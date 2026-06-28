"""
Endpoint para traduccion de codigos DPT a nombres geograficos.
"""
from fastapi import APIRouter, Query
from services.dpt_labels import get_label, resolve_all, stats, get_labels_dict

router = APIRouter(prefix="/api/v2/labels", tags=["DPT Labels"])


@router.get("/dpt/stats")
async def dpt_stats():
    """Estadisticas de las tablas de codigos DPT cargadas."""
    s = stats()
    return {
        "total_registros": sum(s.values()),
        "por_nivel": s,
    }


@router.get("/dpt/list")
async def dpt_list(level: str = Query(None)):
    """Lista completa de un nivel: codigo a nombre.
    Sin level, devuelve el mapa completo aplanado {codigo: nombre}.
    """
    data = get_labels_dict()
    if level:
        return data.get(level, {})
    # Aplanar todo: estado, municipio, parroquia, comunidad
    flat = {}
    for nivel, items in data.items():
        for code, name in items.items():
            flat[code] = name
    return flat


@router.get("/dpt/resolve")
async def resolve_dpt(
    estado: str = Query(None),
    municipio: str = Query(None),
    parroquia: str = Query(None),
    comunidad: str = Query(None),
):
    """Traduce uno o varios codigos DPT a nombres legibles."""
    codes = {k: v for k, v in {
        "estado": estado,
        "municipio": municipio,
        "parroquia": parroquia,
        "comunidad": comunidad,
    }.items() if v is not None}
    if not codes:
        return {"error": "Al menos un codigo es requerido"}
    return resolve_all(codes)


@router.get("/dpt/{code}")
async def resolve_code(code: str, level: str = Query(None)):
    """Traduce un codigo individual."""
    return {"code": code, "label": get_label(code, level)}
