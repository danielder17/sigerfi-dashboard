import json, sys
d = json.load(sys.stdin)
subs = d.get('submissions', d.get('data', []))
for s in subs:
    for k, v in s.items():
        if isinstance(v, list):
            print(f"ARRAY: {k} -> {v}")
        if isinstance(v, dict):
            print(f"DICT: {k} -> {list(v.keys())[:3]}")
print("---Keys in all subs---")
keys = set()
for s in subs:
    keys.update(s.keys())
print(sorted(keys))
