import urllib.request, json, sys
sys.path.insert(0, r'C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend')

# Get actual submissions from ODK
url = 'http://localhost:8010/api/forms/Diagnostico_Comunitario_Integral/submissions?project_id=4'
r = urllib.request.urlopen(url, timeout=10)
raw = json.loads(r.read())

submissions = raw.get('submissions', raw) if isinstance(raw, dict) else raw
print(f"Total submissions: {len(submissions)}")

# Show first submission keys
s = submissions[0] if submissions else {}
print(f"\nFirst sub keys ({len(s)} total):")
for k in sorted(s.keys()):
    v = s[k]
    if isinstance(v, list):
        print(f"  {k}: LIST [{len(v)} items]")
        if v and isinstance(v[0], dict):
            print(f"    first item: {v[0]}")
    else:
        print(f"  {k}: {str(v)[:60]}")
