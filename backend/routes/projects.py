"""
Rutas de proyectos. Usa el adapter configurado (ODK o KoBo).
"""
from fastapi import APIRouter, HTTPException
from services.adapters.factory import get_configured_adapter
import traceback

router = APIRouter()

def _get_adapter():
    """Retorna el adapter autenticado según la fuente activa."""
    try:
        return get_configured_adapter(auto_login=True)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Error de autenticacion: {e}")


@router.get("/projects")
async def list_projects():
    """Lista proyectos de la fuente activa, con formularios anidados."""
    try:
        adapter = _get_adapter()
        projects = adapter.get_projects()
        source_type = type(adapter).__name__

        if source_type == "KoboAPIAdapter":
            # KoBo: cada form es un proyecto (get_projects ya devuelve forms deduplicados)
            mapped = []
            for p in projects:
                fid = p.get("uid") or p.get("id", "")
                fname = p.get("name", "").strip()
                if not fname or not fid:
                    continue
                # Construir form a partir del mismo project
                form = {
                    "xmlFormId": fid,
                    "uid": fid,
                    "name": fname,
                    "owner": p.get("owner", ""),
                    "has_deployment": p.get("has_deployment", False),
                    "deployment_status": p.get("deployment_status", ""),
                    "date_created": p.get("date_created", ""),
                    "date_modified": p.get("date_modified", ""),
                }
                mapped.append({
                    "id": fid,
                    "name": fname,
                    "description": "",
                    "forms": [form],
                    "_kobo_uid": fid,
                    "_source": "kobo",
                    "_deployment_status": p.get("deployment_status", ""),
                })
            return {"projects": mapped}
        else:
            # ODK: meter forms dentro de cada proyecto
            if hasattr(adapter, 'get_forms'):
                for p in projects:
                    pid = p.get("id")
                    if pid:
                        try:
                            forms = adapter.get_forms(pid)
                            p["forms"] = forms
                        except Exception:
                            p["forms"] = []
                    else:
                        p["forms"] = []
            return {"projects": projects}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats():
    """
    Estadísticas agregadas para el panel de control.
    Usa caché ligero para datasources lentos (KoBo).
    """
    try:
        adapter = _get_adapter()
        source_type = type(adapter).__name__

        if source_type == "KoboAPIAdapter":
            from services.submission_cache import get_cached_counts
            cache_result = get_cached_counts(adapter=adapter)

            counts = cache_result.get("counts", {})
            last_by_form = cache_result.get("last_by_form", {})
            count_by_day = cache_result.get("count_by_day", {})

            # En KoBo, get_projects ya devuelve los forms como proyectos
            projects = adapter.get_projects()
            forms_list = []
            for p in projects:
                fid = p.get("uid") or p.get("id", "")
                fname = p.get("name", "").strip()
                if not fname or not fid:
                    continue
                forms_list.append({
                    "fid": fid,
                    "fname": fname,
                    "pid": fid,
                    "pname": fname,
                })

            por_formulario = []
            por_proyecto_map = {}
            for item in forms_list:
                count = counts.get(item["fid"], 0)
                por_formulario.append({
                    "project_id": item["pid"],
                    "project_name": item["pname"],
                    "form_id": item["fid"],
                    "form_name": item["fname"],
                    "count": count,
                    "last_submission": last_by_form.get(item["fid"], ""),
                })
                key = item["pid"]
                if key not in por_proyecto_map:
                    por_proyecto_map[key] = {
                        "project_id": key,
                        "project_name": item["pname"],
                        "count": 0,
                    }
                por_proyecto_map[key]["count"] += count

            por_proyecto = sorted(por_proyecto_map.values(), key=lambda x: x["count"], reverse=True)
            submissions_por_dia = [
                {"date": d, "count": c}
                for d, c in sorted(count_by_day.items())
            ]

            return {
                "submissions_por_dia": submissions_por_dia,
                "submissions_por_proyecto": por_proyecto,
                "submissions_por_formulario": sorted(por_formulario, key=lambda x: x["count"], reverse=True),
                "cache_source": cache_result.get("source", "fresh"),
                "errors": cache_result.get("errors", 0),
                "forms_count": len(forms_list),
            }
        else:
            from collections import Counter
            projects = adapter.get_projects()
            por_dia = Counter()
            por_proyecto = []
            por_formulario = []

            for p in projects:
                pid = p.get("id")
                name = p.get("name", f"Proyecto {pid}")
                try:
                    forms = adapter.get_forms(pid) if hasattr(adapter, 'get_forms') else [p]
                except Exception:
                    forms = []

                total_proyecto = 0
                form_data = []

                for f in forms:
                    fid = f.get("xmlFormId") or f.get("uid") or f.get("id")
                    fname = f.get("name") or f.get("title") or fid

                    if hasattr(adapter, 'get_submissions'):
                        try:
                            submissions = adapter.get_submissions(str(pid), str(fid))
                        except Exception:
                            submissions = []
                    else:
                        submissions = []

                    count = len(submissions or [])
                    total_proyecto += count

                    form_data.append({
                        "project_id": pid,
                        "project_name": name,
                        "form_id": fid,
                        "form_name": fname,
                        "count": count,
                    })

                    for s in (submissions or []):
                        start = s.get("start") or s.get("today") or s.get("_submission_time")
                        if start:
                            try:
                                day = str(start)[:10]
                                por_dia[day] += 1
                            except Exception:
                                pass

                por_formulario.extend(form_data)
                por_proyecto.append({
                    "project_id": pid,
                    "project_name": name,
                    "count": total_proyecto,
                })

            submissions_por_dia = [
                {"date": d, "count": c}
                for d, c in sorted(por_dia.items())
            ]

            return {
                "submissions_por_dia": submissions_por_dia,
                "submissions_por_proyecto": sorted(por_proyecto, key=lambda x: x["count"], reverse=True),
                "submissions_por_formulario": sorted(por_formulario, key=lambda x: x["count"], reverse=True),
            }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/summary")
async def project_summary(project_id: str):
    """Resumen de un proyecto."""
    try:
        adapter = _get_adapter()
        source_type = type(adapter).__name__

        if source_type == "KoboAPIAdapter":
            # KoBo: buscar form por UID
            projects = adapter.get_projects()
            found_form = None
            for p in projects:
                pid = p.get("id") or p.get("uid")
                if not pid:
                    continue
                try:
                    forms = adapter.get_forms(str(pid))
                except Exception:
                    forms = []
                for f in forms:
                    fid = f.get("xmlFormId") or f.get("uid", "")
                    if fid == project_id or f.get("name", "") == project_id:
                        found_form = f
                        break
                if found_form:
                    break

            if not found_form:
                raise HTTPException(status_code=404, detail="Formulario no encontrado")

            # Obtener count desde caché
            from services.submission_cache import get_cached_counts
            cache_result = get_cached_counts(adapter=adapter)
            count = cache_result.get("counts", {}).get(project_id, 0)
            last_sub = cache_result.get("last_by_form", {}).get(project_id, "")

            return {
                "project": {
                    "id": project_id,
                    "name": found_form.get("name", ""),
                    "description": "",
                    "estado": "implementado" if count > 0 else "sin datos",
                    "num_preguntas": 0,
                    "total_submissions": count,
                    "last_submission": last_sub,
                },
                "ubicacion": {"estado": "", "municipio": "", "parroquia": "", "sector_comunidad": ""},
                "envios_rangos": {"ultimos_7_dias": 0, "ultimos_31_dias": 0, "ultimos_3_meses": 0, "ultimos_12_meses": 0},
            }

        # ODK: flujo original
        projects = adapter.get_projects()
        project = None
        for p in projects:
            pid = str(p.get("id"))
            if pid == str(project_id):
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Proyecto no encontrado")

        try:
            forms = adapter.get_forms(project_id) if hasattr(adapter, 'get_forms') else [project]
        except Exception:
            forms = []

        total_submissions = 0
        total_preguntas = 0
        last_submission_date = None

        for f in forms:
            fid = f.get("xmlFormId") or f.get("uid")
            if hasattr(adapter, 'get_submissions'):
                try:
                    submissions = adapter.get_submissions(str(project_id), str(fid))
                except Exception:
                    submissions = []
            else:
                submissions = []

            total_submissions += len(submissions or [])
            for s in (submissions or []):
                start = s.get("start") or s.get("today") or s.get("_submission_time")
                if start:
                    try:
                        d = str(start)[:10]
                        if last_submission_date is None or d > last_submission_date:
                            last_submission_date = d
                    except Exception:
                        pass

        return {
            "project": {
                "id": project_id,
                "name": project.get("name", f"Proyecto {project_id}"),
                "description": project.get("description", "") or project.get("settings", {}).get("description", ""),
                "estado": "implementado" if total_submissions > 0 else "no implementado",
                "num_preguntas": total_preguntas,
                "total_submissions": total_submissions,
                "last_submission": last_submission_date or "",
            },
            "ubicacion": {"estado": "", "municipio": "", "parroquia": "", "sector_comunidad": ""},
            "envios_rangos": {"ultimos_7_dias": 0, "ultimos_31_dias": 0, "ultimos_3_meses": 0, "ultimos_12_meses": 0},
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/forms")
async def list_forms(project_id: str):
    """Lista formularios de un proyecto."""
    try:
        adapter = _get_adapter()
        if hasattr(adapter, 'get_forms'):
            forms = adapter.get_forms(project_id)
        else:
            forms = []
        return {"forms": forms}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
