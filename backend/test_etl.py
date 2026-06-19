"""Prueba del ETL service con datos reales de ODK Central."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services.etl_service import run_etl, get_homologated_submissions, get_homologated_repeats, list_cached_forms

# Token de ODK Central para el bot
TOKEN = None

# Primero obtener token via login
import urllib.request, ssl, json
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

body = json.dumps({"email": "danielder71@yandex.com", "password": "mrgeov_bot71"}).encode()
req = urllib.request.Request(
    "https://odk-rfi.duckdns.org/v1/sessions",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST"
)
with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
    resp = json.loads(r.read().decode())
    TOKEN = resp["token"]

print(f"Token ODK obtenido: {TOKEN[:20]}...")

# Ejecutar ETL para proyecto 4 / formulario Diagnóstico Comunitario
result = run_etl(
    project_id=4,
    form_id="Diagnostico_Comunitario_Integral",
    force=True,
    odk_url="https://odk-rfi.duckdns.org",
    odk_token=TOKEN
)

print(f"\n--- ETL Result ---")
print(json.dumps(result, indent=2))

# Consultar datos homologados
subs, fields = get_homologated_submissions(4, "Diagnostico_Comunitario_Integral")
print(f"\n--- Submissions homologadas: {len(subs)} ---")
for s in subs[:3]:
    # Mostrar solo campos clave
    preview = {k: v for k, v in s.items() if not k.startswith("__") and not k.endswith("@raw")}
    print(json.dumps(preview, indent=2, ensure_ascii=False))

# Repeats
repeats = get_homologated_repeats(4, "Diagnostico_Comunitario_Integral", "integrantes")
print(f"\n--- Repeats 'integrantes': {len(repeats)} registros ---")
for r in repeats[:5]:
    print(json.dumps(r, indent=2, ensure_ascii=False))

# Formularios en cache
print(f"\n--- Formularios cacheados ---")
for f in list_cached_forms():
    print(f"  [{f['project_id']}] {f['form_name']} ({f['form_id']}) - {f['updated_at']}")
