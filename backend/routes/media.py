"""
Rutas de media: proxy a ODK Central/KoBo para archivos multimedia.
Separado para evitar conflictos de rutas en forms.py.
"""
from fastapi import APIRouter, HTTPException, Response, Depends
from services.adapters.factory import get_configured_adapter
import urllib.request, ssl
import urllib.parse

_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE

router = APIRouter()


@router.get("/media/{project_id}/{form_id}/{instance_id}/{filename}")
async def proxy_media(project_id: int, form_id: str, instance_id: str, filename: str):
    """Sirve archivos multimedia desde ODK Central a traves del backend (proxy con token)."""
    try:
        adapter = get_configured_adapter(auto_login=True)
        token = adapter._token if hasattr(adapter, '_token') else ""
        server = adapter.get_server_url() if hasattr(adapter, 'get_server_url') else ""
        if not token or not server:
            raise HTTPException(503, "Proxy no disponible (sin token)")
        
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
