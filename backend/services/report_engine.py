"""
Módulo de informes automáticos para ODK Central.
Incluye: word clouds con frecuencias, tablas de contingencia binarias,
pirámide poblacional, KPIs estadísticos.
"""

import re
import json
import urllib.request
import ssl
from collections import Counter, defaultdict
from datetime import datetime
from typing import Optional

_geo_cache: dict[str, dict] = {}
GEO_CACHE_DB = {}


# ───────────────────────────
#  PARSEO DE SCHEMA XML
# ───────────────────────────

def parse_xml_schema(xml: str) -> list[dict]:
    fields = []
    binds = re.findall(r'<bind[^>]+>', xml)

    options_map = defaultdict(list)
    for match in re.finditer(r'<text id="([^"]+)">\s*<value>([^<]+)', xml):
        opt_id = match.group(1)
        opt_val = match.group(2)
        parts = opt_id.rsplit('-', 1)
        if len(parts) >= 2 and parts[1].isdigit():
            options_map[parts[0]].append(opt_val)

    repeats = set()
    for r in re.findall(r'<repeat[^>]*nodeset="([^"]+)"', xml):
        repeats.add(r)

    def get_repeat_parent(nodeset: str) -> Optional[str]:
        for r in repeats:
            if nodeset.startswith(r + "/"):
                return r
        return None

    for b in binds:
        nodeset_match = re.search(r'nodeset="([^"]+)"', b)
        type_match = re.search(r'type="([^"]+)"', b)
        if not nodeset_match:
            continue

        nodeset = nodeset_match.group(1)
        field_type = type_match.group(1) if type_match else "string"
        parts = nodeset.split("/")
        clean_name = parts[-1]

        if "meta" in nodeset or clean_name in ("deviceid", "subscriberid", "simserial", "phonenumber", "username"):
            continue

        repeat_parent = get_repeat_parent(nodeset)

        # Mapear tipo
        if field_type in ("int", "integer"):
            mapped_type = "integer"
        elif field_type in ("decimal", "double"):
            mapped_type = "decimal"
        elif field_type in ("string", "text", "Note:"):
            mapped_type = "text"
        elif field_type in ("select1",):
            mapped_type = "select_one"
        elif field_type in ("select",):
            mapped_type = "select_multiple"
        elif field_type in ("geopoint",):
            mapped_type = "geopoint"
        elif field_type in ("geotrace", "geoshape"):
            mapped_type = field_type
        elif field_type in ("date", "dateTime", "time"):
            mapped_type = field_type
        elif field_type in ("binary",):
            mapped_type = "binary"
        elif field_type in ("calculate",):
            mapped_type = "calculate"
        else:
            mapped_type = "text"

        # Extraer label del XML
        field_name = clean_name
        input_match = re.search(
            r'<(?:input|select1|select|range|upload)\s+ref="' + re.escape(nodeset) + r'"[^>]*>',
            xml
        )
        if input_match:
            label_match = re.search(r'<label[^>]*>([^<]+)', input_match.group())
            if label_match:
                label_text = label_match.group(1).strip()
                if label_text:
                    field_name = label_text

        # Extraer list_name (opcional) para resolver select con prefijos KoBo
        list_name = ""
        if mapped_type.startswith("select_one") or mapped_type.startswith("select_multiple"):
            parts_t = mapped_type.split()
            if len(parts_t) > 1:
                list_name = parts_t[1]

        fields.append({
            "path": nodeset,
            "name": clean_name,
            "label": field_name,
            "type": mapped_type,
            "is_repeat": False,
            "repeat_parent": repeat_parent,
            "options": options_map.get(clean_name, []),
            "list_name": list_name,
        })

    for r in repeats:
        clean = r.split("/")[-1]
        subfields = [f for f in fields if f.get("repeat_parent") == r]
        fields.append({
            "path": r,
            "name": clean,
            "label": clean,
            "type": "repeat_group",
            "is_repeat": True,
            "repeat_parent": None,
            "children": [f["name"] for f in subfields],
            "options": [],
        })

    return fields


# ───────────────────────────
#  EXPANSIÓN DE REPEATS
# ───────────────────────────

def expand_repeat_groups(submissions: list[dict], repeat_path: str) -> list[dict]:
    """Expande un repeat group (como integrantes) en filas individuales."""
    expanded = []
    prefix = repeat_path.strip("/")

    for sub in submissions:
        repeat_data = sub.get(prefix, [])
        if not isinstance(repeat_data, list):
            repeat_data = [repeat_data]

        if not repeat_data:
            row = dict(sub)
            expanded.append(row)
            continue

        for item in repeat_data:
            row = dict(sub)
            if isinstance(item, dict):
                for k, v in item.items():
                    row[f"{prefix.split('/')[-1]}.{k}"] = v
            else:
                row[f"{prefix.split('/')[-1]}"] = item
            expanded.append(row)

    return expanded


# ───────────────────────────
#  GEOPUNTOS
# ───────────────────────────

def extract_geopoint(submission: dict, geopoint_field: str) -> Optional[tuple[float, float]]:
    raw = submission.get(geopoint_field)
    if not raw:
        return None

    if isinstance(raw, str):
        parts = raw.strip().split()
        if len(parts) >= 2:
            try:
                return (float(parts[0]), float(parts[1]))
            except (ValueError, IndexError):
                pass

    if isinstance(raw, dict):
        lat = raw.get("latitude") or raw.get("lat") or (raw.get("coordinates") or [None, None])[1]
        lon = raw.get("longitude") or raw.get("lng") or raw.get("lon") or (raw.get("coordinates") or [None, None])[0]
        if lat is not None and lon is not None:
            try:
                return (float(lat), float(lon))
            except (ValueError, TypeError):
                pass

    return None


def geocode_reverse(lat: float, lon: float) -> Optional[dict]:
    cache_key = f"{lat:.6f},{lon:.6f}"
    if cache_key in _geo_cache:
        return _geo_cache[cache_key]
    if cache_key in GEO_CACHE_DB:
        result = GEO_CACHE_DB[cache_key]
        _geo_cache[cache_key] = result
        return result

    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&addressdetails=1"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SIGERFI-Dashboard/1.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            if "address" in data:
                address = data["address"]
                result = {
                    "display_name": data.get("display_name", ""),
                    "country": address.get("country", ""),
                    "state": address.get("state", ""),
                    "region": address.get("region", ""),
                    "county": address.get("county", ""),
                    "city": address.get("city", address.get("town", address.get("village", ""))),
                    "municipality": address.get("municipality", ""),
                    "road": address.get("road", ""),
                    "postcode": address.get("postcode", ""),
                }
                _geo_cache[cache_key] = result
                GEO_CACHE_DB[cache_key] = result
                return result
    except Exception:
        pass
    return None


# ───────────────────────────
#  AGRUPACIÓN TEMPORAL
# ───────────────────────────

def group_temporally(submissions: list[dict], field: str, grouping: str = "month") -> dict:
    groups = defaultdict(int)
    for s in submissions:
        raw_date = s.get(field)
        if not raw_date:
            continue
        try:
            if isinstance(raw_date, str):
                dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            else:
                dt = raw_date
            if grouping == "day":
                key = dt.strftime("%Y-%m-%d")
            elif grouping == "week":
                key = dt.strftime("%Y-W%W")
            elif grouping == "month":
                key = dt.strftime("%Y-%m")
            elif grouping == "quarter":
                quarter = (dt.month - 1) // 3 + 1
                key = f"{dt.year}-Q{quarter}"
            elif grouping == "year":
                key = str(dt.year)
            else:
                key = dt.strftime("%Y-%m")
            groups[key] += 1
        except (ValueError, AttributeError):
            pass
    return dict(sorted(groups.items()))


# ───────────────────────────
#  KPIs ESTADÍSTICOS
# ───────────────────────────

def compute_kpis(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "sum": 0, "avg": 0, "min": 0, "max": 0, "median": 0, "std": 0}
    n = len(values)
    total = sum(values)
    avg = total / n
    sorted_vals = sorted(values)
    median = sorted_vals[n // 2] if n % 2 == 1 else (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
    variance = sum((x - avg) ** 2 for x in values) / n
    std = variance ** 0.5
    return {
        "count": n, "sum": total, "avg": round(avg, 2),
        "min": min(values), "max": max(values), "median": round(median, 2),
        "std": round(std, 2),
        "q1": float(sorted_vals[n // 4]),
        "q3": float(sorted_vals[3 * n // 4]),
    }


def count_categories(values: list) -> dict:
    counter = Counter(str(v) for v in values if v is not None and str(v) not in ("", "None"))
    return dict(counter.most_common())


# ───────────────────────────
#  WORD CLOUD MEJORADO
# ───────────────────────────

def build_word_cloud(submissions: list[dict], fields: list[dict]) -> dict:
    """
    Genera nubes de palabras desde campos de texto libre.
    Retorna dict {field_name: [{word, count, pct, rank}, ...]} con estadísticas.
    """
    text_fields = [f for f in fields if f["type"] == "text" and not f["is_repeat"]
                   and f["name"] not in ("deviceid", "subscriberid", "simserial",
                                         "phonenumber", "username")]
    result = {}

    for tf in text_fields[:8]:
        all_words: Counter = Counter()
        total_docs = 0

        for s in submissions:
            v = s.get(tf["name"])
            if v and isinstance(v, str) and v.strip():
                total_docs += 1
                # Para campos con múltiples valores separados por espacio (servicios_basicos, etc.)
                words = re.findall(r'[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}', v.lower())
                all_words.update(words)

        if not all_words:
            continue

        total_freq = sum(all_words.values())
        top = all_words.most_common(50)

        word_cloud_items = []
        for rank, (word, count) in enumerate(top, 1):
            word_cloud_items.append({
                "word": word,
                "count": count,
                "frequency": round(count / total_freq, 4) if total_freq else 0,
                "pct": round(count / total_freq * 100, 1) if total_freq else 0,
                "rank": rank,
                "documents": sum(1 for s in submissions
                                 if s.get(tf["name"]) and isinstance(s.get(tf["name"]), str)
                                 and word in s[tf["name"]].lower()),
            })

        stats = {
            "total_words": total_freq,
            "unique_words": len(all_words),
            "total_documents": total_docs,
            "avg_words_per_doc": round(total_freq / total_docs, 1) if total_docs else 0,
            "top_words": top[:10],
        }

        result[tf["name"]] = {
            "label": tf["label"],
            "items": word_cloud_items,
            "stats": stats,
        }

    return result


# ───────────────────────────
#  TABLAS DE CONTINGENCIA
# ───────────────────────────

def build_contingency_tables(submissions: list[dict], fields: list[dict]) -> list[dict]:
    """
    Detecta pares de campos categóricos y genera tablas de contingencia.
    Incluye:
    - Pares (select_one × select_one)
    - Pares (text categórico × text categórico) con pocos valores únicos
    - Especial: géneros (hombre/mujer) × cualquier otro categórico
    """
    # Identificar campos categóricos (select_one, select_multiple, text con pocos valores únicos)
    cat_fields = []
    for f in fields:
        if f["is_repeat"] or f["type"] in ("calculate", "binary", "geopoint", "geotrace", "geoshape"):
            continue
        if f["type"] in ("select_one", "select_multiple"):
            cat_fields.append(f)
        elif f["type"] == "text":
            values = [s.get(f["name"]) for s in submissions if s.get(f["name"])]
            unique = set(str(v) for v in values if v and str(v) not in ("", "None"))
            if 2 <= len(unique) <= 12:  # campo categórico con pocos valores
                cat_fields.append(f)
            elif f['type'] == 'select_multiple':
                # select_multiple suele tener valores separados por espacio, tratarlos como categóricos
                cat_fields.append(f)

    tables = []

    # Buscar pares interesantes: seleccionar los más relevantes
    # 1. Detectar género (hombre/mujer/otro)
    gender_fields = [f for f in cat_fields if any(k in f["name"].lower() for k in ("genero", "sexo", "gender"))]

    # 2. Si hay género, cruzarlo con otros campos categóricos
    if gender_fields:
        gender_f = gender_fields[0]
        others = [f for f in cat_fields if f["name"] != gender_f["name"]]
        for other in others[:6]:  # máximo 6 tablas
            table = _build_cross_table(submissions, gender_f["name"], other["name"])
            if table and len(table["rows"]) > 0:
                tables.append({
                    "type": "gender_cross",
                    "row_field": gender_f["name"],
                    "row_label": gender_f["label"],
                    "col_field": other["name"],
                    "col_label": other["label"],
                    **table,
                })

    # 3. Pares select_one × select_one generales (máximo 4)
    select_ones = [f for f in cat_fields if f["type"] == "select_one"]
    pairs_done = set((gender_f["name"],) for _ in [1]) if gender_fields else set()
    for i, f1 in enumerate(select_ones):
        for f2 in select_ones[i + 1:]:
            key = tuple(sorted([f1["name"], f2["name"]]))
            if key in pairs_done:
                continue
            pairs_done.add(key)
            table = _build_cross_table(submissions, f1["name"], f2["name"])
            if table and len(table["rows"]) >= 2:
                tables.append({
                    "type": "select_cross",
                    "row_field": f1["name"],
                    "row_label": f1["label"],
                    "col_field": f2["name"],
                    "col_label": f2["label"],
                    **table,
                })
            if len(tables) >= 6:
                break
        if len(tables) >= 6:
            break

    return tables


def _build_cross_table(submissions: list[dict], row_field: str, col_field: str) -> Optional[dict]:
    """Construye tabla de contingencia 2D entre dos campos."""
    matrix = defaultdict(lambda: defaultdict(int))
    row_labels = set()
    col_labels = set()

    for s in submissions:
        rv = str(s.get(row_field, "N/A"))
        cv = str(s.get(col_field, "N/A"))
        if rv in ("None", "") or cv in ("None", ""):
            continue
        matrix[rv][cv] += 1
        row_labels.add(rv)
        col_labels.add(cv)

    if len(row_labels) < 2 and len(col_labels) < 2:
        return None

    col_sorted = sorted(col_labels)
    rows = []
    for rl in sorted(row_labels):
        row_data = {cl: matrix[rl][cl] for cl in col_sorted}
        row_data["_row_total"] = sum(row_data.values())
        rows.append({"label": rl, **row_data})

    col_totals = {cl: sum(matrix[rl][cl] for rl in row_labels) for cl in col_sorted}
    col_totals["_row_total"] = sum(col_totals.values())

    total = col_totals["_row_total"]

    # Chi-cuadrado para independencia
    chi2 = 0.0
    for rl in row_labels:
        for cl in col_sorted:
            observed = matrix[rl][cl]
            if total == 0:
                continue
            row_total = sum(matrix[rl][c] for c in col_sorted)
            col_total = sum(matrix[r][cl] for r in row_labels)
            expected = row_total * col_total / total
            if expected > 0:
                chi2 += (observed - expected) ** 2 / expected

    return {
        "rows": rows,
        "col_labels": col_sorted,
        "col_totals": col_totals,
        "total": total,
        "chi_square": round(chi2, 2),
    }


# ───────────────────────────
#  PIRÁMIDE POBLACIONAL
# ───────────────────────────

def build_population_pyramid(submissions: list[dict], fields: list[dict]) -> Optional[dict]:
    """
    Detecta campos de edad y género y construye una pirámide poblacional.
    Soporta:
    - Campos edad: (edad|age|int_edad) tipo integer
    - Campos género: (genero|sexo|gender|int_genero) tipo text/select_one
    - Rangos etarios automáticos: 0-4, 5-9, 10-14, ..., 80+
    """
    # Detectar edad
    age_field = None
    for f in fields:
        if f["type"] in ("integer", "int", "decimal") and not f["is_repeat"]:
            name_lower = f["name"].lower()
            label_lower = f["label"].lower()
            if "edad" in name_lower or "age" in name_lower or "edad" in label_lower:
                age_field = f
                break

    # Detectar género
    gender_field = None
    for f in fields:
        if not f["is_repeat"]:
            name_lower = f["name"].lower()
            label_lower = f["label"].lower()
            if any(k in name_lower for k in ("genero", "sexo", "gender", "gen")):
                gender_field = f
                break
            if any(k in label_lower for k in ("género", "sexo", "genero", "gender")):
                gender_field = f
                break

    # Detectar si estamos en un repeat (integrantes)
    in_repeat = False
    if age_field and age_field.get("repeat_parent"):
        in_repeat = True
        expand_path = age_field["repeat_parent"]

    if not age_field:
        return None

    # Extraer datos (desde repeat o desde submissions directas)
    data = []
    if in_repeat:
        expand_path = age_field["repeat_parent"]
        prefix = expand_path.strip("/").split("/")[-1]
        for s in submissions:
            members = s.get(prefix, [])
            if not isinstance(members, list):
                members = [members]
            for m in members:
                if isinstance(m, dict):
                    age_val = m.get(age_field["name"], m.get(f"int_edad"))
                    gen_val = m.get(gender_field["name"], m.get(f"int_genero")) if gender_field else None
                    if age_val is not None:
                        data.append({"edad": age_val, "genero": gen_val})
    else:
        for s in submissions:
            age_val = s.get(age_field["name"])
            gen_val = s.get(gender_field["name"]) if gender_field else None
            if age_val is not None:
                data.append({"edad": age_val, "genero": gen_val})

    if not data:
        return None

    # Definir rangos etarios
    age_ranges = []
    for start in range(0, 80, 5):
        age_ranges.append((start, start + 4))
    age_ranges.append((80, 999))  # 80+

    range_labels = [f"{s}-{e}" if e < 200 else f"{s}+" for s, e in age_ranges]

    # Clasificar
    pyramid = {g: {rl: 0 for rl in range_labels} for g in ("hombres", "mujeres", "sin_dato")}
    total_by_range = {rl: 0 for rl in range_labels}

    for d in data:
        try:
            age = int(float(d["edad"]))
        except (ValueError, TypeError):
            continue

        # Asignar rango
        range_key = range_labels[-1]
        for (s, e), rl in zip(age_ranges, range_labels):
            if s <= age <= e:
                range_key = rl
                break

        # Asignar género
        gender_raw = str(d.get("genero", "")).lower()
        if gender_raw in ("m", "hombre", "masculino", "male", "h"):
            gender_key = "hombres"
        elif gender_raw in ("f", "mujer", "femenino", "female", "mujeres"):
            gender_key = "mujeres"
        else:
            gender_key = "sin_dato"

        pyramid[gender_key][range_key] += 1
        total_by_range[range_key] += 1

    total_pob = sum(total_by_range.values())

    # Formatear para ECharts (pirámide)
    series_h = []
    series_m = []
    series_sd = []
    for rl in range_labels:
        h = pyramid["hombres"][rl]
        m = pyramid["mujeres"][rl]
        sd = pyramid["sin_dato"][rl]
        series_h.append(-h)  # negativo para que se dibuje a la izquierda
        series_m.append(m)
        series_sd.append(sd)

    return {
        "total_population": total_pob,
        "age_field": age_field["name"],
        "age_label": age_field["label"],
        "gender_field": gender_field["name"] if gender_field else None,
        "gender_label": gender_field["label"] if gender_field else None,
        "ranges": range_labels,
        "data": {
            "hombres": series_h,
            "mujeres": series_m,
            "sin_dato": series_sd,
            "totals": [total_by_range[rl] for rl in range_labels],
        },
        "stats": {
            "total_hombres": sum(v for v in pyramid["hombres"].values()),
            "total_mujeres": sum(v for v in pyramid["mujeres"].values()),
            "total_sin_dato": sum(v for v in pyramid["sin_dato"].values()),
            "edad_minima": min(d["edad"] for d in data if d["edad"] is not None),
            "edad_maxima": max(d["edad"] for d in data if d["edad"] is not None),
            "edad_promedio": round(sum(float(d["edad"]) for d in data if d["edad"] is not None) / len([d for d in data if d["edad"] is not None]), 1),
        },
    }


# ───────────────────────────
#  INFORME PRINCIPAL
# ───────────────────────────

def build_report(submissions, fields, metrics, dimensions,
                 expand_repeat=None, geopoint_field=None,
                 temporal_field=None, temporal_grouping="month"):
    if expand_repeat:
        submissions = expand_repeat_groups(submissions, expand_repeat)

    # Geo
    geo_data = {}
    if geopoint_field:
        for i, s in enumerate(submissions):
            coords = extract_geopoint(s, geopoint_field)
            if coords:
                address = geocode_reverse(*coords)
                if address:
                    geo_data[i] = address
                    for geo_key, geo_val in address.items():
                        if geo_key != "display_name":
                            s[f"geo_{geo_key}"] = geo_val

    result = {
        "total_submissions": len(submissions),
        "kpis": {},
        "grouped_data": {},
        "temporal_data": {},
        "geo_data": geo_data,
        "charts": {},
        "word_cloud": {},
        "contingency_tables": [],
        "population_pyramid": None,
        "raw_data": submissions,
    }

    # KPIs por métrica
    for metric in metrics:
        values = []
        for s in submissions:
            v = s.get(metric)
            if v is not None:
                try:
                    values.append(float(v))
                except (ValueError, TypeError):
                    pass

        if values:
            result["kpis"][metric] = compute_kpis(values)
        else:
            categories = count_categories([s.get(metric) for s in submissions])
            result["kpis"][metric] = {"count": len(submissions), "categories": categories, "type": "categorical"}

    # Datos agrupados por dimensión
    for dim in dimensions:
        groups = defaultdict(lambda: defaultdict(list))
        for s in submissions:
            dim_val = str(s.get(dim, "N/A"))
            for metric in metrics:
                v = s.get(metric)
                if v is not None:
                    try:
                        groups[dim_val][metric].append(float(v))
                    except (ValueError, TypeError):
                        groups[dim_val][metric].append(str(v))

        dim_result = {}
        for dim_val, metric_data in groups.items():
            dim_result[dim_val] = {}
            for metric, vals in metric_data.items():
                if all(isinstance(v, (int, float)) for v in vals):
                    dim_result[dim_val][metric] = compute_kpis(vals)
                else:
                    dim_result[dim_val][metric] = {"count": len(vals), "categories": dict(Counter(vals).most_common())}

        result["grouped_data"][dim] = dim_result

        chart_labels = list(dim_result.keys())
        chart_values = {}
        for metric in metrics:
            if metric in result["kpis"] and result["kpis"][metric].get("type") != "categorical":
                chart_values[metric] = [dim_result.get(label, {}).get(metric, {}).get("count", 0) for label in chart_labels]

        if chart_values:
            result["charts"][dim] = {
                "type": "bar", "labels": chart_labels, "values": chart_values,
                "title": f"{', '.join(metrics)} por {dim}",
            }

    # Temporal
    if temporal_field:
        temporal_data = group_temporally(submissions, temporal_field, temporal_grouping)
        result["temporal_data"] = {"field": temporal_field, "grouping": temporal_grouping, "data": temporal_data}
        result["charts"]["temporal"] = {
            "type": "line", "labels": list(temporal_data.keys()), "values": {"count": list(temporal_data.values())},
            "title": f"Registros por {temporal_grouping}",
        }

    # Geo points
    if geo_data:
        geo_points = []
        for idx, address in geo_data.items():
            coords = extract_geopoint(submissions[idx], geopoint_field or "")
            if coords:
                geo_points.append({
                    "lat": coords[0], "lon": coords[1],
                    "address": address.get("display_name", ""),
                    "city": address.get("city", ""), "state": address.get("state", ""),
                })
        result["geo_points"] = geo_points

    # Word cloud mejorado con frecuencias y estadísticas
    result["word_cloud"] = build_word_cloud(submissions, fields)

    # Tablas de contingencia (cruce binario/categórico)
    result["contingency_tables"] = build_contingency_tables(submissions, fields)

    # Pirámide poblacional (automática)
    pyramid = build_population_pyramid(submissions, fields)
    if pyramid:
        result["population_pyramid"] = pyramid

    return result


# ───────────────────────────
#  GRUPOS LÓGICOS
# ───────────────────────────

def get_logical_groups(fields: list[dict]) -> list[dict]:
    """Agrupa campos en grupos lógicos con tipo de análisis sugerido."""
    rules = [
        ("nombre_encuestador|cedula_encuestador", "identif|cédula|cedula", "Identificación", "id", "count"),
        ("direccion_referencia|ubicacion", "ubicac|estado|municipio|parroquia|localidad|direccion|parcela", "Ubicación", "map", "geo"),
        ("nota_agricola|hectareas_cultivo|rendimiento_tn_ha", "cultiv|agricol|hect|siembra|produc|rendim", "Producción", "bar", "bar_stacked"),
        ("satisfaccion_vialidad|ranking_vias", "vía|acceso|camino|calle|via", "Vías de Acceso", "bar", "bar"),
        ("tipo_vivienda|tenencia_vivienda|servicios_basicos|foto_vivienda", "vivienda|casa|tenencia", "Vivienda", "bar", "bar"),
        ("satisfaccion_agua|satisfaccion_electricidad|ranking_agua|ranking_electricidad", "agua|electric|vial|satisf", "Servicios Básicos", "bar", "bar"),
        ("nota_ranking|nota_cierre|ranking_salud|ranking_vias|ranking_agua|ranking_electricidad", "ranking|nota", "Ranking y Notas", "radar", "radar"),
        ("numero_familiares|int_.*", "edad|género|genero|famil|parentesco|integrante", "Demográfico", "bar", "bar"),
        ("ingreso_mensual_usd|ingreso_per_capita", "ingreso|per. cap", "Ingresos", "bar", "histogram"),
        ("redes_sociales", "redes", "Redes Sociales", "pie", "pie"),
        ("fecha_encuesta|start|end|today", "fecha", "Fechas", "line", "line"),
        ("nombre_comunidad|foto_comunidad|audio_testimonio", "identif|cédula|nombre|comunidad", "Identificación", "id", "count"),
    ]

    used = set()
    group_map = {}
    group_order = []
    seen_names = set()

    for name_pattern, label_pattern, group_name, icon, analysis in rules:
        matching = []
        for f in fields:
            if f["name"] in used:
                continue
            name_lower = f["name"].lower()
            label_lower = f["label"].lower()
            if re.search(name_pattern, name_lower) or re.search(label_pattern, label_lower):
                if f["name"] not in ("deviceid", "subscriberid", "simserial", "phonenumber", "username"):
                    matching.append(f)
                    used.add(f["name"])

        if matching:
            if group_name not in group_map:
                group_map[group_name] = {"name": group_name, "icon": icon, "analysis": analysis, "fields": []}
                group_order.append(group_name)
            for m in matching:
                if m["name"] not in seen_names:
                    group_map[group_name]["fields"].append(m)
                    seen_names.add(m["name"])

    groups = []
    for gn in group_order:
        g = group_map[gn]
        if g["fields"]:
            g["field_count"] = len(g["fields"])
            groups.append(g)

    unassigned = [f for f in fields if f["name"] not in used and not f["is_repeat"]
                  and f["type"] not in ("calculate", "binary")
                  and f["name"] not in ("deviceid", "subscriberid", "simserial", "phonenumber", "username")]
    if unassigned:
        groups.append({"name": "Otros", "icon": "table", "analysis": "raw", "fields": unassigned, "field_count": len(unassigned)})

    return groups
