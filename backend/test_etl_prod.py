"""Probar ETL en producción."""
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "https://sigerfi-api.onrender.com"

def api(method, path, body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Login bot
s, d = api("POST", "/api/auth/login", {"email": "danielder71@yandex.com", "password": "mrgeov_bot71"})
token = d["access_token"]
print(f"Login: {d['displayName']}, admin={d.get('is_admin')}")

# Ver projects y forms disponibles
s, projs = api("GET", "/api/projects", token=token)
if s == 200:
    projects = projs.get("projects", [])
    print(f"\nProyectos disponibles:")
    for p in projects:
        pid = p["id"]
        s2, forms = api("GET", f"/api/projects/{pid}/forms", token=token)
        if s2 == 200:
            flist = forms.get("forms", [])
            print(f"  [{pid}] {p['name']} - {len(flist)} formularios:")
            for f in flist:
                print(f"    - {f.get('xmlFormId')}: {f.get('name')}")
        else:
            print(f"  [{pid}] {p['name']} - error al obtener forms: {s2}")

# Ahora probar ETL run
print("\n=== Ejecutando ETL... ===")
s, result = api("POST", "/etl/run",
    {"project_id": 4, "form_id": "Diagnostico_Comunitario_Integral", "force": True},
    token=token)
print(f"Status: {s}")
if s == 200:
    print(f"OK: {json.dumps(result, indent=2)}")
else:
    print(f"ERROR: {result[:500]}")
