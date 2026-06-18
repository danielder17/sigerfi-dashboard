import urllib.request, json

url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/schema?project_id=4'
r = urllib.request.urlopen(url, timeout=10)
d = json.loads(r.read())

for f in d['fields']:
    if f['name'] in ('int_edad', 'int_genero', 'numero_familiares', 'integrantes') or f.get('is_repeat'):
        print(f"  {f['name']:25s} type={f['type']:12s} repeat={f.get('is_repeat',False)} parent={f.get('repeat_parent','n/a')}")

# Also check all repeat fields
print("\nAll repeats:")
for f in d['fields']:
    if f.get('is_repeat'):
        print(f"  {f['name']}: children={f.get('children', [])}")
