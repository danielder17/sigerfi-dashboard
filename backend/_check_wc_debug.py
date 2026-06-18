import json, sys, subprocess

body = '{"metrics":["ingreso_mensual_usd","numero_familiares"],"dimensions":["tipo_vivienda"],"geopoint_field":"ubicacion"}'

result = subprocess.run([
    "curl.exe", "-s",
    "http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/report?project_id=4",
    "-H", "Content-Type: application/json",
    "-d", body,
    "--max-time", "25"
], capture_output=True, text=True, timeout=30)

try:
    d = json.loads(result.stdout)
except:
    print("ERROR parsing response:", result.stdout[:500])
    sys.exit(1)

r = d.get('report', {})
wc = r.get('word_cloud', {})
print("Word cloud type:", type(wc).__name__)
if isinstance(wc, dict):
    for k, v in wc.items():
        print(f"  {k}: type={type(v).__name__}")
        if isinstance(v, dict) and 'items' in v:
            print(f"    items={len(v['items'])}, stats={list(v['stats'].keys()) if v.get('stats') else 'no stats'}")
            print(f"    Top 3: {[(i['word'], i['count'], i.get('pct',0)) for i in v['items'][:3]]}")
        elif isinstance(v, list):
            print(f"    list length={len(v)}")
            if v:
                print(f"    item keys={list(v[0].keys())[:5] if isinstance(v[0], dict) else v[0]}")
        else:
            print(f"    value={str(v)[:200]}")
