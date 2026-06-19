"""Decodificar el JWT del bot para ver su payload."""
import urllib.request, json, base64, json

BASE = "http://localhost:8010"

r = urllib.request.urlopen(urllib.request.Request(f"{BASE}/api/auth/login",
    data=json.dumps({"email":"danielder71@yandex.com","password":"mrgeov_bot71"}).encode(),
    headers={"Content-Type":"application/json"}), timeout=10)
d = json.loads(r.read())
token = d["access_token"]

# Decodificar payload (parte media del JWT)
parts = token.split(".")
payload_b64 = parts[1]
padding = 4 - len(payload_b64) % 4
if padding != 4:
    payload_b64 += "=" * padding
payload = json.loads(base64.urlsafe_b64decode(payload_b64))
print(f"JWT payload: {json.dumps(payload, indent=2)}")
print(f"\nis_admin: {payload.get('is_admin')}")
