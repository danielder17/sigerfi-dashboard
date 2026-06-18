import urllib.request, json, ssl
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

r = urllib.request.urlopen('http://localhost:8010/api/projects', context=ctx, timeout=10)
data = json.loads(r.read())
print(f'OK: {len(data["projects"])} proyectos')
for p in data['projects']:
    name = p.get("name", "?")
    # replace non-ASCII
    clean = name.encode('ascii', 'replace').decode()
    print(f'  [{p["id"]}] {clean}')
