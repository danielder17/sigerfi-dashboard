"""
Cliente ODK Central.
Usa urllib en vez de httpx para evitar bugs en Windows con SSL.
"""

import urllib.request
import urllib.error
import json
import ssl
from typing import Optional


class ODKClient:
    """Cliente HTTP para ODK Central API usando urllib."""

    def __init__(self, url: str = None, email: str = None, password: str = None):
        self.base_url = (url or "https://odk-rfi.duckdns.org").rstrip("/")
        self.email = email
        self.password = password
        self.token: Optional[str] = None
        # Contexto SSL que no verifica
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        self._ssl_ctx = ctx

    def _request(self, method: str, path: str, data: dict = None) -> dict:
        """Ejecuta request HTTP y retorna JSON."""
        url = f"{self.base_url}{path}"
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)

        try:
            resp = urllib.request.urlopen(req, context=self._ssl_ctx, timeout=30)
            text = resp.read().decode()
            if text.strip():
                return json.loads(text)
            return []
        except urllib.error.HTTPError as e:
            if e.code == 403:
                return []
            text = e.read().decode()[:300]
            raise Exception(f"HTTP {e.code}: {text}")
        except Exception as e:
            raise Exception(f"Error en request: {e}")

    def _request_raw(self, method: str, path: str) -> Optional[str]:
        """Ejecuta request y retorna texto crudo (para XML)."""
        url = f"{self.base_url}{path}"
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        req = urllib.request.Request(url, headers=headers, method=method)
        try:
            resp = urllib.request.urlopen(req, context=self._ssl_ctx, timeout=30)
            return resp.read().decode()
        except Exception:
            return None

    def login(self, email: str = None, password: str = None) -> str:
        """Autentica contra ODK Central."""
        e = email or self.email
        p = password or self.password
        if not e or not p:
            raise ValueError("Email y password requeridos")

        data = {"email": e, "password": p}
        req = urllib.request.Request(
            f"{self.base_url}/v1/sessions",
            data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, context=self._ssl_ctx, timeout=30)
            result = json.loads(resp.read().decode())
            self.token = result.get("token")
            self.email = e
            return self.token
        except urllib.error.HTTPError as e:
            text = e.read().decode()[:300]
            raise Exception(f"Error de autenticacion ({e.code}): {text}")

    def get_projects(self) -> list:
        """Lista proyectos."""
        return self._request("GET", "/v1/projects")

    def get_forms(self, project_id: int) -> list:
        """Lista formularios de un proyecto."""
        return self._request("GET", f"/v1/projects/{project_id}/forms")

    def get_submissions_odata(self, project_id: int, form_id: str, top: int = 100, skip: int = 0, expand: Optional[str] = None) -> list:
        """Descarga submissions vía OData. Opcionalmente expande repeat groups."""
        path = f"/v1/projects/{project_id}/forms/{form_id}.svc/Submissions?$top={top}&$skip={skip}&$count=true"
        if expand:
            path += f"&$expand={expand}"
        url = f"{self.base_url}{path}"
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            resp = urllib.request.urlopen(req, context=self._ssl_ctx, timeout=60)
            data = json.loads(resp.read().decode())
            return data.get("value", [])
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            raise Exception(f"Error OData ({e.code}): {e.read().decode()[:200]}")
        except Exception as e:
            raise Exception(f"Error en OData: {e}")

    def get_all_submissions(self, project_id: int, form_id: str, expand: Optional[str] = None) -> list:
        """Descarga todas las submissions (paginación automática)."""
        all_subs = []
        skip = 0
        batch_size = 200
        while True:
            batch = self.get_submissions_odata(project_id, form_id, top=batch_size, skip=skip, expand=expand)
            if not batch:
                break
            all_subs.extend(batch)
            if len(batch) < batch_size:
                break
            skip += batch_size
        return all_subs

    def get_form_xml(self, project_id: int, form_id: str) -> Optional[str]:
        return self._request_raw("GET", f"/v1/projects/{project_id}/forms/{form_id}.xml")

    def get_form_schema(self, project_id: int, form_id: str) -> Optional[str]:
        path = f"/v1/projects/{project_id}/forms/{form_id}.svc/$metadata"
        return self._request_raw("GET", path)

    def close(self):
        pass
