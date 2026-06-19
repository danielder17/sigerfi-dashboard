"""
DataSourceAdapter: Capa de abstracción para fuentes de datos ODK/KoBo.
Permite que el pipeline ETL funcione con cualquier plataforma XLSForm.
"""
from abc import ABC, abstractmethod
from typing import Optional


class DataSourceAdapter(ABC):
    """
    Interfaz común para adaptadores de fuente de datos.
    Cada plataforma (ODK Central, KoBoToolbox, etc.) implementa esta interfaz.
    """

    @abstractmethod
    def login(self, email: str = "", password: str = "", api_key: str = "") -> str:
        """
        Autentica contra la fuente de datos.
        Returns: token de acceso (string).
        """
        ...

    @abstractmethod
    def get_projects(self) -> list[dict]:
        """
        Obtiene la lista de proyectos accesibles.
        Returns: [{id, name, ...}]
        """
        ...

    @abstractmethod
    def get_forms(self, project_id: str) -> list[dict]:
        """
        Obtiene los formularios de un proyecto.
        Args:
            project_id: ID del proyecto (puede ser int o string UID)
        Returns: [{xmlFormId, name, ...}]
        """
        ...

    @abstractmethod
    def get_schema_xml(self, project_id: str, form_id: str) -> str:
        """
        Obtiene el XML del formulario (para extraer labels y estructura).
        Returns: string XML
        """
        ...

    @abstractmethod
    def get_submissions(
        self,
        project_id: str,
        form_id: str,
        top: int = 10000
    ) -> list[dict]:
        """
        Obtiene todas las submissions de un formulario.
        Los datos deben venir en formato normalizado:
        - Repeats como arrays embebidos (clave: nombre_del_repeat, valor: [{...}])
        - select values como strings (índices 1-based o labels)
        - Metadatos: instanceId, createdAt, submitterId
        Returns: [{...}, ...]
        """
        ...

    @abstractmethod
    def get_attachment_url(
        self,
        project_id: str,
        form_id: str,
        instance_id: str,
        filename: str
    ) -> str:
        """
        Construye la URL para descargar un adjunto multimedia.
        Returns: URL absoluta (con credenciales si es necesario)
        """
        ...

    @abstractmethod
    def get_server_url(self) -> str:
        """Retorna la URL base del servidor."""
        ...

    def get_id_type(self) -> str:
        """
        Retorna el tipo de ID que usa la fuente.
        Returns: "int" | "uid"
        """
        return "int"
