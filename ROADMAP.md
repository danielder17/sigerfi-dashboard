# SIGERFI Dashboard v2

## Roadmap - Fase 0: Setup

Seguimos el plan de desarrollo del markdown como guía.

### ✅ Fase 1: Fundación (Sprint 1) — COMPLETADA

#### Backend (`backend/`)
- [x] FastAPI base con CORS y health check (puerto 8010)
- [x] Cliente ODK con urllib (evita bug de httpx en Windows)
- [x] Endpoints: `/api/projects`, `/api/projects/{id}/forms`
- [x] Endpoints: `/api/forms/{id}/schema`, `/api/forms/{id}/submissions`, `/api/forms/{id}/all`

#### Frontend (`frontend/`)
- [x] Next.js 15 + React 19 + TypeScript + Tailwind v4
- [x] shadcn/ui (16 componentes: button, card, select, badge, separator, sheet, scroll-area, alert, dialog, dropdown-menu, input, label, avatar, tooltip, skeleton, tabs)
- [x] Recharts + ECharts instalados
- [x] Layout con sidebar colapsable + header
- [x] Selector de proyecto en header (carga desde API)
- [x] Modo oscuro/claro (toggle en header)
- [x] Página principal `/` con KPIs (proyectos, formularios)
- [x] Página `/projects` — Lista de proyectos con búsqueda
- [x] Página `/projects/[id]` — 5 pestañas:
  - 📋 **Datos** — Tabla con búsqueda, ordenación, columnas dinámicas
  - 📊 **Informe** — KPIs, timeline, histogramas automáticos
  - 🖼️ **Galería** — Detección multimedia, filtros por tipo
  - ⬇️ **Descargas** — CSV, JSON, GeoJSON con detección de puntos
  - 🗺️ **Mapa** — Scatter plot, coloreado por campo categórico

### 🔄 Fase 2: Mejoras y Siguientes

#### Pendiente
- [ ] Página de Settings (configuración)
- [ ] Mapa real con MapLibre GL JS (reemplazar scatter de ECharts)
- [ ] Mejor parseo de esquema del formulario (tipos, opciones, grupos)
- [ ] Labels desde XForm XML en lugar de nombres de campo internos
- [ ] AG Grid para tabla de datos (mejor rendimiento con miles de filas)
- [ ] Autenticación JWT
- [ ] WebSocket para notificaciones en tiempo real
- [ ] PDF desde informe automático
- [ ] Descarga de Shapefile / Excel
- [ ] Despliegue con Docker
