"""Prueba de endpoints admin con usuario admin."""
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

BASE = "http://localhost:8010"

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

# Login con bot (no admin)
_, d = api("/api/auth/login", "POST", {"email": "danielder71@yandex.com", "password": "mrgeov_bot71"})
print(f"[BOT] {d['displayName']}, is_admin={d.get('is_admin')}")

# Intentar cache/refresh sin admin
code, d2 = api("/cache/refresh", "POST", {"project_id": 4, "form_id": "Diagnostico_Comunitario_Integral", "force": True}, token=d["access_token"])
print(f"[BOT] cache/refresh: {code} - {d2.get('detail', 'OK')}")

# Login con admin
_, d = api("/api/auth/login", "POST", {"email": "danielder@gmail.com", "password": "Der22050303"})
print(f"\n[ADMIN] {d['displayName']}, is_admin={d.get('is_admin')}")

# cache/stats
code, d2 = api("/cache/stats", token=d["access_token"])
print(f"[ADMIN] cache/stats: {code} - {json.dumps(d2, indent=2)}")

# cache/info
code, d2 = api("/cache/info?project_id=4&form_id=Diagnostico_Comunitario_Integral", token=d["access_token"])
print(f"\n[ADMIN] cache/info: {code}")
for k, v in d2.items():
    print(f"  {k}: {v}")

# cache/refresh (admin)
code, d2 = api("/cache/refresh", "POST", {"project_id": 4, "form_id": "Diagnostico_Comunitario_Integral", "force": True}, token=d["access_token"])
print(f"\n[ADMIN] cache/refresh: {code} - {d2.get('status')} - {d2.get('rows',0)} rows")
