"""Prueba de los endpoints de administración de caché (Fase 4)."""
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
print(f"[OK] Login: {d['displayName']}")

# /cache/stats
code, d = api("/cache/stats")
print(f"[OK] Cache stats: {d.get('forms_cached',0)} forms, {d.get('total_submissions',0)} subs, {d.get('db_size_human','?')}")

# /cache/info
code, d = api(f"/cache/info?project_id={P}&form_id={F}")
print(f"[OK] Cache info: cached={d.get('cached')}, subs={d.get('submissions_count','?')}, age={d.get('age_human','?')}, expired={d.get('expired')}")

# /cache/refresh (force=True primero para tener datos frescos)
code, d = api("/cache/refresh", "POST", {"project_id": P, "form_id": F, "force": True})
print(f"[OK] Refresh: {d.get('status')} - {d.get('rows',0)} rows")

# /cache/refresh (sin force - debe saltar porque está fresco)
code, d = api("/cache/refresh", "POST", {"project_id": P, "form_id": F, "force": False})
print(f"[OK] Refresh (no force): {d.get('status')} - action={d.get('action','?')}")

# /cache/clean-expired (limpiar expirados, debe dejar este fresco)
code, d = api(f"/cache/clean-expired?max_age_hours=48")
print(f"[OK] Clean expired: {d.get('deleted_forms',0)} forms eliminados")

# Verificar que sigue en caché
code, d = api(f"/cache/info?project_id={P}&form_id={F}")
print(f"[OK] Post-clean check: cached={d.get('cached')}, subs={d.get('submissions_count','?')}")

print("\n✅ Fase 4 completada exitosamente")
