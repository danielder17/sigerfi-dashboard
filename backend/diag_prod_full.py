"""Diagnóstico completo del flujo en producción."""
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "https://sigerfi-api.onrender.com"

def api(method, path, body=None, token=None):
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body

# 1. Login como bot (no admin)
s, d = api("POST", "/api/auth/login", {"email": "danielder71@yandex.com", "password": "mrgeov_bot71"})
token = d["access_token"]
print(f"Login: {d.get('displayName')}, is_admin={d.get('is_admin')}")
print()

# 2. Probar verify para ver si devuelve is_admin correctamente
s, v = api("GET", "/api/auth/verify", token=token)
print(f"Verify: {s} -> is_admin={v.get('is_admin')}, user={v.get('user', {}).get('displayName')}")
print()

# 3. Obtener proyectos
s, projs = api("GET", "/api/projects", token=token)
projects = projs.get("projects", [])
print(f"Proyectos ({len(projects)}):")
for p in projects:
    print(f"  [{p['id']}] {p.get('name')}")
print()

# 4. Probar forms de cada proyecto
for p in projects:
    pid = p["id"]
    s, forms = api("GET", f"/api/projects/{pid}/forms", token=token)
    if s != 200:
        print(f"  [{pid}] Forms ERROR {s}: {forms}")
    else:
        flist = forms.get("forms", [])
        print(f"  [{pid}] {p.get('name')}: {len(flist)} forms")
        for f in flist:
            print(f"    - {f.get('xmlFormId')}: {f.get('name', 'sin nombre')}")
            # Intentar obtener submissions
            form_id = f.get("xmlFormId")
            s2, subs = api("GET", f"/api/forms/{form_id}/all?project_id={pid}", token=token)
            if s2 == 200:
                submissions = subs.get("submissions", subs if isinstance(subs, list) else [])
                scount = len(submissions) if isinstance(submissions, list) else submissions.get("count", 0)
                print(f"      Submissions: {scount}")
            else:
                print(f"      Submissions ERROR {s2}: {str(subs)[:200]}")

print()
# 5. Probar cache actual
s, cached = api("GET", "/etl/cached")
if s == 200:
    print(f"Cache ETL: {len(cached.get('forms',[]))} forms")
    for f in cached.get("forms",[]):
        print(f"  [{f['project_id']}] {f['form_name']} - {f['updated_at']}")
else:
    print(f"Cache ETL error: {s}")
