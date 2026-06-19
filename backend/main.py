"""
FastAPI app principal - SIGERFI Dashboard v2.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import APP_NAME, APP_VERSION, CORS_ORIGINS, HOST, PORT
from routes import projects, forms, reports, auth, etl


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"[{APP_NAME}] Iniciando...")
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
