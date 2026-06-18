import urllib.request, json

url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'
req = json.dumps({"logical_groups": ["demographics"]}).encode()
r = urllib.request.urlopen(urllib.request.Request(url, data=req, headers={'Content-Type': 'application/json'}), timeout=30)
d = json.loads(r.read())
print(f'Submissions: {d["total_submissions"]}')
for m in d.get('modules', []):
    print(f'\nModule: {m["name"]}')
    for q in m.get('queries', []):
        data = q.get('data', {})
        err = q.get('error')
        if err:
            print(f'  ERROR: {err}')
            continue
        print(f'  [{q["chart"]}] {q["question"]}')
        print(f'    keys: {list(data.keys())[:8]}')
        if 'count' in data:
            print(f'    count={data["count"]}, avg={data.get("avg","?")}')
            if data['count'] > 0:
                print(f'    sum={data["sum"]}')
        if data.get('labels'):
            print(f'    labels: {data["labels"][:3]}')
            print(f'    values: {data["values"][:3]}')
        if data.get('groups'):
            print(f'    groups: {len(data["groups"])}')
            for g in data['groups'][:2]:
                print(f'      {g["name"]}: n={g["count"]}, min={g["min"]}, max={g["max"]}')
