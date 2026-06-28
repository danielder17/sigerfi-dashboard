"""
Rutas de formularios. Usa el adapter configurado (ODK o KoBo).
"""
from fastapi import APIRouter, HTTPException, Query, Response, Request
from typing import Optional
from services.adapters.user_adapter import get_user_adapter
from services.report_engine import parse_xml_schema
from services.etl_service import get_homologated_submissions
from config import HOST, PORT
import urllib.request, ssl

_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE

router = APIRouter()


def _get_backend_url() -> str:
    """Devuelve la URL base del backend para construir URLs absolutas."""
    return f"http://{HOST}:{PORT}"


def _enrich_with_media_urls(subs: list, project_id: int, form_id: str, adapter) -> list:
    """AÃ±ade __media_urls apuntando al proxy del backend (URL absoluta).
    Busca archivos multimedia en campos directos y como fallback via ODK Central API.
    TambiÃ©n aplanea geopoints y campos select desde grupos anidados.
    """
    MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".mp4", ".webm", ".mov", ".pdf"}
    backend_url = _get_backend_url()
    token = getattr(adapter, '_token', '')
    server = adapter.get_server_url() if hasattr(adapter, 'get_server_url') else ''
    enriched = []

    # Obtener datos reales del adapter (con grupos anidados)
    real_data_by_id = {}  # {instance_id_clean: {field: value, ...}}
    real_ids = {}  # {instance_id_clean: instance_id_full}
    real_groups_map = {}  # {instance_id_clean: [(field, value), ...]} para todos los campos anidados

    try:
        real_subs = adapter.get_submissions(str(project_id), form_id)
        for rs in real_subs:
            inst = rs.get('instanceId', rs.get('__id', ''))
            inst_clean = inst.replace('uuid:', '')
            real_ids[inst_clean] = inst

            # Aplanar grupos anidados: todos los subcampos y attachments
            flat_items = []
            def _walk_groups(data: dict, prefix: str = ''):
                for gk, gv in data.items():
                    if isinstance(gv, dict) and gk not in ('meta', '__system'):
                        # GeoJSON: {type: Point, coordinates: [...]}
                        if gv.get('type') == 'Point' and 'coordinates' in gv:
                            key = prefix + gk if prefix else gk
                            coords = gv.get('coordinates', [])
                            if len(coords) >= 2:
                                lat = float(coords[1])
                                lng = float(coords[0])
                                flat_items.append((key, f'{lat} {lng} 0 0'))
                            continue
                        _walk_groups(gv, prefix + gk + '/')
                    elif isinstance(gv, str):
                        key = prefix + gk if prefix else gk
                        flat_items.append((key, gv))
            _walk_groups(rs)
            real_groups_map[inst_clean] = flat_items
    except Exception:
        pass

    for s in subs:
        raw_id = (
            s.get("__id") or s.get("__instance_id") or s.get("__submission_id") or
            s.get("instanceId") or s.get("meta/instanceID", "") or
            (s.get("@odata.id", "").split("(")[-1].split(")")[0] if "(" in s.get("@odata.id", "") else "")
        )
        instance_id = str(raw_id).strip()
        if instance_id and not instance_id.startswith("uuid:"):
            instance_id = f"uuid:{instance_id}"

        urls = {}
        # 1. Buscar en campos directos de la submission
        for k, v in s.items():
            if isinstance(v, str) and any(v.lower().endswith(e) for e in MEDIA_EXTS):
                urls[k] = f"{backend_url}/api/media/{project_id}/{form_id}/{instance_id}/{v}"

        # 2. Si no encontramos nada, usar mapeo de datos reales
        id_key = raw_id.replace('uuid:', '') if raw_id else ''
        real_inst = real_ids.get(id_key, instance_id)
        flat_items = real_groups_map.get(id_key, [])

        if not urls:
            for field_name, fval in flat_items:
                if any(fval.lower().endswith(e) for e in MEDIA_EXTS):
                    name = field_name.split('/')[-1]  # usar solo el nombre corto
                    urls[name] = f"{backend_url}/api/media/{project_id}/{form_id}/{real_inst}/{fval}"

        if urls:
            s["__media_urls"] = urls

        # 3. Aplanar TODOS los campos desde grupos anidados al nivel raíz
        for field_name, fval in flat_items:
            short = field_name.split('/')[-1]
            if short in s and s[short] not in ('', None):
                continue  # no sobreescribir campos ya existentes
            # Geopoint: ODK format "lat lng alt accuracy"
            if short == 'ubicacion' or 'localizacion_espacial' in short or 'geopoint' in short or 'geo' in short or short == 'location':
                if len(fval.split()) >= 2:
                    parts = fval.strip().split()
                    try:
                        lat, lng = float(parts[0]), float(parts[1])
                        s[short] = fval
                        s['_latitude'] = lat
                        s['_longitude'] = lng
                    except ValueError:
                        pass
            else:
                # Aplanar campos de texto y numeros al nivel raíz
                if short not in ('meta', '__id', 'instanceId', '__system'):
                    s[short] = fval

        enriched.append(s)
    return enriched


@router.get("/forms/{form_id}/schema")
async def get_form_schema(form_id: str, project_id: int = Query(...), request: Request = None):
    """Obtiene el esquema del formulario parseado (fields, tipos, labels, opciones)."""
    try:
        adapter = get_user_adapter(request)

        # Intentar obtener XML del formulario
        xml = None
        if hasattr(adapter, 'get_form_xml'):
            xml = adapter.get_form_xml(project_id, form_id)

        if not xml:
            raise HTTPException(status_code=404, detail="XML del formulario no encontrado")

        fields = parse_xml_schema(xml)

        return {
            "xml": xml,
            "fields": fields,
            "total_fields": len(fields),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forms/{form_id}/submissions")
async def get_submissions(
    form_id: str,
    project_id: int = Query(...),
    top: int = Query(100, le=1000),
    skip: int = Query(0, ge=0),
    request: Request = None,
):
    """Obtiene submissions paginados.
    
    Primero intenta del cachÃ© ETL (homologado). Si no hay, cae al adapter activo.
    """
    try:
        # Intentar desde cachÃ© ETL
        subs, fields = get_homologated_submissions(project_id, form_id)
        if subs:
            # Enriquecer con media aunque venga de cachÃ©
            try:
                adapter = get_user_adapter(request)
                subs_with_media = _enrich_with_media_urls(subs, project_id, form_id, adapter)
            except Exception:
                subs_with_media = subs
            paginated = subs_with_media[skip:skip + top]
            has_more = len(subs_with_media) > skip + top
            return {
                "submissions": paginated,
                "count": len(paginated),
                "total": len(subs_with_media),
                "skip": skip,
                "has_more": has_more,
                "source": "cache",
                "fields": fields,
            }

        # Fallback al adapter del usuario autenticado
        adapter = get_user_adapter(request)
        if hasattr(adapter, 'get_submissions'):
            subs = adapter.get_submissions(str(project_id), form_id, top=top, skip=skip)
        elif hasattr(adapter, 'get_submissions_odata'):
            subs = adapter.get_submissions_odata(int(project_id), form_id, top=top, skip=skip)
        else:
            subs = []

        has_more = len(subs) >= top
        return {
            "submissions": subs,
            "count": len(subs),
            "skip": skip,
            "has_more": has_more,
            "source": "adapter",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forms/{form_id}/all")
async def get_all_submissions(form_id: str, project_id: int = Query(...), request: Request = None):
    """Obtiene TODAS las submissions.
    
    Primero intenta del cachÃ© ETL (homologado). Si no hay, cae al adapter activo.
    """
    try:
        # Intentar desde cachÃ© ETL
        subs, fields = get_homologated_submissions(project_id, form_id)
        if subs:
            # Enriquecer con media aunque venga de cachÃ©
            try:
                adapter = get_user_adapter(request)
                subs_with_media = _enrich_with_media_urls(subs, project_id, form_id, adapter)
            except Exception:
                subs_with_media = subs
            return {
                "submissions": subs_with_media,
                "count": len(subs_with_media),
                "source": "cache",
                "fields": fields,
            }

        # Fallback al adapter del usuario autenticado
        adapter = get_user_adapter(request)
        if hasattr(adapter, 'get_all_submissions'):
            subs = adapter.get_all_submissions(project_id, form_id)
        elif hasattr(adapter, 'get_submissions'):
            subs = adapter.get_submissions(str(project_id), form_id)
        else:
            subs = []

        # Adjuntar URLs de archivos multimedia
        try:
            subs_with_media = _enrich_with_media_urls(subs, project_id, form_id, adapter)
        except Exception:
            subs_with_media = subs

        return {"submissions": subs_with_media, "count": len(subs_with_media), "source": "adapter"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


        raise HTTPException(500, str(e))
