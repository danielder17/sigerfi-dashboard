import json, sys
d = json.load(sys.stdin)
r = d.get('report', {})
print('WC keys:', list(r.get('word_cloud', {}).keys()))
print('Pyramid:', bool(r.get('population_pyramid')))
print('Tables:', len(r.get('contingency_tables', [])))
for k, v in r.get('word_cloud', {}).items():
    s = v.get('stats', {})
    items = v.get('items', [])
    print(f'  {k}: {len(items)} items, total_words={s.get("total_words",0)}, unique={s.get("unique_words",0)}, docs={s.get("total_documents",0)}')
    if items:
        print(f'    Top 5: {[(i["word"], i["count"], i["pct"]) for i in items[:5]]}')
pp = r.get('population_pyramid')
if pp:
    print(f'  Pyramid: pop={pp["total_population"]}, ranges={pp["ranges"]}')
    print(f'  Stats: H={pp["stats"]["total_hombres"]} M={pp["stats"]["total_mujeres"]} min={pp["stats"]["edad_minima"]} max={pp["stats"]["edad_maxima"]} avg={pp["stats"]["edad_promedio"]}')
tables = r.get('contingency_tables', [])
for ct in tables:
    print(f'  Table: {ct["row_field"]} x {ct["col_field"]}, rows={len(ct["rows"])}, col_labels={ct["col_labels"][:5]}')
