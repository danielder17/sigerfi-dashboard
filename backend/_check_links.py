import json, sys
d = json.load(sys.stdin)
for s in d.get('submissions', d.get('data', [])):
    sid = s.get("__id", "")
    link = s.get("integrantes@odata.navigationLink", "")
    if link:
        print(f"SID={sid} LINK={link}")
