# Análisis de compatibilidad XLSForm: ODK Collect ↔ KoBoToolbox

## 1. Contexto

ODK Collect y KoBoToolbox (KoboCollect) comparten el mismo núcleo tecnológico.
Ambos usan el estándar **XLSForm** → **ODK XForm** (XML) como pipeline de
definición de formularios. Sin embargo, cada plataforma introduce extensiones
propias, columnas adicionales en las hojas de Excel, y diferencias en la
representación de datos a través de sus respectivas APIs.

Este documento analiza las divergencias, identifica los puntos de fallo en el
pipeline ETL actual de SIGERFI Dashboard, y propone soluciones concretas.

---

## 2. Línea base compartida

| Elemento | ODK Central | KoBoToolbox | Compatible |
|----------|-------------|-------------|------------|
| XLSForm → XForm | ✅ | ✅ | ✅ |
| Hojas `survey`, `choices`, `settings` | ✅ | ✅ | ✅ |
| Tipos básicos (text, integer, decimal, date) | ✅ | ✅ | ✅ |
| select_one / select_multiple | ✅ | ✅ | ✅ |
| geopoint | ✅ | ✅ | ✅ |
| begin_group / end_group | ✅ | ✅ | ✅ |
| begin_repeat / end_repeat | ✅ | ✅ | ✅ |
| note, calculate, hidden | ✅ | ✅ | ✅ |
| Multimedia (image, audio, video, file) | ✅ | ✅ | ✅ |
| OData para exportación de datos | ✅ | ❌ (API REST propia) | ⚠️ |
| `$expand=*` para repeats embebidos | ✅ | ❌ | ❌ |

---

## 3. Diferencias críticas

### 3.1 API de datos

| Aspecto | ODK Central | KoBoToolbox |
|---------|-------------|-------------|
| **Endpoint de datos** | `/v1/projects/{id}/forms/{fid}.svc/Submissions` (OData 4.0) | `/api/v2/assets/{uid}/data/` (JSON REST) |
| **Autenticación** | Bearer token (JWT) | API Key + username |
| **Formato respuesta** | `{value: [{...}, ...]}` | `[{...}, ...]` con paginación |
| **Repeats** | `$expand=*` → arrays embebidos | Anidados en JSON (`_group/repeat_name`) |
| **Identificador único** | `instanceId` + `__id` | `_id` |
| **Metadatos** | `createdAt`, `submitterId`, `updatedAt` | `_submission_time`, `_submitted_by`, `_status` |
| **Adjuntos** | Referencia por nombre de archivo | Referencia por URL absoluta |
| **Geopuntos** | String `"lat lng alt prec"` | String `"lat lng alt prec"` (mismo formato) |

**Problema**: El dashboard actual está cableado a ODK Central (OData). Para
soportar KoBoToolbox, se necesita un **adaptador de API** que hable REST v2.

### 3.2 XLSForm — Columnas extendidas

| Columna | ODK Central | KoBoToolbox | Notas |
|---------|-------------|-------------|-------|
| `parameters` | ❌ No soporta | ✅ Extensiones personalizadas | KoBo pasa params extra en URL |
| `body::` | ❌ | ✅ Estilos visuales (colores, iconos) | Afecta solo apariencia, no datos |
| `choice_filter` | ✅ | ✅ (con sintaxis diferente) | Filtro dinámico de opciones |
| `appearance` | ✅ Estándar | ✅ Extensiones propias | KoBo añade `w1`, `w2`, `w3`, `likert` |
| `label::language` | ✅ | ✅ | Ambos soportan multi-idioma |
| `media::image` | ✅ | ✅ | Ambos soportan |
| `hint::language` | ✅ | ✅ | Ambos soportan |
| `guidance_hint` | ✅ | ✅ | Texts de ayuda adicional |
| `trigger` | ❌ | ✅ | Conditional display |

**Impacto en ETL**: Columnas visuales (`body::`, `appearance`) no afectan los
datos. `choice_filter` se resuelve del lado del cliente en ODK Collect, pero en
KoBo se puede resolver server-side — **no afecta al ETL**. `parameters` en KoBo
podría contener metadata de contexto que el ETL puede ignorar o mapear.

### 3.3 Representación de grupos repetitivos (repeats)

**ODK Central (OData + `$expand=*`)**:
```json
{
  "instanceId": "uuid:abc",
  "integrantes": [
    {"nombre": "María", "edad": 30},
    {"nombre": "José", "edad": 45}
  ],
  "nombre_encuestador": "Pedro"
}
```

**KoBoToolbox (JSON API v2)**:
```json
{
  "_id": 123,
  "integrantes/nombre": "María",
  "integrantes/edad": 30,
  "integrantes/__index": 1
}
```

En KoBo, **los repeats se expanden en filas separadas** (formato tabular) incluso
en la API JSON, a menos que se solicite el raw JSON. El `$expand=*` de ODK no
existe en KoBo.

**Impacto en ETL**: El módulo `transform_repeats()` espera que los repeats
lleguen como arrays embebidos. Con KoBo habría que **re-agrupar** las filas
expandidas en arrays.

### 3.4 select_one / select_multiple — Codificación interna

ODK Central devuelve valores como strings o índices 1-based:
```json
{"tipo_vivienda": "casa", "material_piso": "1"}
```

KoBoToolbox devuelve valores como strings, pero puede incluir el prefijo
del list_name:
```json
{"tipo_vivienda": "vivienda_casa", "material_piso": "material_ceramica"}
```

**Problema**: el `list_name` puede concatenarse al value. El ETL actual
resuelve labels comparando el valor exacto contra las opciones. Si KoBo
prefija los valores, el match falla.

### 3.5 Adjuntos multimedia

| Aspecto | ODK Central | KoBoToolbox |
|---------|-------------|-------------|
| **URL de descarga** | `/v1/projects/{pid}/forms/{fid}/submissions/{sid}/attachments/{file}` | `https://{server}/media/{file}` o attachment URL absoluta |
| **Metadato** | `image/persona.jpg` (nombre archivo) | URL completa o nombre archivo |
| **Autenticación** | Bearer token | API Key vía query param o header |

**Problema**: La galería del dashboard construye URLs de descarga asumiendo la
estructura de ODK Central. Con KoBo, las URLs son diferentes.

### 3.6 Metadatos del formulario

| Campo | ODK Central | KoBoToolbox |
|-------|-------------|-------------|
| `form_id` | `xmlFormId` (ej: `Diagnostico_Comunitario_Integral`) | `id_string` (ej: `aBcDeFgHiJkLmN`) |
| Versión | `version` | `version_id` |
| Proyecto | ID numérico: `4` | Asset UID alfanumérico: `aBcDeFgHiJkLmN` |
| Owner | `createdBy` con `id` y `displayName` | `owner` con URL |

**Problema**: KoBo usa asset UIDs en vez de IDs numéricos para proyectos.
El sistema actual se basa en `project_id: int`.

### 3.7 Tipos de dato exclusivos de KoBo

KoBoToolbox añade tipos que ODK Collect no tiene:

- `range` — selector de rango (ODK tiene `select_one` con `appearance=rating`)
- `select_one_from_file` — opciones desde CSV externo
- `select_multiple_from_file` — opciones múltiples desde CSV externo
- `background` — tareas en segundo plano (odk_validate, etc.)

**Impacto en ETL**: `range` → se trata como integer/decimal. `select_*_from_file`
→ las opciones vienen de un archivo externo que hay que descargar y parsear.

---

## 4. Problemas específicos detectados en el ETL actual

### 4.1 Codificación de IDs

**Archivo**: `backend/services/etl_service.py`

```python
def run_etl(project_id: int, form_id: str, ...):
```

KoBo usa `project_id` como string (asset UID) y `form_id` puede ser el id_string
hash. El ETL asume `project_id: int` en todas las consultas SQL y endpoints.

### 4.2 Endpoints cableados a OData

Todas las funciones de extracción usan la URL de OData:

```python
ODK_URL = "https://odk-rfi.duckdns.org"
_odk_get(f"/v1/projects/{project_id}/forms/{form_id}.svc/Submissions", "$expand=*&$top=10000")
```

KoBo no tiene OData. La API es:
```
POST /api/v2/assets/{uid}/data.json
GET  /api/v2/assets/{uid}/data/{id}.json
```

### 4.3 Resolución de labels con prefijo KoBo

```python
def _resolve_select(value: str, options: list[str]) -> str:
    values = value.split()
    for v in values:
        try:
            idx = int(v) - 1  # Asume índice 1-based
            ...
```

Si KoBo devuelve `"vivienda_casa"` en vez de `"1"` o `"casa"`,
`int(v)` falla y cae al `except` que usa `v` como label directamente.

### 4.4 Repeats en formato tabular

```python
def extract_submissions(...):
    raw = _odk_get(..., "$expand=*&$top=10000")
```

El `$expand=*` devuelve repeats como arrays. KoBo los devuelve como
filas separadas (una por repeat). El ETL actual no sabe reagrupar.

### 4.5 Adjuntos — URL absoluta vs relativa

```python
# En el frontend/galería:
fetch(`${API_BASE}/api/projects/${projectId}/forms/${formId}/submissions/${instanceId}/attachments/${fileName}`)
```

KoBo sirve adjuntos en `/media/{file}` con API Key. No tiene este endpoint REST.

### 4.6 Sin soporte para `select_*_from_file`

El ETL no resuelve opciones que vienen de archivos CSV externos. En KoBo,
las opciones se definen en un archivo itemsets.csv que hay que descargar
y parsear junto con el XLSForm.

---

## 5. Soluciones propuestas

### 5.1 Arquitectura: Capa de abstracción de fuente de datos

```
┌─────────────────────────────────────────────┐
│              SIGERFI Dashboard              │
├─────────────────────────────────────────────┤
│              Pipeline ETL (genérico)         │
├────────────────────┬────────────────────────┤
│   Fuente: ODK      │   Fuente: KoBo         │
│   Central          │   Toolbox              │
│                    │                        │
│  ┌──────────────┐  │  ┌──────────────────┐  │
│  │ ODataAdapter  │  │  │ KoboAPIAdapter   │  │
│  │ /v1/projects  │  │  │ /api/v2/assets   │  │
│  │ OData 4.0     │  │  │ REST paginado    │  │
│  │ $expand=*     │  │  │ Repeats tabular  │  │
│  └──────────────┘  │  └──────────────────┘  │
└────────────────────┴────────────────────────┘
```

**Acción**: Crear una clase abstracta `DataSourceAdapter` con métodos:
- `get_projects() -> list[dict]`
- `get_forms(project_id) -> list[dict]`
- `get_schema(project_id, form_id) -> dict`
- `get_submissions(project_id, form_id) -> list[dict]`
- `get_attachment_url(project_id, form_id, instance_id, filename) -> str`

Implementaciones:
- `ODKCentralAdapter` (existente, refactorizar)
- `KoboAPIAdapter` (nuevo)

### 5.2 Normalización de IDs

```
┌──────────────────┐       ┌──────────────────────┐
│ ODK: pid=4 (int) │──────▶│                      │
│                   │       │  Sistema interno     │
│ KoBo: pid=        │──────▶│  usa ID string       │
│ "aBcDeFgHiJkLmN"  │       │  universal (UID)     │
└──────────────────┘       └──────────────────────┘
```

**Acción**: Normalizar `project_id` a string en toda la capa interna.
ODK `4` → interno `"4"`, KoBo `"aBcDe..."` → interno `"aBcDe..."`.
Las tablas SQLite deben migrar de `INTEGER` a `TEXT` para `project_id`.

### 5.3 Resolución de select_* mejorada

**Problema**: KoBo puede prefijar valores con `list_name`.

**Solución** en `_resolve_select()`:

```python
def _resolve_select(value: str, options: list[str], list_name: str = "") -> str:
    if not value:
        return ""
    values = value.split() if isinstance(value, str) else [str(value)]
    labels = []
    for v in values:
        v = v.strip()
        # Intentar match exacto
        if v in options:
            labels.append(options[v])  # Usar dict
            continue
        # Intentar con prefijo list_name
        prefixed = f"{list_name}_{v}" if list_name else None
        if prefixed and prefixed in options:
            labels.append(options[prefixed])
            continue
        # Intentar como índice 1-based
        try:
            idx = int(v) - 1
            if 0 <= idx < len(options):
                labels.append(options[idx])
                continue
        except ValueError:
            pass
        # Fallback: usar el valor crudo
        labels.append(v)
    return " / ".join(labels)
```

### 5.4 Manejo de repeats tabulares (KoBo)

**Problema**: KoBo API v2 devuelve repeats como filas separadas con nombres
como `"integrantes/nombre"`, `"integrantes/edad"`.

**Solución**: Detectar campos con `/` en el nombre (path-style) y reagruparlos:

```python
def regroup_tabular_repeats(submissions: list[dict]) -> list[dict]:
    """Reagrupa repeats en formato tabular (KoBo) a arrays embebidos."""
    for sub in submissions:
        repeat_groups = {}
        flat_keys = []
        for key in list(sub.keys()):
            if "/" in key:
                parts = key.split("/")
                group_name = parts[0]
                field_name = "/".join(parts[1:])
                if group_name not in repeat_groups:
                    repeat_groups[group_name] = []
                # Esperar a tener todas las filas
            else:
                flat_keys.append(key)
        # ... lógica de reagrupamiento
    return submissions
```

### 5.5 Resolución de opciones desde itemsets.csv

**Problema**: KoBo permite `select_one_from_file` con opciones desde CSV.

**Solución**: Al detectar `select_one_from_file` o `select_multiple_from_file`
en el XLSForm parseado, buscar el archivo itemsets.csv y cargar las opciones:

```python
if ftype.startswith("select_one_from_file"):
    file_name = ftype.replace("select_one_from_file ", "")
    options = load_itemsets(file_name, itemsets_csv)
```

### 5.6 Adjuntos multimedia

**Problema**: URLs de descarga diferentes.

**Solución**: Agregar un método en cada adapter:

```python
# ODK Central
def get_attachment_url(project_id, form_id, instance_id, filename):
    return f"{base}/v1/projects/{project_id}/forms/{form_id}/submissions/{instance_id}/attachments/{filename}"

# KoBoToolbox
def get_attachment_url(project_id, form_id, instance_id, filename):
    return f"{base}/media/{filename}?format=json"
```

En el frontend, usar la URL que devuelve el backend en vez de construirla.

---

## 6. Matriz de impacto

| Cambio | Archivos afectados | Esfuerzo | Prioridad |
|--------|-------------------|----------|-----------|
| DataSourceAdapter abstracta | `backend/services/etl_service.py` (refactor) | Alta | 📌 **Alta** |
| Adapter KoBo API v2 | `backend/services/kobo_adapter.py` (nuevo) | Alta | 📌 **Alta** |
| Normalización IDs (int→string) | `etl_service.py`, `cache_manager.py`, `routes/*.py`, SQLite | Media | 📌 **Alta** |
| Resolución select_* mejorada | `etl_service.py` (`_resolve_select`) | Baja | ⭐ **Crítica** |
| Repeats tabulares | `etl_service.py` (`transform_repeats`) | Media | ⭐ **Crítica** |
| Adjuntos multimedia | `backend/routes/forms.py`, frontend galería | Baja | ⭐ **Crítica** |
| select_*_from_file | `etl_service.py` + itemsets parser | Media | Media |
| Configuración multi-fuente | `config.py`, `backend/main.py` | Baja | Alta |

---

## 7. Recomendación de implementación

### Fase 1 (inmediata) — Compatibilidad básica
1. Mejorar `_resolve_select()` para detectar prefijos de KoBo
2. Normalizar `project_id` a string en toda la capa interna
3. Separar la construcción de URLs de adjuntos al backend

### Fase 2 — Adapter KoBo
4. Crear `DataSourceAdapter` abstracto
5. Implementar `KoboAPIAdapter` con autenticación vía API Key
6. Manejo de repeats tabulares con reagrupamiento

### Fase 3 — Features avanzados
7. Resolver `select_*_from_file` con itemsets.csv
8. Soportar `range` y otros tipos exclusivos
9. Interfaz de selección de fuente en el Admin

---

## 8. Conclusión

ODK Collect y KoBoToolbox son **80% compatibles** a nivel de XLSForm, pero
divergen completamente en la **API de datos** y en ciertas extensiones del
formato. La solución no es tratar de unificar todo en un solo parser, sino
construir una **capa de adaptación** que aisle al dashboard de las diferencias
específicas de cada plataforma.

El pipeline ETL actual con ODK Central + OData + `$expand=*` es sólido para
ODK. Para KoBoToolbox se requiere un adapter separado que normalice los datos
al formato interno que el dashboard ya sabe consumir (arrays embebidos de
repeats, valores de select resueltos, URLs de adjuntos funcionales).
