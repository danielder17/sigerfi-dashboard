import urllib.request, json

# Check what the report endpoint receives
url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'
req_data = json.dumps({"logical_groups": ["demographics"], "expand_repeat": None}).encode()
r = urllib.request.urlopen(urllib.request.Request(url, data=req_data, headers={'Content-Type': 'application/json'}), timeout=15)
d = json.loads(r.read())

for m in d['modules']:
    print(f'Module: {m["name"]}')
    for q in m.get('queries', []):
        data = q.get('data') or {}
        if q.get('error'):
            print(f'  ERROR: {q["error"]}')
            continue
        print(f'  {q["question"]}')
        print(f'    data keys: {list(data.keys())}')
        if data.get('count') is not None:
            print(f'    count={data["count"]}')
