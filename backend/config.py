# Configuración del backend SIGERFI v2

import os as _os

APP_NAME = "SIGERFI Dashboard v2"
APP_VERSION = "0.1.0"

# Fuente de datos activa: "odk" (default) | "kobo"
DATA_SOURCE = _os.environ.get("DATA_SOURCE", "odk")

# ODK Central por defecto
ODK_DEFAULT_URL = _os.environ.get("ODK_URL", "https://odk-rfi.duckdns.org")
ODK_DEFAULT_EMAIL = _os.environ.get("ODK_EMAIL", "danielder71@yandex.com")
ODK_DEFAULT_PASSWORD = _os.environ.get("ODK_PASSWORD", "mrgeov_bot71")

# KoBoToolbox (solo si DATA_SOURCE=kobo)
KOBO_DEFAULT_URL = _os.environ.get("KOBO_URL", "https://kf.kobotoolbox.org")
KOBO_DEFAULT_API_KEY = _os.environ.get("KOBO_API_KEY", "")

# Base de datos
DATABASE_URL = "sqlite:///./sigerfi_v2.db"

# CORS
# En producción, Render inyecta CORS_ORIGINS via variable de entorno
CORS_ORIGINS = [
    "http://localhost:3000",  # Next.js dev
    "http://localhost:3001",  # Next.js dev (fallback)
    "http://localhost:5173",  # Vite dev (alternativa)
    "*",  # Permitir cualquier origen en desarrollo
]

# Detectar si estamos en Render
if _os.environ.get("RENDER"):
    # En producción, usar variable de entorno o permitir frontend de Vercel
    env_cors = _os.environ.get("CORS_ORIGINS")
    if env_cors:
        import json as _json
        try:
            CORS_ORIGINS = _json.loads(env_cors)
        except (ValueError, _json.JSONDecodeError):
            CORS_ORIGINS = env_cors.split(",")

# JWT / Autenticación
SECRET_KEY = _os.environ.get("SECRET_KEY", "sigerfi-dev-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(_os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8 horas (o 1440 para 24h)

# Admin local (fallback offline cuando ODK no responde)
# Generar hash: python -X utf8 -c "import hashlib;print(hashlib.sha256(b'tu_password').hexdigest())"
ADMIN_EMAIL = _os.environ.get("ADMIN_EMAIL", "admin@sigerfi.local")
ADMIN_PASSWORD_HASH = _os.environ.get("ADMIN_PASSWORD_HASH", "3f052ff735bd79474909abc49f5c5cf9833a648f936de5062ec0347a5a28d0e4")
ADMIN_DISPLAY_NAME = _os.environ.get("ADMIN_DISPLAY_NAME", "Admin Local")

# ETL / Cache
CACHE_TTL_MINUTES = int(_os.environ.get("CACHE_TTL_MINUTES", "60"))  # 1 hora

# Server
HOST = "127.0.0.1"
PORT = 8010
