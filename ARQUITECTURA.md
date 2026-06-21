# Diagrama de Arquitectura - SIGERFI Data Analyst v2

## Visión General

```mermaid
---
title: SIGERFI Dashboard v2 - Arquitectura General
---
graph TB
    subgraph Frontend["Frontend - Next.js 16 (Vercel)"]
        UI["Componentes UI shadcn/ui"]
        PAGES["Páginas:<br/>Panel Control<br/>Proyectos<br/>Admin<br/>Settings"]
        LIBS["Librerías:<br/>auth.tsx<br/>api.ts<br/>source.tsx"]
    end

    subgraph Backend["Backend - FastAPI (Render)"]
        API["Endpoints API<br/>/api/auth<br/>/api/projects<br/>/api/forms<br/>/api/source<br/>/api/cache<br/>/api/reports<br/>/api/etl"]
        ADAPTERS["Data Adapters<br/>ODKCentralAdapter<br/>KoboAPIAdapter"]
        SERVICES["Servicios<br/>cache_manager<br/>report_engine<br/>etl_service<br/>analysis_modules"]
        CONFIG["config.py"]
    end

    subgraph Fuentes["Fuentes de Datos"]
        ODK["ODK Central<br/>odk-rfi.duckdns.org"]
        KOBO_EU["KoBoToolbox EU<br/>eu.kobotoolbox.org"]
        KOBO_KF["KoBoToolbox KF<br/>kf.kobotoolbox.org"]
    end

    subgraph Infra["Infraestructura"]
        CF_WORKER["Cloudflare Worker<br/>Proxy KoBo"]
        GITHUB["GitHub<br/>danielder17/sigerfi-dashboard"]
    end

    UI --> PAGES
    PAGES --> LIBS
    LIBS --> API
    
    API --> ADAPTERS
    ADAPTERS --> SERVICES
    
    ADAPTERS --> ODK
    ADAPTERS --> KOBO_EU
    ADAPTERS -.-> |vía proxy| CF_WORKER
    CF_WORKER --> KOBO_EU
    CF_WORKER --> KOBO_KF
```

## Diagrama de Flujo de Datos

```mermaid
---
title: Flujo de Datos - Consulta de Submissions
---
sequenceDiagram
    actor User as Usuario
    participant FE as Frontend (Vercel)
    participant BE as Backend (Render)
    participant CF as Cloudflare Worker
    participant ODK as ODK Central
    participant KOBO as KoBoToolbox

    User->>FE: Selecciona proyecto/formulario
    FE->>BE: GET /api/forms/{formId}/submissions
    alt Fuente = ODK
        BE->>ODK: OData GET /v1/projects/{pid}/forms/{fid}.svc/Submissions
        ODK-->>BE: XML/JSON con submissions
    else Fuente = KoBo
        BE->>CF: GET /api/v2/assets/{uid}/data.json
        CF->>KOBO: GET /api/v2/assets/{uid}/data.json
        KOBO-->>CF: JSON con submissions
        CF-->>BE: JSON
    end
    BE->>BE: Normaliza datos (labels, tipos)
    BE-->>FE: JSON con submissions + metadata
    FE->>User: Renderiza tabla/gráficos/mapa
```

## Mapa de Componentes Backend

```mermaid
---
title: Backend - Relaciones entre Módulos
---
graph TB
    MAIN["main.py<br/>App FastAPI startup"]
    CONFIG["config.py<br/>Variables de entorno"]
    
    subgraph Routes["Rutas API"]
        AUTH["routes/auth.py<br/>Login/Verify"]
        PROJ["routes/projects.py<br/>CRUD Proyectos"]
        FORMS["routes/forms.py<br/>Schema/Submissions"]
        REPORTS["routes/reports.py<br/>Reportes + Análisis"]
        SOURCE["routes/source.py<br/>Selector de fuente"]
        ETL["routes/etl.py<br/>Extracción/Transformación"]
        CACHE["routes/cache_admin.py<br/>Admin de caché"]
    end

    subgraph Adapters["Adaptadores de Datos"]
        FACTORY["factory.py<br/>DataSource Factory"]
        ODK_ADP["odk_adapter.py<br/>ODKCentralAdapter"]
        KOBO_ADP["kobo_adapter.py<br/>KoboAPIAdapter"]
    end

    subgraph Services["Servicios Core"]
        CACHE_MGR["cache_manager.py<br/>Cache de datos ODK/KoBo"]
        REPORT_ENG["report_engine.py<br/>Generación de reportes"]
        ETL_SVC["etl_service.py<br/>Pipeline ETL"]
        ANAL_MOD["analysis_modules.py<br/>Módulos de análisis"]
    end

    MAIN --> CONFIG
    MAIN --> Routes
    Routes --> Adapters
    Routes --> Services
    FACTORY --> ODK_ADP
    FACTORY --> KOBO_ADP
    REPORT_ENG --> ANAL_MOD
    CACHE_MGR --> ODK_ADP
    CACHE_MGR --> KOBO_ADP
```

## Mapa de Componentes Frontend

```mermaid
---
title: Frontend - Árbol de Componentes
---
graph TB
    APP["app/page.tsx<br/>Panel de Control"]
    
    subgraph Layout["Layout"]
        SHELL["components/layout/app-shell.tsx<br/>Sidebar + Main"]
        HEADER["components/layout/header.tsx<br/>Header (obsoleto?)"]
        SIDEBAR["Sidebar interno en app-shell"]
    end

    subgraph Providers["Providers"]
        AUTH_PROV["lib/auth.tsx<br/>AuthProvider"]
        SOURCE_PROV["lib/source.tsx<br/>SourceProvider"]
    end

    subgraph Pages["Páginas"]
        PROJECTS["app/projects/page.tsx<br/>Lista de Proyectos"]
        PROJ_DETAIL["app/projects/[id]/page.tsx<br/>Detalle del proyecto"]
        ADMIN["app/admin/page.tsx<br/>Admin"]
        SETTINGS["app/settings/page.tsx<br/>Configuración"]
    end

    subgraph Components["Componentes"]
        SOURCE_SEL["components/source-selector.tsx<br/>Selector de fuentes"]
        AUTH_GUARD["components/auth-guard.tsx<br/>Protección de rutas"]
        CHARTS["components/charts-section.tsx<br/>Gráficos"]
        PROJ_SUM["components/project-summary-section.tsx<br/>Resumen"]
    end

    subgraph Tabs["Tabs del Proyecto"]
        DATA_TAB["data-tab.tsx<br/>Tabla de datos"]
        REPORT_TAB["report-tab.tsx<br/>Reporte/Analisis"]
        NEW_REPORT["new-report-tab.tsx<br/>Nuevo reporte"]
        GALLERY["gallery-tab.tsx<br/>Galería multimedia"]
        DOWNLOADS["downloads-tab.tsx<br/>Exportaciones"]
        MAP["map-tab.tsx / maplibre-tab.tsx<br/>Mapa"]
        ANALYSIS["analysis-report-view.tsx<br/>Reportes avanzados"]
    end

    APP --> Layout
    Layout --> Providers
    Layout --> SOURCE_SEL
    Providers --> PAGES
    PAGES --> PROJ_DETAIL
    PROJ_DETAIL --> Tabs
    APP --> Components
```

## Diagnosis de Problemas Detectados

| # | Problema | Causa Raíz | Severidad | Solución Propuesta |
|---|---|---|---|---|
| 1 | **KoBo no carga datos al switch** | `/api/source/activate` funciona pero los endpoints de datos siguen usando ODK | 🔴 Alta | `get_configured_adapter()` debe leer source persistido, no solo env vars |
| 2 | **KoBo KF aparece 2 veces en Admin** | El endpoint `/api/source/list` tiene rutas separadas por servidor, Admin quizás itera sobre fuentes | 🟡 Media | Revisar duplicidad en admin/page.tsx |
| 3 | **Sin recarga automática de datos** | Al cambiar fuente, el frontend no refresca proyectos/submissions | 🟡 Media | Ya tenemos reload, falta que el backend sirva datos correctos |
| 4 | **91 formularios KoBo EU - performance** | El frontend no está optimizado para miles de submissions | 🟡 Media | Paginación, virtual scrolling, caché agresiva |
| 5 | **Mapa duplicado (map-tab vs maplibre-tab)** | Dos implementaciones de mapa conviviendo | 🟢 Baja | Consolidar en maplibre-tab |
| 6 | **Reportes duplicados (report-tab vs new-report-tab)** | Evolución de código sin limpiar versión anterior | 🟢 Baja | Limpiar tabs obsoletos |

## Plan de Acción Recomendado

```mermaid
---
title: Roadmap de Correcciones
---
gantt
    title SIGERFI v2 - Correcciones
    dateFormat  YYYY-MM-DD
    axisFormat  %d %b
    
    section Fase 1 - Core Fix
    Fix switch fuente backend      :a1, 2026-06-21, 1d
    Verificar carga datos KoBo     :a2, after a1, 1d
    
    section Fase 2 - Frontend
    Fix Admin duplicados           :b1, after a1, 1d
    Optimizar performance 91 forms :b2, after b1, 2d
    
    section Fase 3 - Limpieza
    Consolidar tabs mapa/reporte   :c1, after b2, 1d
    Documentación técnica          :c2, after c1, 2d
```
