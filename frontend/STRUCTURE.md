# Frontend - SIGERFI Dashboard v2

## Estructura

```
src/
├── app/
│   ├── layout.tsx          # Layout raíz con sidebar + header
│   ├── page.tsx            # Home (Panel de Control Global)
│   └── globals.css         # Estilos globales
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── layout/
│   │   ├── sidebar.tsx     # Sidebar navegación
│   │   └── header.tsx      # Header con selector de proyecto
│   ├── projects/
│   │   └── project-list.tsx # Lista de proyectos
│   └── dashboard/
│       ├── kpi-cards.tsx
│       └── activity-chart.tsx
├── lib/
│   └── api.ts              # Cliente API
└── types/
    └── index.ts            # Tipos TypeScript
```

## Stack

- Next.js 15 + React 19 + TypeScript
- Tailwind CSS + shadcn/ui
- Recharts + ECharts
- Carpetas por feature (dashboard, projects, etc.)
