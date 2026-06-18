import urllib.request, json

# Test module report
url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/module-report'
req_data = json.dumps({"logical_groups": ["demographics"], "expand_repeat": None}).encode()

r = urllib.request.urlopen(urllib.request.Request(url, data=req_data, headers={'Content-Type': 'application/json'}), timeout=15)
d = json.loads(r.read())

print(f'Total submissions: {d["total_submissions"]}')
print(f'Modules: {len(d["modules"])}')
for m in d['modules']:
    print(f'\nModule: {m["name"]} (status={m.get("status","?")})')
    for q in m.get('queries', []):
        e = q.get('error')
        if e:
            print(f'  ERROR {q["query_id"]}: {e}')
            continue
        data = q.get('data', {})
        if data is None:
            print(f'  {q["question"]}: NO DATA')
            continue
        print(f'  {q["question"]} ({q["chart"]})')
        if isinstance(data, dict):
            if 'value' in data:
                print(f'    value={data["value"]}')
            if 'labels' in data and 'values' in data:
                print(f'    labels={data["labels"][:5]}...')
                print(f'    values={data["values"][:5]}...')
            if 'yes_pct' in data:
                print(f'    yes_pct={data["yes_pct"]}%, no_pct={data["no_pct"]}%')
            if 'groups' in data:
                print(f'    groups={len(data["groups"])}')
            if 'series' in data:
                print(f'    series keys={list(data["series"].keys())}')
