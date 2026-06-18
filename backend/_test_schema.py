"""Test: llamar a get_form_schema y contar preguntas"""
import sys, json, re
sys.path.insert(0, r"C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend")
from odk_client import ODKClient
from config import ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD

client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
client.login()

xml = client.get_form_schema(4, "Diagnostico_Comunitario_Integral")
if xml:
    inputs = re.findall(r'(?:input|select1|select|range)\s+ref="/([^"]+)"', xml)
    print(f"Preguntas: {len(inputs)}")
    if len(inputs) == 0:
        print("Primeros 500 chars del XML:")
        print(xml[:500])
else:
    print("XML es None")
client.close()
