"""
Sistema de Módulos de Análisis Configurables.

Cada módulo define un conjunto de consultas (queries) que responden
preguntas de negocio específicas. Los módulos se activan automáticamente
según los campos disponibles en el formulario.

Inspirado en el Cuadro Maestro de Consultas para encuestas ODK.
Cada query tiene: pregunta de negocio, campos necesarios, tipo de cálculo,
gráfico recomendado y justificación pedagógica.
"""

import re
import json
import os
from collections import Counter, defaultdict
from typing import Optional
from .report_engine import (
    compute_kpis, count_categories, extract_geopoint, geocode_reverse,
    group_temporally, expand_repeat_groups, build_word_cloud,
    build_contingency_tables, build_population_pyramid,
)

# ───────────────────────────────
#  TEMPLATES DE MÓDULOS
# ───────────────────────────────

MODULE_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "analysis_modules")

# Módulos precargados por defecto
DEFAULT_MODULES = []


# ───────────────────────────────
#  TIPOS DE QUERY
# ───────────────────────────────

QUERY_TYPES = {
    # count: COUNT simple de registros
    "count": {
        "handler": "_handle_count",
        "description": "Conteo de registros",
    },
    # count_group: COUNT con GROUP BY
    "count_group": {
        "handler": "_handle_count_group",
        "description": "Conteo agrupado por categoría",
    },
    # binary_pie: Proporción si/no (2 categorías)
    "binary_pie": {
        "handler": "_handle_binary_pie",
        "description": "Proporción binaria (donut/pastel)",
    },
    # multi_select_freq: Frecuencia de opciones en multiselect
    "multi_select_freq": {
        "handler": "_handle_multi_select_freq",
        "description": "Frecuencia de opciones multiselect",
    },
    # numeric_kpi: KPIs estadísticos de campo numérico
    "numeric_kpi": {
        "handler": "_handle_numeric_kpi",
        "description": "KPIs de campo numérico",
    },
    # numeric_grouped: Numérico agrupado por categoría
    "numeric_grouped": {
        "handler": "_handle_numeric_grouped",
        "description": "Métrica numérica por grupo",
    },
    # text_freq: Frecuencia de texto (top N)
    "text_freq": {
        "handler": "_handle_text_freq",
        "description": "Frecuencia de texto abierto",
    },
    # word_cloud: Nube de palabras
    "word_cloud": {
        "handler": "_handle_word_cloud",
        "description": "Nube de palabras desde texto libre",
    },
    # contingency: Tabla de contingencia 2x2 o NxM
    "contingency": {
        "handler": "_handle_contingency",
        "description": "Tabla de contingencia entre dos variables",
    },
    # temporal_series: Serie temporal
    "temporal_series": {
        "handler": "_handle_temporal_series",
        "description": "Evolución temporal de registros",
    },
    # scatter: Dispersión entre dos numéricos
    "scatter": {
        "handler": "_handle_scatter",
        "description": "Relación entre dos variables numéricas",
    },
    # boxplot: Diagrama de caja y bigotes
    "boxplot": {
        "handler": "_handle_boxplot",
        "description": "Distribución con detección de outliers",
    },
    # heatmap: Mapa de calor de frecuencias
    "heatmap": {
        "handler": "_handle_heatmap",
        "description": "Intensidad de relación entre categóricas",
    },
    # stacked_bar: Barras apiladas
    "stacked_bar": {
        "handler": "_handle_stacked_bar",
        "description": "Composición por categoría",
    },
    # mixed_query: Query compuesta (varios sub-resultados)
    "mixed_query": {
        "handler": "_handle_mixed_query",
        "description": "Consulta compuesta con múltiples salidas",
    },
}


# ───────────────────────────────
#  CARGA DE MÓDULOS DESDE JSON
# ───────────────────────────────

def load_modules() -> list[dict]:
    """Carga todos los templates de módulos desde la carpeta analysis_modules."""
    modules = list(DEFAULT_MODULES)
    if not os.path.isdir(MODULE_TEMPLATES_DIR):
        return modules
    for fname in sorted(os.listdir(MODULE_TEMPLATES_DIR)):
        if fname.endswith(".json"):
            try:
                with open(os.path.join(MODULE_TEMPLATES_DIR, fname), "r", encoding="utf-8") as f:
                    module = json.load(f)
                    modules.append(module)
            except Exception as e:
                pass  # Silently skip malformed modules
    return modules


# ───────────────────────────────
#  DETECCIÓN DE MÓDULOS ACTIVOS
# ───────────────────────────────

def _field_matches_pattern(field_name: str, field_label: str, pattern: str) -> bool:
    """Verifica si un campo coincide con un patrón (exacto, wildcard, o substring)."""
    fn = field_name.lower().strip()
    fl = field_label.lower().strip()
    pl = pattern.lower().strip()

    # Exact match
    if pl == fn:
        return True
    # Wildcard
    if pl.endswith("/*"):
        prefix = pl[:-1]
        return fn.startswith(prefix)
    # Substring en nombre
    if pl in fn:
        return True
    # Substring en label
    if pl in fl:
        return True
    return False


def _find_matching_fields(required: list[str], all_field_names: set, field_labels: dict) -> tuple:
    """
    Busca campos que coincidan con los requeridos (exacto + wildcard).
    Retorna (available_fields, missing_fields, matched_pairs).
    """
    available = []
    missing = []
    matched_pairs = []

    for qf in required:
        if qf.endswith("/*"):
            prefix = qf[:-1]
            matched = sorted({n for n in all_field_names if n.startswith(prefix)})
            if matched:
                available.extend(matched)
                matched_pairs.append((qf, matched))
            else:
                missing.append(qf)
            continue

        if qf in all_field_names:
            available.append(qf)
            matched_pairs.append((qf, [qf]))
        else:
            missing.append(qf)

    return available, missing, matched_pairs


def _find_matching_fields_fuzzy(required: list[str], all_field_names: set, field_labels: dict) -> tuple:
    """
    Busca campos con matching fuzzy (substring en nombre/label).
    Solo para módulos que tengan fuzzy_match=True explícito.
    """
    available = []
    missing = []
    matched_pairs = []

    for qf in required:
        found = False
        for fn in all_field_names:
            fl = field_labels.get(fn, "")
            if _field_matches_pattern(fn, fl, qf):
                available.append(fn)
                matched_pairs.append((qf, [fn]))
                found = True
                break
        if not found:
            missing.append(qf)

    return available, missing, matched_pairs


def _auto_detect_fields(fields: list[dict], rules: list[dict]) -> dict:
    """
    Para módulos auto-detect, encuentra campos que coincidan con las reglas.
    Retorna dict con variante individual -> campo encontrado.
    Los patrones pueden contener pipes (ej. "edad|age|int_edad") que se expanden.
    """
    result = {}
    for rule in rules:
        pattern = rule["pattern"]
        ftype = rule["type"]
        found = None

        # Split por pipe para múltiples variantes
        variants = [p.strip() for p in pattern.split("|")]

        for f in fields:
            if f.get("is_repeat"):
                continue
            name = f["name"].lower()
            label = f.get("label", "").lower()

            # Verificar tipo
            if ftype == "numeric" and f["type"] not in ("integer", "decimal", "int"):
                continue
            if ftype == "categorical" and f["type"] not in ("select_one", "text"):
                continue

            # Buscar cualquier variante
            for variant in variants:
                if variant in name or variant in label:
                    found = f
                    result[variant] = f
                    break

    return result


def _resolve_auto_query(query: dict, auto_fields: dict) -> tuple:
    """
    Resuelve una query auto-detect reemplazando __auto_*__ con campos reales encontrados.
    Retorna (resolved_fields, success).
    """
    if not query.get("detect"):
        return [], False

    detect_rules = query["detect"].get("patterns", [])
    resolved = []

    for rule_pattern in detect_rules:
        field = auto_fields.get(rule_pattern)
        if field:
            resolved.append(field["name"])

    if not resolved:
        return [], False

    return resolved, True


def detect_active_modules(fields: list[dict], submissions: list[dict]) -> list[dict]:
    """
    Detecta qué módulos están activos según los campos disponibles.
    Soporta:
    - Matching exacto de nombres de campo
    - Wildcard (campo/* para prefijos)
    - Auto-detect (módulos con detect_rules que buscan por patrones genéricos)
    - Fallback a matching fuzzy por substring
    """
    modules = load_modules()
    all_field_names = {f["name"] for f in fields}
    field_by_name = {f["name"]: f for f in fields}
    field_labels = {f["name"]: f.get("label", "").lower() for f in fields}
    result = []

    for module in modules:
        active_queries = []
        total_required = 0
        matched_required = 0
        is_auto_detect = module.get("auto_detect", False)

        # Para auto-detect, pre-calcular campos coincidentes
        auto_fields = {}
        if is_auto_detect:
            auto_fields = _auto_detect_fields(fields, module.get("detect_rules", []))

        for query in module.get("queries", []):
            query_fields = query.get("fields", [])
            if isinstance(query_fields, str):
                query_fields = [query_fields]

            required = query.get("required_fields", [])
            if not required:
                required = query_fields

            # Auto-detect: resolver __auto_*__ placeholders
            if is_auto_detect and query.get("detect"):
                resolved, success = _resolve_auto_query(query, auto_fields)
                if not success:
                    continue

                resolved_query = dict(query)
                resolved_query["resolved_fields"] = resolved
                resolved_query["available_fields"] = resolved
                resolved_query["missing_fields"] = []
                resolved_query["field_schemas"] = [field_by_name.get(n, {"name": n}) for n in resolved]
                resolved_query["auto_detected"] = True
                active_queries.append(resolved_query)
                matched_required += 1
                total_required += 1
                continue

            # Matching normal (exacto o wildcard, SIN fuzzy para evitar falsos positivos)
            available, missing, matched_pairs = _find_matching_fields(required, all_field_names, field_labels)

            if missing:
                # Solo permitimos fuzzy matching para módulos que lo tengan explícito
                if not module.get("fuzzy_match", False):
                    continue
                # Reintentar con fuzzy
                available, missing, matched_pairs = _find_matching_fields_fuzzy(required, all_field_names, field_labels)
                if missing:
                    continue

            resolved_fields = []
            real_available = []
            for qf in query_fields:
                founds = [fn for pat, fns in matched_pairs if pat == qf for fn in fns]
                if not founds:
                    if qf.endswith("/*"):
                        prefix = qf[:-1]
                        founds = sorted({n for n in all_field_names if n.startswith(prefix)})
                    elif qf in all_field_names:
                        founds = [qf]
                resolved_fields.extend(founds)
                real_available.extend(founds)

            total_required += len(required)
            matched_required += len(required) - len(missing)

            resolved_query = dict(query)
            resolved_query["resolved_fields"] = resolved_fields
            resolved_query["available_fields"] = real_available
            resolved_query["missing_fields"] = missing
            resolved_query["field_schemas"] = [field_by_name.get(n, {"name": n}) for n in resolved_fields]
            resolved_query["matched_pairs"] = [{"pattern": p, "fields": f} for p, f in matched_pairs]
            active_queries.append(resolved_query)

        if active_queries:
            status = "full" if is_auto_detect or matched_required >= total_required else "partial"
            result.append({
                "module_id": module.get("id", module.get("name", "unknown")),
                "name": module.get("name", "Módulo sin nombre"),
                "icon": module.get("icon", "table"),
                "description": module.get("description", ""),
                "order": module.get("order", 99),
                "status": status,
                "total_queries": len(module.get("queries", [])),
                "active_queries_count": len(active_queries),
                "queries": active_queries,
                "fields_available": matched_required,
                "fields_required": total_required,
                "auto_detect": is_auto_detect,
            })

    result.sort(key=lambda m: m["order"])
    return result


# ───────────────────────────────
#  EJECUTOR DE MÓDULOS
# ───────────────────────────────

def _detect_repeat_parent(field_name: str, fields: list[dict]) -> Optional[str]:
    """
    Detecta si un campo pertenece a un repeat group.
    Retorna el nombre del repeat group padre, o None si no pertenece.
    """
    for f in fields:
        if f.get("is_repeat"):
            children = f.get("children", [])
            if field_name in children:
                return f["name"]
    return None


def execute_module(module: dict, submissions: list[dict], fields: list[dict],
                   expand_repeat: Optional[str] = None) -> dict:
    """
    Ejecuta todas las queries activas de un módulo y retorna resultados.
    Detecta automáticamente si los campos resueltos están dentro de
    repeat groups y expande según sea necesario.
    """
    # Auto-detect: si alguna query usa campos de repeat, expandir automáticamente
    auto_expand = None
    for query in module.get("queries", []):
        resolved = query.get("resolved_fields", [])
        for rfield in resolved:
            parent = _detect_repeat_parent(rfield, fields)
            if parent:
                auto_expand = parent
                break
        if auto_expand:
            break

    effective_repeat = expand_repeat or auto_expand
    if effective_repeat and effective_repeat != "__none__":
        try:
            submissions = expand_repeat_groups(submissions, effective_repeat)
            # Normalizar: renombrar "integrantes.int_edad" -> "int_edad"
            # porque los handlers esperan los nombres planos originales
            prefix = f"{effective_repeat.split('/')[-1]}."
            for s in submissions:
                for rfield in [rf for q in module.get('queries', []) for rf in q.get('resolved_fields', [])]:
                    prefixed = f"{prefix}{rfield}"
                    if prefixed in s and rfield not in s:
                        s[rfield] = s[prefixed]
        except Exception as e:
            pass  # Si falla, continuar con submissions planas

    result = {
        "module_id": module["module_id"],
        "name": module["name"],
        "icon": module["icon"],
        "description": module["description"],
        "status": module["status"],
        "queries": [],
    }

    for query in module.get("queries", []):
        qtype = query.get("type", "count")
        handler_name = QUERY_TYPES.get(qtype, {}).get("handler")
        if not handler_name:
            continue

        handler = globals().get(handler_name)
        if not handler:
            continue

        try:
            qresult = handler(submissions, query, fields)
            result["queries"].append({
                "query_id": query.get("id", "unknown"),
                "question": query.get("question", ""),
                "justification": query.get("justification", ""),
                "type": qtype,
                "chart": query.get("chart", "bar"),
                "chart_options": query.get("chart_options", {}),
                "data": qresult,
            })
        except Exception as e:
            result["queries"].append({
                "query_id": query.get("id", "unknown"),
                "question": query.get("question", ""),
                "type": qtype,
                "error": str(e),
                "data": None,
            })

    return result


# ───────────────────────────────
#  REPORTE COMPLETO POR MÓDULOS
# ───────────────────────────────

def build_module_report(submissions: list[dict], fields: list[dict],
                         expand_repeat: Optional[str] = None,
                         module_ids: Optional[list[str]] = None) -> dict:
    """
    Construye el reporte completo por módulos.
    Si module_ids se especifica, solo ejecuta esos módulos.
    Si no, ejecuta todos los módulos activos.
    """
    detected = detect_active_modules(fields, submissions)
    modules_to_run = []

    if module_ids:
        modules_to_run = [m for m in detected if m["module_id"] in module_ids]
    else:
        modules_to_run = detected

    results = []
    for module in modules_to_run:
        try:
            mresult = execute_module(module, submissions, fields, expand_repeat)
            results.append(mresult)
        except Exception as e:
            results.append({
                "module_id": module["module_id"],
                "name": module["name"],
                "error": str(e),
                "queries": [],
            })

    return {
        "total_submissions": len(submissions),
        "total_modules": len(results),
        "modules": results,
    }


# ══════════════════════════════════════
#  HANDLERS DE CADA TIPO DE QUERY
# ══════════════════════════════════════


def _handle_count(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """COUNT simple."""
    return {
        "value": len(submissions),
        "label": f"Total de registros: {len(submissions)}",
    }


def _handle_count_group(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """COUNT con GROUP BY."""
    group_field = query.get("resolved_fields", [None])[0]
    if not group_field:
        return {"labels": [], "values": [], "total": len(submissions)}

    counts = Counter()
    for s in submissions:
        val = str(s.get(group_field, "N/A"))
        if val not in ("None", "", "N/A"):
            counts[val] += 1

    ordered = counts.most_common()
    return {
        "labels": [item[0] for item in ordered],
        "values": [item[1] for item in ordered],
        "total": len(submissions),
        "field": group_field,
    }


def _handle_binary_pie(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Proporción binaria (si/no, presente/ausente)."""
    field = query.get("resolved_fields", [None])[0]
    if not field:
        return {"labels": [], "values": []}

    label_map = query.get("label_map", {})
    yes_vals = query.get("yes_values", ["si", "sí", "yes", "1", "true", "verdadero"])
    no_vals = query.get("no_values", ["no", "not", "0", "false", "falso"])

    yes_count = 0
    no_count = 0

    for s in submissions:
        val = str(s.get(field, "")).lower().strip()
        if val in yes_vals:
            yes_count += 1
        elif val in no_vals:
            no_count += 1

    total = yes_count + no_count
    yes_label = label_map.get("yes", "Sí")
    no_label = label_map.get("no", "No")

    return {
        "labels": [yes_label, no_label],
        "values": [yes_count, no_count],
        "total": total,
        "yes_pct": round(yes_count / total * 100, 1) if total else 0,
        "no_pct": round(no_count / total * 100, 1) if total else 0,
    }


def _handle_multi_select_freq(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Frecuencia de opciones en multiselect (columnas binarias)."""
    fields_list = query.get("resolved_fields", [])
    options = query.get("options_labels", {})

    if not fields_list:
        return {"labels": [], "values": []}

    counts = Counter()
    for s in submissions:
        for f in fields_list:
            val = s.get(f, 0)
            if val == 1 or str(val) == "1" or (isinstance(val, str) and val.lower() in ("yes", "si", "true", "x")):
                label = options.get(f, f)
                counts[label] += 1

    ordered = counts.most_common()
    return {
        "labels": [item[0] for item in ordered],
        "values": [item[1] for item in ordered],
        "total_submissions": len(submissions),
        "field": fields_list[0].split("/")[0] if "/" in fields_list[0] else fields_list[0],
    }


def _handle_numeric_kpi(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """KPIs de campo numérico."""
    field = query.get("resolved_fields", [None])[0]
    if not field:
        return {"count": 0}

    values = []
    for s in submissions:
        v = s.get(field)
        if v is not None:
            try:
                values.append(float(v))
            except (ValueError, TypeError):
                pass

    if values:
        kpis = compute_kpis(values)
        return kpis
    return {"count": 0, "sum": 0, "avg": 0, "min": 0, "max": 0, "median": 0, "std": 0}


def _handle_numeric_grouped(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Métrica numérica agrupada por categoría."""
    resolved = query.get("resolved_fields", [])
    if len(resolved) < 2:
        return {"labels": [], "series": []}

    metric_field = resolved[0]
    group_field = resolved[1]

    groups = defaultdict(list)
    for s in submissions:
        v = s.get(metric_field)
        gv = str(s.get(group_field, "N/A"))
        if v is not None and gv not in ("None", ""):
            try:
                groups[gv].append(float(v))
            except (ValueError, TypeError):
                pass

    labels = []
    means = []
    medians = []
    counts = []
    for g, vals in sorted(groups.items(), key=lambda x: sum(x[1]) / len(x[1]) if x[1] else 0, reverse=True):
        labels.append(g)
        kpi = compute_kpis(vals)
        means.append(kpi["avg"])
        medians.append(kpi["median"])
        counts.append(kpi["count"])

    return {
        "labels": labels,
        "series": {
            "mean": means,
            "median": medians,
            "count": counts,
        },
        "metric_field": metric_field,
        "group_field": group_field,
    }


def _handle_text_freq(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Frecuencia de valores en campo de texto categórico."""
    field = query.get("resolved_fields", [None])[0]
    if not field:
        return {"labels": [], "values": []}

    counts = Counter()
    for s in submissions:
        v = s.get(field)
        if v and str(v) not in ("None", "", "N/A"):
            counts[str(v)] += 1

    top_n = query.get("top_n", 15)
    ordered = counts.most_common(top_n)
    return {
        "labels": [item[0] for item in ordered],
        "values": [item[1] for item in ordered],
        "total_unique": len(counts),
        "total": sum(counts.values()),
    }


def _handle_word_cloud(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Nube de palabras desde campos de texto."""
    resolved = query.get("resolved_fields", [])
    result = {}
    for field in resolved[:3]:  # Máximo 3 campos para word cloud
        all_words = Counter()
        total_docs = 0
        for s in submissions:
            v = s.get(field)
            if v and isinstance(v, str) and v.strip():
                total_docs += 1
                words = re.findall(r'[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}', v.lower())
                all_words.update(words)
        if all_words:
            total_freq = sum(all_words.values())
            top = all_words.most_common(50)
            items = []
            for rank, (word, count) in enumerate(top, 1):
                items.append({
                    "word": word,
                    "count": count,
                    "pct": round(count / total_freq * 100, 1) if total_freq else 0,
                    "rank": rank,
                })
            result[field] = items
    return result


def _handle_contingency(submissions: list[dict], query: dict, fields: list[dict]) -> Optional[dict]:
    """Tabla de contingencia entre dos campos categóricos."""
    resolved = query.get("resolved_fields", [])
    if len(resolved) < 2:
        return None

    row_field = resolved[0]
    col_field = resolved[1]

    from .report_engine import _build_cross_table
    return _build_cross_table(submissions, row_field, col_field)


def _handle_temporal_series(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Serie temporal."""
    field = query.get("resolved_fields", [None])[0]
    grouping = query.get("temporal_grouping", "month")
    if not field:
        return {"labels": [], "values": []}

    data = group_temporally(submissions, field, grouping)
    return {
        "labels": list(data.keys()),
        "values": list(data.values()),
        "field": field,
        "grouping": grouping,
    }


def _handle_scatter(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Dispersión entre dos variables numéricas."""
    resolved = query.get("resolved_fields", [])
    if len(resolved) < 2:
        return {"x": [], "y": []}

    x_field = resolved[0]
    y_field = resolved[1]

    points = []
    for s in submissions:
        xv = s.get(x_field)
        yv = s.get(y_field)
        if xv is not None and yv is not None:
            try:
                points.append({
                    "x": float(xv),
                    "y": float(yv),
                })
            except (ValueError, TypeError):
                pass

    return {
        "points": points,
        "x_field": x_field,
        "y_field": y_field,
        "total_points": len(points),
    }


def _handle_boxplot(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Boxplot de un campo numérico, opcionalmente agrupado."""
    resolved = query.get("resolved_fields", [])
    if not resolved:
        return {"groups": []}

    num_field = resolved[0]

    if len(resolved) >= 2:
        group_field = resolved[1]
        groups = defaultdict(list)
        for s in submissions:
            v = s.get(num_field)
            gv = str(s.get(group_field, "N/A"))
            if v is not None and gv not in ("None", ""):
                try:
                    groups[gv].append(float(v))
                except (ValueError, TypeError):
                    pass

        result_groups = []
        for gname, vals in groups.items():
            if len(vals) < 4:
                continue
            sv = sorted(vals)
            n = len(sv)
            result_groups.append({
                "name": gname,
                "min": sv[0], "max": sv[-1],
                "q1": float(sv[n // 4]),
                "median": float(sv[n // 2]) if n % 2 == 1 else (sv[n // 2 - 1] + sv[n // 2]) / 2,
                "q3": float(sv[3 * n // 4]),
                "count": n,
                "outliers": [v for v in sv if v < sv[n // 4] - 1.5 * (sv[3 * n // 4] - sv[n // 4])
                             or v > sv[3 * n // 4] + 1.5 * (sv[3 * n // 4] - sv[n // 4])],
            })
        return {"groups": result_groups, "field": num_field}
    else:
        vals = []
        for s in submissions:
            v = s.get(num_field)
            if v is not None:
                try:
                    vals.append(float(v))
                except (ValueError, TypeError):
                    pass
        if len(vals) < 4:
            return {"groups": []}
        sv = sorted(vals)
        n = len(sv)
        return {
            "groups": [{
                "name": "General",
                "min": sv[0], "max": sv[-1],
                "q1": float(sv[n // 4]),
                "median": float(sv[n // 2]) if n % 2 == 1 else (sv[n // 2 - 1] + sv[n // 2]) / 2,
                "q3": float(sv[3 * n // 4]),
                "count": n,
                "outliers": [v for v in sv if v < sv[n // 4] - 1.5 * (sv[3 * n // 4] - sv[n // 4])
                             or v > sv[3 * n // 4] + 1.5 * (sv[3 * n // 4] - sv[n // 4])],
            }],
            "field": num_field,
        }


def _handle_heatmap(submissions: list[dict], query: dict, fields: list[dict]) -> Optional[dict]:
    """Mapa de calor de frecuencias entre dos categóricas."""
    resolved = query.get("resolved_fields", [])
    if len(resolved) < 2:
        return None
    return _handle_contingency(submissions, query, fields)


def _handle_stacked_bar(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """Barras apiladas: grupo por una dimensión, categorías de otra."""
    resolved = query.get("resolved_fields", [])
    if len(resolved) < 2:
        return {"labels": [], "categories": [], "data": []}

    # Primer campo: la dimensión principal (eje X)
    # Segundo campo: la categoría que se apila
    dim_field = resolved[0]
    cat_field = resolved[1]

    matrix = defaultdict(lambda: Counter())
    for s in submissions:
        dim = str(s.get(dim_field, "N/A"))
        cat = str(s.get(cat_field, "N/A"))
        if dim not in ("None", "") and cat not in ("None", ""):
            matrix[dim][cat] += 1

    labels = sorted(matrix.keys())
    all_cats = set()
    for d in labels:
        all_cats.update(matrix[d].keys())
    categories = sorted(all_cats)

    data = {cat: [matrix[d].get(cat, 0) for d in labels] for cat in categories}

    return {
        "labels": labels,
        "categories": categories,
        "data": data,
    }


def _handle_mixed_query(submissions: list[dict], query: dict, fields: list[dict]) -> dict:
    """
    Query compuesta que ejecuta múltiples sub-queries.
    La definición está en query["subqueries"].
    """
    result = {}
    for sq in query.get("subqueries", []):
        sqtype = sq.get("type", "count")
        handler_name = QUERY_TYPES.get(sqtype, {}).get("handler")
        if handler_name:
            handler = globals().get(handler_name)
            if handler:
                try:
                    result[sq.get("id", "sub")] = handler(submissions, {**query, **sq}, fields)
                except Exception:
                    result[sq.get("id", "sub")] = None
    return result


# ───────────────────────────────
#  MAPEO AUTOMÁTICO POR SIMILITUD
# ───────────────────────────────

def auto_map_fields(form_fields: list[dict], module_templates: list[dict]) -> list[dict]:
    """
    Mapea campos del formulario real a campos esperados por módulos,
    usando similitud de nombres (case-insensitive, substrings).
    Retorna misma estructura que detect_active_modules pero con mapeo explícito.

    Útil para formularios que no tienen los mismos nombres que los templates.
    """
    field_names = {f["name"].lower() for f in form_fields}
    field_labels = {f.get("label", "").lower() for f in form_fields}

    def field_matches(pattern: str) -> bool:
        """Verifica si algún campo coincide con el patrón."""
        pl = pattern.lower().strip()
        # Exact match
        if pl in field_names:
            return True
        # Wildcard match
        if pl.endswith("/*"):
            prefix = pl[:-1]
            return any(n.startswith(prefix) for n in field_names)
        # Substring match en nombres
        if any(pl in n for n in field_names):
            return True
        # Substring match en labels
        if any(pl in lbl for lbl in field_labels):
            return True
        return False

    result = []
    for module in module_templates:
        matched_queries = []
        for query in module.get("queries", []):
            required = query.get("required_fields", query.get("fields", []))
            if isinstance(required, str):
                required = [required]

            matched_all = all(field_matches(rf) for rf in required)
            if matched_all:
                matched_queries.append(query)

        if matched_queries:
            result.append({
                "module_id": module.get("id", "unknown"),
                "name": module.get("name", ""),
                "status": "auto_mapped",
                "queries": matched_queries,
            })

    return result


# ───────────────────────────────
#  GENERADOR DE MÓDULOS DESDE GRUPOS
# ───────────────────────────────

def groups_to_modules(logical_groups: list[dict]) -> list[dict]:
    """
    Convierte los grupos lógicos existentes (get_logical_groups) a módulos.
    Útil para migración gradual: cada grupo → un módulo con queries básicas.
    """
    modules = []
    for g in logical_groups:
        queries = []
        for f in g["fields"][:10]:  # Máximo 10 campos por módulo
            qtype = "count_group"
            if f["type"] in ("int", "integer", "decimal"):
                qtype = "numeric_kpi"
            elif f["type"] == "geopoint":
                continue
            elif f["type"] in ("text",):
                qtype = "text_freq"
            elif f["type"] in ("select_one",):
                qtype = "count_group"
            elif f["type"] in ("select_multiple",):
                qtype = "multi_select_freq"

            queries.append({
                "id": f"field_{f['name']}",
                "question": f"Análisis de {f['label']}",
                "type": qtype,
                "fields": [f["name"]],
                "required_fields": [f["name"]],
                "chart": "bar" if qtype != "numeric_kpi" else "numeric",
            })

        if queries:
            modules.append({
                "id": g["name"].lower().replace(" ", "_"),
                "name": g["name"],
                "icon": g.get("icon", "table"),
                "description": f"Análisis de {g['name'].lower()}",
                "order": 50,
                "queries": queries,
            })

    return modules
