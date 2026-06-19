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


def _resolve_select(value: str, options: list[str]) -> str:
    """Traduce un código a su label."""
    if not value:
        return ""
    # Si es select_multiple separado por espacios
    values = value.split()
    labels = []
    for v in values:
        try:
            idx = int(v) - 1
            if 0 <= idx < len(options):
                labels.append(options[idx])
            else:
                labels.append(v)
        except ValueError:
            labels.append(v)
    return " / ".join(labels)


def transform_flat(submission: dict, fields: list[dict]) -> dict:
    """Transforma una submission cruda a un dict plano con labels."""
    result = {}
    geo_fields = {}

    for f in fields:
        name = f["name"]
        ftype = f["type"]

        # Saltar repeat groups (se procesan aparte)
        if f.get("is_repeat"):
            continue

        raw = submission.get(name)
        if raw is None:
            continue

        if ftype == "geopoint":
            parsed = _parse_geopoint(raw)
            if parsed:
                geo_fields[name] = json.loads(parsed)
                result[name + "/lat"] = geo_fields[name]["lat"]
                result[name + "/lng"] = geo_fields[name]["lng"]
            result[name] = raw
        elif ftype in ("select_one", "select_multiple"):
            label = _resolve_select(str(raw), f.get("options", []))
            result[name] = label
            result[name + "@raw"] = raw
        elif ftype == "binary":
            result[name] = raw
        elif ftype == "date":
            result[name] = raw
        elif ftype in ("int", "integer", "decimal"):
            try:
                result[name] = float(raw) if "." in str(raw) else int(raw)
            except ValueError:
                result[name] = raw
        else:
            result[name] = raw

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
    project_id: int,
    form_id: str,
    force: bool = False,
    odk_url: str = None,
    odk_token: str = None
) -> dict:
    """
    Ejecuta el pipeline ETL completo para un formulario.
    
    Args:
        project_id: ID del proyecto en ODK Central
        form_id: ID del formulario
        force: Si True, reextrae aunque ya esté en caché
        odk_url: URL de ODK Central (opcional si ya se llamó a init_connection)
        odk_token: Token de acceso (opcional si ya se llamó a init_connection)
    
    Returns:
        dict con {status, rows, error?}
    """
    if odk_url and odk_token:
        init_connection(odk_url, odk_token)

    if not ODK_URL or not ODK_TOKEN:
        return {"status": "error", "error": "ODK no configurado. Usa init_connection() primero."}

    _init_tables()

    try:
        # 1. Schema
        schema = extract_schema(project_id, form_id)
        fields = parse_xml_fields(schema["xml"])

        # 2. Submissions
        submissions = extract_submissions(project_id, form_id)

        with _get_db() as conn:
            # Guardar schema
            conn.execute(
                """INSERT OR REPLACE INTO schemas (project_id, form_id, form_name, xml, parsed_fields, updated_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                (project_id, form_id, schema["form_name"], schema["xml"],
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
                    (project_id, form_id, instance_id,
                     json.dumps(sub, ensure_ascii=False, default=str),
                     json.dumps(flat, ensure_ascii=False, default=str))
                )

                # Repeats
                for rep_name, rep_items in repeats.items():
                    for item in rep_items:
                        conn.execute(
                            """INSERT OR REPLACE INTO repeat_cache
                               (project_id, form_id, instance_id, repeat_name, index_num, flat_data, updated_at)
                               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))""",
                            (project_id, form_id, instance_id, rep_name, item["__index"],
                             json.dumps(item, ensure_ascii=False, default=str))
                        )

                rows += 1

            conn.execute(
                """INSERT INTO etl_log (project_id, form_id, action, rows, created_at)
                   VALUES (?, ?, 'full_etl', ?, datetime('now'))""",
                (project_id, form_id, rows)
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


def get_etl_status(project_id: int = None, form_id: str = None) -> list[dict]:
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
