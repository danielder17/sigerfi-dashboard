"""
Caché ligero de estadísticas para datasources lentos (KoBo).
Guarda counts de submissions por formulario en un JSON local.
"""
import json
import os
import time
from datetime import datetime, timezone
from collections import Counter, defaultdict

CACHE_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "submission_cache.json")
CACHE_TTL = 300  # 5 minutos


def _load_cache():
    """Carga el caché desde disco."""
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def _save_cache(data: dict):
    """Guarda el caché a disco."""
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_cached_counts(adapter=None, projects_data: list = None) -> dict:
    """
    Retorna counts de submissions por form.
    - Si el caché es reciente (< TTL), lo devuelve directo.
    - Si expiró y hay adapter, refresca en paralelo.
    
    Retorna: {
        "counts": {form_id: count, ...},
        "last_by_form": {form_id: "2025-01-15", ...},
        "count_by_project": {project_id: total, ...},
        "count_by_day": {"2025-01-15": 5, ...},
        "forms_count": int,
        "last_updated": "ISO timestamp",
        "source": "cache" | "fresh"
    }
    """
    cache = _load_cache()
    now = time.time()
    last_updated = cache.get("_last_updated", 0)
    
    # Si el caché es reciente y no hay adapter forzando refresh
    if adapter is None and last_updated and (now - last_updated) < CACHE_TTL:
        result = cache.copy()
        result.pop("_last_updated", None)
        result["source"] = "cache"
        return result
    
    # Construir lista de forms desde adapter o projects_data
    forms_to_fetch = []
    if adapter is not None:
        try:
            projects = adapter.get_projects()
            for p in projects:
                pid = p.get("id") or p.get("uid", "")
                try:
                    forms = adapter.get_forms(str(pid))
                except Exception:
                    forms = []
                for f in forms:
                    if f.get("deleted") or f.get("archived"):
                        continue
                    fid = f.get("xmlFormId") or f.get("uid", "")
                    fname = f.get("name", "").strip()
                    if not fname or not fid:
                        continue
                    forms_to_fetch.append({
                        "fid": fid,
                        "fname": fname,
                        "pid": pid,
                        "project_name": p.get("name", ""),
                    })
        except Exception as e:
            return _fallback_cache(cache, f"Error getting projects: {e}")

    if not forms_to_fetch:
        return _fallback_cache(cache, "No forms found")

    # Fetch en paralelo usando threads
    counts = {}
    last_by_form = {}
    count_by_project = defaultdict(int)
    count_by_day = Counter()
    errors = 0
    
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    def fetch_count(item):
        fid = item["fid"]
        pid = item["pid"]
        project_name = item["project_name"]
        try:
            if hasattr(adapter, '_get'):
                # KoBo: GET /api/v2/assets/{uid}/data/?format=json&limit=0
                url = f"/api/v2/assets/{fid}/data/?format=json&limit=1"
                result = adapter._get(url)
                total = result.get("count", 0)
                # Última submission (si hay)
                last_sub = ""
                results_list = result.get("results", [])
                if results_list:
                    s = results_list[0]
                    last_sub = s.get("_submission_time", "") or s.get("start", "") or s.get("today", "")
                    if last_sub:
                        last_sub = str(last_sub)[:10]
                return fid, total, last_sub, pid, project_name, None
            else:
                return fid, 0, "", pid, project_name, None
        except Exception as e:
            return fid, 0, "", pid, project_name, str(e)[:60]
    
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(fetch_count, item) for item in forms_to_fetch]
        for future in as_completed(futures):
            fid, total, last_sub, pid, pname, err = future.result()
            counts[fid] = total
            last_by_form[fid] = last_sub
            count_by_project[pid] += total
            if last_sub:
                count_by_day[last_sub] += 1
            if err:
                errors += 1

    result = {
        "counts": counts,
        "last_by_form": dict(last_by_form),
        "count_by_project": dict(count_by_project),
        "count_by_day": dict(count_by_day),
        "forms_count": len(forms_to_fetch),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "source": "fresh",
        "errors": errors,
    }
    
    # Guardar en caché
    cache_data = result.copy()
    cache_data["_last_updated"] = now
    _save_cache(cache_data)
    
    return result


def _fallback_cache(cache: dict, reason: str):
    """Si falla el fetch, devuelve el caché viejo si existe."""
    result = cache.copy()
    result.pop("_last_updated", None)
    result["source"] = "stale"
    result["fallback_reason"] = reason
    return result
