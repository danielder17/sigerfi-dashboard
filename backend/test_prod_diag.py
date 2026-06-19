"""Diagnóstico de endpoints en producción."""
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
        with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Login bot
s, d = api("POST", "/api/auth/login", {"email": "danielder71@yandex.com", "password": "mrgeov_bot71"})
token = d["access_token"]
print(f"[LOGIN] {d['displayName']}, is_admin={d.get('is_admin')}")

# /api/stats - crudo
print("\n=== /api/stats (raw) ===")
s, d2 = api("GET", "/api/stats", token=token)
print(f"Status: {s}")
if s == 200:
    for k, v in d2.items():
        print(f"  {k}: {v}")
else:
    print(f"  Error: {d2[:300]}")

# /api/projects - crudo
print("\n=== /api/projects (raw) ===")
s, d3 = api("GET", "/api/projects", token=token)
print(f"Status: {s}")
if s == 200:
    print(f"Tipo: {type(d3).__name__}")
    if isinstance(d3, list):
        print(f"Items: {len(d3)}")
        for i, item in enumerate(d3[:5]):
            print(f"  [{i}] tipo={type(item).__name__}: {json.dumps(item)[:200]}")
    else:
        print(f"Contenido: {json.dumps(d3)[:300]}")
else:
    print(f"Error: {d3[:300]}")

# /api/projects - sin token (debería ser lo mismo)
print("\n=== /api/projects (sin token) ===")
s, d4 = api("GET", "/api/projects")
print(f"Status: {s}")
if isinstance(d4, str):
    print(f"Body: {d4[:300]}")
else:
    print(f"Tipo: {type(d4).__name__}, items: {len(d4) if isinstance(d4, list) else 'N/A'}")
