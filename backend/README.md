# Backend SIGERFI Dashboard v2

FastAPI con ODK Central proxy.

## Estructura

```
backend/
├── main.py          # App FastAPI + CORS
├── config.py        # Config (URL ODK, defaults)
├── database.py      # SQLAlchemy setup
├── models.py        # Modelos BD
├── odk_client.py    # Cliente ODK Central (reutiliza lógica v1)
├── routes/
│   ├── __init__.py
│   ├── auth.py
│   ├── projects.py
│   ├── forms.py
│   └── submissions.py
└── services/
    ├── sync.py      # Sincronización de datos
    ├── schema.py    # Parseo de esquema del formulario
    └── transform.py # Transformación de tipos
```
