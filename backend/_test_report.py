"""Test del endpoint report"""
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

payload = json.dumps({
    "metrics": ["numero_familiares", "ingreso_mensual_usd"],
    "dimensions": ["tipo_vivienda"],
    "temporal_field": "fecha_encuesta",
    "temporal_grouping": "month",
    "geopoint_field": "ubicacion",
}).encode()

req = urllib.request.Request(
    "http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/report",
    data=payload,
    headers={"Content-Type": "application/json"}
)

try:
    resp = urllib.request.urlopen(req, context=ctx, timeout=30)
    d = json.loads(resp.read().decode())
    print(f"Report OK: {'report' in d}")
    print(f"Form: {d.get('form_name', '')}")
    print(f"KPIs: {list(d.get('report', {}).get('kpis', {}).keys())}")
    print(f"Dimensions: {list(d.get('report', {}).get('grouped_data', {}).keys())}")
    print(f"Temporal: {d['report']['temporal_data']['grouping'] if 'temporal_data' in d.get('report', {}) else 'N/A'}")
    print(f"Geo points: {len(d.get('report', {}).get('geo_points', []))}")
    print(f"Charts: {list(d.get('report', {}).get('charts', {}).keys())}")
    
    # Mostrar algunos KPIs
    kpis = d.get('report', {}).get('kpis', {})
    for metric, kpi_data in kpis.items():
        print(f"  {metric}: count={kpi_data.get('count', '?')}, avg={kpi_data.get('avg', '?')}, min={kpi_data.get('min', '?')}, max={kpi_data.get('max', '?')}")
    
    # Mostrar grouped data
    grouped = d.get('report', {}).get('grouped_data', {})
    for dim, dim_data in grouped.items():
        print(f"  Dimension {dim}: {len(dim_data)} valores")
        for val, metrics in list(dim_data.items())[:5]:
            print(f"    {val}: {json.dumps({k: v.get('count', '?') for k, v in metrics.items()})}")
    
    # Mostrar temporal data
    temp = d.get('report', {}).get('temporal_data', {})
    print(f"  Temporal ({temp.get('grouping', '?')}): {len(temp.get('data', {}))} periodos")
    for date, count in list(temp.get('data', {}).items())[:10]:
        print(f"    {date}: {count}")
    
    # Mostrar charts
    charts = d.get('report', {}).get('charts', {})
    for chart_id, chart_data in charts.items():
        print(f"  Chart '{chart_id}': type={chart_data.get('type', '?')}, labels={len(chart_data.get('labels', []))}")
        
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode()[:500]}")
except Exception as e:
    print(f"Error: {e}")
