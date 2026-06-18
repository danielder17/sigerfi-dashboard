import urllib.request, json

url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/analysis-modules?project_id=4'
r = urllib.request.urlopen(url, timeout=10)
d = json.loads(r.read())
print(f'Modulos activos: {len(d["modules"])}')
for m in d['modules']:
    print(f'  [{m["module_id"]}] {m["name"]} ({m["active_queries_count"]}/{m["total_queries"]} queries, status={m["status"]})')
    for q in m['queries'][:4]:
        print(f'    - {q["question"][:55]}')
        if q.get('resolved_fields'):
            print(f'      fields: {q["resolved_fields"]}')
print(f'\nTemplates disponibles: {len(d["all_templates"])}')
for t in d['all_templates']:
    print(f'  - {t["id"]}: {t["name"]} ({len(t["queries"])} queries)')
