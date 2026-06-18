# 🚀 Publicación del Dashboard SIGERFI — Opciones Open Source

Este documento analiza las mejores opciones para publicar el **SIGERFI Dashboard** en internet usando herramientas gratuitas/open source, sin crédito bancario ni servidores dedicados.

---

## 🔍 Stack a desplegar

| Capa | Stack | Puerto local |
|------|-------|-------------|
| Frontend | Next.js 16 + shadcn/ui + MapLibre | `:3000` |
| Backend | FastAPI + Uvicorn + httpx | `:8010` |
| ODK Central | `odk-rfi.duckdns.org` | externo |

---

## 🏆 Recomendación #1: Render (Gratis, sin tarjeta)

**Plan Hobby — $0/mes**

| Feature | Disponible |
|---------|-----------|
| Web Service (FastAPI) | ✅ Hasta 25 servicios |
| Static Site (Next.js export) | ✅ CDN global |
| Custom domain (opcional) | ✅ |
| HTTPS automático | ✅ |
| GitHub auto-deploy | ✅ |
| 5GB ancho de banda | ✅ Gratis |
| Sin tarjeta de crédito | ✅ Solo email |

### Cómo funciona

1. Subes el proyecto a un repo público de GitHub
2. Conectas tu GitHub con Render
3. Creas un **Web Service** para el backend FastAPI
4. Creas un **Static Site** para el frontend Next.js (build estático)
5. Render te da URLs como `https://sigerfi-api.onrender.com` y `https://sigerfi-dashboard.onrender.com`

### Limitaciones del free tier
- El backend se "duerme" si nadie lo usa por 15 min (tarda ~30s en despertar)
- 5 GB/mes de ancho de banda
- 500 minutos de build/mes
- 7 días de retención de logs

---

## 🥈 Recomendación #2: Railway (Cupón $5 gratis, sin tarjeta)

**Free Trial — $5 de crédito único, sin tarjeta**

| Feature | Disponible |
|---------|-----------|
| Deploy Docker o repo directo | ✅ |
| FastAPI listo | ✅ |
| Next.js compatible | ✅ |
| HTTPS automático | ✅ |
| Sin tarjeta | ✅ (solo en trial inicial) |
| Sin sleep mode | ✅ (mejor que Render) |

### Limitaciones
- Solo $5 de crédito — con un servicio pequeño alcanza para ~2-3 meses
- Después del trial pide tarjeta para continuar

---

## 🥉 Recomendación #3: Vercel + Railway (híbrido)

**Vercel Hobby (gratis) para frontend + Railway trial para backend**

| Servicio | Plataforma | Costo |
|----------|-----------|-------|
| Frontend Next.js | Vercel Hobby | $0 |
| Backend FastAPI | Railway | $0 (trial) |

### Por qué esta combo
- **Vercel** es el creador de Next.js — despliegue nativo, CDN global, sin sleep
- **Railway** tiene mejor rendimiento que Render para backends (no duerme)
- Separar frontend y backend evita el cold start de Render en el frontend

---

## 🐧 Recomendación #4: VPS barato + auto-host

Si prefieres control total por <$5/mes:

| Proveedor | Precio | RAM | Almacenamiento |
|-----------|--------|-----|---------------|
| **Hetzner** | €4.15/mes | 4 GB | 40 GB SSD |
| **Oracle Cloud Free** | $0 | 1 GB (siempre free) | 200 GB |
| **DigitalOcean** | $4/mes | 512 MB | 20 GB SSD |

Luego instalas:
- **Docker Compose** con FastAPI + Nginx como reverse proxy
- **Nginx Proxy Manager** para SSL gratis con Let's Encrypt

---

## 📊 Comparativa rápida

| Criterio | Render | Railway | Vercel+Railway | VPS Hetzner |
|----------|--------|---------|---------------|-------------|
| **Costo mensual** | $0 | $0 (3 meses) | $0 (3 meses) | ~$5 |
| **Sin tarjeta** | ✅ | ✅ (trial) | ❌ (ambos piden) | ❌ |
| **Cold start** | ❌ 30s | ✅ | ✅ front / ❌ back | ✅ |
| **Configuración** | Fácil | Fácil | Media | Compleja |
| **HTTPS** | ✅ auto | ✅ auto | ✅ auto | ✅ med manual |
| **Escalabilidad** | Baja | Media | Alta | Total |

---

## 🚀 Implementación paso a paso (Render — mi recomendación)

### Paso 1: Preparar el repo

```bash
cd odk-dashboard-v2

# 1.1 Crear .gitignore
cat > .gitignore << EOF
node_modules/
.next/
__pycache__/
*.pyc
.env
.env.local
.DS_Store
EOF

# 1.2 Inicializar git
git init
git add .
git commit -m "Initial commit: SIGERFI Dashboard v2"
```

### Paso 2: Crear repo en GitHub
- Ir a https://github.com/new
- Crear repo público (ej: `sigerfi-dashboard`)
- Subir el código:
```bash
git remote add origin https://github.com/TU_USUARIO/sigerfi-dashboard.git
git push -u origin main
```

### Paso 3: Configurar backend en Render

1. Ir a https://dashboard.render.com
2. "New +" → "Web Service"
3. Conectar GitHub y seleccionar el repo
4. Configurar:
   - **Name**: `sigerfi-api`
   - **Root Directory**: `backend/`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port 10000`
   - **Plan**: Free
5. Agregar variables de entorno:

```
ODK_CENTRAL_URL=https://odk-rfi.duckdns.org
ODK_EMAIL=danielder71@yandex.com
ODK_PASSWORD=mrgeov_bot71
CORS_ORIGINS=["https://sigerfi-dashboard.onrender.com","http://localhost:3000"]
```
6. Deploy — Render dará URL tipo `https://sigerfi-api.onrender.com`

### Paso 4: Configurar frontend en Render

1. "New +" → "Static Site" (no Web Service)
2. Configurar:
   - **Name**: `sigerfi-dashboard`
   - **Root Directory**: `frontend/`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `out/` (necesita build estático)
3. Agregar variable de entorno:
```
NEXT_PUBLIC_API_URL=https://sigerfi-api.onrender.com
```

### ⚠️ Requisito: Build estático de Next.js

Para Static Site en Render, el frontend debe exportar HTML estático:

`frontend/next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // ← build estático
  images: { unoptimized: true },
  trailingSlash: true,
}
module.exports = nextConfig
```

**Limitación**: Con `output: 'export'`, el frontend no tiene SSR y las rutas dinámicas (`/projects/[id]`) se generan en build-time. Para que funcione con cualquier proyecto, necesitas generar páginas estáticas con `generateStaticParams()`.

---

## 🔄 Alternativa: Vercel (frontend) + Render (backend)

### Frontend en Vercel
1. Ve a https://vercel.com
2. "Add New Project" → importar repo
3. **No cambia nada del build** — Next.js corre nativamente en Vercel
4. Agregar: `NEXT_PUBLIC_API_URL=https://sigerfi-api.onrender.com`
5. ✅ SSR funcional, rutas dinámicas, sin sleep

### Backend en Render
Igual que Paso 3 arriba. Listo.

---

## 🛠️ Script automático de deploy

Creé un script que prepara todo:

```bash
cd odk-dashboard-v2
python scripts/prepare_deploy.py
```

Ese script:
1. Crea el repo git si no existe
2. Genera instrucciones específicas según la plataforma elegida
3. Crea `Dockerfile` y `render.yaml` para deploy
4. Sugiere las variables de entorno necesarias

Pero no lo ejecutes sin antes decidir qué plataforma usar.

---

## ✅ Recomendación final

**Usa Render (Hobby) para empezar — es la única que NO pide tarjeta de crédito en el plan gratuito.**

**Si después necesitas mejor rendimiento,** migra el frontend a Vercel (gratis, con SSR real) y deja el backend en Render.

**Si el dashboard se vuelve crítico,** un VPS de Hetzner por €4.15 te da control total sin límites de ancho de banda ni cold starts.

---

## 📝 Variables de entorno que va a necesitar

```
# Backend (Render Railway)
ODK_CENTRAL_URL=https://odk-rfi.duckdns.org
ODK_EMAIL=danielder71@yandex.com
ODK_PASSWORD=mrgeov_bot71
CORS_ORIGINS=["https://sigerfi-dashboard.onrender.com"]

# Frontend (Vercel o Render)
NEXT_PUBLIC_API_URL=https://sigerfi-api.onrender.com
```
