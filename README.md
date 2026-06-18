# SIGERFI Dashboard v2 🗺️

Dashboard interactivo para visualizar datos recolectados con **ODK Central** en campo.
Conecta formularios ODK → backend FastAPI → frontend Next.js con mapas, gráficos y análisis.

## Stack

- **Frontend**: Next.js 16 + shadcn/ui + MapLibre GL + ECharts
- **Backend**: FastAPI + Uvicorn + ODK Central API
- **Mapas**: CARTO (dark-matter), Esri World Imagery, OpenFreeMap (OSM)

## Despliegue

- Frontend: [Vercel](https://vercel.com) (Plan Hobby — gratis)
- Backend: [Render](https://render.com) (Plan Free — $0)

## Variables de entorno

### Backend (Render)

| Variable | Descripción |
|----------|-------------|
| `ODK_CENTRAL_URL` | URL del servidor ODK Central |
| `ODK_EMAIL` | Email de cuenta ODK |
| `ODK_PASSWORD` | Contraseña de cuenta ODK |
| `CORS_ORIGINS` | Orígenes permitidos (JSON array) |
| `PYTHON_VERSION` | Versión de Python (3.12.0) |

### Frontend (Vercel)

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | URL del backend en Render |
