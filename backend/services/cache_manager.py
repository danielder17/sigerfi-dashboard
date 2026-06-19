"""
Fase 4: Refresco automático y limpieza del caché ETL.
Agrega funciones para refresco programado, detección de cambios y TTL.
"""
import json
import sqlite3
from datetime import datetime, timedelta
from typing import Optional

from services.etl_service import (
    _get_db,
    run_etl,
    list_cached_forms,
    extract_submissions,
    extract_schema,
    parse_xml_fields,
    transform_flat,
    transform_repeats,
    init_connection,
    DB_PATH,
)

# ─── CONFIGURACIÓN ────────────────────────────────────

# TTL por defecto: 1 hora (en segundos)
DEFAULT_TTL_SECONDS = 3600

# Máximo de entradas en el log ETL
MAX_LOG_ENTRIES = 100


# ─── ESTADO DEL CACHÉ ─────────────────────────────────

def get_cache_info(project_id: int, form_id: str) -> dict:
    """
    Retorna info detallada del caché para un formulario.
    Incluye: edad, tamaño, estado de expiración.
    """
    try:
        with _get_db() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS schemas (project_id INTEGER NOT NULL, form_id TEXT NOT NULL, form_name TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS submissions_cache (project_id INTEGER NOT NULL, form_id TEXT NOT NULL, instance_id TEXT NOT NULL, data JSON, created_at TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS etl_log (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, form_id TEXT, action TEXT, rows INTEGER DEFAULT 0, error TEXT, created_at TEXT NOT NULL)")

            row = conn.execute(
                """SELECT form_name, updated_at FROM schemas
                   WHERE project_id = ? AND form_id = ?""",
                (project_id, form_id)
            ).fetchone()

            if not row:
                return {"cached": False}

            count = conn.execute(
                """SELECT COUNT(*) as c FROM submissions_cache
                   WHERE project_id = ? AND form_id = ?""",
                (project_id, form_id)
            ).fetchone()["c"]

            last_etl = conn.execute(
                """SELECT created_at FROM etl_log
                   WHERE project_id = ? AND form_id = ? AND action = 'full_etl'
                   ORDER BY created_at DESC LIMIT 1""",
                (project_id, form_id)
            ).fetchone()

        updated = row["updated_at"]
        try:
            updated_dt = datetime.strptime(updated, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            updated_dt = datetime.now()

        age_seconds = (datetime.now() - updated_dt).total_seconds()
    except Exception:
        return {"cached": False}

    return {
        "cached": True,
        "form_name": row["form_name"],
        "submissions_count": count,
        "last_updated": updated,
        "age_seconds": age_seconds,
        "age_human": _format_age(age_seconds),
        "expired": age_seconds > DEFAULT_TTL_SECONDS,
        "ttl_seconds": DEFAULT_TTL_SECONDS,
    }


def _format_age(seconds: float) -> str:
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        return f"{int(seconds // 60)}m"
    elif seconds < 86400:
        return f"{int(seconds // 3600)}h {int((seconds % 3600) // 60)}m"
    else:
        days = int(seconds // 86400)
        return f"{days}d {int((seconds % 86400) // 3600)}h"


# ─── REFRESCO ──────────────────────────────────────────

def refresh_form(
    project_id: int,
    form_id: str,
    odk_url: str = None,
    odk_token: str = None,
    force: bool = False
) -> dict:
    """
    Refresca el caché de un formulario si está expirado o si force=True.
    Retorna dict con {status, action, rows?, error?}
    """
    info = get_cache_info(project_id, form_id)

    if not info["cached"]:
        # No hay caché, ejecutar ETL completo
        return run_etl(project_id, form_id, force=True, odk_url=odk_url, odk_token=odk_token)

    if not force and not info["expired"]:
        return {
            "status": "skipped",
            "action": "cache_fresh",
            "age_human": info["age_human"],
            "rows": info["submissions_count"],
        }

    # Ejecutar ETL completo para refrescar
    return run_etl(project_id, form_id, force=True, odk_url=odk_url, odk_token=odk_token)


def refresh_all_cached(odk_url: str = None, odk_token: str = None, force: bool = False) -> list[dict]:
    """
    Refresca todos los formularios en caché.
    Retorna lista de resultados por formulario.
    """
    forms = list_cached_forms()
    results = []

    for f in forms:
        result = refresh_form(
            f["project_id"],
            f["form_id"],
            odk_url=odk_url,
            odk_token=odk_token,
            force=force,
        )
        result["project_id"] = f["project_id"]
        result["form_id"] = f["form_id"]
        result["form_name"] = f.get("form_name", f["form_id"])
        results.append(result)

    return results


def incremental_refresh(
    project_id: int,
    form_id: str,
    odk_url: str = None,
    odk_token: str = None
) -> dict:
    """
    Refresco inteligente: compara cantidad de submissions en ODK vs caché.
    Si hay nuevas, solo agrega las nuevas. Si hay cambios, refresca todo.
    """
    if not odk_url or not odk_token:
        return {"status": "error", "error": "Se requieren credenciales ODK"}

    init_connection(odk_url, odk_token)

    # Obtener submissions actuales desde ODK
    new_subs = extract_submissions(project_id, form_id)

    # Obtener submissions en caché
    with _get_db() as conn:
        cached_ids = set(
            r["instance_id"] for r in conn.execute(
                """SELECT instance_id FROM submissions_cache
                   WHERE project_id = ? AND form_id = ?""",
                (project_id, form_id)
            ).fetchall()
        )

    odk_ids = set()
    for s in new_subs:
        sid = s.get("instanceId", s.get("__id", ""))
        if sid:
            odk_ids.add(sid)

    # Comparar
    new_ids = odk_ids - cached_ids
    removed_ids = cached_ids - odk_ids
    total_odk = len(odk_ids)
    total_cached = len(cached_ids)

    if not new_ids and not removed_ids and total_odk == total_cached:
        return {"status": "ok", "action": "no_changes", "total_odk": total_odk, "total_cached": total_cached}

    if new_ids or removed_ids:
        # Hay cambios, ejecutar ETL completo para asegurar consistencia
        return run_etl(project_id, form_id, force=True, odk_url=odk_url, odk_token=odk_token)

    return {"status": "ok", "action": "synced", "total": total_odk}


# ─── LIMPIEZA ──────────────────────────────────────────

def clean_expired_forms(max_age_hours: int = 48) -> dict:
    """
    Elimina formularios del caché que no se han actualizado en más de N horas.
    Retorna dict con formularios eliminados.
    """
    cutoff = (datetime.now() - timedelta(hours=max_age_hours)).strftime("%Y-%m-%d %H:%M:%S")

    with _get_db() as conn:
        expired = conn.execute(
            """SELECT project_id, form_id, form_name FROM schemas
               WHERE updated_at < ?""",
            (cutoff,)
        ).fetchall()

        deleted = []
        for r in expired:
            pid, fid, fname = r["project_id"], r["form_id"], r["form_name"]
            conn.execute("DELETE FROM schemas WHERE project_id=? AND form_id=?", (pid, fid))
            conn.execute("DELETE FROM submissions_cache WHERE project_id=? AND form_id=?", (pid, fid))
            conn.execute("DELETE FROM repeat_cache WHERE project_id=? AND form_id=?", (pid, fid))
            deleted.append({"project_id": pid, "form_id": fid, "form_name": fname})

        # Limpiar log ETL viejo
        conn.execute("""
            DELETE FROM etl_log WHERE id NOT IN (
                SELECT id FROM etl_log ORDER BY id DESC LIMIT ?
            )
        """, (MAX_LOG_ENTRIES,))

        return {
            "deleted_forms": len(deleted),
            "forms": deleted,
            "max_age_hours": max_age_hours,
        }


def clean_form(project_id: int, form_id: str) -> dict:
    """
    Elimina un formulario específico del caché.
    """
    with _get_db() as conn:
        conn.execute("DELETE FROM schemas WHERE project_id=? AND form_id=?", (project_id, form_id))
        conn.execute("DELETE FROM submissions_cache WHERE project_id=? AND form_id=?", (project_id, form_id))
        conn.execute("DELETE FROM repeat_cache WHERE project_id=? AND form_id=?", (project_id, form_id))
    return {"status": "ok", "deleted": True, "project_id": project_id, "form_id": form_id}


def clean_all() -> dict:
    """
    Limpia TODO el caché (cuidado: borra todos los datos homologados).
    """
    with _get_db() as conn:
        conn.execute("DELETE FROM schemas")
        conn.execute("DELETE FROM submissions_cache")
        conn.execute("DELETE FROM repeat_cache")
        conn.execute("DELETE FROM etl_log")
    return {"status": "ok", "deleted": True}


def get_cache_stats() -> dict:
    """
    Estadísticas globales del caché.
    """
    try:
        with _get_db() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS schemas (project_id INTEGER NOT NULL, form_id TEXT NOT NULL, form_name TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS submissions_cache (project_id INTEGER NOT NULL, form_id TEXT NOT NULL, instance_id TEXT NOT NULL, data JSON, created_at TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS repeat_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, form_id TEXT, instance_id TEXT, repeat_name TEXT, data JSON, created_at TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS etl_log (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, form_id TEXT, action TEXT, rows INTEGER DEFAULT 0, error TEXT, created_at TEXT NOT NULL)")

            forms_count = conn.execute("SELECT COUNT(*) as c FROM schemas").fetchone()["c"]
            subs_count = conn.execute("SELECT SUM(c) as total FROM (SELECT COUNT(*) as c FROM submissions_cache GROUP BY project_id, form_id)").fetchone()
            subs_total = subs_count["total"] if subs_count["total"] else 0
            repeats_count = conn.execute("SELECT COUNT(*) as c FROM repeat_cache").fetchone()["c"]
            etl_count = conn.execute("SELECT COUNT(*) as c FROM etl_log").fetchone()["c"]

            import os
            db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

            return {
                "forms_cached": forms_count,
                "total_submissions": subs_total,
                "total_repeat_records": repeats_count,
                "etl_log_entries": etl_count,
                "db_size_bytes": db_size,
                "db_size_human": _format_size(db_size),
                "db_path": DB_PATH,
            }
    except Exception:
        return {
            "forms_cached": 0,
            "total_submissions": 0,
            "total_repeat_records": 0,
            "etl_log_entries": 0,
            "db_size_bytes": 0,
            "db_size_human": "0 B",
            "db_path": DB_PATH,
        }


def _format_size(bytes: int) -> str:
    if bytes < 1024:
        return f"{bytes} B"
    elif bytes < 1024**2:
        return f"{bytes / 1024:.1f} KB"
    else:
        return f"{bytes / 1024**2:.1f} MB"
