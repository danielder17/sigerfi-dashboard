"""Analizar estructura XML de formulario ODK"""
import sys, json, re

d = json.load(sys.stdin)
xml = d.get('xml', '')

# Extraer binds (campos y tipos)
binds = re.findall(r'<bind[^>]+>', xml)
print(f"=== BINDS ({len(binds)}) ===")
for b in binds:
    nodeset = re.search(r'nodeset="([^"]+)"', b)
    btype = re.search(r'type="([^"]+)"', b)
    if nodeset:
        print(f"  {nodeset.group(1):45s} type={btype.group(1) if btype else 'N/A'}")

# Extraer inputs (preguntas del body)
inputs = re.findall(r'<(input|select1|select|range|upload)\s+ref="([^"]+)"', xml)
print(f"\n=== INPUTS ({len(inputs)}) ===")
for inp_type, inp_ref in inputs:
    # Buscar label
    label_match = re.search(r'<' + inp_type + r'\s+ref="' + re.escape(inp_ref) + r'">\s*<label[^>]*>([^<]+)', xml)
    label = label_match.group(1) if label_match else ''
    print(f"  {inp_ref:45s} tipo={inp_type:10s} label={label[:40]}")

# Extraer grupos repetidos
groups = re.findall(r'<group[^>]*>\s*<label[^>]*>([^<]+)</label>', xml)
repeats = re.findall(r'<repeat[^>]*nodeset="([^"]+)"', xml)
print(f"\n=== GRUPOS ({len(groups)}) / REPEATS ({len(repeats)}) ===")
for r in repeats:
    print(f"  repeat: {r}")
for g in groups:
    print(f"  group: {g}")

# Extraer opciones select
selects = re.findall(r'<select1\s+ref="([^"]+)"', xml)
print(f"\n=== SELECTS ({len(selects)}) ===")
for s_ref in selects:
    # Buscar list_name
    list_match = re.search(r'<' + inp_type + r'\s+ref="' + re.escape(s_ref) + r'"[^>]*>', xml)
    # Buscar opciones en itext
    opts = re.findall(r'id="' + re.escape(s_ref.split('/')[-1]) + r'-(\d+)"', xml)
    print(f"  {s_ref:45s} opciones={len(opts)}")
