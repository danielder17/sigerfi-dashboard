import sys, json, re

# Test: read XML from stdin, count fields
d = json.load(sys.stdin)
xml = d.get('xml', '')
if not xml:
    print("No 'xml' key found in JSON")
    print("Keys:", list(d.keys()))
else:
    inputs = re.findall(r'(?:input|select1|select|range)\s+ref="/([^"]+)"', xml)
    print(f"Preguntas: {len(inputs)}")
    if len(inputs) > 0:
        print("Primeras:", inputs[:3])
