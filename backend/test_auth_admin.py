"""Test: bot no-admin intenta llamar cache/refresh - debe dar 403."""
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "http://localhost:8010"

# Login bot
r = urllib.request.urlopen(urllib.request.Request(f"{BASE}/api/auth/login",
    data=json.dumps({"email":"danielder71@yandex.com","password":"mrgeov_bot71"}).encode(),
    headers={"Content-Type":"application/json"}), timeout=10)
d = json.loads(r.read())
bot_token = d["access_token"]
print(f"[BOT] is_admin={d.get('is_admin')}")

# Bot intenta refresh
try:
    r2 = urllib.request.urlopen(urllib.request.Request(f"{BASE}/cache/refresh",
        data=json.dumps({"project_id":4,"form_id":"Diagnostico_Comunitario_Integral","force":True}).encode(),
        headers={"Content-Type":"application/json","Authorization":f"Bearer {bot_token}"}), timeout=10)
    print(f"[BOT] cache/refresh: {r2.status} - OK (DEBERIA SER 403!)")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"[BOT] cache/refresh: {e.code} - {body}")
    if e.code == 403:
        print("  ✅ Admin protection works!")
    else:
        print(f"  ⚠️  Unexpected status {e.code}")
