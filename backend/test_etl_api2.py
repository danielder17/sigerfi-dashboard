"""Prueba de todos los endpoints ETL."""
import urllib.request, json

TOKEN = None
BASE = "http://localhost:8010"

def api(path, method="GET", body=None):
    h = {"Content-Type": "application/json"}
    if TOKEN:
        h["Authorization"] = f"Bearer {TOKEN}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

# Login primero
_, d = api("/api/auth/login", "POST", {"email": "danielder71@yandex.com", "password": "mrgeov_bot71"})
TOKEN = d["access_token"]
print(f"✅ Login OK: {d['displayName']}")

# ETL Run
code, d = api("/etl/run", "POST", {"project_id": 4, "form_id": "Diagnostico_Comunitario_Integral", "force": True})
print(f"{'✅' if code==200 else '❌'} ETL Run: {code} - rows={d.get('rows','?')}, fields={d.get('fields','?')}")

# ETL Cached
code, d = api("/etl/cached")
print(f"{'✅' if code==200 else '❌'} ETL Cached: {code} - {len(d.get('forms',[]))} forms")

# ETL Status
code, d = api("/etl/status")
print(f"{'✅' if code==200 else '❌'} ETL Status: {code} - {len(d)} entries")

# ETL Data
code, d = api(f"/etl/data?project_id=4&form_id=Diagnostico_Comunitario_Integral")
print(f"{'✅' if code==200 else '❌'} ETL Data: {code} - {d.get('count',0)} subs, {len(d.get('fields',[]))} fields")

if d.get('submissions'):
    s = d['submissions'][0]
    show = {k: v for k, v in s.items() if not k.startswith('__') and not k.endswith('@raw')}
    print(f"  Sample: {json.dumps(dict(list(show.items())[:5]), indent=2, ensure_ascii=False)}")

# ETL Repeats
code, d = api(f"/etl/repeats?project_id=4&form_id=Diagnostico_Comunitario_Integral&repeat_name=integrantes")
print(f"{'✅' if code==200 else '❌'} ETL Repeats: {code} - {d.get('count',0)} registros")
if d.get('repeats'):
    print(f"  Sample: {json.dumps(d['repeats'][0], indent=2, ensure_ascii=False)}")

# Submissions desde /forms - debe leer del cache ahora
code, d = api(f"/api/forms/Diagnostico_Comunitario_Integral/submissions?project_id=4&top=10&skip=0")
print(f"{'✅' if code==200 else '❌'} Forms/submissions (from cache): {code} - {d.get('count',0)} items, source={d.get('source','?')}")

# All submissions
code, d = api(f"/api/forms/Diagnostico_Comunitario_Integral/all?project_id=4")
print(f"{'✅' if code==200 else '❌'} Forms/all (from cache): {code} - {d.get('count',0)} items, source={d.get('source','?')}")
