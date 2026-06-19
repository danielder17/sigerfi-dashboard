"""
FastAPI app principal - SIGERFI Dashboard v2.
"""

import asyncio
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import APP_NAME, APP_VERSION, CORS_ORIGINS, HOST, PORT, \
    ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD
from routes import projects, forms, reports, auth, etl, queries, cache_admin
from services.etl_service import list_cached_forms, run_etl
from odk_client import ODKClient


def _auto_cache_all():
    """
    Cachea TODOS los formularios de todos los proyectos accesibles
    al iniciar el backend, para que el dashboard tenga datos disponibles
    incluso después de un deploy (Render resetea el filesystem).
    """
    try:
        # Login con credenciales por defecto (bot)
        client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
        client.login()
        token = client.token
        client.close()

        # Obtener proyectos
        import ssl, urllib.request
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(
            f"{ODK_DEFAULT_URL}/v1/projects",
            headers={"Authorization": f"Bearer {token}"}
        )
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            projects_data = json.loads(r.read().decode())

        cached_count = 0
        error_count = 0

        for proj in projects_data:
            pid = proj["id"]
            # Probar acceso al proyecto
            req2 = urllib.request.Request(
                f"{ODK_DEFAULT_URL}/v1/projects/{pid}/forms",
                headers={"Authorization": f"Bearer {token}"}
            )
            try:
                with urllib.request.urlopen(req2, timeout=15, context=ctx) as r2:
                    forms_data = json.loads(r2.read().decode())
            except urllib.error.HTTPError as e:
                if e.code == 403:
                    continue  # Sin acceso al proyecto
                error_count += 1
                continue

            for form in forms_data:
                fid = form.get("xmlFormId") or form.get("id")
                if not fid:
                    continue
                try:
                    result = run_etl(pid, fid, force=True,
                                     odk_url=ODK_DEFAULT_URL,
                                     odk_token=token)
                    if result.get("status") == "ok":
                        cached_count += 1
                        print(f"  [AutoCache] ✅ [{pid}] {fid}: {result.get('rows')} subs")
                    else:
                        error_count += 1
                        print(f"  [AutoCache] ❌ [{pid}] {fid}: {result.get('error')}")
                except Exception as e:
                    error_count += 1
                    print(f"  [AutoCache] ❌ [{pid}] {fid}: {str(e)[:100]}")

        print(f"[AutoCache] Completado: {cached_count} formularios cacheados, "
              f"{error_count} errores")
    except Exception as e:
        print(f"[AutoCache] Error general: {str(e)[:200]}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"[{APP_NAME}] Iniciando...")
    print(f"[{APP_NAME}] Ejecutando auto-cache de formularios...")
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _auto_cache_all)
    except Exception as e:
        print(f"[{APP_NAME}] Auto-cache falló (no crítico): {str(e)[:200]}")
    yield
    # Shutdown
    print(f"[{APP_NAME}] Deteniendo...")


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


# Rutas
app.include_router(projects.router, prefix="/api")
app.include_router(forms.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(auth.router)
app.include_router(etl.router)
app.include_router(queries.router)
app.include_router(cache_admin.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
