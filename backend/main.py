"""
FastAPI app principal - SIGERFI Dashboard v2.
Ahora con soporte multi-fuente (ODK Central / KoBoToolbox).
"""

import asyncio
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import APP_NAME, APP_VERSION, CORS_ORIGINS, HOST, PORT, \
    ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD, \
    KOBO_DEFAULT_URL, KOBO_DEFAULT_API_KEY, DATA_SOURCE
from routes import projects, forms, reports, auth, etl, queries, cache_admin, source, export_routes
from services.etl_service import run_etl
from services.adapters.factory import get_adapter, get_configured_adapter, resolve_active_source, clear_adapters


def _auto_cache_all():
    """
    Cachea TODOS los formularios de todos los proyectos accesibles
    al iniciar el backend, usando el adapter configurado.
    """
    try:
        # Usar la fuente persistida o variable de entorno
        source_type, server_url, extra = resolve_active_source()
        source = source_type.lower()

        if source == "kobo":
            adapter = get_adapter("kobo", server_url)
            adapter.login(api_key=extra.get("api_key", ""))
        else:
            adapter = get_adapter("odk", server_url)
            adapter.login(
                email=extra.get("email", ODK_DEFAULT_EMAIL),
                password=extra.get("password", ODK_DEFAULT_PASSWORD)
            )
            source = "odk"

        # Obtener proyectos
        if source == "odk":
            projects_data = adapter.get_projects()
        else:
            # KoBo: adaptamos la lista de assets a una lista plana
            # En KoBo cada asset (form) está en su propio "proyecto"
            projects_data = adapter.get_projects()

        cached_count = 0
        error_count = 0

        if source == "odk":
            # ODK: iterar proyectos reales
            for proj in projects_data:
                pid = str(proj["id"])
                try:
                    forms_data = adapter.get_forms(pid)
                except Exception as e:
                    if "403" in str(e):
                        continue
                    error_count += 1
                    continue

                for form in forms_data:
                    fid = form.get("xmlFormId") or form.get("id")
                    if not fid:
                        continue
                    try:
                        result = run_etl(
                            pid, fid, force=True,
                            odk_url=server_url,
                            odk_token=adapter._token if hasattr(adapter, '_token') else "",
                            adapter=adapter
                        )
                        if result.get("status") == "ok":
                            cached_count += 1
                            print(f"  [AutoCache] ✅ [{pid}] {fid}: {result.get('rows')} subs")
                        else:
                            error_count += 1
                            print(f"  [AutoCache] ❌ [{pid}] {fid}: {result.get('error')}")
                    except Exception as e:
                        error_count += 1
                        print(f"  [AutoCache] ❌ [{pid}] {fid}: {str(e)[:100]}")
        else:
            # KoBo: los forms ya vienen como assets individuales
            for form in projects_data:
                uid = form.get("uid", form.get("xmlFormId"))
                if not uid:
                    continue
                try:
                    result = run_etl(
                        uid, uid, force=True,
                        odk_url=server_url,
                        odk_token=KOBO_DEFAULT_API_KEY,
                        adapter=adapter,
                        source="kobo"
                    )
                    if result.get("status") == "ok":
                        cached_count += 1
                        print(f"  [AutoCache] ✅ [kobo/{uid}] {form.get('name','')}: {result.get('rows')} subs")
                    else:
                        error_count += 1
                        print(f"  [AutoCache] ❌ [kobo/{uid}] {form.get('name','')}: {result.get('error')}")
                except Exception as e:
                    error_count += 1
                    print(f"  [AutoCache] ❌ [kobo/{uid}] {str(e)[:100]}")

        print(f"[AutoCache] Completado: {cached_count} formularios cacheados, "
              f"{error_count} errores")
    except Exception as e:
        print(f"[AutoCache] Error general: {str(e)[:200]}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"[{APP_NAME}] Iniciando (fuente: {DATA_SOURCE})...")
    print(f"[{APP_NAME}] Ejecutando auto-cache de formularios...")
    # Auto-cache solo para ODK (KoBo es muy lento, usamos caché on-demand)
    if DATA_SOURCE == "odk":
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
    return {"status": "ok", "version": APP_VERSION, "data_source": DATA_SOURCE}


# Rutas
app.include_router(projects.router, prefix="/api")
app.include_router(forms.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(auth.router)
app.include_router(etl.router)
app.include_router(queries.router)
app.include_router(cache_admin.router)
app.include_router(source.router)
app.include_router(export_routes.router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
