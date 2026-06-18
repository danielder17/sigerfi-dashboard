# SIGERFI Dashboard v2 — Manual del Administrador

Dashboard interactivo para visualizar datos recolectados con **ODK Central**.
Conecta formularios de campo → backend FastAPI → frontend Next.js con mapas, gráficos y análisis.

---

## 1. Arquitectura del sistema

```
Navegador Web
https://sigerfi-dashboard.vercel.app
       │ HTTPS
       ▼
Vercel (Frontend)
Next.js 16 + shadcn/ui + MapLibre
Plan Hobby — $0
       │ HTTPS
       ▼
Render (Backend API)
FastAPI + Uvicorn
Plan Free — $0
https://sigerfi-api.onrender.com
       │ HTTPS
       ▼
ODK Central (Fuente de datos)
https://odk-rfi.duckdns.org
```

| Componente | URL | Plan |
|-----------|-----|------|
| Frontend | https://sigerfi-dashboard.vercel.app | Vercel Hobby ($0) |
| Backend | https://sigerfi-api.onrender.com | Render Free ($0) |
| API Docs | https://sigerfi-api.onrender.com/docs | - |

---

## 2. Acceso al dashboard

### Producción (internet)

Solo abre: **https://sigerfi-dashboard.vercel.app**

No requiere instalación. Cualquier navegador moderno funciona.

### Desarrollo local

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8010`
- API docs: `http://localhost:8010/docs`

### Iniciar entorno local

```bash
# Terminal 1 — Backend
cd odk-dashboard-v2/backend
py -3.12 -m uvicorn main:app --host 0.0.0.0 --port 8010 --reload

# Terminal 2 — Frontend
cd odk-dashboard-v2/frontend
npx next dev -p 3000
```

---

## 3. Secciones del dashboard

### Panel de Control (Home)
- KPIs: total proyectos, formularios, registros
- Gráficos de actividad por día, proyecto y formulario

### Proyectos
- Lista de proyectos desde ODK Central
- Al hacer clic → vista detallada con 5 pestañas

### Pestañas de proyecto

| Pestaña | Función |
|---------|---------|
| **Datos** | Tabla de registros con búsqueda, filtros, y vista individual 👁️ |
| **Informe** | Grupos Lógicos + Módulos de Análisis con gráficos ECharts |
| **Galería** | Imágenes, audios y videos adjuntos |
| **Descargas** | Exportar a CSV, Excel, JSON, GeoJSON, Shapefile |
| **Mapa** | Visualización geográfica con filtro espacial |

---

## 4. Módulos de Análisis

9 módulos que se activan automáticamente según los campos del formulario:

| # | Módulo | Consultas | Detecta si existe campo |
|---|--------|-----------|------------------------|
| 1 | Identificación y Cobertura | 6 | estado, municipio, parroquia |
| 2 | Servicio de Internet | 4 | internet, tipo_conexion |
| 3 | Tipo de Productor | 4 | tipo_productor, tenencia_tierra |
| 4 | Producción Agrícola | 7 | hectareas_cultivo, rendimiento |
| 5 | Fumigación | 5 | fumigacion, tipo_fumigacion |
| 6 | Fertilización | 4 | fertilizacion, tipo_fertilizante |
| 7 | Vías de Acceso y Asociatividad | 5 | acceso_vias, asociacion_agricola |
| 8 | Análisis Cruzados | 4 | combina dos o más variables |
| 9 | Demográfico (auto-detect) | 3 | edad, genero, familiares |

### Agregar un módulo nuevo

Crear archivo JSON en `backend/services/analysis_modules/`:

```json
{
  "module_id": "mi_modulo",
  "name": "Mi Módulo",
  "description": "Qué analiza",
  "detection": {
    "required_fields": ["campo_exacto"],
    "auto_detect": ["variante1|variante2"]
  },
  "queries": [
    {
      "id": "q1",
      "question": "¿Pregunta de negocio?",
      "type": "count_group",
      "field": "campo",
      "chart": "bar"
    }
  ]
}
```

Tipos de query: `count`, `count_group`, `binary_pie`, `multi_select_freq`, `numeric_kpi`, `text_freq`, `contingency`, `boxplot`, `scatter`, `stacked_bar`, `heatmap`, `numeric_grouped`, `temporal_series`, `mixed_query`.

---

## 5. Activar / Desactivar el dashboard en producción

### Activar backend (Render)

1. https://dashboard.render.com → `sigerfi-api`
2. **Manual Deploy** → **Deploy latest commit**
3. Esperar ~2 min hasta ver "Live"

### Activar frontend (Vercel)

1. https://vercel.com/danielder17/sigerfi/sigerfi-dashboard
2. **Deployments** → último → **Redeploy**

### Desactivar backend (Render)

1. Render Dashboard → `sigerfi-api`
2. **Settings** → **Suspend Service** → Confirmar
3. Render deja de facturar recursos. Los datos NO se pierden.

### Desactivar frontend (Vercel)

**Opción A (quitar dominio, recomendada):**
1. Proyecto → **Settings** → **Domains**
2. `sigerfi-dashboard.vercel.app` → Remove
3. El código sigue en GitHub, el proyecto existe, solo no se sirve.

**Opción B (eliminar proyecto):**
1. Proyecto → **Settings** → **General** → **Delete Project**
2. ⚠️ Borra todo en Vercel. Código en GitHub intacto.

### Reactivar después de desactivar

**Si solo se removió el dominio:**
1. **Settings** → **Domains** → **Add** → `sigerfi-dashboard.vercel.app`
2. **Deployments** → **Redeploy**

**Si se eliminó el proyecto:**
1. Vercel → **Add New** → **Project** → importar `danielder17/sigerfi-dashboard`
2. Root Directory: `frontend`
3. Environment Variable: `NEXT_PUBLIC_API_URL=https://sigerfi-api.onrender.com`
4. **Deploy**

### Costos

| Plataforma | Plan | Costo | Inactividad |
|-----------|------|-------|-------------|
| Vercel | Hobby | $0/mes | Nunca duerme |
| Render | Free | $0/mes | Duerme a los 15 min, despierta solo (~30s) |

Sin tarjeta de crédito registrada. Sin riesgo de cobros.

---

## 6. Actualizar código

### Push a GitHub (autodeploy)

```bash
cd odk-dashboard-v2
git add .
git commit -m "Descripción del cambio"
git push origin main
```

Vercel y Render redeployan automáticamente (~1-2 min).

### Redeploy manual

**Vercel:** Deployments → último → ... → Redeploy
**Render:** Manual Deploy → Deploy latest commit

### Actualizar variables de entorno

**Vercel:** Settings → Environment Variables → Editar → Save → Redeploy
**Render:** Environment (menú izquierdo) → Editar → Save Changes

---

## 7. Solución de problemas

| Problema | Causa | Solución |
|----------|-------|----------|
| Carga lenta primera vez | Cold start de Render (30s) | Esperar y refrescar |
| Not Found / 502 | Backend caído | Revisar `api.onrender.com/docs` |
| No aparecen datos | Credenciales ODK incorrectas | Render → Environment → revisar ODK_EMAIL/PASSWORD |
| Error CORS | URL del frontend no autorizada | Render → Environment → CORS_ORIGINS |
| Build falla en Vercel | Root Directory incorrecto | Settings → Build → Root Directory → `frontend` |
| Mapa no carga | Sin conexión a internet | Cambiar capa base en el selector del mapa |

### Verificar backend

Abrir https://sigerfi-api.onrender.com/docs — debe mostrar la documentación Swagger con todos los endpoints.

---

## 8. Estructura del código

```
odk-dashboard-v2/
├── backend/
│   ├── main.py                 # Punto de entrada FastAPI
│   ├── config.py               # Configuración (CORS, ODK)
│   ├── odk_client.py           # Cliente ODK Central
│   ├── requirements.txt
│   ├── routes/                 # Endpoints de la API
│   └── services/               # Lógica de negocio
│       ├── analysis_modules.py # Motor de módulos
│       └── analysis_modules/   # 9 definiciones JSON
├── frontend/
│   └── src/
│       ├── app/                # Páginas (Home, Proyectos, Settings)
│       ├── components/
│       │   ├── ui/             # shadcn/ui
│       │   ├── project/tabs/   # 5 pestañas + vistas
│       │   └── ...
│       ├── lib/                # API client, utilidades
│       └── types/              # TypeScript types
├── render.yaml                 # Config Render
├── .gitignore
└── README.md
```

---

## Notas finales

- **ODK Central** es la fuente única de datos — no hay base de datos local.
- El dashboard es **solo lectura** — no modifica datos en ODK Central.
- Los **módulos de análisis** se detectan por coincidencia exacta de nombres de campo.
- Código fuente: https://github.com/danielder17/sigerfi-dashboard

---

*Documento generado el 2026-06-18. SIGERFI Dashboard v0.1.0*
