import urllib.request, json

url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'
req = json.dumps({"logical_groups": ["demographics"]}).encode()
try:
    r = urllib.request.urlopen(urllib.request.Request(url, data=req, headers={'Content-Type': 'application/json'}), timeout=30)
except urllib.error.HTTPError as e:
    print(f'Status: {e.code}')
    print(f'Body: {e.read().decode()[:500]}')
