"""Test de importación y _resolve_select."""
import sys
sys.path.insert(0, 'C:\\Users\\Usuario\\.openclaw\\workspace\\odk-dashboard-v2\\backend')

from services.etl_service import _resolve_select
from services.adapters.factory import get_adapter

print("--- Importaciones OK ---")

# Test _resolve_select con prefijo KoBo
opts = ['Casa', 'Apartamento', 'Rancho']

result = _resolve_select('vivienda_casa', opts, list_name='vivienda')
print(f"prefijo KoBo: 'vivienda_casa' -> '{result}'")
assert result == 'Casa', f"Esperado Casa, obtenido: {result}"

result2 = _resolve_select('1', opts)
print(f"indice 1-based: '1' -> '{result2}'")
assert result2 == 'Casa', f"Esperado Casa, obtenido: {result2}"

result3 = _resolve_select('casa', opts)
print(f"match exacto: 'casa' -> '{result3}'")
assert result3 == 'Casa', f"Esperado Casa, obtenido: {result3}"

# Test sin list_name (funcionamiento actual)
result4 = _resolve_select('2', opts)
print(f"indice 2: '2' -> '{result4}'")
assert result4 == 'Apartamento'

# Test select_multiple
result5 = _resolve_select('1 3', opts)
print(f"multi-select '1 3' -> '{result5}'")
assert result5 == 'Casa / Rancho'

# Test prefijo genérico (sin list_name específico)
result6 = _resolve_select('tipo_casa', opts)
print(f"prefijo generico 'tipo_casa' -> '{result6}'")
assert result6 == 'Casa', f"Esperado Casa, obtenido: {result6}"

# Test fallback (valor no reconocible)
result7 = _resolve_select('xyz', opts)
print(f"fallback 'xyz' -> '{result7}'")
assert result7 == 'xyz'

print("\n--- TODOS LOS TESTS PASARON ---")
