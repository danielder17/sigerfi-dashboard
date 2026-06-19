"""
Rutas del servicio ETL - gestión de caché de datos homologados.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from services.etl_service import (
    run_etl,
    get_homologated_submissions,
    get_homologated_repeats,
    get_etl_status,
    list_cached_forms,
    init_connection,
)
from odk_client import ODKClient
from config import ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD

router = APIRouter(prefix="/etl", tags=["ETL - Homologación"])


class RunETLRequest(BaseModel):
    project_id: int
    form_id: str
    force: bool = False


@router.post("/run")
async def etl_run(body: RunETLRequest):
    """Ejecuta el pipeline ETL para un formulario: extrae, transforma y cachea."""
    try:
        client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
        client.login()
        token = client.token
        client.close()

        result = run_etl(
            project_id=body.project_id,
            form_id=body.form_id,
            force=body.force,
            odk_url=ODK_DEFAULT_URL,
            odk_token=token,
        )

        if result["status"] == "error":
            raise HTTPException(status_code=500, detail=result["error"])

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def etl_status(project_id: Optional[int] = None, form_id: Optional[str] = None):
    """Retorna el log de ejecuciones ETL."""
    try:
        return get_etl_status(project_id, form_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cached")
async def etl_cached():
    """Lista los formularios actualmente en caché."""
    try:
        return {"forms": list_cached_forms()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data")
async def etl_data(project_id: int = Query(...), form_id: str = Query(...)):
    """Retorna los datos homologados de un formulario (submissions + fields)."""
    try:
        subs, fields = get_homologated_submissions(project_id, form_id)
        return {
            "submissions": subs,
            "fields": fields,
            "count": len(subs),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repeats")
async def etl_repeats(
    project_id: int = Query(...),
    form_id: str = Query(...),
    repeat_name: str = Query(...),
):
    """Retorna los registros de un repeat group homologados."""
    try:
        items = get_homologated_repeats(project_id, form_id, repeat_name)
        return {
            "repeats": items,
            "count": len(items),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
