"""
Rutas del módulo de informes automáticos y módulos de análisis configurables.
"""

import traceback
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from services.report_engine import (
    parse_xml_schema,
    build_report,
    get_logical_groups,
)
from services.analysis_modules import (
    detect_active_modules,
    execute_module,
    build_module_report,
    groups_to_modules,
    load_modules,
)
from services.etl_service import get_homologated_submissions
from services.adapters.factory import get_configured_adapter

router = APIRouter()


from services.adapters.user_adapter import get_user_adapter


def _get_adapter(request: Request = None):
    """Returns ODK adapter usando el usuario autenticado si hay request, o fallback al bot."""
    if request is not None:
        return get_user_adapter(request)
    adapter = get_configured_adapter(auto_login=True)
    from odk_client import ODKClient
    from config import ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD
    client = ODKClient(ODK_DEFAULT_URL, ODK_DEFAULT_EMAIL, ODK_DEFAULT_PASSWORD)
    client.login()
    return client


class ReportRequest(BaseModel):
    metrics: list[str] = []
    dimensions: list[str] = []
    expand_repeat: Optional[str] = None
    geopoint_field: Optional[str] = None
    temporal_field: Optional[str] = None
    temporal_grouping: str = "month"
    filters: Optional[dict] = None
    filtered_ids: Optional[list[str]] = None
    logical_groups: Optional[list[str]] = None


# ───────────────────────────────
#  ENDPOINTS DE GRUPOS LÓGICOS
# ───────────────────────────────

# Touch: reload tras agregar close() + get_all_submissions a ODKCentralAdapter

@router.get("/forms/{form_id}/logical-groups")
async def get_logical_groups_endpoint(request: Request, form_id: str, project_id: int = Query(...)):
    """Devuelve los grupos lógicos de un formulario."""
    try:
        client = _get_adapter(request)
        xml = client.get_form_xml(project_id, form_id)
        if not xml:
            client.close()
            raise HTTPException(status_code=404, detail="XML del formulario no encontrado")
        fields = parse_xml_schema(xml)
        groups = get_logical_groups(fields)
        client.close()
        return {"form_id": form_id, "project_id": project_id, "groups": groups}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────────────
#  ENDPOINTS DE MÓDULOS DE ANÁLISIS
# ───────────────────────────────

@router.get("/forms/{form_id}/analysis-modules")
async def get_analysis_modules(request: Request, form_id: str, project_id: int = Query(...)):
    """
    Detecta qué módulos de análisis están activos para un formulario.
    Los módulos se activan según los campos disponibles.
    """
    try:
        client = _get_adapter(request)
        xml = client.get_form_xml(project_id, form_id)
        if not xml:
            client.close()
            raise HTTPException(status_code=404, detail="XML del formulario no encontrado")

        fields = parse_xml_schema(xml)
        submissions = client.get_all_submissions(project_id, form_id)

        modules = detect_active_modules(fields, submissions)

        # También incluir grupos lógicos convertidos a módulos (migración)
        logical_groups = get_logical_groups(fields)
        legacy_modules = groups_to_modules(logical_groups)

        client.close()

        return {
            "form_id": form_id,
            "project_id": project_id,
            "modules": modules,
            "legacy_modules": legacy_modules,
            "all_templates": load_modules(),
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forms/{form_id}/analysis-module-templates")
async def get_module_templates():
    """Devuelve todos los templates de módulos disponibles."""
    return {"modules": load_modules()}


@router.post("/forms/{form_id}/module-report")
async def generate_module_report(request: Request, form_id: str, req: ReportRequest):
    """
    Genera un informe usando el sistema de módulos de análisis.
    Si req.logical_groups contiene IDs de módulos, solo ejecuta esos.
    Si no, ejecuta todos los módulos activos.
    """
    try:
        client = _get_adapter(request)

        # Buscar formulario en proyectos
        projects = client.get_projects()
        project_id = None
        form_name = ""
        xml = None

        for p in projects:
            pid = p["id"]
            try:
                forms = client.get_forms(pid)
                for f in forms:
                    if f["xmlFormId"] == form_id:
                        project_id = pid
                        form_name = f.get("name", form_id)
                        xml = client.get_form_xml(pid, form_id)
                        break
            except Exception:
                continue
            if xml:
                break

        if not project_id or not xml:
            client.close()
            raise HTTPException(status_code=404, detail="Formulario no encontrado")

        fields = parse_xml_schema(xml)

        # Intentar obtener submissions desde caché ETL primero
        from_cache = False
        subs, _ = get_homologated_submissions(project_id, form_id)
        if subs:
            submissions = subs
            from_cache = True
        else:
            # Detectar si los módulos necesitan repeat groups
            needs_expand = bool(req.expand_repeat)
            expand_repeat_value = req.expand_repeat

            if not needs_expand and req.logical_groups:
                # Auto-detectar si algún módulo usa campos de repeat
                fields_repeat_map = {}
                for f in fields:
                    if f.get('is_repeat'):
                        for child in f.get('children', []):
                            fields_repeat_map[child] = f['name']

                all_active = detect_active_modules(fields, [])
                for mod in all_active:
                    if mod['module_id'] in req.logical_groups:
                        for q in mod.get('queries', []):
                            for rf in q.get('resolved_fields', []):
                                if rf in fields_repeat_map:
                                    expand_repeat_value = fields_repeat_map[rf]
                                    needs_expand = True
                                    break
                        if needs_expand:
                            break

            if needs_expand:
                try:
                    submissions = client.get_all_submissions(project_id, form_id, expand='*')
                except Exception:
                    submissions = client.get_all_submissions(project_id, form_id)
            else:
                submissions = client.get_all_submissions(project_id, form_id)

        # Aplicar filtro espacial
        if req.filtered_ids:
            filtered_set = set(req.filtered_ids)
            submissions = [s for s in submissions if s.get("__id") in filtered_set or s.get("__submission_id") in filtered_set]

        module_report = build_module_report(
            submissions=submissions,
            fields=fields,
            expand_repeat=req.expand_repeat,
            module_ids=req.logical_groups,
        )

        client.close()

        return {
            "form_id": form_id,
            "form_name": form_name,
            "project_id": project_id,
            "total_submissions": module_report["total_submissions"],
            "modules": module_report["modules"],
            "source": "cache" if from_cache else "odk",
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────────────
#  ENDPOINT DE INFORME LEGACY
# ───────────────────────────────

@router.post("/forms/{form_id}/report")
async def generate_report(request: Request, form_id: str, req: ReportRequest):
    """
    Genera un informe automático tradicional (legacy) a partir de un formulario
    y la configuración de métricas/dimensiones.
    """
    try:
        client = _get_adapter(request)

        projects = client.get_projects()
        project_id = None
        form_name = ""
        xml = None

        for p in projects:
            pid = p["id"]
            try:
                forms = client.get_forms(pid)
                for f in forms:
                    if f["xmlFormId"] == form_id:
                        project_id = pid
                        form_name = f.get("name", form_id)
                        xml = client.get_form_xml(pid, form_id)
                        break
            except Exception:
                continue
            if xml:
                break

        if not project_id or not xml:
            client.close()
            raise HTTPException(status_code=404, detail="Formulario no encontrado")

        # Intentar desde caché ETL primero
        from_cache = False
        subs, _ = get_homologated_submissions(project_id, form_id)
        if subs:
            # Verificar si el cache ETL guardó grupos anidados
            # Si tiene dicts como valores, necesitamos datos frescos del adapter
            sample = subs[0] if subs else {}
            has_nested = any(isinstance(v, dict) and k not in ('meta',) and not k.startswith('__') for k, v in sample.items())
            if has_nested:
                # Obtener datos frescos con grupos expandidos
                try:
                    submissions = client.get_all_submissions(project_id, form_id)
                except Exception:
                    submissions = subs
                    from_cache = True
            else:
                submissions = subs
                from_cache = True
        else:
            submissions = client.get_all_submissions(project_id, form_id)

        if req.filtered_ids:
            filtered_set = set(req.filtered_ids)
            submissions = [s for s in submissions if s.get("__id") in filtered_set or s.get("__submission_id") in filtered_set]

        fields = parse_xml_schema(xml)

        if req.logical_groups:
            all_groups = get_logical_groups(fields)
            selected_groups = [g for g in all_groups if g["name"] in req.logical_groups]
            if selected_groups:
                merged_metrics = []
                merged_dims = []
                merged_geo = None
                merged_temp = None
                merged_repeat = None
                for g in selected_groups:
                    for f in g["fields"]:
                        if f["type"] in ("integer", "decimal", "int") and not f.get("is_repeat"):
                            if f["name"] not in merged_metrics:
                                merged_metrics.append(f["name"])
                    # También agregar textos con opciones como métricas de frecuencia
                    for f in g["fields"]:
                        if f["type"] == "text" and f.get("options") and f["name"] not in merged_metrics:
                            if f["name"] not in merged_metrics:
                                merged_metrics.append(f["name"])
                    cat_found = None
                    for f in g["fields"]:
                        # Aceptar select_one O texto con opciones (DPT) como dimensión
                        if f["type"] in ("select_one",) and not f.get("is_repeat"):
                            cat_found = f["name"]
                            break
                        if f["type"] == "text" and f.get("options") and len(f.get("options", [])) > 1:
                            # Es un campo DPT o similar con opciones -> buena dimensión
                            if not cat_found:
                                cat_found = f["name"]
                    if cat_found and cat_found not in merged_dims:
                        merged_dims.append(cat_found)
                    if not merged_geo:
                        for f in g["fields"]:
                            if f["type"] in ("geopoint",):
                                merged_geo = f["name"]
                                break
                    if not merged_temp:
                        for f in g["fields"]:
                            if f["type"] in ("date", "dateTime"):
                                merged_temp = f["name"]
                                break
                    if not merged_repeat:
                        for f in g["fields"]:
                            if f.get("is_repeat"):
                                merged_repeat = f.get("path", "")
                                break
                if not req.metrics:
                    req.metrics = merged_metrics if merged_metrics else [g["fields"][0]["name"] for g in selected_groups[:1]]
                if not req.dimensions:
                    req.dimensions = merged_dims
                if not req.geopoint_field and merged_geo:
                    req.geopoint_field = merged_geo
                if not req.temporal_field and merged_temp:
                    req.temporal_field = merged_temp
                if not req.expand_repeat and merged_repeat:
                    req.expand_repeat = merged_repeat

        report = build_report(
            submissions=submissions,
            fields=fields,
            metrics=req.metrics,
            dimensions=req.dimensions,
            expand_repeat=req.expand_repeat,
            geopoint_field=req.geopoint_field,
            temporal_field=req.temporal_field,
            temporal_grouping=req.temporal_grouping,
        )

        client.close()

        return {
            "form_id": form_id,
            "form_name": form_name,
            "project_id": project_id,
            "fields": fields,
            "report": report,
            "source": "cache" if from_cache else "odk",
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
