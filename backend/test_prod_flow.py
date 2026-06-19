"""Verificación del flujo completo en producción."""
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
    with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
        return r.status, json.loads(r.read().decode())

# 1. Login admin
s, d = api("POST", "/api/auth/login", {"email": "danielder71@yandex.com", "password": "mrgeov_bot71"})
token = d["access_token"]
print(f"[LOGIN] {d['displayName']}, is_admin={d.get('is_admin')}")

# 2. Stats
s, d2 = api("GET", "/api/stats", token=token)
print(f"\n[STATS] proyectos={d2.get('total_proyectos')}, forms={d2.get('total_formularios')}, subs={d2.get('total_submissions')}")

# 3. Proyectos
s, d3 = api("GET", "/api/projects", token=token)
print(f"\n[PROYECTOS] {len(d3)}:")
for p in d3:
    print(f"  - {p.get('name')} (id={p.get('id')})")

# 4. Forms del primer proyecto
if d3:
    pid = d3[0]["id"]
    s, d4 = api("GET", f"/api/projects/{pid}/forms", token=token)
    print(f"\n[FORMS proyecto {pid}] {len(d4)}:")
    for f in d4:
        print(f"  - {f.get('name')} (xmlFormId={f.get('xmlFormId')})")
