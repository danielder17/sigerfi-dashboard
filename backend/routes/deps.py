"""
Utilidad de autenticación para rutas protegidas.
Permite verificar el JWT y el rol admin desde cualquier endpoint.
"""
from fastapi import HTTPException, Request
from routes.auth import _decode_jwt


def get_current_user(request: Request) -> dict:
    """Extrae y verifica el usuario desde el token JWT en el header Authorization."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token requerido")
    token = auth.split(" ", 1)[1]
    payload = _decode_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return payload


def require_admin(request: Request):
    """Verifica que el usuario autenticado sea administrador."""
    user = get_current_user(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Se requieren permisos de administrador")
    return user
