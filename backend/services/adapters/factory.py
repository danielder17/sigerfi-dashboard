"""
DataSource Factory: Selecciona y gestiona adapters según configuración.
"""
from __future__ import annotations
from typing import Optional
from . import DataSourceAdapter
from .odk_adapter import ODKCentralAdapter
from .kobo_adapter import KoboAPIAdapter


# Cache global de adaptadores activos
_active_adapters: dict[str, DataSourceAdapter] = {}


def get_adapter(source: str, server_url: str) -> DataSourceAdapter:
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


def get_configured_adapter() -> DataSourceAdapter:
    """
    Retorna el adaptador configurado desde la variable de entorno.
    Fallback a ODK Central si no hay configuración.
    """
    import os
    source = os.environ.get("DATA_SOURCE", "odk")
    server_url = os.environ.get("ODK_URL", os.environ.get("KOBO_URL", ""))
    return get_adapter(source, server_url)


def register_adapter(source: str, server_url: str, adapter: DataSourceAdapter):
    """Registra un adaptador ya inicializado (con login hecho)."""
    cache_key = f"{source}::{server_url}"
    _active_adapters[cache_key] = adapter


def clear_adapters():
    """Limpia la caché de adaptadores (útil al cambiar configuración)."""
    _active_adapters.clear()
