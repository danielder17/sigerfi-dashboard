import urllib.request, json

url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'

# Probar módulo coverage
for groups in [["coverage"], ["demographics"], ["coverage", "demographics"]]:
    req = json.dumps({"logical_groups": groups}).encode()
    r = urllib.request.urlopen(urllib.request.Request(url, data=req, headers={'Content-Type': 'application/json'}), timeout=15)
    d = json.loads(r.read())
    print(f'\n{"="*50}')
    print(f'Módulos: {groups}')
    print(f'Submissions: {d["total_submissions"]}')
    for m in d.get('modules', []):
        print(f'\n  {m["name"]}')
        for q in m.get('queries', []):
            data = q.get('data', {})
            if q.get('error'):
                print(f'    ERROR: {q["error"]}')
            elif data:
                if 'count' in data:
                    print(f'    {q["question"]}: count={data["count"]}')
                if data.get('labels'):
                    print(f'    {q["question"]}: {len(data["labels"])} categorías, labels={data["labels"][:3]}')
                if data.get('groups'):
                    print(f'    {q["question"]}: {len(data["groups"])} grupos')
                if 'value' in data:
                    print(f'    {q["question"]}: value={data["value"]}')
            else:
                print(f'    {q["question"]}: NO DATA')
