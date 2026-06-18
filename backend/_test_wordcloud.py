"""Test word cloud"""
import urllib.request, json

payload = json.dumps({
    "metrics": ["numero_familiares", "ingreso_mensual_usd"],
    "dimensions": ["tipo_vivienda"],
    "temporal_field": "fecha_encuesta",
}).encode()

req = urllib.request.Request(
    "http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/report",
    data=payload,
    headers={"Content-Type": "application/json"},
)

d = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
wc = d.get("report", {}).get("word_cloud", {})
print("Word cloud fields:", list(wc.keys()))
for k, v in wc.items():
    top5 = [w["word"] for w in v[:5]]
    print(f"  {k}: {len(v)} words  top5={top5}")
