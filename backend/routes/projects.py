"""
Rutas de proyectos ODK Central.
"""

from collections import Counter, defaultdict
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from odk_client import ODKClient
from config import ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD
import traceback
import re

router = APIRouter()


def _get_client() -> ODKClient:
    """Crea cliente autenticado (temporal, sin sesión)."""
    client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
    try:
        client.login()
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Error de autenticacion ODK: {e}")
    return client


@router.get("/projects")
async def list_projects():
    """Lista todos los proyectos accesibles con sus formularios."""
    try:
        client = _get_client()
        projects = client.get_projects()
        # Rellenar forms dentro de cada proyecto
        for p in projects:
            pid = p["id"]
            try:
                forms = client.get_forms(pid)
                p["forms"] = forms
            except Exception:
                p["forms"] = []
        client.close()
        return {"projects": projects}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats():
    """
    Estadisticas agregadas para el panel de control:
    - submissions_por_dia: registros agrupados por fecha
    - submissions_por_proyecto: total de registros por proyecto
    - submissions_por_formulario: registros por formulario dentro de cada proyecto
    """
    try:
        client = _get_client()
        projects = client.get_projects()

        por_dia = Counter()
        por_proyecto = []
        por_formulario = []

        for p in projects:
            pid = p["id"]
            try:
                forms = client.get_forms(pid)
            except Exception:
                forms = []

            total_proyecto = 0
            form_data = []

            for f in forms:
                xml_id = f["xmlFormId"]
                try:
                    submissions = client.get_all_submissions(pid, xml_id)
                except Exception:
                    submissions = []

                count = len(submissions)
                total_proyecto += count

                form_data.append({
                    "project_id": pid,
                    "project_name": p.get("name", f"Proyecto {pid}"),
                    "form_id": xml_id,
                    "form_name": f.get("name", xml_id),
                    "count": count,
                })

                # Por dia
                for s in submissions:
                    start = s.get("start") or s.get("today")
                    if start:
                        try:
                            day = start[:10]  # YYYY-MM-DD
                            por_dia[day] += 1
                        except Exception:
                            pass

            por_formulario.extend(form_data)
            por_proyecto.append({
                "project_id": pid,
                "project_name": p.get("name", f"Proyecto {pid}"),
                "count": total_proyecto,
            })

        client.close()

        # Ordenar por dia
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
async def project_summary(project_id: int):
    """
    Resumen de un proyecto:
    - descripcion, estado (implementado/en pausa/no implementado)
    - numero de preguntas
    - propietario
    - ultima edicion, ultima modificacion, ultima implementacion, ultimo envio
    - ubicacion: estado, municipio, parroquia, sector/comunidad
    - envios agrupados: ultimos 7 dias, 31 dias, 3 meses, 12 meses
    """
    try:
        client = _get_client()
        projects = client.get_projects()
        project = None
        for p in projects:
            if p["id"] == project_id:
                project = p
                break
        if not project:
            client.close()
            raise HTTPException(status_code=404, detail="Proyecto no encontrado")

        forms = client.get_forms(project_id)

        total_preguntas = 0
        total_submissions = 0
        last_submission_date = None
        last_implementation_date = None

        import re
        from datetime import datetime, timezone

        for f in forms:
            xml_id = f["xmlFormId"]
            try:
                xml = client.get_form_xml(project_id, xml_id)
                if xml:
                    inputs = re.findall(r'(?:input|select1|select|range)\s+ref="/([^"]+)"', xml)
                    total_preguntas += len(inputs)
            except Exception:
                pass

            try:
                submissions = client.get_all_submissions(project_id, xml_id)
                total_submissions += len(submissions)
                for s in submissions:
                    start = s.get("start") or s.get("today")
                    if start:
                        try:
                            d = start[:10]
                            if last_submission_date is None or d > last_submission_date:
                                last_submission_date = d
                        except Exception:
                            pass
            except Exception:
                pass

            # Ultima implementacion = updatedAt del formulario
            updated = f.get("updatedAt")
            if updated:
                try:
                    d = updated[:10]
                    if last_implementation_date is None or d > last_implementation_date:
                        last_implementation_date = d
                except Exception:
                    pass

            # Estado del formulario
            form_state = f.get("state", "")

        client.close()

        # Estado del proyecto (basado en forms y fechas)
        if last_implementation_date:
            estado = "implementado"
        elif project.get("archived"):
            estado = "en pausa"
        else:
            estado = "no implementado"

        # Fechas del proyecto
        created = project.get("createdAt", "")
        updated = project.get("updatedAt", "")
        created_str = created[:10] if created else ""
        updated_str = updated[:10] if updated else ""

        # Propietario (del assignment)
        propietario = ""

        # Calculo de envios por rango
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)

        
        def submissions_en_rango(rango_dias):
            """Cuenta envios en los ultimos N dias."""
            count = 0
            for f in forms:
                xml_id = f["xmlFormId"]
                try:
                    submissions = client.get_all_submissions(project_id, xml_id)
                    for s in submissions:
                        start = s.get("start") or s.get("today")
                        if start:
                            try:
                                d = datetime.fromisoformat(start.replace("Z", "+00:00"))
                                if (now - d).days <= rango_dias:
                                    count += 1
                            except Exception:
                                pass
                except Exception:
                    pass
            return count

        return {
            "project": {
                "id": project_id,
                "name": project.get("name", f"Proyecto {project_id}"),
                "description": project.get("description", "") or "",
                "estado": estado,
                "num_preguntas": total_preguntas,
                "propietario": propietario or "No asignado",
                "created_at": created_str,
                "updated_at": updated_str,
                "last_implementation": last_implementation_date or "",
                "last_submission": last_submission_date or "",
                "total_submissions": total_submissions,
            },
            "ubicacion": {
                "estado": "",
                "municipio": "",
                "parroquia": "",
                "sector_comunidad": "",
            },
            "envios_rangos": {
                "ultimos_7_dias": submissions_en_rango(7),
                "ultimos_31_dias": submissions_en_rango(31),
                "ultimos_3_meses": submissions_en_rango(90),
                "ultimos_12_meses": submissions_en_rango(365),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/forms")
async def list_forms(project_id: int):
    """Lista formularios de un proyecto."""
    try:
        client = _get_client()
        forms = client.get_forms(project_id)
        client.close()
        return {"forms": forms}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
