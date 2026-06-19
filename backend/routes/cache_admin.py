"""
Rutas de administración del caché ETL.
Fase 4: refresco automático y limpieza.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from services.cache_manager import (
    get_cache_info,
    refresh_form,
    refresh_all_cached,
    clean_expired_forms,
    clean_form,
    clean_all,
    get_cache_stats,
    incremental_refresh,
)
from odk_client import ODKClient
from config import ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD

router = APIRouter(prefix="/cache", tags=["Caché ETL - Administración"])


class RefreshRequest(BaseModel):
    project_id: int
    form_id: str
    force: bool = False


class CleanRequest(BaseModel):
    project_id: Optional[int] = None
    form_id: Optional[str] = None


def _get_token() -> str:
    client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
    client.login()
    token = client.token
    client.close()
    return token


@router.get("/info")
async def cache_info(project_id: int = Query(...), form_id: str = Query(...)):
    """Info detallada del caché para un formulario."""
    try:
        return get_cache_info(project_id, form_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def cache_stats():
    """Estadísticas globales del caché."""
    try:
        return get_cache_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh")
async def cache_refresh(body: RefreshRequest):
    """Refresca el caché de un formulario si está expirado o si force=True."""
    try:
        token = _get_token()
        result = refresh_form(
            body.project_id,
            body.form_id,
            odk_url=ODK_DEFAULT_URL,
            odk_token=token,
            force=body.force,
        )
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("error", "Error desconocido"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh-all")
async def cache_refresh_all(force: bool = Query(False)):
    """Refresca todos los formularios en caché."""
    try:
        token = _get_token()
        results = refresh_all_cached(
            odk_url=ODK_DEFAULT_URL,
            odk_token=token,
            force=force,
        )
        return {
            "results": results,
            "total": len(results),
            "errors": sum(1 for r in results if r.get("status") == "error"),
            "refreshed": sum(1 for r in results if r.get("status") == "ok"),
            "skipped": sum(1 for r in results if r.get("status") == "skipped"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clean-expired")
async def cache_clean_expired(max_age_hours: int = Query(48, ge=1)):
    """Elimina formularios del caché que no se han actualizado en más de N horas."""
    try:
        return clean_expired_forms(max_age_hours)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clean")
async def cache_clean(body: CleanRequest):
    """Elimina un formulario específico del caché o todo si no se especifica."""
    try:
        if body.project_id and body.form_id:
            return clean_form(body.project_id, body.form_id)
        else:
            # Limpiar expirados por defecto (48h)
            return clean_expired_forms(48)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clean-all")
async def cache_clean_all():
    """Limpia TODO el caché (requiere reconfirmación)."""
    try:
        return clean_all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
