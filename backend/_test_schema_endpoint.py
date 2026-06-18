import sys, json
d = json.load(sys.stdin)
print(f'fields: {len(d.get("fields",[]))} xml: {"xml" in d}')
for f in d.get('fields', [])[:15]:
    print(f'  {f["name"]:25s} type={f["type"]:12s} repeat={f["is_repeat"]} opts={len(f.get("options",[]))}')
