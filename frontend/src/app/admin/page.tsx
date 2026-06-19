"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  RefreshCw,
  Trash2,
  Activity,
  Plus,
  Server,
  HardDrive,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Project {
  id: number;
  name: string;
}

interface FormSummary {
  xmlFormId: string;
  name: string;
}

interface CacheStats {
  forms_cached: number;
  total_submissions: number;
  total_repeat_records: number;
  etl_log_entries: number;
  db_size_bytes: number;
  db_size_human: string;
}

interface CachedForm {
  project_id: number;
  form_id: string;
  form_name: string;
  updated_at: string;
}

interface CacheInfo {
  cached: boolean;
  form_name?: string;
  submissions_count?: number;
  last_updated?: string;
  age_human?: string;
  expired?: boolean;
  ttl_seconds?: number;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [cachedForms, setCachedForms] = useState<CachedForm[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cacheResult, setCacheResult] = useState<string | null>(null);
  const [cacheInfos, setCacheInfos] = useState<Record<string, CacheInfo>>({});
  const [running, setRunning] = useState(false);

  // Selectores inteligentes
  const [projects, setProjects] = useState<Project[]>([]);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [loadingForms, setLoadingForms] = useState(false);

  // Redirigir si no es admin
  useEffect(() => {
    if (!loading && user && !user.is_admin) router.push("/");
  }, [user, loading, router]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("sigerfi_token");
      const headers = { Authorization: `Bearer ${token}` };

      const statsRes = await fetch(`${API_BASE}/cache/stats`, { headers });
      if (statsRes.ok) setStats(await statsRes.json());

      const res = await fetch(`${API_BASE}/etl/cached`);
      if (res.ok) {
        const data = await res.json();
        setCachedForms(data.forms || []);
      }
    } catch (e) {
      console.error("Error fetching admin data:", e);
    }
  };

  const fetchCacheInfo = async (projectId: number, formId: string) => {
    const key = `${projectId}/${formId}`;
    if (cacheInfos[key]) return;
    try {
      const token = localStorage.getItem("sigerfi_token");
      const res = await fetch(`${API_BASE}/cache/info?project_id=${projectId}&form_id=${formId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCacheInfos((prev) => ({ ...prev, [key]: data }));
      }
    } catch {}
  };

  // Cargar proyectos disponibles para los selectores
  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("sigerfi_token");
      const res = await fetch(`${API_BASE}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (e) {
      console.error("Error fetching projects:", e);
    }
  };

  // Cargar formularios cuando se selecciona un proyecto
  const fetchForms = async (projectId: number) => {
    setLoadingForms(true);
    setSelectedForm("");
    setForms([]);
    try {
      const token = localStorage.getItem("sigerfi_token");
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/forms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setForms(data.forms || []);
      }
    } catch (e) {
      console.error("Error fetching forms:", e);
    }
    setLoadingForms(false);
  };

  useEffect(() => {
    fetchData();
    fetchProjects();
  }, []);

  useEffect(() => {
    cachedForms.forEach((f) => fetchCacheInfo(f.project_id, f.form_id));
  }, [cachedForms]);

  // Cuando cambia el proyecto, cargar formularios
  useEffect(() => {
    if (selectedProject && selectedProject !== "__none__") {
      fetchForms(parseInt(selectedProject));
    } else {
      setForms([]);
      setSelectedForm("");
    }
  }, [selectedProject]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const token = localStorage.getItem("sigerfi_token");
      const res = await fetch(`${API_BASE}/cache/refresh-all?force=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      alert(`Refrescados: ${data.refreshed || 0} · Saltados: ${data.skipped || 0} · Errores: ${data.errors || 0}`);
      fetchData();
    } catch {
      alert("Error al refrescar");
    }
    setRefreshing(false);
  };

  const handleRefreshForm = async (projectId: number, formId: string) => {
    try {
      const token = localStorage.getItem("sigerfi_token");
      const res = await fetch(`${API_BASE}/cache/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, form_id: formId, force: true }),
      });
      const data = await res.json();
      alert(`${data.status}: ${data.rows || 0} filas procesadas`);
      fetchData();
    } catch {
      alert("Error al refrescar");
    }
  };

  const handleCleanExpired = async () => {
    setCleaning(true);
    try {
      const token = localStorage.getItem("sigerfi_token");
      const res = await fetch(`${API_BASE}/cache/clean-expired?max_age_hours=48`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      alert(`${data.deleted_forms || 0} formularios eliminados`);
      fetchData();
    } catch {
      alert("Error al limpiar");
    }
    setCleaning(false);
  };

  const handleCleanAll = async () => {
    if (!confirm("¿Estás seguro? Esto eliminará TODO el caché.")) return;
    try {
      const token = localStorage.getItem("sigerfi_token");
      await fetch(`${API_BASE}/cache/clean-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      alert("Caché limpiado completamente");
      fetchData();
    } catch {
      alert("Error al limpiar");
    }
  };

  const handleRunETL = async () => {
    if (!selectedProject || !selectedForm) return;
    setRunning(true);
    setCacheResult(null);
    try {
      const token = localStorage.getItem("sigerfi_token");
      const res = await fetch(`${API_BASE}/etl/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: parseInt(selectedProject),
          form_id: selectedForm,
          force: true,
        }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setCacheResult(`✅ ${data.rows} submissions, ${data.fields} campos`);
        fetchData();
      } else {
        setCacheResult(`❌ ${data.error || "Error desconocido"}`);
      }
    } catch {
      setCacheResult("❌ Error de conexión con el servidor");
    }
    setRunning(false);
  };

  // ── Estado para fuente de datos ──
  const [sourceInfo, setSourceInfo] = useState<null | {
    data_source: string;
    odk_url: string;
    kobo_url: string;
    odk_email: string;
    has_kobo_api_key: boolean;
  }>(null);
  const [testingSource, setTestingSource] = useState(false);
  const [sourceTestResult, setSourceTestResult] = useState<null | {
    status: string;
    projects_count: number;
    projects: {id: string; name: string}[];
  }>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/source/`)
      .then(r => r.json())
      .then(setSourceInfo)
      .catch(() => {});
  }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Verificando sesión...</div>;
  if (!user?.is_admin) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🔐 Administración</h1>
          <p className="text-muted-foreground text-sm">Gestión del caché ETL y datos homologados</p>
        </div>
        <Badge variant="outline" className="text-xs">🛡️ Admin</Badge>
      </div>

      {/* Fuente de datos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" /> Fuente de datos
          </CardTitle>
          <CardDescription>
            El dashboard puede leer datos desde ODK Central o KoBoToolbox
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sourceInfo && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={sourceInfo.data_source === "kobo" ? "default" : "secondary"}>
                  {sourceInfo.data_source === "kobo" ? "KoBoToolbox" : "ODK Central"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {sourceInfo.data_source === "kobo"
                    ? sourceInfo.kobo_url
                    : sourceInfo.odk_url}
                </span>
                {sourceInfo.data_source === "odk" && (
                  <span className="text-xs text-muted-foreground">
                    ({sourceInfo.odk_email})
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setTestingSource(true);
                    setSourceTestResult(null);
                    try {
                      const res = await fetch(`${API_BASE}/api/source/test`, {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                          source: "odk",
                          server_url: sourceInfo.odk_url,
                          email: sourceInfo.odk_email,
                        }),
                      });
                      const data = await res.json();
                      setSourceTestResult(data);
                    } catch (e: any) {
                      setSourceTestResult({status: "error", projects_count: 0, projects: []});
                    }
                    setTestingSource(false);
                  }}
                  disabled={testingSource}
                >
                  <RefreshCw className={"h-3 w-3 mr-1 " + (testingSource ? "animate-spin" : "")} />
                  Probar ODK Central
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setTestingSource(true);
                    setSourceTestResult(null);
                    try {
                      const res = await fetch(`${API_BASE}/api/source/test`, {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                          source: "kobo",
                          server_url: sourceInfo.kobo_url,
                        }),
                      });
                      const data = await res.json();
                      setSourceTestResult(data);
                    } catch (e: any) {
                      setSourceTestResult({status: "error", projects_count: 0, projects: []});
                    }
                    setTestingSource(false);
                  }}
                  disabled={testingSource || !sourceInfo.has_kobo_api_key}
                  title={!sourceInfo.has_kobo_api_key ? "Configurar KOBO_API_KEY en servidor" : ""}
                >
                  Probar KoBoToolbox
                </Button>
              </div>

              {sourceTestResult && (
                <div className={`text-sm p-3 rounded-lg border ${
                  sourceTestResult.status === "ok"
                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                }`}>
                  <p className="font-medium mb-1">
                    {sourceTestResult.status === "ok"
                      ? `✅ Conexión exitosa — ${sourceTestResult.projects_count} proyecto(s)`
                      : "❌ Error de conexión"}
                  </p>
                  {sourceTestResult.projects?.length > 0 && (
                    <ul className="list-disc list-inside text-xs text-muted-foreground">
                      {sourceTestResult.projects.slice(0, 5).map((p) => (
                        <li key={p.id}>{p.name} ({p.id})</li>
                      ))}
                      {sourceTestResult.projects.length > 5 && (
                        <li>...y {sourceTestResult.projects.length - 5} más</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" /> Formularios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.forms_cached ?? "—"}</p>
            <p className="text-xs text-muted-foreground">en caché</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" /> Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.total_submissions ?? "—"}</p>
            <p className="text-xs text-muted-foreground">homologadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> Repeats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.total_repeat_records ?? "—"}</p>
            <p className="text-xs text-muted-foreground">registros expandidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" /> Base de datos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.db_size_human ?? "—"}</p>
            <p className="text-xs text-muted-foreground">tamaño del caché</p>
          </CardContent>
        </Card>
      </div>

      {/* Cambiar fuente activa */}
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

      {/* Cachear nuevo formulario (selectores inteligentes) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" /> Cachear formulario en ETL
          </CardTitle>
          <CardDescription>
            Selecciona el proyecto y el formulario para procesarlo y guardarlo en el caché local
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[200px]">
              <Label>Proyecto</Label>
              <Select
                value={selectedProject}
                onValueChange={(v) => setSelectedProject(v !== "__none__" ? (v ?? "") : "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proyecto..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 && (
                    <SelectItem value="__none__" disabled>Cargando...</SelectItem>
                  )}
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      [{p.id}] {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 min-w-[250px]">
              <Label>Formulario</Label>
              <Select
                value={selectedForm}
                onValueChange={(v) => setSelectedForm(v !== "__none__" ? (v ?? "") : "")}
                disabled={!selectedProject || loadingForms}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingForms ? "Cargando..." :
                      !selectedProject ? "Primero selecciona un proyecto" :
                      "Seleccionar formulario..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {forms.length === 0 && (
                    <SelectItem value="__none__" disabled>
                      {loadingForms ? "Cargando formularios..." : "Sin formularios"}
                    </SelectItem>
                  )}
                  {forms.map((f) => (
                    <SelectItem key={f.xmlFormId} value={f.xmlFormId}>
                      {f.name || f.xmlFormId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleRunETL}
              disabled={!selectedProject || !selectedForm || running}
            >
              {running ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Procesando...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-1" /> Ejecutar ETL</>
              )}
            </Button>
          </div>
          {cacheResult && (
            <p className={`mt-3 text-sm ${cacheResult.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
              {cacheResult}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Formularios cacheados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">📦 Formularios cacheados</CardTitle>
            <CardDescription>Refresca los datos de un formulario desde ODK Central</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refrescar todos
          </Button>
        </CardHeader>
        <CardContent>
          {cachedForms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No hay formularios en caché. Usa los selectores de arriba para procesar uno.
            </p>
          ) : (
            <div className="space-y-2">
              {cachedForms.map((f) => {
                const key = `${f.project_id}/${f.form_id}`;
                const info = cacheInfos[key];
                const isExpired = info?.expired;
                return (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${isExpired ? "bg-red-500" : "bg-green-500"}`} />
                      <div>
                        <p className="text-sm font-medium">{f.form_name || f.form_id}</p>
                        <p className="text-xs text-muted-foreground">
                          Proyecto {f.project_id} · {info?.submissions_count ?? "?"} subs · actualizado {info?.age_human ?? "?"} atrás
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRefreshForm(f.project_id, f.form_id)}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Refrescar
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Limpieza */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trash2 className="h-5 w-5" /> Limpieza del caché
          </CardTitle>
          <CardDescription>
            Los formularios no actualizados en más de 48h se consideran expirados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleCleanExpired} disabled={cleaning}>
              <Trash2 className="h-4 w-4 mr-1" />
              Limpiar expirados (+48h)
            </Button>
            <Button variant="destructive" onClick={handleCleanAll}>
              <AlertTriangle className="h-4 w-4 mr-1" />
              Limpiar todo el caché
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
