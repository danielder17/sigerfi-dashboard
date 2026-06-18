import sys, json, urllib.request, urllib.parse

sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')

# Probar OData expand directamente
url_base = 'https://odk-rfi.duckdns.org'
token = '14 12887302889785272031'  # bot token
pid = 4
fid = 'Diagnostico_Comunitario_Integral'

# Primero obtener un submission para ver el navigationLink
path = f'/v1/projects/{pid}/forms/{fid}.svc/Submissions?$top=1'
url = url_base + path
headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
req = urllib.request.Request(url, headers=headers, method='GET')
ctx = urllib.request.ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = urllib.request.ssl.CERT_NONE
resp = urllib.request.urlopen(req, context=ctx, timeout=30)
data = json.loads(resp.read().decode())

value = data.get('value', [])
if value:
    item = value[0]
    print("Keys en OData:")
    for k in sorted(item.keys()):
        print(f"  {k}")
    
    # Buscar navigationLinks
    for k in item:
        if 'navigationLink' in k.lower() or 'NavigationLink' in k or 'odata' in k.lower():
            print(f"\nNavigationLink found: {k}")
            print(f"  value: {item[k]}")

    # Probar expand con diferentes sintaxis
    for expand_val in ['integrantes@odata.navigationLink', 'integrantes', 'Integrantes@odata.navigationLink']:
        try:
            path2 = f'/v1/projects/{pid}/forms/{fid}.svc/Submissions?$top=1&$expand={urllib.parse.quote(expand_val)}'
            url2 = url_base + path2
            req2 = urllib.request.Request(url2, headers=headers, method='GET')
            resp2 = urllib.request.urlopen(req2, context=ctx, timeout=30)
            data2 = json.loads(resp2.read().decode())
            vals2 = data2.get('value', [])
            print(f"\nexpand='{expand_val}':")
            if vals2:
                for k in sorted(vals2[0].keys()):
                    v = vals2[0][k]
                    if isinstance(v, list) and v:
                        print(f"  {k}: LIST[{len(v)}] first={str(v[0])[:80]}")
                    elif isinstance(v, dict) and v:
                        print(f"  {k}: DICT keys={list(v.keys())[:5]}")
                    elif str(v).startswith('uuid:'):
                        pass  # omit IDs
        except Exception as e:
            print(f"\nexpand='{expand_val}': ERROR: {str(e)[:100]}")
