# -*- coding: utf-8 -*-
"""
Endpoint de exportación: CSV, Excel, JSON, GeoJSON, Shapefile.
Los datos se obtienen del adapter activo (ODK o KoBo).
"""
import csv, io, json, zipfile, tempfile, os, urllib.request, ssl
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from services.adapters.factory import get_configured_adapter

_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE

router = APIRouter()


def _get_adapter():
    return get_configured_adapter(auto_login=True)


def _get_coords(submission: dict) -> tuple[float | None, float | None]:
    """Extrae coordenadas de una submission cualquiera sea el formato."""
    # OData: punto; ETL: lat/lon directos; varías claves comunes
    lat = (submission.get("lat") or submission.get("latitude") or
           submission.get("Latitude") or submission.get("__latitude") or None)
    lon = (submission.get("lon") or submission.get("longitude") or
           submission.get("Longitude") or submission.get("__longitude") or None)

    # También buscar en campos anidados tipo geopoint OData
    if not lat or not lon:
        # Formato "x y z acc" o "lat lon alt acc"
        pt = submission.get("point") or submission.get("Point") or submission.get("location") or submission.get("Location") or ""
        if isinstance(pt, str) and pt.strip():
            parts = pt.strip().split()
            if len(parts) >= 2:
                try:
                    lat, lon = float(parts[0]), float(parts[1])
                except ValueError:
                    lat, lon = None, None

    if lat is not None and lon is not None:
        try:
            return float(lat), float(lon)
        except (ValueError, TypeError):
            pass
    return None, None


@router.get("/export/{project_id}/{form_id}/csv")
async def export_csv(project_id: int, form_id: str):
    subs = _get_subs(project_id, form_id)
    if not subs:
        return Response("", media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={form_id}.csv"})

    keys = _get_keys(subs)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(keys)
    for s in subs:
        w.writerow([str(s.get(k, "") or "") for k in keys])

    return Response(
        buf.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={form_id}.csv"},
    )


@router.get("/export/{project_id}/{form_id}/xlsx")
async def export_xlsx(project_id: int, form_id: str):
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(500, "openpyxl no instalado en el servidor")

    subs = _get_subs(project_id, form_id)
    keys = _get_keys(subs)

    wb = Workbook()
    ws = wb.active
    ws.title = form_id[:31]
    ws.append(keys)
    for s in subs:
        ws.append([str(s.get(k, "") or "") for k in keys])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={form_id}.xlsx"},
    )


@router.get("/export/{project_id}/{form_id}/json")
async def export_json(project_id: int, form_id: str):
    import json as j
    subs = _get_subs(project_id, form_id)
    return Response(
        j.dumps(subs, ensure_ascii=False, indent=2).encode("utf-8"),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={form_id}.json"},
    )


@router.get("/export/{project_id}/{form_id}/geojson")
async def export_geojson(project_id: int, form_id: str):
    import json as j
    subs = _get_subs(project_id, form_id)

    features = []
    for s in subs:
        lat, lon = _get_coords(s)
        if lat is None or lon is None:
            continue
        props = {k: s.get(k) for k in _get_keys([s]) if k not in ("lat", "lon", "latitude", "longitude", "Latitude", "Longitude", "__latitude", "__longitude", "point", "Point", "location", "Location")}
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        })

    fc = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {"total": len(subs), "with_coords": len(features), "without_coords": len(subs) - len(features)},
    }

    return Response(
        j.dumps(fc, ensure_ascii=False, indent=2).encode("utf-8"),
        media_type="application/geo+json; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={form_id}.geojson"},
    )


@router.get("/export/{project_id}/{form_id}/shapefile")
async def export_shapefile(project_id: int, form_id: str):
    """Retorna un ZIP conteniendo .shp, .shx, .dbf, .prj"""
    try:
        import shapefile  # pyshp
    except ImportError:
        raise HTTPException(500, "pyshp no instalado en el servidor")

    subs = _get_subs(project_id, form_id)

    with tempfile.TemporaryDirectory() as tmpdir:
        shp_path = os.path.join(tmpdir, form_id[:50])

        w = shapefile.Writer(shp_path, shapeType=shapefile.POINT)
        w.field("id", "N", 10)

        keys = _get_keys(subs)
        # Limitar a campos que pyshp soporte (10 chars, sin espacios)
        safe_fields = {}
        for i, k in enumerate(keys):
            safe = _safe_field_name(k, i)
            safe_fields[k] = safe
            # pyshp field: name(10), type(C/N/F/L), size, decimals
            w.field(safe, "C", 254)

        for idx, s in enumerate(subs):
            lat, lon = _get_coords(s)
            if lat is None or lon is None:
                continue
            w.point(lon, lat)
            rec = [idx]
            for k in keys:
                rec.append(str(s.get(k, "") or "")[:254])
            w.record(*rec)

        w.close()

        # Crear .prj (WGS84)
        prj_content = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
        with open(shp_path + ".prj", "w") as f:
            f.write(prj_content)

        # Empaquetar ZIP
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                fpath = shp_path + ext
                if os.path.exists(fpath):
                    zf.write(fpath, f"{form_id[:50]}{ext}")
        buf.seek(0)

    return Response(
        buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={form_id}_shapefile.zip"},
    )


def _get_subs(project_id: int, form_id: str) -> list:
    """Obtiene submissions del adapter activo."""
    adapter = _get_adapter()
    if hasattr(adapter, "get_all_submissions"):
        subs = adapter.get_all_submissions(project_id, form_id)
    elif hasattr(adapter, "get_submissions"):
        subs = adapter.get_submissions(str(project_id), form_id)
    else:
        subs = []
    if not subs:
        raise HTTPException(404, "Sin datos para exportar")
    return subs


def _get_keys(subs: list) -> list[str]:
    """Obtiene keys comunes de todas las submissions, excluyendo internas."""
    if not subs:
        return []
    keys = set()
    for s in subs:
        keys.update(s.keys())
    internals = {"@odata.context", "@odata.editLink", "@odata.id", "@odata.etag", "meta", "__id", "__media_urls", "__submission_id", "__instance_id", "__latitude", "__longitude"}
    return sorted(k for k in keys if k not in internals)


def _safe_field_name(name: str, idx: int) -> str:
    """Convierte nombre de campo a máximo 10 chars alfanuméricos para Shapefile."""
    safe = "".join(c for c in name if c.isalnum() or c in "_")
    safe = safe.replace(" ", "_")[:9]
    if not safe:
        safe = f"f{idx}"
    if safe[0].isdigit():
        safe = "f" + safe
    return safe[:10]
