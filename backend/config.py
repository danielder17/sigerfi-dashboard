# Configuración del backend SIGERFI v2

APP_NAME = "SIGERFI Dashboard v2"
APP_VERSION = "0.1.0"

# ODK Central por defecto
ODK_DEFAULT_URL = "https://odk-rfi.duckdns.org"
ODK_DEFAULT_EMAIL = "danielder71@yandex.com"
ODK_DEFAULT_PASSWORD = "mrgeov_bot71"

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
import os as _os
if _os.environ.get("RENDER"):
    # En producción, usar variable de entorno o permitir frontend de Vercel
    env_cors = _os.environ.get("CORS_ORIGINS")
    if env_cors:
        import json as _json
        try:
            CORS_ORIGINS = _json.loads(env_cors)
        except (ValueError, _json.JSONDecodeError):
            CORS_ORIGINS = env_cors.split(",")

# Server
HOST = "0.0.0.0"
PORT = 8010
