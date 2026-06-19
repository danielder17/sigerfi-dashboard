"""
Rutas de formularios ODK Central.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from odk_client import ODKClient
from config import ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD
from services.report_engine import parse_xml_schema
from services.etl_service import get_homologated_submissions

router = APIRouter()


def _get_client() -> ODKClient:
    client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
    client.login()
    return client


@router.get("/forms/{form_id}/schema")
async def get_form_schema(form_id: str, project_id: int = Query(...)):
    """Obtiene el esquema del formulario parseado (fields, tipos, labels, opciones)."""
    try:
        client = _get_client()

        # XML del formulario (para labels, opciones, estructura)
        xml = client.get_form_xml(project_id, form_id)
        if not xml:
            client.close()
            raise HTTPException(status_code=404, detail="XML del formulario no encontrado")

        # Parsear con el motor de reportes
        fields = parse_xml_schema(xml)

        client.close()
        return {
            "xml": xml,
            "fields": fields,
            "total_fields": len(fields),
        }
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
    
    Primero intenta del caché ETL (homologado). Si no hay, cae a ODK Central.
    """
    try:
        # Intentar desde caché ETL
        subs, fields = get_homologated_submissions(project_id, form_id)
        if subs:
            # Paginar desde el caché
            paginated = subs[skip:skip + top]
            has_more = len(subs) > skip + top
            return {
                "submissions": paginated,
                "count": len(paginated),
                "total": len(subs),
                "skip": skip,
                "has_more": has_more,
                "source": "cache",
                "fields": fields,
            }

        # Fallback a ODK Central
        client = _get_client()
        subs = client.get_submissions_odata(project_id, form_id, top=top, skip=skip)
        total = len(subs)
        has_more = len(subs) >= top
        client.close()
        return {
            "submissions": subs,
            "count": total,
            "skip": skip,
            "has_more": has_more,
            "source": "odk",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forms/{form_id}/all")
async def get_all_submissions(form_id: str, project_id: int = Query(...)):
    """Obtiene TODAS las submissions.
    
    Primero intenta del caché ETL (homologado). Si no hay, cae a ODK Central.
    """
    try:
        # Intentar desde caché ETL
        subs, fields = get_homologated_submissions(project_id, form_id)
        if subs:
            return {
                "submissions": subs,
                "count": len(subs),
                "source": "cache",
                "fields": fields,
            }

        # Fallback a ODK Central
        client = _get_client()
        subs = client.get_all_submissions(project_id, form_id)
        client.close()
        return {"submissions": subs, "count": len(subs), "source": "odk"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
