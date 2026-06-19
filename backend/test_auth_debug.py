"""Debug: ver exactamente qué devuelve cache/refresh con token de bot."""
import urllib.request, json

BASE = "http://localhost:8010"

# Login bot
r = urllib.request.urlopen(urllib.request.Request(f"{BASE}/api/auth/login",
    data=json.dumps({"email":"danielder71@yandex.com","password":"mrgeov_bot71"}).encode(),
    headers={"Content-Type":"application/json"}), timeout=10)
d = json.loads(r.read())
bot_token = d["access_token"]

# Header exacto que estamos enviando
auth_header = f"Bearer {bot_token}"
print(f"Auth header: {auth_header[:50]}...")

# Llamada con urllib verbose
req = urllib.request.Request(f"{BASE}/cache/refresh",
    data=json.dumps({"project_id": 4, "form_id": "Diagnostico_Comunitario_Integral", "force": True}).encode(),
    headers={"Content-Type": "application/json", "Authorization": auth_header})

try:
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read().decode()
        print(f"Status: {r.status}")
        print(f"Response: {body[:200]}")
except urllib.error.HTTPError as e:
    print(f"Status: {e.code}")
    print(f"Response: {e.read().decode()[:300]}")

# Ahora probar sin token (debe dar 401)
print("\n--- Sin token ---")
req2 = urllib.request.Request(f"{BASE}/cache/refresh",
    data=json.dumps({"project_id": 4, "form_id": "Diagnostico_Comunitario_Integral", "force": True}).encode(),
    headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req2, timeout=10) as r:
        print(f"Status: {r.status} (DEBERIA SER 401!)")
except urllib.error.HTTPError as e:
    print(f"Status: {e.code}")
    print(f"Response: {e.read().decode()[:300]}")
