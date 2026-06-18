import sys, json, urllib.request

sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')
from services.report_engine import parse_xml_schema

r = urllib.request.urlopen('http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/schema?project_id=4')
d = json.loads(r.read())

for f in d['fields']:
    if f.get('is_repeat') or f.get('children'):
        print(f["name"] + ': children=' + str(f.get('children',[])))
    elif f['name'] in ('int_edad', 'int_genero'):
        print(f["name"] + ': parent=' + str(f.get('repeat_parent','')))
