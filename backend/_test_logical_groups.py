"""Test logical groups"""
import sys, json

d = json.load(sys.stdin)
for g in d.get("groups", []):
    names = [f["name"] for f in g["fields"]]
    print(f'{g["name"]:30s} [{g["analysis"]:15s}] icon={g["icon"]:10s} fields={names}')
