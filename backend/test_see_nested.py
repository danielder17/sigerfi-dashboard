import sys, json, urllib.request

sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')

# Obtener submissions via endpoint API
r = urllib.request.urlopen('http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/submissions?project_id=4')
d = json.loads(r.read())

# Mostrar estructura completa de 1 submission
subs = d.get('submissions', d.get('data', []))
print(f'Submissions: {len(subs)}')
s = subs[0]
print(f'\nKeys con repeats:')
for k in sorted(s.keys()):
    v = s[k]
    if isinstance(v, list):
        print(f'  {k}: LIST[{len(v)}]')
        if v and isinstance(v[0], dict):
            print(f'    items[0] keys: {list(v[0].keys())}')
            for ik, iv in v[0].items():
                print(f'      {ik}: {iv}')
    elif 'navigation' in str(k).lower() or 'odata' in str(k).lower() or 'deferred' in str(k).lower():
        print(f'  {k}: {str(v)[:100]}')
