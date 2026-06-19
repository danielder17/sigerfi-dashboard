import urllib.request, json

# Primero login
url = 'http://localhost:8010/api/auth/login'
body = json.dumps({"email":"danielder71@yandex.com","password":"mrgeov_bot71"}).encode()
r = urllib.request.urlopen(urllib.request.Request(url, data=body, headers={'Content-Type':'application/json'}), timeout=10)
d = json.loads(r.read())
token = d['access_token']
print(f'Token: {token[:50]}...')

# Verificar token
r2 = urllib.request.urlopen(urllib.request.Request('http://localhost:8010/api/auth/verify', headers={'Authorization': f'Bearer {token}'}), timeout=10)
d2 = json.loads(r2.read())
print(f'Verify: {json.dumps(d2, indent=2)}')

# También probar con el admin
url2 = 'http://localhost:8010/api/auth/login'
body2 = json.dumps({"email":"danielder@gmail.com","password":"Der22050303"}).encode()
r3 = urllib.request.urlopen(urllib.request.Request(url2, data=body2, headers={'Content-Type':'application/json'}), timeout=10)
d3 = json.loads(r3.read())
print(f'\nAdmin login: {d3["displayName"]} - is_admin: {d3["is_admin"]}')
