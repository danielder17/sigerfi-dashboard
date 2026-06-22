"""
DPT Labels: traduccion de codigos DPT a nombres geograficos de Venezuela.
Carga el archivo dpt_labels.json y ofrece busqueda rapida por codigo y nivel.
"""
import json
from pathlib import Path

_LABELS = None
LEVELS = ("estado", "municipio", "parroquia", "comunidad")


def _load() -> dict:
    global _LABELS
    if _LABELS is not None:
        return _LABELS
    path = Path(__file__).resolve().parent.parent / "dpt_labels.json"
    if not path.exists():
        _LABELS = {}
        return _LABELS
    with open(path, "r", encoding="utf-8") as f:
        _LABELS = json.load(f)
    return _LABELS


def get_label(code: str, level: str = None) -> str:
    """
    Devuelve el nombre para un codigo DPT.
    Si no se especifica level, prueba estado -> municipio -> parroquia -> comunidad.
    """
    data = _load()
    if not data:
        return code
    if level:
        return data.get(level, {}).get(code.strip(), code)
    for lvl in LEVELS:
        if code.strip() in data.get(lvl, {}):
            return data[lvl][code.strip()]
    return code


def resolve_all(codes: dict) -> dict:
    """
    Toma un dict con claves 'estado', 'municipio', 'parroquia', 'comunidad'
    y devuelve los nombres correspondientes.
    """
    result = {}
    data = _load()
    for level in LEVELS:
        val = codes.get(level)
        if val is not None:
            result[level] = data.get(level, {}).get(str(val).strip(), str(val))
            result[f"{level}_code"] = str(val).strip()
    return result


def get_labels_dict() -> dict:
    """Devuelve el diccionario completo de labels."""
    return _load()


def stats() -> dict:
    """Estadisticas de las tablas de lookup cargadas."""
    data = _load()
    return {k: len(v) for k, v in data.items()}
