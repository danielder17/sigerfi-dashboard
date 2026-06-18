import sys, json, urllib.request

sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')

url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'
req = json.dumps({"logical_groups": ["demographics"]}).encode()

try:
    r = urllib.request.urlopen(urllib.request.Request(url, data=req, headers={'Content-Type': 'application/json'}), timeout=30)
    d = json.loads(r.read())
    
    print(f'Submissions: {d["total_submissions"]}')
    for m in d.get('modules', []):
        print(f'\nModule: {m["name"]}')
        for q in m.get('queries', []):
            err = q.get('error')
            data = q.get('data', {})
            if err:
                print(f'  ERROR: {err}')
                continue
            print(f'  [{q["chart"]}] {q["question"]}')
            print(f'    keys: {list(data.keys())[:8]}')
            if 'count' in data:
                print(f'    count={data["count"]}')
                if data['count'] > 0:
                    print(f'    sum={data["sum"]}, avg={data["avg"]}')
            if data.get('labels'):
                print(f'    labels: {data["labels"][:5]}')
                print(f'    values: {data["values"][:5]}')
            if data.get('groups'):
                print(f'    groups: {len(data["groups"])}')
                for g in data['groups'][:2]:
                    print(f'      {g["name"]}: n={g["count"]}, min={g["min"]}, max={g["max"]}')
except Exception as e:
    print(f'ERROR: {e}')
