"""Test rapido del cliente ODK."""
import sys
sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')
from odk_client import ODKClient
from config import ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD

client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
token = client.login()
print(f'TOKEN OK: {token[:20]}...')

proys = client.get_projects()
print(f'Proyectos: {len(proys)}')
for p in proys:
    print(f'  [{p["id"]}] {p.get("name", "?")}')
client.close()
