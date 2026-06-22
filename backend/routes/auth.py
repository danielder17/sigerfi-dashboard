"""
Endpoints de autenticación para SIGERFI Dashboard v2.
Valida contra ODK Central y genera JWT local.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import ssl
import json
import urllib.request

from config import ODK_DEFAULT_URL, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_DISPLAY_NAME

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


# ─── Modelos ──────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


# ─── JWT manual (sin librería externa) ─────────────────
# Usamos Python puro para evitar dependencias extra

import hmac
import base64
import hashlib
from datetime import datetime, timezone, timedelta

def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _base64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)

def _create_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _base64url_encode(json.dumps(header, separators=(",", ":")).encode())

    payload["exp"] = int((datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp())
    payload["iat"] = int(datetime.now(timezone.utc).timestamp())
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode())

    signature = hmac.new(SECRET_KEY.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
    sig_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"

def _decode_jwt(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts

        # Verificar firma
        expected_sig = hmac.new(SECRET_KEY.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
        actual_sig = _base64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload = json.loads(_base64url_decode(payload_b64))
        if payload.get("exp", 0) < datetime.now(timezone.utc).timestamp():
            return None  # Expirado

        return payload
    except Exception:
        return None


# ─── Validar contra ODK Central ────────────────────────

def _validar_en_odk(email: str, password: str) -> dict | None:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    url = f"{ODK_DEFAULT_URL.rstrip('/')}/v1/sessions"
    body = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")

    try:
        r = urllib.request.urlopen(req, context=ctx, timeout=15)
        resp = json.loads(r.read().decode())
        odk_token = resp.get("token")
        if not odk_token:
            return None

        # Obtener info del usuario
        user_url = f"{ODK_DEFAULT_URL.rstrip('/')}/v1/users/current"
        req2 = urllib.request.Request(user_url, headers={"Authorization": f"Bearer {odk_token}"})
        r2 = urllib.request.urlopen(req2, context=ctx, timeout=10)
        userdata = json.loads(r2.read().decode())

        # Detectar si es admin
        es_admin = False
        try:
            req4 = urllib.request.Request(
                f"{ODK_DEFAULT_URL.rstrip('/')}/v1/assignments",
                headers={"Authorization": f"Bearer {odk_token}"}
            )
            urllib.request.urlopen(req4, context=ctx, timeout=10)
            es_admin = True
        except Exception:
            es_admin = False

        return {
            "email": email,
            "displayName": userdata.get("displayName", email.split("@")[0]),
            "id": userdata.get("id"),
            "is_admin": es_admin,
        }
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return None
        raise HTTPException(status_code=502, detail=f"ODK Central error: {e.code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error conectando con ODK: {str(e)}")


# ─── Endpoints ─────────────────────────────────────────

def _validar_admin_local(email: str, password: str) -> dict | None:
    """Valida contra el admin local (offline)."""
    if not ADMIN_PASSWORD_HASH or not ADMIN_EMAIL:
        return None
    if email.lower() != ADMIN_EMAIL.lower():
        return None
    import hashlib
    ingresado_hash = hashlib.sha256(password.encode()).hexdigest()
    if ingresado_hash == ADMIN_PASSWORD_HASH:
        return {
            "email": ADMIN_EMAIL,
            "displayName": ADMIN_DISPLAY_NAME,
            "id": 0,
            "is_admin": True,
            "offline_mode": True,
        }
    return None


@router.post("/login")
async def login(body: LoginRequest):
    """Login: primero intenta ODK Central, si falla prueba admin local."""
    user_info = None
    offline = False

    try:
        user_info = _validar_en_odk(body.email, body.password)
    except Exception:
        # ODK no responde o hay error de red
        pass

    if not user_info:
        # Fallback: probar admin local
        user_info = _validar_admin_local(body.email, body.password)
        if user_info:
            offline = True

    if not user_info:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    jwt_token = _create_jwt({
        "sub": body.email,
        "displayName": user_info["displayName"],
        "userId": user_info.get("id", 0),
        "is_admin": user_info.get("is_admin", False),
        "offline_mode": offline,
    })

    return {
        "access_token": jwt_token,
        "token_type": "bearer",
        "displayName": user_info["displayName"],
        "email": body.email,
        "is_admin": user_info.get("is_admin", False),
        "offline_mode": offline,
    }


@router.get("/verify")
async def verify_token(request: Request):
    """Verifica si el token JWT es válido."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token requerido")
    token = auth.split(" ", 1)[1]
    payload = _decode_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return {
        "valid": True,
        "email": payload.get("sub"),
        "displayName": payload.get("displayName"),
        "is_admin": payload.get("is_admin", False),
    }
