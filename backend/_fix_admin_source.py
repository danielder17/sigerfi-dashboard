import re

path = r"C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\frontend\src\app\admin\page.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Encontrar el cierre del Card de Fuente de datos
# Buscamos: </CardContent>\n\n      </Card>\n\n      {/* Cachear nuevo formulario
target = '        </CardContent>\n\n      </Card>\n\n      {/* Cachear nuevo formulario'
replacement = """        </CardContent>
      </Card>

      {/* Fuente de datos - acciones de activacion */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" /> Cambiar fuente activa
          </CardTitle>
          <CardDescription>
            Activa KoBoToolbox o resetea a la fuente configurada por entorno
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={async () => {
                const apiKey = prompt("API Key de KoBoToolbox:");
                const token = localStorage.getItem("sigerfi_token");
                if (!token || !apiKey) return;
                try {
                  const res = await fetch(API_BASE + "/api/source/activate", {
                    method: "POST",
                    headers: {"Content-Type": "application/json", Authorization: "Bearer " + token},
                    body: JSON.stringify({source: "kobo", server_url: sourceInfo?.kobo_url || "https://kf.kobotoolbox.org", api_key: apiKey}),
                  });
                  const data = await res.json();
                  alert(data.message || JSON.stringify(data));
                  const srcRes = await fetch(API_BASE + "/api/source/");
                  setSourceInfo(await srcRes.json());
                } catch (e) {
                  alert("Error: " + (e instanceof Error ? e.message : String(e)));
                }
              }}
            >
              <Server className="h-3 w-3 mr-1" />
              Activar KoBoToolbox
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const token = localStorage.getItem("sigerfi_token");
                if (!token) return;
                try {
                  const res = await fetch(API_BASE + "/api/source/reset", {
                    method: "POST",
                    headers: {Authorization: "Bearer " + token},
                  });
                  const data = await res.json();
                  alert(data.message || "OK");
                  const srcRes = await fetch(API_BASE + "/api/source/");
                  setSourceInfo(await srcRes.json());
                } catch (e) {
                  alert("Error: " + (e instanceof Error ? e.message : String(e)));
                }
              }}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Resetear a entorno
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cachear nuevo formulario"""

if target in content:
    content = content.replace(target, replacement)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("OK: seccion de activacion agregada")
else:
    print("ERROR: target no encontrado")
    # Debug: buscar cerca
    idx = content.find("Cachear nuevo formulario")
    if idx > 0:
        print(f"Cachear encontrado en pos {idx}, contexto:")
        print(repr(content[idx-100:idx+50]))
