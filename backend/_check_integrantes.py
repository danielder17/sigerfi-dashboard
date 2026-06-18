import json, sys
d = json.load(sys.stdin)
subs = d.get('submissions', d.get('data', []))
for s in subs:
    integrantes = s.get('integrantes', [])
    if isinstance(integrantes, list):
        for miembro in integrantes:
            if isinstance(miembro, dict):
                sid = s.get("__id", "?")[:8]
                n = miembro.get("int_nombre", "?")
                e = miembro.get("int_edad", "?")
                g = miembro.get("int_genero", "?")
                p = miembro.get("int_parentesco", "?")
                print(f"{sid}... | n={n} e={e} g={g} p={p}")
