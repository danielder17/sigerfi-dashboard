"""
Rutas de formularios. Usa el adapter configurado (ODK o KoBo).
"""
from fastapi import APIRouter, HTTPException, Query, Response
from typing import Optional
from services.adapters.factory import get_configured_adapter
from services.report_engine import parse_xml_schema
from services.etl_service import get_homologated_submissions
from config import HOST, PORT
import urllib.request, ssl

_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE

router = APIRouter()


def _get_adapter():
    """Retorna el adapter autenticado."""
    return get_configured_adapter(auto_login=True)


def _get_backend_url() -> str:
    """Devuelve la URL base del backend para construir URLs absolutas."""
    return f"http://{HOST}:{PORT}"


def _enrich_with_media_urls(subs: list, project_id: int, form_id: str, adapter) -> list:
    """A�ade __media_urls apuntando al proxy del backend (URL absoluta)."""
    MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".mp4", ".webm", ".mov", ".pdf"}
    backend_url = _get_backend_url()
    enriched = []
    for s in subs:
        raw_id = (
            s.get("__id") or s.get("__instance_id") or s.get("__submission_id") or
            s.get("instanceId") or s.get("meta/instanceID", "") or
            (s.get("@odata.id", "").split("(")[-1].split(")")[0] if "(" in s.get("@odata.id", "") else "")
        )
        # ODK Central require el prefijo uuid:
        instance_id = str(raw_id).strip()
        if instance_id and not instance_id.startswith("uuid:"):
            instance_id = f"uuid:{instance_id}"
        urls = {}
        for k, v in s.items():
            if isinstance(v, str) and any(v.lower().endswith(e) for e in MEDIA_EXTS):
                urls[k] = f"{backend_url}/api/media/{project_id}/{form_id}/{instance_id}/{v}"
        if urls:
            s["__media_urls"] = urls
        enriched.append(s)
    return enriched


@router.get("/forms/{form_id}/schema")
async def get_form_schema(form_id: str, project_id: int = Query(...)):
    """Obtiene el esquema del formulario parseado (fields, tipos, labels, opciones)."""
    try:
        adapter = _get_adapter()

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
):
    """Obtiene submissions paginados.
    
    Primero intenta del caché ETL (homologado). Si no hay, cae al adapter activo.
    """
    try:
        # Intentar desde caché ETL
        subs, fields = get_homologated_submissions(project_id, form_id)
        if subs:
            # Enriquecer con media aunque venga de caché
            try:
                adapter = _get_adapter()
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

        # Fallback al adapter activo
        adapter = _get_adapter()
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
async def get_all_submissions(form_id: str, project_id: int = Query(...)):
    """Obtiene TODAS las submissions.
    
    Primero intenta del caché ETL (homologado). Si no hay, cae al adapter activo.
    """
    try:
        # Intentar desde caché ETL
        subs, fields = get_homologated_submissions(project_id, form_id)
        if subs:
            # Enriquecer con media aunque venga de caché
            try:
                adapter = _get_adapter()
                subs_with_media = _enrich_with_media_urls(subs, project_id, form_id, adapter)
            except Exception:
                subs_with_media = subs
            return {
                "submissions": subs_with_media,
                "count": len(subs_with_media),
                "source": "cache",
                "fields": fields,
            }

        # Fallback al adapter activo
        adapter = _get_adapter()
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


@router.get("/media/{project_id}/{form_id}/{instance_id}/{filename:path}")
async def proxy_media(project_id: int, form_id: str, instance_id: str, filename: str):
    """Sirve archivos multimedia desde ODK Central a trav�s del backend (proxy con token)."""
    try:
        adapter = _get_adapter()
        token = adapter._token if hasattr(adapter, '_token') else ""
        server = adapter.get_server_url() if hasattr(adapter, 'get_server_url') else ""
        if not token or not server:
            raise HTTPException(503, "Proxy no disponible (sin token)")
        import urllib.parse
        odk_url = f"{server}/v1/projects/{project_id}/forms/{form_id}/submissions/{instance_id}/attachments/{urllib.parse.quote(filename)}"
        req = urllib.request.Request(odk_url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, context=_ctx, timeout=30) as r:
            content = r.read()
            ct = r.headers.get("Content-Type", "application/octet-stream")
        return Response(content=content, media_type=ct)
    except urllib.error.HTTPError as e:
        raise HTTPException(e.code, f"ODK media error: {e.reason}")
    except Exception as e:
        raise HTTPException(500, str(e))
