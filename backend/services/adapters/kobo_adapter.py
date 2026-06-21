"""
KoboAPIAdapter: Adaptador para KoBoToolbox vía API v2.
KoBo no tiene OData; usa REST con asset UIDs y formato tabular para repeats.
"""
import json
import ssl
import re
import urllib.request
from collections import defaultdict
from typing import Optional

from . import DataSourceAdapter


_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE

# Mapeo de tipos XLSForm de KoBo a nuestro sistema interno
KOBO_TYPE_MAP = {
    "range": "decimal",
    "select_one_from_file": "select_one",
    "select_multiple_from_file": "select_multiple",
}


class KoboAPIAdapter(DataSourceAdapter):
    """
    Adaptador para KoBoToolbox.
    Usa la API v2 REST de KoBo (assets, data endpoints).
    Los repeats se devuelven en formato tabular y se reagrupan a arrays.
    """

    def __init__(self, server_url: str, proxy_url: str = ""):
        self._url = server_url.rstrip("/")
        self._proxy = proxy_url.rstrip("/") if proxy_url else ""
        self._token: Optional[str] = None  # API Key
        self._server_key = "kf" if "kf.kobotoolbox" in server_url else "eu"

    def login(self, email: str = "", password: str = "", api_key: str = "") -> str:
        """
        Autentica contra KoBoToolbox usando API Key.
        KoBo no usa email+password vía API, sino API Key desde el perfil.
        """
        if not api_key:
            raise Exception("KoBo requiere API Key (no email/password)")
        self._token = api_key
        # Verificar que el token es válido
        try:
            self._get("/api/v2/assets/")
            return self._token
        except Exception as e:
            raise Exception(f"KoBo API Key inválida: {e}")

    def _headers(self) -> dict:
        # Al usar proxy, la API key va en la URL, no en headers.
        # Sin proxy, KoBo acepta ApiKey y Bearer.
        if self._proxy:
            return {}
        return {"Authorization": f"ApiKey {self._token}"}

    def _make_url(self, path: str) -> str:
        """Construye URL: directa a KoBo o vía proxy."""
        if self._proxy:
            # Proxy de Cloudflare: pasar server_key y api_key como query params
            sep = "&" if "?" in path else "?"
            return f"{self._proxy}{path}{sep}server={self._server_key}&api_key={self._token}"
        return f"{self._url}{path}"

    def _get(self, path: str) -> dict | list:
        """GET a KoBoToolbox API v2."""
        url = self._make_url(path)
        headers = self._headers()
        if self._proxy:
            headers["User-Agent"] = "Mozilla/5.0 (compatible; SIGERFI/1.0)"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_ctx, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))

    def _post(self, path: str, data: dict = None) -> dict | list:
        """POST a KoBoToolbox API v2."""
        url = self._make_url(path)
        headers = self._headers()
        if self._proxy:
            headers["User-Agent"] = "Mozilla/5.0 (compatible; SIGERFI/1.0)"
        if data:
            headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=headers)
        with urllib.request.urlopen(req, context=_ctx, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))

    def get_projects(self) -> list[dict]:
        """
        Obtiene proyectos desde KoBo — devuelve TODOS los forms como proyectos.
        Cada form es un "proyecto" individual para compatibilidad con el frontend.
        """
        try:
            result = self._get("/api/v2/assets/?format=json")
            results = result.get("results", [])
            seen_fids = set()
            projects = []
            for asset in results:
                fid = asset.get("uid", "")
                if fid in seen_fids:
                    continue
                seen_fids.add(fid)
                name = asset.get("name", "").strip()
                if not name or not fid:
                    continue
                if asset.get("deleted"):
                    continue
                # Cada form es un proyecto
                projects.append({
                    "id": fid,
                    "uid": fid,
                    "name": name,
                    "owner": asset.get("owner", ""),
                    "owner_url": asset.get("owner", "") if isinstance(asset.get("owner"), str) else "",
                    "has_deployment": asset.get("has_deployment", False),
                    "deployment_status": asset.get("deployment_status", ""),
                    "date_created": asset.get("date_created", ""),
                    "date_modified": asset.get("date_modified", ""),
                    "version_id": asset.get("version_id", ""),
                })
            return projects
        except Exception as e:
            raise Exception(f"KoBo get_projects error: {e}")

    def get_forms(self, project_id: str) -> list[dict]:
        """
        Obtiene formularios desde KoBo.
        En KoBo, cada 'asset' es un formulario.
        """
        try:
            # Si project_id es una URL de owner, filtramos por owner
            result = self._get(f"/api/v2/assets/?owner={project_id}")
            results = result.get("results", [])
            forms = []
            for asset in results:
                forms.append({
                    "xmlFormId": asset.get("uid", ""),
                    "name": asset.get("name", ""),
                    "uid": asset.get("uid", ""),
                    "owner": asset.get("owner", ""),
                    "url": asset.get("url", ""),
                    "date_created": asset.get("date_created", ""),
                    "date_modified": asset.get("date_modified", ""),
                    "has_deployment": asset.get("has_deployment", False),
                    "deployment_status": asset.get("deployment_status", ""),
                    "version_id": asset.get("version_id", ""),
                })
            return forms
        except Exception as e:
            raise Exception(f"KoBo get_forms error: {e}")

    def get_schema_xml(self, project_id: str, form_id: str) -> str:
        """
        Obtiene el XML del formulario desde KoBo.
        KoBo devuelve el XForm (XML) como parte del asset detail.
        """
        try:
            asset = self._get(f"/api/v2/assets/{form_id}/")
            xform = asset.get("xml", "")
            if not xform:
                raise Exception("Asset no contiene XML")
            return xform
        except Exception as e:
            raise Exception(f"KoBo get_schema_xml error: {e}")

    def _get_submissions_json(self, form_uid: str) -> list[dict]:
        """
        Obtiene submissions en formato JSON raw desde KoBo.
        Retorna datos con estructura anidada (no tabular).
        """
        # KoBo tiene dos endpoints de datos:
        # /api/v2/assets/{uid}/data.json - datos en bruto
        # /api/v2/assets/{uid}/data/{id}.json - submission individual
        data = self._get(f"/api/v2/assets/{form_uid}/data.json?format=json")
        if isinstance(data, dict) and "results" in data:
            return data["results"]
        if isinstance(data, list):
            return data
        return []

    def get_submissions(
        self,
        project_id: str,
        form_id: str,
        top: int = 10000
    ) -> list[dict]:
        """
        Obtiene submissions y las normaliza al formato interno.
        KoBo devuelve datos tabulares con `/` para repeats anidados.
        Este método reagrupa los tabs en arrays embebidos.
        """
        raw_subs = self._get_submissions_json(form_id)

        if not raw_subs:
            return []

        # Detectar estructura: si tiene campos con "/", está en formato tabular
        has_tabular = any("/" in key for sub in raw_subs for key in sub.keys())

        if not has_tabular:
            # Ya está en formato anidado (arrays embebidos)
            return self._normalize_submissions(raw_subs)

        # Reagrupar formato tabular a arrays embebidos
        return self._tabular_to_nested(raw_subs)

    def _normalize_submissions(self, submissions: list[dict]) -> list[dict]:
        """Normaliza nombres de campos: asigna __system delante de campos ocultos."""
        normalized = []
        for sub in submissions:
            ns = {}
            for k, v in sub.items():
                if k.startswith("_"):
                    ns[f"__system/{k.lstrip('_')}"] = v
                else:
                    ns[k] = v
            # Agregar instanceId si no existe
            if "instanceId" not in ns and "_uuid" in ns:
                ns["instanceId"] = ns["_uuid"]
            normalized.append(ns)
        return normalized

    def _tabular_to_nested(self, submissions: list[dict]) -> list[dict]:
        """
        Convierte formato tabular de KoBo a arrays embebidos.
        
        Ejemplo entrada tabular:
            {"nombre": "Juan", "integrantes/nombre": "María", 
             "integrantes/edad": 30, "integrantes/__index": 1,
             "integrantes_1/nombre": "José", "integrantes_1/edad": 45,
             "integrantes_1/__index": 2}
        
        Ejemplo salida:
            {"nombre": "Juan", 
             "integrantes": [{"nombre": "María", "edad": 30, "__index": 1},
                            {"nombre": "José", "edad": 45, "__index": 2}]}
        """
        if not submissions:
            return []

        grouped = defaultdict(list)

        # Paso 1: identificar los prefijos de repeat groups
        prefix_pattern = re.compile(r'^(.+?)(?:_(\d+))?(/.+)$')
        repeat_indexes = defaultdict(set)

        for sub in submissions:
            sub_id = self._sub_id(sub)
            for key in sub.keys():
                m = prefix_pattern.match(key)
                if m:
                    base = m.group(1)
                    idx_str = m.group(2)
                    idx = int(idx_str) if idx_str else 0
                    repeat_indexes[base].add(idx)

        # Paso 2: reagrupar
        result = []
        for sub in submissions:
            sub_id = self._sub_id(sub)
            # Detectar qué campos son repeat y cuáles son planos
            flat_fields = {}
            repeat_groups = defaultdict(lambda: defaultdict(dict))

            for key, val in sub.items():
                m = prefix_pattern.match(key)
                if m:
                    base = m.group(1)
                    idx_str = m.group(2)
                    field_path = m.group(3).lstrip("/")
                    # Buscar el nombre más limpio del repeat
                    idx = int(idx_str) if idx_str else 0
                    # Si hay solo un índice (0) usar el nombre como viene
                    repeat_groups[base][idx][field_path] = val
                else:
                    flat_fields[key] = val

            # Convertir repeat_groups a arrays
            for group_name, items in repeat_groups.items():
                max_idx = max(items.keys()) + 1
                result_group = []
                for i in range(max_idx):
                    item = items.get(i, {})
                    if item:
                        result_group.append(item)
                if result_group:
                    flat_fields[group_name] = result_group

            result.append(flat_fields)

        return self._normalize_submissions(result)

    def _sub_id(self, sub: dict) -> str:
        """Extrae ID de una submission."""
        return str(sub.get("_id", sub.get("instanceId", sub.get("__id", ""))))

    def get_attachment_url(
        self,
        project_id: str,
        form_id: str,
        instance_id: str,
        filename: str
    ) -> str:
        # KoBo sirve adjuntos en /media/{filename}
        return f"{self._url}/media/{filename}"

    def get_server_url(self) -> str:
        return self._url

    def get_id_type(self) -> str:
        return "uid"
