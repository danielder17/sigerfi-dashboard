import urllib.request, json

# Test with explicit expand_repeat
url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'
req_data = json.dumps({"logical_groups": ["demographics"], "expand_repeat": "integrantes"}).encode()

r = urllib.request.urlopen(urllib.request.Request(url, data=req_data, headers={'Content-Type': 'application/json'}), timeout=15)
d = json.loads(r.read())

print(f'Total submissions: {d["total_submissions"]}')
for m in d['modules']:
    print(f'\nModule: {m["name"]}')
    for q in m.get('queries', []):
        e = q.get('error')
        if e:
            print(f'  ERROR {q["query_id"]}: {e}')
            continue
        data = q.get('data', {})
        if data is None:
            print(f'  {q["question"]}: NO DATA')
            continue
        print(f'\n  {q["question"]} (type={q["type"]}, chart={q["chart"]})')
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list):
                    print(f'    {k}: {v[:8]}...')
                elif isinstance(v, dict):
                    print(f'    {k}: {str(list(v.keys())[:3])}...')
                else:
                    print(f'    {k}: {v}')
