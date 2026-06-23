"""
Rutas para el Visualizador 3D de Edificaciones.
Retorna GeoJSON FeatureCollection con polígonos extrusionables desde ODK OData.
"""
from fastapi import APIRouter, HTTPException
from services.adapters.factory import get_configured_adapter
from config import HOST, PORT
import json

router = APIRouter()


@router.get("/api/v2/projects/{project_id}/forms/{form_id}/edificaciones-3d")
async def get_edificaciones_3d(project_id: int, form_id: str):
    """
    Retorna GeoJSON FeatureCollection con edificios como Polygon.
    Convierte geotrace (LineString) a Polygon cerrado para extrusiones 3D.
    """
    try:
        adapter = get_configured_adapter(auto_login=True)
        subs = adapter.get_submissions(str(project_id), form_id)

        backend_url = f"http://{HOST}:{PORT}"
        features = []

        for sub in subs:
            poligono = sub.get("poligono")
            if not poligono:
                continue

            if isinstance(poligono, str):
                try:
                    poligono = json.loads(poligono)
                except (json.JSONDecodeError, TypeError):
                    continue

            coords = poligono.get("coordinates", [])
            if not coords or len(coords) < 3:
                continue

            first = coords[0]
            last = coords[-1]
            if len(first) >= 2 and len(last) >= 2:
                if first[0] != last[0] or first[1] != last[1]:
                    coords = list(coords) + [list(first)]

            polygon_coords = [coords]

            altura = sub.get("altura_m")
            try:
                altura = float(altura) if altura is not None else 0
            except (ValueError, TypeError):
                altura = 0

            area = sub.get("area_m2")
            try:
                area = round(float(area), 2) if area is not None else None
            except (ValueError, TypeError):
                area = None

            volumen = sub.get("volumen_m3")
            try:
                volumen = round(float(volumen), 2) if volumen is not None else None
            except (ValueError, TypeError):
                volumen = None

            foto = sub.get("foto_edificacion", "")
            foto_url = None
            if foto and foto.strip() and foto != "None":
                foto_url = f"{backend_url}/api/media/{project_id}/{form_id}/{foto.strip()}"

            lons = [c[0] for c in coords if len(c) >= 2]
            lats = [c[1] for c in coords if len(c) >= 2]
            center_lon = sum(lons) / len(lons) if lons else None
            center_lat = sum(lats) / len(lats) if lats else None

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": polygon_coords
                },
                "properties": {
                    "id": sub.get("__id", ""),
                    "nombre": sub.get("nombre_edificacion", ""),
                    "tipo": sub.get("tipo", ""),
                    "altura_m": altura,
                    "area_m2": area,
                    "volumen_m3": volumen,
                    "estado": sub.get("estado", ""),
                    "situacion": sub.get("situacion", ""),
                    "servicios": sub.get("servicios", ""),
                    "dpt_estado": sub.get("dpt_estado"),
                    "dpt_municipio": sub.get("dpt_municipio"),
                    "dpt_parroquia": sub.get("dpt_parroquia"),
                    "dpt_comunidad": sub.get("dpt_comunidad"),
                    "foto_url": foto_url,
                    "encuestador": sub.get("encuestador", ""),
                    "anios_construccion": sub.get("anios_construccion"),
                    "center_lon": center_lon,
                    "center_lat": center_lat,
                }
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
            "total": len(features)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
