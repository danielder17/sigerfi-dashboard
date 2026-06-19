"""
Endpoint para consultar/cambiar la fuente de datos activa.
Soporta persistencia vía archivo JSON (para Render u otros entornos efímeros).
"""
import json
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import DATA_SOURCE, ODK_DEFAULT_URL, KOBO_DEFAULT_URL, \
    ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD, KOBO_DEFAULT_API_KEY, \
    SECRET_KEY
from services.adapters.factory import get_adapter, clear_adapters, \
    get_configured_adapter
from routes.deps import admin_dependency

router = APIRouter(prefix="/api/source", tags=["source"])

# Archivo de persistencia para configuración de fuente
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "source_config.json")
CONFIG_FILE = os.path.normpath(CONFIG_FILE)


class SourceConfig(BaseModel):
    """Configuración de fuente de datos."""
    source: str = "odk"  # "odk" | "kobo"
    server_url: str = ""
    email: str = ""
    password: str = ""
    api_key: str = ""


def _load_persisted_config() -> dict:
    """Carga la configuración persistida desde el archivo JSON."""
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_persisted_config(config: dict):
    """Guarda la configuración en el archivo JSON."""
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def _resolve_source_config() -> dict:
    """
    Resuelve la configuración actual:
    1. Archivo persistido (source_config.json) — si existe y es reciente
    2. Variables de entorno (por defecto)
    """
    persisted = _load_persisted_config()
    if persisted.get("source") and persisted.get("server_url"):
        return {
            "data_source": persisted.get("source", DATA_SOURCE),
            "odk_url": persisted.get("odk_url", ODK_DEFAULT_URL),
            "kobo_url": persisted.get("kobo_url", KOBO_DEFAULT_URL),
            "odk_email": persisted.get("email", ODK_DEFAULT_EMAIL),
            "koob_api_key": persisted.get("api_key", ""),
            "persisted": True,
        }

    # Fallback a variables de entorno
    return {
        "data_source": DATA_SOURCE,
        "odk_url": ODK_DEFAULT_URL,
        "kobo_url": KOBO_DEFAULT_URL,
        "odk_email": ODK_DEFAULT_EMAIL,
        "has_kobo_api_key": bool(KOBO_DEFAULT_API_KEY),
        "persisted": False,
    }


@router.get("/")
async def get_source():
    """Consulta la fuente activa y su estado."""
    config = _resolve_source_config()
    return config


@router.post("/test")
async def test_source(config: SourceConfig):
    """Prueba la conexión con una fuente de datos."""
    try:
        adapter = get_adapter(config.source, config.server_url)
        if config.source == "kobo":
            key = config.api_key or _resolve_source_config().get("koob_api_key", KOBO_DEFAULT_API_KEY)
            if not key:
                raise HTTPException(status_code=400, detail="API Key requerida para KoBo")
            adapter.login(api_key=key)
        else:
            email = config.email or ODK_DEFAULT_EMAIL
            password = config.password or ODK_DEFAULT_PASSWORD
            adapter.login(email=email, password=password)

        projects = adapter.get_projects()
        projects_list = projects if isinstance(projects, list) else []
        return {
            "status": "ok",
            "server_url": config.server_url,
            "source": config.source,
            "projects_count": len(projects_list),
            "projects": [
                {"id": str(p.get("id") or p.get("uid", "")), "name": p.get("name", "")}
                for p in projects_list
            ][:20]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)[:300])


@router.post("/activate")
async def activate_source(config: SourceConfig, _admin=Depends(admin_dependency)):
    """
    Activa una fuente de datos y persiste la configuración.
    Luego de activar, el backend usará esta fuente en el próximo auto-cache.
    NOTA: En Render, el cambio persiste en disco mientras el container viva.
    Para persistencia permanente, configurar las variables de entorno.
    """

    # Probar conexión primero
    try:
        adapter = get_adapter(config.source, config.server_url)
        if config.source == "kobo":
            if not config.api_key:
                raise HTTPException(status_code=400, detail="API Key requerida para KoBo")
            adapter.login(api_key=config.api_key)
        else:
            adapter.login(email=config.email or ODK_DEFAULT_EMAIL,
                          password=config.password or ODK_DEFAULT_PASSWORD)

        projects = adapter.get_projects()
        projects_list = projects if isinstance(projects, list) else []
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Conexión fallida: {str(e)[:300]}")

    # Persistir configuración
    config_data = {
        "source": config.source,
        "server_url": config.server_url,
        "email": config.email or ODK_DEFAULT_EMAIL,
        "api_key": config.api_key or "",
        "odk_url": ODK_DEFAULT_URL,
        "kobo_url": KOBO_DEFAULT_URL,
        "activated_at": __import__("datetime").datetime.now().isoformat(),
    }
    _save_persisted_config(config_data)

    # Limpiar caché de adaptadores para forzar recarga
    clear_adapters()

    return {
        "status": "ok",
        "message": f"Fuente activada: {config.source} ({config.server_url})",
        "projects_count": len(projects_list),
        "projects": [
            {"id": str(p.get("id") or p.get("uid", "")), "name": p.get("name", "")}
            for p in projects_list
        ][:20],
        "note": "El backend usará esta fuente. En Render, el cambio persiste mientras el container esté activo."
    }


@router.post("/reset")
async def reset_source(_admin=Depends(admin_dependency)):
    """Resetea a la fuente configurada por variables de entorno."""

    if os.path.exists(CONFIG_FILE):
        os.remove(CONFIG_FILE)

    clear_adapters()

    return {
        "status": "ok",
        "message": f"Fuente reseteada. Usando variable de entorno: DATA_SOURCE={DATA_SOURCE}"
    }
