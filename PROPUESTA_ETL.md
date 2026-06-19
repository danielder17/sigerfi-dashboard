# Propuesta: Servicio de Homologación de Datos (ETL Layer)

## 🧠 El problema

Actualmente el dashboard consulta ODK Central directamente vía OData y los datos llegan "crudos":
- Nombres de campo internos (`edad`, `genero`, `tipo_vivienda`)
- Sin labels humanas en la respuesta
- Repeat groups como estructuras anidadas complejas
- Geopuntos en formato texto `"10.123 -66.789 0 0"`
- La lógica de transformación se repite en cada endpoint

Cada vez que un tab necesita mostrar datos, el backend tiene que:
1. Traer datos de ODK
2. Parsear XML del formulario para obtener labels
3. Transformar valores código → label
4. Detectar tipos de campo
5. Repetir todo para cada consulta

## 📦 La solución: Servicio de Homologación (ODK ETL Pipeline)

```mermaid
flowchart LR
    ODK[ODK Central] --> ETL[Servicio ETL<br/>Homologación]
    
    subgraph ETL[Servicio de Homologación]
        direction TB
        EXTRACT[1. Extracción<br/>OData + Forms XML + Schema]
        TRANSFORM[2. Transformación<br/>Resolución de labels + tipos + geopuntos]
        CACHE[3. Cache en SQLite local<br/>"Snapshot" del formulario]
    end
    
    CACHE --> API[Endpoints del Dashboard<br/>/submissions<br/>/report<br/>/map]
    CACHE --> QUERY[Consultas directas<br/>con SQL]
```

### Componentes del servicio:

#### 1️⃣ Módulo de Extracción (`extractor.py`)
- Descarga el XML del formulario (XForm) una sola vez
- Obtiene el schema completo: campos, tipos, opciones, repeat groups
- Descarga todas las submissions vía OData con `$expand=*`

#### 2️⃣ Módulo de Transformación (`transformer.py`)
- **Resolución de labels**: cada valor código se traduce a su label (ej: `1` → `"Casa independiente"`)
- **Parseo de tipos**: geopuntos → `{lat, lng, alt}`, fecha → Date, números → float
- **Aplanado de repeats**: cada repeat group se expande en tablas separadas relacionadas
- **Campos calculados**: edad desde fecha de nacimiento, rangos etarios, etc.

#### 3️⃣ Motor de Consultas (`query_engine.py`)
- Consultas precalculadas (no en tiempo real)
- Cache persistente en SQLite local
- Refresco manual o automático (cron cada N horas)

### 📐 Esquema de datos resultante

**Tabla principal** (una fila por submission, con labels ya resueltas):

| instance_id | fecha | comunidad | jefe_hogar | tipo_vivienda | num_integrantes | geopunto |
|-------------|-------|-----------|------------|---------------|-----------------|----------|
| uuid:abc | 2026-01-15 | "El Valle" | "María Pérez" | "Casa independiente" | 4 | 10.456,-66.789 |

**Tabla de repeats** (una fila por integrante, con foreign key):

| submission_id | integrante_nombre | edad | genero | parentesco |
|--------------|-------------------|------|--------|------------|
| uuid:abc | "Juan Pérez" | 28 | "Masculino" | "Hijo/a" |

### 🗺️ Roadmap de implementación

| Fase | Qué incluye | Tiempo estimado |
|------|-------------|----------------|
| **1** | Servicio ETL base: extracción + transformación + cache SQLite | 3-4 horas |
| **2** | Integración con los endpoints del dashboard | 2-3 horas |
| **3** | Consultas precalculadas y endpoint de "tabla homologada" | 2 horas |
| **4** | Refresco automático y limpieza de la caché | 2 horas |

### ✅ Beneficios

- **Rendimiento**: datos precalculados, no se consulta ODK Central en cada request
- **Simplicidad**: los tabs consultan datos planos con labels, no raw OData
- **Offline-friendly**: el snapshot local permite operar incluso si ODK está caído
- **Reutilizable**: el motor de consultas sirve para todos los módulos de análisis

### ❓ Pregunta

¿Te parece bien este enfoque? ¿Prefieres que trabajemos en **todas las fases seguidas** o prefieres ir fase por fase probando cada una antes de pasar a la siguiente?
