"""
Servicio ETL: Extracción, Transformación y Carga (homologación) de datos ODK.
Fase 1: pipeline base con cache en SQLite local.
"""
import ssl
import json
import re
import sqlite3
import os
import urllib.request
from collections import defaultdict
from datetime import datetime
from typing import Optional

# Ruta de la base de datos cache
DB_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "odk_cache.db")

ODK_URL = None
ODK_TOKEN = None

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


# ─── API PUBLICA ──────────────────────────────────────

def init_connection(url: str, token: str):
    """Inicializa credenciales ODK para este módulo."""
    global ODK_URL, ODK_TOKEN
    ODK_URL = url.rstrip("/")
    ODK_TOKEN = token


# ─── BASE DE DATOS ─────────────────────────────────────

def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_tables():
    """Crea las tablas del cache si no existen."""
    with _get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS schemas (
                project_id INTEGER NOT NULL,
                form_id TEXT NOT NULL,
                form_name TEXT NOT NULL DEFAULT '',
                xml TEXT,
                parsed_fields TEXT,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (project_id, form_id)
            );

            CREATE TABLE IF NOT EXISTS submissions_cache (
                project_id INTEGER NOT NULL,
                form_id TEXT NOT NULL,
                instance_id TEXT NOT NULL,
                raw_data TEXT NOT NULL,
                flat_data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (project_id, form_id, instance_id)
            );

            CREATE TABLE IF NOT EXISTS repeat_cache (
                project_id INTEGER NOT NULL,
                form_id TEXT NOT NULL,
                instance_id TEXT NOT NULL,
                repeat_name TEXT NOT NULL,
                index_num INTEGER NOT NULL,
                flat_data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_repeat_lookup 
                ON repeat_cache(project_id, form_id, instance_id);

            CREATE TABLE IF NOT EXISTS etl_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                form_id TEXT,
                action TEXT NOT NULL,
                rows INTEGER DEFAULT 0,
                error TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)


# ─── EXTRACCIÓN ────────────────────────────────────────

def _odk_get(path: str, params: str = "") -> dict | list:
    """GET a ODK Central con autenticación."""
    url = f"{ODK_URL}{path}?{params}" if params else f"{ODK_URL}{path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {ODK_TOKEN}",
        "Accept": "application/json"
    })
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return json.loads(r.read().decode())


def extract_schema(project_id: int, form_id: str) -> dict:
    """Extrae schema (XML) y formulario de ODK Central."""
    form_info = _odk_get(f"/v1/projects/{project_id}/forms/{form_id}")
    form_name = form_info.get("name", form_id)
    # El XML se devuelve como texto plano, no como JSON
    xml_url = f"{ODK_URL}/v1/projects/{project_id}/forms/{form_id}.xml"
    req = urllib.request.Request(xml_url, headers={"Authorization": f"Bearer {ODK_TOKEN}"})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        xml = r.read().decode("utf-8")
    return {"form_id": form_id, "form_name": form_name, "xml": xml}


def extract_submissions(project_id: int, form_id: str) -> list[dict]:
    """Extrae todas las submissions via OData con $expand=* para repeats."""
    try:
        raw = _odk_get(
            f"/v1/projects/{project_id}/forms/{form_id}.svc/Submissions",
            "$expand=*&$top=10000"
        )
    except Exception as e:
        # Fallback sin expand
        raw = _odk_get(
            f"/v1/projects/{project_id}/forms/{form_id}.svc/Submissions",
            "$top=10000"
        )
    if isinstance(raw, dict):
        return raw.get("value", [])
    return raw if isinstance(raw, list) else []


# ─── TRANSFORMACIÓN ────────────────────────────────────

def parse_xml_fields(xml: str) -> list[dict]:
    """Parsea el XML del formulario a una lista de campos con tipos y labels."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "report_engine",
        os.path.join(os.path.dirname(__file__), "report_engine.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.parse_xml_schema(xml)


def _parse_geopoint(val: str) -> str | None:
    """Convierte '10.123 -66.789 0 0' a JSON string."""
    if not val or not isinstance(val, str):
        return None
    parts = val.strip().split()
    if len(parts) >= 2:
        try:
            lat, lng = float(parts[0]), float(parts[1])
            return json.dumps({"lat": lat, "lng": lng, "alt": float(parts[2]) if len(parts) > 2 else 0})
        except ValueError:
            return None
    return None


def _resolve_select(value: str, options: list[str], list_name: str = "") -> str:
    """
    Traduce un código a su label.
    Soporta tres formatos:
    1. Índice 1-based: "1" -> options[0]
    2. Match exacto: "casa" -> "casa"
    3. Prefijo KoBo: "vivienda_casa" -> "casa" (strip list_name prefix)
    """
    if not value:
        return ""
    values = value.split()
    labels = []
    
    # Crear set de opciones para match rápido
    opts_lower = {str(o).lower(): o for o in options}
    
    for v in values:
        v_stripped = v.strip()
        if not v_stripped:
            continue
            
        # 1. Intentar como índice 1-based
        try:
            idx = int(v_stripped) - 1
            if 0 <= idx < len(options):
                labels.append(options[idx])
                continue
        except ValueError:
            pass
        
        # 2. Match exacto (case-insensitive)
        if v_stripped.lower() in opts_lower:
            labels.append(opts_lower[v_stripped.lower()])
            continue
        
        # 3. Prefijo KoBo: quitar "list_name_" del inicio
        if list_name:
            prefix = f"{list_name}_"
            if v_stripped.startswith(prefix):
                stripped = v_stripped[len(prefix):]
                if stripped.lower() in opts_lower:
                    labels.append(opts_lower[stripped.lower()])
                    continue
        
        # 4. Intentar quitando prefijos comunes (KoBo puede prefixear con list_name)
        # Buscar cualquier prefijo que termine en _
        underscore_pos = v_stripped.find("_")
        if underscore_pos > 0:
            stripped = v_stripped[underscore_pos + 1:]
            if stripped.lower() in opts_lower:
                labels.append(opts_lower[stripped.lower()])
                continue
        
        # 5. Fallback: usar valor crudo
        labels.append(v_stripped)
    
    return " / ".join(labels)


def _flatten_group(submission: dict, fields: list[dict], prefix: str = "") -> dict:
    """Aplanea recursivamente una submission, incluyendo grupos anidados."""
    result = {}
    geo_fields = {}

    for f in fields:
        name = f["name"]
        ftype = f["type"]
        children = f.get("children", [])

        # Saltar repeat groups (se procesan aparte)
        if f.get("is_repeat"):
            continue

        # Grupos: buscar valor en submission y luego aplanar recursivamente
        if ftype == "group" and children:
            group_data = submission.get(name)
            if isinstance(group_data, dict):
                nested = _flatten_group(group_data, children, prefix=name + "/")
                result.update(nested)
            # Si group_data es None, simplemente omitimos el grupo
            continue

        raw = submission.get(name)
        if raw is None:
            continue

        full_name = name

        if ftype == "geopoint":
            parsed = _parse_geopoint(raw)
            if parsed:
                geo_fields[full_name] = json.loads(parsed)
                result[full_name + "/lat"] = geo_fields[full_name]["lat"]
                result[full_name + "/lng"] = geo_fields[full_name]["lng"]
            result[full_name] = raw
        elif ftype.startswith("select_one") or ftype.startswith("select_multiple"):
            label = _resolve_select(str(raw), f.get("options", []), f.get("list_name", ""))
            result[full_name] = label
            result[full_name + "@raw"] = raw
        elif ftype == "binary":
            result[full_name] = raw
        elif ftype == "date":
            result[full_name] = raw
        elif ftype in ("int", "integer", "decimal"):
            try:
                result[full_name] = float(raw) if "." in str(raw) else int(raw)
            except ValueError:
                result[full_name] = raw
        else:
            result[full_name] = raw

    return result


def transform_flat(submission: dict, fields: list[dict]) -> dict:
    """Transforma una submission cruda a un dict plano con labels.
    Aplanea grupos anidados recursivamente usando _flatten_group."""
    result = _flatten_group(submission, fields)

    # Metadatos
    result["__submission_id"] = submission.get("__id", submission.get("instanceId", ""))
    result["__instance_id"] = submission.get("instanceId", submission.get("__id", ""))
    result["__submitter_id"] = submission.get("submitterId", "")
    result["__created_at"] = submission.get("createdAt", submission.get("__system/submissionDate", ""))

    return result


def transform_repeats(submission: dict, fields: list[dict]) -> dict[str, list[dict]]:
    """Extrae y transforma los repeat groups de una submission."""
    result = {}
    for f in fields:
        if not f.get("is_repeat"):
            continue
        name = f["name"]
        children = f.get("children", [])
        raw_repeats = submission.get(name)
        if not raw_repeats or not isinstance(raw_repeats, list):
            continue

        items = []
        for idx, item in enumerate(raw_repeats):
            if isinstance(item, dict):
                flat = {"__index": idx}
                for c in children:
                    val = item.get(c)
                    if val is not None:
                        flat[c] = str(val) if not isinstance(val, (int, float)) else val
                items.append(flat)
        if items:
            result[name] = items

    return result


def _build_options_map(fields: list[dict]) -> dict:
    """Construye mapa de opciones {field_name: [option_labels]}."""
    return {f["name"]: f.get("options", []) for f in fields if f.get("options")}


def get_all_submissions(project_id: int, form_id: str) -> list[dict]:
    """Obtiene todas las submissions desde ODK y las expande con expandir la notación compacta."""
    return extract_submissions(project_id, form_id)


# ─── CARGA (ETL completo) ─────────────────────────────

def run_etl(
    project_id,
    form_id: str,
    force: bool = False,
    odk_url: str = None,
    odk_token: str = None,
    adapter=None,
    source: str = "odk"
) -> dict:
    """
    Ejecuta el pipeline ETL completo para un formulario.
    
    Args:
        project_id: ID del proyecto (int para ODK, str UID para KoBo)
        form_id: ID del formulario
        force: Si True, reextrae aunque ya esté en caché
        odk_url: URL del servidor (fallback para compatibilidad)
        odk_token: Token de acceso (fallback para compatibilidad)
        adapter: DataSourceAdapter opcional (si se pasa, ignora odk_url/odk_token)
        source: "odk" | "kobo"
    
    Returns:
        dict con {status, rows, error?}
    """
    # Normalizar project_id a string (soporta tanto int como str)
    pid_str = str(project_id)

    _init_tables()

    # ── EXTRACCIÓN: adapter o modo legacy ──
    try:
        if adapter:
            xml = adapter.get_schema_xml(pid_str, form_id)
            if source == "kobo":
                form_info = {"form_name": form_id}
            else:
                try:
                    forms_data = adapter.get_forms(pid_str)
                    matches = [f for f in forms_data if f.get("xmlFormId") == form_id or f.get("name") == form_id]
                    form_info = matches[0] if matches else {"name": form_id}
                except Exception:
                    form_info = {"name": form_id}
            form_name = form_info.get("name", form_id)
            fields = parse_xml_fields(xml)
            submissions = adapter.get_submissions(pid_str, form_id)
            schema = {"form_id": form_id, "form_name": form_name, "xml": xml}
        else:
            if odk_url and odk_token:
                init_connection(odk_url, odk_token)
            if not ODK_URL or not ODK_TOKEN:
                return {"status": "error", "error": "ODK no configurado. Usa init_connection() primero."}
            schema = extract_schema(project_id, form_id)
            fields = parse_xml_fields(schema["xml"])
            submissions = extract_submissions(project_id, form_id)
    except Exception as e:
        return {"status": "error", "error": f"Extraction error: {str(e)[:300]}"}

    # ── CARGA (shared) ──
    try:
        with _get_db() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO schemas (project_id, form_id, form_name, xml, parsed_fields, updated_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                (pid_str, form_id, schema["form_name"], schema["xml"],
                 json.dumps(fields, ensure_ascii=False, default=str))
            )

            rows = 0
            for sub in submissions:
                instance_id = sub.get("instanceId", sub.get("__id", f"row_{rows}"))
                flat = transform_flat(sub, fields)
                repeats = transform_repeats(sub, fields)

                conn.execute(
                    """INSERT OR REPLACE INTO submissions_cache
                       (project_id, form_id, instance_id, raw_data, flat_data, updated_at)
                       VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                    (pid_str, form_id, instance_id,
                     json.dumps(sub, ensure_ascii=False, default=str),
                     json.dumps(flat, ensure_ascii=False, default=str))
                )

                for rep_name, rep_items in repeats.items():
                    for item in rep_items:
                        conn.execute(
                            """INSERT OR REPLACE INTO repeat_cache
                               (project_id, form_id, instance_id, repeat_name, index_num, flat_data, updated_at)
                               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))""",
                            (pid_str, form_id, instance_id, rep_name, item["__index"],
                             json.dumps(item, ensure_ascii=False, default=str))
                        )

                rows += 1

            conn.execute(
                """INSERT INTO etl_log (project_id, form_id, action, rows, created_at)
                   VALUES (?, ?, 'full_etl', ?, datetime('now'))""",
                (pid_str, form_id, rows)
            )

        return {"status": "ok", "rows": rows, "fields": len(fields)}

    except Exception as e:
        with _get_db() as conn:
            conn.execute(
                """INSERT INTO etl_log (project_id, form_id, action, rows, error, created_at)
                   VALUES (?, ?, 'full_etl', 0, ?, datetime('now'))""",
                (project_id, form_id, str(e))
            )
        return {"status": "error", "error": str(e)}


# ─── CONSULTAS ─────────────────────────────────────────

def get_homologated_submissions(project_id: int, form_id: str) -> tuple[list[dict], list[dict]]:
    """
    Retorna las submissions homologadas (con labels).
    
    Returns:
        (submissions_flat, fields)
    """
    try:
        with _get_db() as conn:
            rows = conn.execute(
                """SELECT flat_data FROM submissions_cache
                   WHERE project_id = ? AND form_id = ?
                   ORDER BY rowid""",
                (project_id, form_id)
            ).fetchall()

            fields_row = conn.execute(
                """SELECT parsed_fields FROM schemas
                   WHERE project_id = ? AND form_id = ?""",
                (project_id, form_id)
            ).fetchone()

        subs = [json.loads(r["flat_data"]) for r in rows]
        fields = json.loads(fields_row["parsed_fields"]) if fields_row else []
        return subs, fields
    except Exception:
        return [], []


def get_homologated_repeats(
    project_id: int,
    form_id: str,
    repeat_name: str
) -> list[dict]:
    """Retorna los registros de un repeat group específico con sus submission_ids."""
    with _get_db() as conn:
        rows = conn.execute(
            """SELECT instance_id, flat_data FROM repeat_cache
               WHERE project_id = ? AND form_id = ? AND repeat_name = ?
               ORDER BY instance_id, index_num""",
            (project_id, form_id, repeat_name)
        ).fetchall()
    return [
        {**json.loads(r["flat_data"]), "__submission_id": r["instance_id"]}
        for r in rows
    ]


def get_etl_status(project_id=None, form_id: str = None) -> list[dict]:
    """Retorna el log de ejecuciones ETL."""
    try:
        with _get_db() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS etl_log (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, form_id TEXT, action TEXT, rows INTEGER DEFAULT 0, error TEXT, created_at TEXT NOT NULL)")
            if project_id and form_id:
                rows = conn.execute(
                    """SELECT * FROM etl_log WHERE project_id = ? AND form_id = ?
                       ORDER BY created_at DESC LIMIT 20""",
                    (project_id, form_id)
                ).fetchall()
            elif project_id:
                rows = conn.execute(
                    """SELECT * FROM etl_log WHERE project_id = ?
                       ORDER BY created_at DESC LIMIT 20""",
                    (project_id,)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM etl_log ORDER BY created_at DESC LIMIT 20"
                ).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []


def list_cached_forms() -> list[dict]:
    """Lista los formularios actualmente en caché."""
    try:
        with _get_db() as conn:
            # Asegurar que la tabla existe
            conn.execute("CREATE TABLE IF NOT EXISTS schemas (project_id INTEGER NOT NULL, form_id TEXT NOT NULL, form_name TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)")
            rows = conn.execute(
                """SELECT project_id, form_id, form_name, updated_at FROM schemas
                   ORDER BY updated_at DESC"""
            ).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
