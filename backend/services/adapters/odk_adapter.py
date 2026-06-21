"""
ODKCentralAdapter: Adaptador para ODK Central vía API REST y OData.
"""
import json
import ssl
import urllib.request
from typing import Optional

from . import DataSourceAdapter


# Contexto SSL tolerante (para servidores self-signed)
_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE


class ODKCentralAdapter(DataSourceAdapter):
    """
    Adaptador para ODK Central.
    Usa la API REST (v1) para formularios y OData 4.0 para submissions.
    """

    def __init__(self, server_url: str):
        self._url = server_url.rstrip("/")
        self._token: Optional[str] = None

    def login(self, email: str = "", password: str = "", api_key: str = "") -> str:
        """Autentica contra ODK Central usando email+password."""
        try:
            req = urllib.request.Request(
                f"{self._url}/v1/sessions",
                data=json.dumps({"email": email, "password": password}).encode(),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, context=_ctx, timeout=30) as r:
                data = json.loads(r.read().decode())
                self._token = data["token"]
                return self._token
        except urllib.error.HTTPError as e:
            raise Exception(f"ODK login failed: {e.code} {e.read().decode()[:200]}")

    def _get(self, path: str, accept_json: bool = True) -> dict | list | str:
        """GET a ODK Central con autenticación."""
        url = f"{self._url}{path}"
        headers = {"Authorization": f"Bearer {self._token}"}
        if accept_json:
            headers["Accept"] = "application/json"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_ctx, timeout=30) as r:
            body = r.read().decode("utf-8")
            if accept_json:
                return json.loads(body)
            return body

    def get_projects(self) -> list[dict]:
        return self._get("/v1/projects")

    def get_forms(self, project_id: str) -> list[dict]:
        return self._get(f"/v1/projects/{project_id}/forms")

    def get_schema_xml(self, project_id: str, form_id: str) -> str:
        return self._get(f"/v1/projects/{project_id}/forms/{form_id}.xml", accept_json=False)

    def get_form_xml(self, project_id: str, form_id: str) -> str:
        return self.get_schema_xml(str(project_id), str(form_id))

    def get_submissions(
        self,
        project_id: str,
        form_id: str,
        top: int = 10000
    ) -> list[dict]:
        """Obtiene submissions vía OData con $expand=* para repeats."""
        try:
            raw = self._get(
                f"/v1/projects/{project_id}/forms/{form_id}.svc/Submissions",
                params=f"$expand=*&$top={top}"
            )
            if isinstance(raw, dict):
                return raw.get("value", [])
            return raw
        except Exception:
            # Fallback sin expand
            raw = self._get(
                f"/v1/projects/{project_id}/forms/{form_id}.svc/Submissions",
                params=f"$top={top}"
            )
            if isinstance(raw, dict):
                return raw.get("value", [])
            return raw

    def _get(self, path: str, params: str = "", accept_json: bool = True) -> dict | list | str:
        """GET a ODK Central con autenticación y parámetros de query."""
        url = f"{self._url}{path}"
        if params:
            url = f"{url}?{params}"
        headers = {"Authorization": f"Bearer {self._token}"}
        if accept_json:
            headers["Accept"] = "application/json"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_ctx, timeout=30) as r:
            body = r.read().decode("utf-8")
            if accept_json:
                return json.loads(body)
            return body

    def get_attachment_url(
        self,
        project_id: str,
        form_id: str,
        instance_id: str,
        filename: str
    ) -> str:
        return (
            f"{self._url}/v1/projects/{project_id}/forms/{form_id}"
            f"/submissions/{instance_id}/attachments/{filename}"
        )

    def get_server_url(self) -> str:
        return self._url

    def get_id_type(self) -> str:
        return "int"
