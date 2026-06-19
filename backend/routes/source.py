"""
Endpoint para consultar/cambiar la fuente de datos activa.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import DATA_SOURCE, ODK_DEFAULT_URL, KOBO_DEFAULT_URL, \
    ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD, KOBO_DEFAULT_API_KEY
from services.adapters.factory import get_adapter, clear_adapters

router = APIRouter(prefix="/api/source", tags=["source"])


class SourceConfig(BaseModel):
    """Configuración de fuente de datos."""
    source: str = "odk"  # "odk" | "kobo"
    server_url: str = ""
    email: str = ""
    password: str = ""
    api_key: str = ""


@router.get("/")
async def get_source():
    """Consulta la fuente activa y su estado."""
    return {
        "data_source": DATA_SOURCE,
        "odk_url": ODK_DEFAULT_URL,
        "kobo_url": KOBO_DEFAULT_URL,
        "odk_email": ODK_DEFAULT_EMAIL,
        "has_kobo_api_key": bool(KOBO_DEFAULT_API_KEY),
    }


@router.post("/test")
async def test_source(config: SourceConfig):
    """Prueba la conexión con una fuente de datos."""
    try:
        adapter = get_adapter(config.source, config.server_url)
        if config.source == "kobo":
            if not config.api_key and not KOBO_DEFAULT_API_KEY:
                raise HTTPException(status_code=400, detail="API Key requerida para KoBo")
            adapter.login(api_key=config.api_key or KOBO_DEFAULT_API_KEY)
        else:
            adapter.login(email=config.email or ODK_DEFAULT_EMAIL,
                          password=config.password or ODK_DEFAULT_PASSWORD)

        projects = adapter.get_projects()
        return {
            "status": "ok",
            "server_url": config.server_url,
            "source": config.source,
            "projects_count": len(projects) if isinstance(projects, list) else 0,
            "projects": [
                {"id": p.get("id") or p.get("uid", ""), "name": p.get("name", "")}
                for p in (projects if isinstance(projects, list) else [])
            ][:20]  # Máximo 20 proyectos en preview
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)[:300])
