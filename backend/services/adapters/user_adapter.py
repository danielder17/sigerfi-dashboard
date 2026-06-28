"""
user_adapter.py — Crea adapters temporales con las credenciales del usuario autenticado.

Cada request HTTP obtiene su propio adapter, evitando compartir sesiones
entre usuarios (el bot global solo ve 3 proyectos, el admin ve 5).

Estrategia:
1. Si request.state.user existe (populado por get_current_user()), usa esas credenciales.
2. Si no, decodifica el JWT directamente del header Authorization.
3. Si no hay JWT o no se puede decodificar, cae al adapter global (bot).
"""
from fastapi import Request
from .odk_adapter import ODKCentralAdapter
from .factory import get_configured_adapter

# Importar funciones JWT del módulo de auth
import sys
import os
import logging
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from routes.auth import _decode_jwt

logger = logging.getLogger("sigerfi.auth")


def _get_user_from_token(request: Request) -> dict | None:
    """Extrae el payload del JWT desde el header Authorization."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1]
    return _decode_jwt(token)


def get_user_adapter(request: Request) -> ODKCentralAdapter:
    """
    Crea un adapter ODK temporal con las credenciales del usuario autenticado.

    1) Intenta request.state.user (middleware de auth en deps.py).
    2) Si no, decodifica el JWT del header Authorization.
    3) Si todo falla, usa adapter global.

    Args:
        request: Request de FastAPI

    Returns:
        ODKCentralAdapter logueado con las credenciales del usuario (o fallback global)
    """
    # Fuente 1: request.state.user (populado por get_current_user / deps)
    user = getattr(request.state, "user", None)
    if user is None:
        # Fuente 2: decodificar JWT directamente del header
        user = _get_user_from_token(request)

    if user is None:
        # Fallback: adapter global del bot
        logger.warning("[FALLBACK] get_user_adapter() sin token JWT — usando adapter del bot")
        return get_configured_adapter(auto_login=True)

    email = user.get("sub") or user.get("email", "")
    password = user.get("odk_password", "")

    if not email or not password:
        logger.warning(f"[FALLBACK] get_user_adapter() sin credenciales en JWT (sub={email}) — usando adapter del bot")
        return get_configured_adapter(auto_login=True)

    # Crear adapter temporal
    from config import ODK_DEFAULT_URL
    adapter = ODKCentralAdapter(ODK_DEFAULT_URL)
    adapter.login(email=email, password=password)
    return adapter
