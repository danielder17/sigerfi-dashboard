import sys, json, urllib.request

sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')

# Hacer POST al endpoint module-report y ver todos los datos
url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'
req = json.dumps({"logical_groups": ["demographics"]}).encode()
r = urllib.request.urlopen(urllib.request.Request(url, data=req, headers={'Content-Type': 'application/json'}), timeout=15)
d = json.loads(r.read())

print('Form:', d['form_name'])
print('Submissions:', d['total_submissions'])
print()

for m in d.get('modules', []):
    print(f'Module: {m["name"]}')
    for q in m.get('queries', []):
        err = q.get('error')
        if err:
            print(f'  ERROR: {err}')
            continue
        data = q.get('data', {})
        print(f'  [{q["chart"]}] {q["question"]}')
        if data:
            print(f'    keys: {list(data.keys())[:8]}')
        if 'count' in data:
            print(f'    count={data["count"]}')
        if 'labels' in data and data['labels']:
            print(f'    top labels: {data["labels"][:5]}')
        if 'values' in data and data['values']:
            print(f'    values: {data["values"][:5]}')
        if 'groups' in data and data['groups']:
            print(f'    groups: {len(data["groups"])}')
            for g in data['groups'][:2]:
                print(f'      {g["name"]}: count={g["count"]}, min={g["min"]}, max={g["max"]}')
    print()
