import urllib.request, json

url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/report'
req_data = json.dumps({'logical_groups': ['Vivienda', 'Produccion']}).encode()
req = urllib.request.Request(url, data=req_data, headers={'Content-Type': 'application/json'})
resp = urllib.request.urlopen(req, timeout=30)
data = json.loads(resp.read())
print('OK: Reporte multi-grupo generado')
print(f'  Submissions: {data["report"]["total_submissions"]}')
print(f'  KPIs: {len(data["report"]["kpis"])} campos')
for k in list(data['report']['kpis'].keys())[:8]:
    print(f'    - {k}')
print(f'  Word clouds: {len(data["report"]["word_cloud"])}')
print(f'  Contingency tables: {len(data["report"]["contingency_tables"])}')
print(f'  Pyramid: {"yes" if data["report"]["population_pyramid"] else "no"}')
