"""
Rutas de consultas precalculadas y tabla homologada.
Fase 3: endpoints para datos planos, filtros y agregaciones rápidas desde cache ETL.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from services.etl_service import (
    get_homologated_submissions,
    get_homologated_repeats,
    list_cached_forms,
)

router = APIRouter(prefix="/query", tags=["Consultas - Tabla Homologada"])


@router.get("/table")
async def query_table(
    project_id: int = Query(...),
    form_id: str = Query(...),
    fields: Optional[str] = Query(None, description="Columnas separadas por coma. Vacío = todas"),
    include_repeats: bool = Query(False, description="Incluir datos de repeat groups como columnas JSON"),
    top: int = Query(100, le=1000),
    skip: int = Query(0, ge=0),
    search: Optional[str] = Query(None, description="Búsqueda textual en todos los campos"),
    sort_by: Optional[str] = Query(None, description="Campo para ordenar"),
    sort_dir: str = Query("asc", description="asc o desc"),
):
    """
    Retorna datos homologados en formato tabla plana (como una hoja de cálculo).
    
    - Los select_one/select_multiple ya vienen con labels resueltas
    - Los geopuntos vienen como {lat, lng, alt}
    - Los números vienen como números (no strings)
    - Filtro por columnas específicas
    - Búsqueda textual
    - Ordenamiento
    """
    try:
        subs, _ = get_homologated_submissions(project_id, form_id)
        if not subs:
            return {"data": [], "count": 0, "total": 0, "fields": [], "skip": skip, "source": "cache"}

        # Determinar campos disponibles
        all_fields = list(subs[0].keys())

        # Remover campos internos del display por defecto
        internal_fields = {"__submission_id", "__instance_id", "__submitter_id", "__created_at"}
        default_display = [f for f in all_fields if f not in internal_fields and not f.endswith("@raw")]

        # Filtrar columnas si se especifican
        if fields:
            selected = [f.strip() for f in fields.split(",") if f.strip() in all_fields]
            if not selected:
                selected = default_display
        else:
            selected = default_display

        # Búsqueda textual
        if search:
            search_lower = search.lower()
            filtered = []
            for s in subs:
                for k, v in s.items():
                    if str(v).lower().find(search_lower) >= 0:
                        filtered.append(s)
                        break
            subs = filtered

        # Ordenamiento
        if sort_by and sort_by in all_fields:
            reverse = sort_dir.lower() == "desc"
            subs = sorted(subs, key=lambda x: str(x.get(sort_by, "")), reverse=reverse)

        total = len(subs)

        # Paginar
        paginated = subs[skip:skip + top]

        return {
            "data": paginated,
            "count": len(paginated),
            "total": total,
            "fields": selected,
            "internal_fields": list(internal_fields),
            "skip": skip,
            "source": "cache",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/aggregate")
async def query_aggregate(
    project_id: int = Query(...),
    form_id: str = Query(...),
    group_by: str = Query(..., description="Campo para agrupar"),
    metric: str = Query("count", description="count, sum, avg, min, max"),
    metric_field: Optional[str] = Query(None, description="Campo numérico para sum/avg/min/max"),
    top: int = Query(50, le=200),
):
    """
    Agregación rápida: agrupa por un campo y calcula métrica.
    
    Ejemplos:
      /query/aggregate?project_id=4&form_id=Diagnostico...&group_by=tipo_vivienda
      /query/aggregate?project_id=4&form_id=Diagnostico...&group_by=tipo_vivienda&metric=avg&metric_field=numero_familiares
    """
    try:
        subs, fields = get_homologated_submissions(project_id, form_id)
        if not subs:
            return {"data": [], "count": 0}

        # Verificar que group_by existe
        if group_by not in subs[0]:
            raise HTTPException(status_code=400, detail=f"Campo '{group_by}' no encontrado en los datos")

        from collections import defaultdict

        groups = defaultdict(list)
        for s in subs:
            key = str(s.get(group_by, "N/A"))
            if metric in ("sum", "avg", "min", "max") and metric_field:
                try:
                    val = float(s.get(metric_field, 0))
                except (ValueError, TypeError):
                    val = 0
                groups[key].append(val)
            else:
                groups[key].append(s)

        result = []
        for key, items in groups.items():
            row = {"group": key, "count": len(items)}
            if metric == "sum" and metric_field:
                row["value"] = sum(items)
            elif metric == "avg" and metric_field:
                row["value"] = round(sum(items) / len(items), 2) if items else 0
            elif metric == "min" and metric_field:
                row["value"] = min(items) if items else 0
            elif metric == "max" and metric_field:
                row["value"] = max(items) if items else 0
            result.append(row)

        # Ordenar por count descendente
        result.sort(key=lambda r: r["count"], reverse=True)

        return {"data": result[:top], "total_groups": len(result), "metric": metric, "metric_field": metric_field}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def query_summary(project_id: int = Query(...), form_id: str = Query(...)):
    """
    Resumen estadístico rápido del formulario desde cache.
    Incluye tipos de campos, valores nulos, rangos, etc.
    """
    try:
        subs, fields = get_homologated_submissions(project_id, form_id)
        if not subs:
            return {"data": [], "fields": [], "count": 0}

        # Campos con sus tipos
        field_types = {}
        for f in fields:
            field_types[f["name"]] = f["type"]

        total = len(subs)

        resumen = {}
        for f_name, f_type in field_types.items():
            col_stats = {"type": f_type, "total": total, "non_null": 0, "null": 0, "unique": 0}
            values = []
            for s in subs:
                v = s.get(f_name)
                if v is not None and v != "" and v != "N/A":
                    col_stats["non_null"] += 1
                    values.append(v)
                else:
                    col_stats["null"] += 1

            col_stats["unique"] = len(set(str(v) for v in values))

            if f_type in ("integer", "int", "decimal") and values:
                nums = [float(v) for v in values if isinstance(v, (int, float)) or str(v).replace(".", "", 1).isdigit()]
                if nums:
                    col_stats["min"] = min(nums)
                    col_stats["max"] = max(nums)
                    col_stats["avg"] = round(sum(nums) / len(nums), 2)
                    col_stats["sum"] = round(sum(nums), 2)

            if f_type in ("select_one", "select_multiple") and values:
                from collections import Counter
                counts = Counter(str(v) for v in values)
                col_stats["top_values"] = counts.most_common(10)

            resumen[f_name] = col_stats

        return {
            "form_id": form_id,
            "project_id": project_id,
            "total_submissions": total,
            "total_fields": len(fields),
            "fields_summary": resumen,
            "source": "cache",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fields")
async def query_fields(project_id: int = Query(...), form_id: str = Query(...)):
    """
    Lista los campos homologados disponibles con sus tipos y labels.
    """
    try:
        subs, fields = get_homologated_submissions(project_id, form_id)
        if not subs:
            return {"fields": [], "count": 0}

        # Obtener todos los keys de las submissions homologadas
        all_keys = set()
        for s in subs:
            all_keys.update(s.keys())

        # Mapa de tipos desde fields parseados
        type_map = {}
        label_map = {}
        for f in fields:
            type_map[f["name"]] = f["type"]
            if f["name"] != f.get("label", f["name"]):
                label_map[f["name"]] = f["label"]

        result = []
        for k in sorted(all_keys):
            if k.endswith("@raw") or k.startswith("__"):
                continue
            ftype = type_map.get(k, "string")
            if "/lat" in k or "/lng" in k:
                ftype = "geopoint_component"
            result.append({
                "name": k,
                "label": label_map.get(k, k.replace("_", " ").title()),
                "type": ftype,
            })

        return {"fields": result, "count": len(result)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
