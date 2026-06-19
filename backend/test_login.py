import urllib.request, json

url = 'http://localhost:8010/api/auth/login'
body = json.dumps({"email":"danielder71@yandex.com","password":"mrgeov_bot71"}).encode()
r = urllib.request.urlopen(urllib.request.Request(url, data=body, headers={'Content-Type':'application/json'}), timeout=10)
d = json.loads(r.read())
print(json.dumps(d, indent=2))
