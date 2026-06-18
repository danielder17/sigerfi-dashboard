import sys
sys.path.insert(0, '.')
from odk_client import ODKClient
from services.report_engine import parse_xml_schema
from services.analysis_modules import detect_active_modules, groups_to_modules

c = ODKClient()
c.login('danielder71@yandex.com', 'mrgeov_bot71')

# Probar con Diagnostico_Comunitario_Integral
pid = 4
fid = 'Diagnostico_Comunitario_Integral'
xml = c.get_form_xml(pid, fid)
f = parse_xml_schema(xml)
subs = c.get_all_submissions(pid, fid)
print(f'Campos ({len(f)}):')
for ff in f:
    print(f'  {ff["name"]:30s} type={ff["type"]:15s} label={ff.get("label","?")[:30]}')
print()

m = detect_active_modules(f, subs)
print(f'Modulos activos: {len(m)}')
for mm in m:
    print(f'  [{mm["module_id"]}] {mm["name"]} ({mm["active_queries_count"]}/{mm["total_queries"]} queries, status={mm["status"]}, auto={mm.get("auto_detect", False)})')
    for q in mm['queries'][:4]:
        print(f'    - {q["question"][:55]}')
        print(f'      fields: {q.get("resolved_fields", [])}')

c.close()
