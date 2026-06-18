import sys, json, urllib.request, ssl

sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')

# Usar el client del backend (con credenciales del .env)
from dotenv import load_dotenv
load_dotenv(r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend\.env')

from config import ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD
from odk_client import ODKClient

client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
subs = client.get_all_submissions(4, 'Diagnostico_Comunitario_Integral', expand='*')
print(f'Submissions: {len(subs)}')
if subs:
    s = subs[0]
    print(f'\nKeys con datos de integrantes:')
    for k in sorted(s.keys()):
        v = s[k]
        if isinstance(v, list):
            print(f'  {k}: LIST[{len(v)}]')
            if v and isinstance(v[0], dict):
                print(f'    keys: {list(v[0].keys())}')
                for ik, iv in v[0].items():
                    print(f'      {ik}: {iv}')
        elif k in ('int_edad', 'int_genero', 'numero_familiares'):
            print(f'  {k}: {v}')
        elif 'integrantes' in k.lower():
            print(f'  {k}: {type(v).__name__}')

client.close()
