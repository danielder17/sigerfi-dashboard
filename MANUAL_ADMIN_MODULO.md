# Módulo de Administración — SIGERFI Dashboard v2

## 📋 Resumen

El módulo de **Administración** es el centro de control del ecosistema ETL (Extract, Transform, Load) del dashboard. Está diseñado para administradores del sistema y permite gestionar el **caché local de datos homologados**, realizar operaciones de **refresco y limpieza**, y monitorear el **estado del pipeline de datos**.

Este módulo **solo está visible para usuarios con rol de administrador** en ODK Central. Los usuarios regulares no ven la opción en el menú lateral y no pueden acceder a la ruta `/admin`.

---

## 🎯 Objetivos del módulo

| Objetivo | Descripción |
|----------|-------------|
| **Homologación de datos** | Procesar formularios ODK y transformar sus datos crudos (con códigos internos) a un formato legible con etiquetas (labels) humanas |
| **Caché local persistente** | Almacenar los datos homologados en SQLite local para reducir la dependencia de ODK Central y acelerar las consultas |
| **Refresco inteligente** | Actualizar el caché cuando los datos en ODK Central cambien, con detección de expiración automática |
| **Limpieza y mantenimiento** | Eliminar datos obsoletos o expirados para mantener el caché eficiente |
| **Monitoreo** | Visualizar estadísticas del caché: tamaño, formularios almacenados, registros, historial de operaciones |

---

## ⚙️ Funcionalidades

### 1. Dashboard de KPIs

Cuatro indicadores en tiempo real sobre el estado del caché:

| KPI | Descripción |
|-----|-------------|
| **Formularios** | Número de formularios actualmente en caché |
| **Submissions** | Total de encuestas/registros homologados |
| **Repeats** | Registros expandidos de grupos repetitivos (integrantes del hogar, etc.) |
| **Base de datos** | Tamaño físico del archivo SQLite en disco |

### 2. Cachear formulario (ETL)

Selectores inteligentes para procesar un formulario:

1. **Seleccionar Proyecto** — Dropdown con todos los proyectos accesibles desde ODK Central
2. **Seleccionar Formulario** — Se llena automáticamente al elegir un proyecto
3. **Ejecutar ETL** — Botón que dispara el pipeline completo:

```
ODK Central (OData)  →  Extraer XML (schema+labels)  →  Homologar datos
→  Resolver labels  →  Aplanar estructura  →  Cachear en SQLite
```

El proceso es completamente **genérico**: funciona con cualquier formulario ODK, detecta automáticamente campos, tipos de datos, grupos repetitivos, geopuntos, opciones select_one/select_multiple, etc.

### 3. Formularios cacheados

Lista de formularios procesados con información de estado:
- Indicador visual **verde/rojo** según si el caché está fresco o expirado
- Nombre del formulario, proyecto al que pertenece
- Cantidad de submissions y tiempo desde la última actualización
- Botón **Refrescar** individual por formulario
- Botón **Refrescar todos** para actualizar todo el caché

### 4. Limpieza del caché

| Operación | Descripción | ¿Requiere confirmación? |
|-----------|-------------|------------------------|
| **Limpiar expirados (+48h)** | Elimina formularios no actualizados en más de 48 horas | No |
| **Limpiar todo el caché** | Borra completamente la base de datos SQLite | Sí |

> ⚠️ "Limpiar todo" no pierde datos definitivamente — los formularios se pueden volver a cachear desde ODK Central cuando se necesiten.

---

## 🏗️ Arquitectura técnica

```
Frontend (Next.js)                    Backend (FastAPI)
┌─────────────────┐                  ┌──────────────────────┐
│  /admin/page.tsx │ ── POST /etl/run ──▶  etl_service.py    │
│  (React/TS)      │ ── POST /cache/ ──▶  cache_manager.py   │
│  shadcn/ui       │ ── GET  /cache/ ──▶                     │
│  Selectores +    │                  │     │                │
│  KPIs + Cards    │                  │     ▼                │
└─────────────────┘                  │  SQLite (odk_cache.db)│
                                     └──────────────────────┘
                                              │
                                              ▼
                                     ┌──────────────────┐
                                     │  ODK Central     │
                                     │  (datos origen)  │
                                     └──────────────────┘
```

### Backend

- **`backend/services/etl_service.py`**: Pipeline ETL base — extracción desde OData, parseo XML, transformación con labels, carga a SQLite
- **`backend/services/cache_manager.py`**: Capa de caché con TTL, refresco inteligente, limpieza, estadísticas
- **`backend/routes/cache_admin.py`**: Endpoints REST protegidos con autenticación admin
- **`backend/routes/etl.py`**: Endpoints ETL (run, status, cached, data, repeats)

### Frontend

- **`frontend/src/app/admin/page.tsx`**: Página SPA con KPIs, selectores, formularios cacheados, limpieza
- **`frontend/src/components/layout/app-shell.tsx`**: Sidebar con badge `🛡️ Admin` visible solo para admins
- **`frontend/src/components/auth-guard.tsx`**: Protección de rutas

### Seguridad

- Endpoints POST protegidos con `require_admin()` que verifica el token JWT
- El campo `is_admin` se determina desde ODK Central a través de `/v1/assignments`
- La página `/admin` redirige automáticamente si el usuario no tiene rol admin
- El sidebar oculta el ítem "Admin" para usuarios no administradores

---

## 🔄 Flujo ETL completo

```
Fase 1: Extracción
  ├── Obtener XML del formulario (labels + estructura)
  ├── Consultar OData ($expand=* para repeats)
  └── Obtener submissions crudas

Fase 2: Transformación
  ├── Parsear XML → lista de campos con tipos y labels
  ├── Resolver labels: select_one / select_multiple
  ├── Aplanar estructura (repeats → filas separadas)
  ├── Procesar geopuntos (lat/lon/alt/precision)
  └── Detectar tipos: texto, número, fecha, binario, geopunto

Fase 3: Carga
  ├── Crear tabla de submissions_cache
  ├── Crear tabla de repeat_cache
  ├── Crear tabla de schemas (metadata)
  └── Insertar log en etl_log

Fase 4: Mantenimiento
  ├── Refresco automático (TTL: 1 hora)
  ├── Refresco incremental (solo datos nuevos)
  ├── Limpieza de expirados (+48h)
  └── Estadísticas y monitoreo
```

---

## 🚀 Cómo usar

### Prerrequisitos
- Ser usuario administrador en ODK Central
- Tener al menos un proyecto con formularios publicados

### Cachear un formulario por primera vez

1. Inicia sesión con tu cuenta admin (`danielder@gmail.com`)
2. Haz clic en **Admin** en el menú lateral
3. En la sección **Cachear formulario en ETL**:
   - Selecciona el **Proyecto** del dropdown
   - Selecciona el **Formulario** (se cargan automáticamente)
   - Haz clic en **Ejecutar ETL**
4. Espera el mensaje de confirmación ✅
5. El formulario aparecerá en **Formularios cacheados**

### Refrescar datos
- **Individual**: Botón "Refrescar" en cada tarjeta de formulario
- **Todos**: Botón "Refrescar todos" en el header de la sección

### Limpiar caché
- **Automático**: Los formularios no actualizados en +48h se consideran expirados
- **Manual**: Botón "Limpiar expirados" o "Limpiar todo" (con confirmación)

---

## 📊 Interpretación de indicadores

| Indicador | Significado |
|-----------|-------------|
| 🔴 Punto rojo en formulario | Caché expirado (>1h desde última actualización) |
| 🟢 Punto verde en formulario | Caché fresco |
| Formularios: 0 | No hay datos cacheados — ejecuta ETL primero |
| Base de datos: 0 B | El archivo SQLite no existe o está vacío |

---

## 🔧 Solución de problemas

| Problema | Causa | Solución |
|----------|-------|----------|
| "Admin no aparece en el menú" | El usuario no tiene rol admin | Inicia sesión con cuenta admin (`danielder@gmail.com`) |
| "Error 500 al ejecutar ETL" | Base de datos corrupta o tabla faltante | Usa "Limpiar todo" y vuelve a ejecutar ETL |
| "Formularios cacheados vacío" | Nunca se ha ejecutado ETL | Selecciona proyecto/formulario y ejecuta ETL |
| "Error 403 en Admin" | Sesión expirada o token inválido | Cierra sesión y vuelve a iniciar |
| "No such table: ..." | Deploy fresco en Render sin BD | El sistema crea las tablas automáticamente; solo ejecuta ETL |
| "0 submissions en caché" | El ETL no encontró datos nuevos | Verifica que el formulario tenga submissions en ODK Central |

---

## 📝 Notas técnicas

- **TTL por defecto**: 1 hora (3600 segundos). Configurable en `cache_manager.py`
- **Base de datos**: SQLite ubicada en `backend/data/odk_cache.db`
- **Límite de log**: 100 entradas como máximo en `etl_log`
- **Repeats**: Se manejan vía `$expand=*` en OData (ODK Central lo soporta)
- **Labels**: Se resuelven desde el XML del formulario usando los tags `<itext><translation>`
- **En Render**: El caché se pierde al redeployar porque el filesystem es efímero. Se debe ejecutar ETL después de cada deploy.
