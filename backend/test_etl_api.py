"""Prueba del endpoint ETL /run desde el backend en vivo."""
import urllib.request, json

# Login 
r = urllib.request.urlopen(urllib.request.Request(
    'http://localhost:8010/api/auth/login',
    data=json.dumps({"email":"danielder71@yandex.com","password":"mrgeov_bot71"}).encode(),
    headers={"Content-Type":"application/json"}
), timeout=10)
token = json.loads(r.read())["access_token"]
print(f"Token: {token[:30]}...")

# ETL run - probar con auth
try:
    body = json.dumps({"project_id": 4, "form_id": "Diagnostico_Comunitario_Integral", "force": True}).encode()
    req = urllib.request.Request(
        'http://localhost:8010/etl/run',
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        print(json.dumps(json.loads(r.read()), indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()}")
except Exception as e:
    print(f"Error: {e}")
