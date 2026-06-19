"""Prueba de los endpoints de consultas (Fase 3)."""
import urllib.request, json, sys

BASE = "http://localhost:8010"
TOKEN = None

def api(path, method="GET", body=None):
    h = {"Content-Type": "application/json"}
    if TOKEN: h["Authorization"] = f"Bearer {TOKEN}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

P = 4
F = "Diagnostico_Comunitario_Integral"

# Login
_, d = api("/api/auth/login", "POST", {"email": "danielder71@yandex.com", "password": "mrgeov_bot71"})
TOKEN = d["access_token"]
print(f'[OK] Login: {d["displayName"]}')

# /query/fields
code, d = api(f"/query/fields?project_id={P}&form_id={F}")
print(f"  -> {d.get('count',0)} fields")
for f in d.get('fields', [])[:5]:
    print(f"     {f['name']:30s} {f['type']:15s} {f['label']}")

# /query/table (sin filtros)
code, d = api(f"/query/table?project_id={P}&form_id={F}&top=3")
print(f"  -> {d.get('count',0)} rows, total={d.get('total',0)}, source={d.get('source','?')}")
if d.get('data'):
    s = d['data'][0]
    for k in ['nombre_comunidad', 'tipo_vivienda', 'tenencia_vivienda', 'numero_familiares', 'ingreso_mensual_usd']:
        print(f"     {k}: {s.get(k, 'N/A')}")

# /query/table con búsqueda
code, d = api(f"/query/table?project_id={P}&form_id={F}&search=valle&top=5")
print(f"  -> search='valle': {d.get('count',0)} resultados")

# /query/aggregate - group by tipo_vivienda
code, d = api(f"/query/aggregate?project_id={P}&form_id={F}&group_by=tipo_vivienda")
print(f"  -> {d.get('total_groups',0)} grupos, metric=count")
for r in d.get('data', []):
    print(f"     {r['group']:20s}: {r['count']}")

# /query/aggregate - avg de numero_familiares por tipo_vivienda
code, d = api(f"/query/aggregate?project_id={P}&form_id={F}&group_by=tipo_vivienda&metric=avg&metric_field=numero_familiares")
print(f"  -> {d.get('total_groups',0)} grupos, metric=avg(numero_familiares)")
for r in d.get('data', []):
    print(f"     {r['group']:20s}: avg={r.get('value','?')} (n={r['count']})")

# /query/aggregate - sum de ingresos por tenencia_vivienda
code, d = api(f"/query/aggregate?project_id={P}&form_id={F}&group_by=tenencia_vivienda&metric=sum&metric_field=ingreso_mensual_usd")
print(f"  -> sum(ingreso) por tenencia: {d.get('total_groups',0)} grupos")
for r in d.get('data', []):
    print(f"     {r['group']:25s}: sum=${r.get('value',0):,.2f} (n={r['count']})")

# /query/summary
code, d = api(f"/query/summary?project_id={P}&form_id={F}")
print(f"  -> {d.get('total_submissions',0)} subs, {d.get('total_fields',0)} fields")
fs = d.get('fields_summary', {})
for fname in ['tipo_vivienda', 'numero_familiares', 'ingreso_mensual_usd', 'hectareas_cultivo']:
    if fname in fs:
        s = fs[fname]
        extra = ""
        if 'avg' in s: extra = f", avg={s['avg']}, min={s.get('min','?')}, max={s.get('max','?')}"
        if 'top_values' in s: extra = f", top: {dict(s['top_values'][:3])}"
        print(f"     {fname:25s}: {s['non_null']}/{s['total']} no null, {s['unique']} unique{extra}")
