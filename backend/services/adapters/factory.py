"""
DataSource Factory: Selecciona y gestiona adapters según configuración.
Soporta persistencia de fuente vía archivo JSON (routes/source.py).
"""
from __future__ import annotations
import json
import os
from typing import Optional
from . import DataSourceAdapter
from .odk_adapter import ODKCentralAdapter
from .kobo_adapter import KoboAPIAdapter


# Cache global de adaptadores activos
_active_adapters: dict[str, DataSourceAdapter] = {}

# Archivo de configuración persistida (misma ruta que en routes/source.py)
_CONFIG_FILE = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "source_config.json")
)


def _load_persisted_config() -> dict:
    """Carga la configuración persistida (cambio de fuente manual)."""
    try:
        if os.path.exists(_CONFIG_FILE):
            with open(_CONFIG_FILE, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def resolve_active_source() -> tuple[str, str, dict]:
    """
    Resuelve la fuente activa:
    1. Archivo persistido (source_config.json) — si existe
    2. Variables de entorno (default)

    Returns:
        (source_type, server_url, config_dict)
    """
    persisted = _load_persisted_config()
    if persisted.get("source"):
        source_type = persisted["source"]
        server_url = persisted.get("server_url", "")
        api_key = persisted.get("api_key", "")
        return source_type, server_url, {"api_key": api_key}

    # Fallback a variables de entorno
    import config as app_config
    source_type = app_config.DATA_SOURCE
    if source_type == "kobo":
        return source_type, app_config.KOBO_DEFAULT_URL, {
            "api_key": app_config.KOBO_DEFAULT_API_KEY
        }
    else:
        return source_type, app_config.ODK_DEFAULT_URL, {
            "email": app_config.ODK_DEFAULT_EMAIL,
            "password": app_config.ODK_DEFAULT_PASSWORD,
        }


def get_adapter(source: str, server_url: str, api_key: str = "") -> DataSourceAdapter:
    """
    Retorna (o crea) un adaptador para la fuente especificada.

    Args:
        source: "odk" | "kobo"
        server_url: URL base del servidor ODK/KoBo

    Returns:
        Instancia de DataSourceAdapter
    """
    cache_key = f"{source}::{server_url}"
    if cache_key in _active_adapters:
        return _active_adapters[cache_key]

    if source == "kobo":
        proxy_url = os.environ.get("KOBO_PROXY_URL", "https://muddy-haze-ece9.danielder-e45.workers.dev")
        adapter = KoboAPIAdapter(server_url, proxy_url=proxy_url)
    elif source == "odk":
        adapter = ODKCentralAdapter(server_url)
    else:
        raise ValueError(f"Fuente de datos desconocida: {source}")

    _active_adapters[cache_key] = adapter
    return adapter


def get_configured_adapter(auto_login: bool = True) -> DataSourceAdapter:
    """
    Retorna el adapter logueado según la fuente persistida o variable de entorno.

    Args:
        auto_login: Si True, hace login automáticamente

    Returns:
        Instancia de DataSourceAdapter (logueada)
    """
    source_type, server_url, extra = resolve_active_source()
    adapter = get_adapter(source_type, server_url)

    if auto_login:
        try:
            if source_type == "kobo":
                api_key = extra.get("api_key", "")
                if api_key:
                    adapter.login(api_key=api_key)
            else:
                import config as app_config
                email = extra.get("email", app_config.ODK_DEFAULT_EMAIL)
                password = extra.get("password", app_config.ODK_DEFAULT_PASSWORD)
                adapter.login(email=email, password=password)
        except Exception as e:
            print(f"[Factory] Login falló para {source_type}: {str(e)[:100]}")

    return adapter


def register_adapter(source: str, server_url: str, adapter: DataSourceAdapter):
    """Registra un adaptador ya inicializado (con login hecho)."""
    cache_key = f"{source}::{server_url}"
    _active_adapters[cache_key] = adapter


def clear_adapters():
    """Limpia la caché de adaptadores (útil al cambiar configuración)."""
    _active_adapters.clear()
