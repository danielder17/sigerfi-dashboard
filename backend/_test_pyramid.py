"""
Test rápido de pirámide poblacional y tablas de contingencia.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from services.report_engine import build_population_pyramid, build_contingency_tables

# Simular submissions con integrantes expandidos
submissions = [
    {"numero_familiares": 4, "int.edad": 35, "int.genero": "hombre", "int.parentesco": "jefe", "tipo_vivienda": "casa", "redes_sociales": "whatsapp telegram"},
    {"numero_familiares": 4, "int.edad": 32, "int.genero": "mujer", "int.parentesco": "conyuge", "tipo_vivienda": "casa", "redes_sociales": "whatsapp"},
    {"numero_familiares": 4, "int.edad": 8, "int.genero": "hombre", "int.parentesco": "hijo", "tipo_vivienda": "casa", "redes_sociales": "tiktok"},
    {"numero_familiares": 4, "int.edad": 5, "int.genero": "mujer", "int.parentesco": "hija", "tipo_vivienda": "casa", "redes_sociales": "ninguna"},
    {"numero_familiares": 3, "int.edad": 28, "int.genero": "hombre", "int.parentesco": "jefe", "tipo_vivienda": "apto", "redes_sociales": "instagram telegram"},
    {"numero_familiares": 3, "int.edad": 26, "int.genero": "mujer", "int.parentesco": "conyuge", "tipo_vivienda": "apto", "redes_sociales": "instagram"},
    {"numero_familiares": 3, "int.edad": 1, "int.genero": "mujer", "int.parentesco": "hija", "tipo_vivienda": "apto", "redes_sociales": "whatsapp"},
    {"numero_familiares": 2, "int.edad": 45, "int.genero": "hombre", "int.parentesco": "jefe", "tipo_vivienda": "rancho", "redes_sociales": "whatsapp"},
    {"numero_familiares": 2, "int.edad": 70, "int.genero": "mujer", "int.parentesco": "madre", "tipo_vivienda": "rancho", "redes_sociales": "ninguna"},
]

fields = [
    {"name": "int.edad", "label": "Edad", "type": "integer", "is_repeat": False, "repeat_parent": None, "options": []},
    {"name": "int.genero", "label": "Género", "type": "text", "is_repeat": False, "repeat_parent": None, "options": []},
    {"name": "int.parentesco", "label": "Parentesco", "type": "text", "is_repeat": False, "repeat_parent": None, "options": []},
    {"name": "numero_familiares", "label": "Número de familiares", "type": "integer", "is_repeat": False, "repeat_parent": None, "options": []},
    {"name": "tipo_vivienda", "label": "Tipo de vivienda", "type": "text", "is_repeat": False, "repeat_parent": None, "options": ["casa", "apto", "rancho"]},
    {"name": "redes_sociales", "label": "Redes sociales", "type": "text", "is_repeat": False, "repeat_parent": None, "options": []},
]

pyramid = build_population_pyramid(submissions, fields)
print("\n=== PIRÁMIDE POBLACIONAL ===")
if pyramid:
    print(f"Población total: {pyramid['total_population']}")
    print(f"Rangos: {pyramid['ranges']}")
    print(f"Hombres: {pyramid['data']['hombres']}")
    print(f"Mujeres: {pyramid['data']['mujeres']}")
    print(f"Totales: {pyramid['data']['totals']}")
    print(f"Stats: {pyramid['stats']}")
else:
    print("No detectada")

tables = build_contingency_tables(submissions, fields)
print(f"\n=== TABLAS DE CONTINGENCIA ({len(tables)}) ===")
for ct in tables:
    print(f"\n{ct['row_field']} x {ct['col_field']} (chi2={ct['chi_square']})")
    for row in ct['rows']:
        print(f"  {row['label']}: total={row['_row_total']} | {', '.join(f'{c}={row[c]}' for c in ct['col_labels'])}")
