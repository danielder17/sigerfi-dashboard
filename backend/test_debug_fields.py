import urllib.request, json

url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'
req_data = json.dumps({"logical_groups": ["demographics"], "expand_repeat": "integrantes"}).encode()
r = urllib.request.urlopen(urllib.request.Request(url, data=req_data, headers={'Content-Type': 'application/json'}), timeout=15)
d = json.loads(r.read())

# Debug: ver submissions expandidas
# Llamada directa a la API para ver campos
url_sub = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/submissions?project_id=4&$top=1'
r_sub = urllib.request.urlopen(url_sub, timeout=10)
sub = json.loads(r_sub.read())
if isinstance(sub, list) and len(sub) > 0:
    s = sub[0]
    print("Campos en submission:")
    for k, v in sorted(s.items()):
        if not k.startswith('_'):
            print(f"  {k}: {str(v)[:80]}")
