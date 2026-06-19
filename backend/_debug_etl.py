"""Debug: extraer schema XML directamente."""
import urllib.request, ssl, json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Token
body = json.dumps({"email": "danielder71@yandex.com", "password": "mrgeov_bot71"}).encode()
req = urllib.request.Request(
    "https://odk-rfi.duckdns.org/v1/sessions",
    data=body,
    headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
    TOKEN = json.loads(r.read().decode())["token"]

print(f"Token: {TOKEN[:20]}...")

# Info del formulario
url = "https://odk-rfi.duckdns.org/v1/projects/4/forms/Diagnostico_Comunitario_Integral"
print(f"\nGET {url}")
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
try:
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        data = r.read()
        print(f"Status: {r.status}, Size: {len(data)} bytes")
        print(f"Content-Type: {r.headers.get('Content-Type')}")
        print(f"First 200 chars: {data[:200]}")
except Exception as e:
    print(f"Error: {e}")

# XML
xml_url = "https://odk-rfi.duckdns.org/v1/projects/4/forms/Diagnostico_Comunitario_Integral.xml"
print(f"\nGET {xml_url}")
req = urllib.request.Request(xml_url, headers={"Authorization": f"Bearer {TOKEN}"})
try:
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        data = r.read()
        print(f"Status: {r.status}, Size: {len(data)} bytes")
        print(f"Content-Type: {r.headers.get('Content-Type')}")
        text = data.decode()
        print(f"First 300 chars: {text[:300]}")
except Exception as e:
    print(f"Error: {e}")
    print(f"Body: {e.read() if hasattr(e, 'read') else 'N/A'}")

# Submissions via OData
odata_url = "https://odk-rfi.duckdns.org/v1/projects/4/forms/Diagnostico_Comunitario_Integral.svc/Submissions?$expand=*&$top=1"
print(f"\nGET {odata_url}")
req = urllib.request.Request(odata_url, headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"})
try:
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        data = json.loads(r.read().decode())
        print(f"Status: {r.status}")
        print(f"Keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")
        if isinstance(data, dict):
            vals = data.get("value", [])
            print(f"Submissions: {len(vals)}")
            if vals:
                print(f"Keys of first sub: {list(vals[0].keys())}")
except Exception as e:
    print(f"Error: {e}")
