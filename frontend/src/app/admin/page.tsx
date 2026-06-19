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
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

interface EtlLogEntry {
  id: number;
  project_id: number;
  form_id: string;
  action: string;
  rows: number;
  error: string | null;
  created_at: string;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [cachedForms, setCachedForms] = useState<CachedForm[]>([]);
  const [etlLog, setEtlLog] = useState<EtlLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const [newFormId, setNewFormId] = useState("");
  const [cacheResult, setCacheResult] = useState<string | null>(null);
  const [cacheInfos, setCacheInfos] = useState<Record<string, CacheInfo>>({});

  // Si no es admin, redirigir
  useEffect(() => {
    if (!loading && user && !user.is_admin) {
      router.push("/");
    }
  }, [user, loading, router]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("sigerfi_token");
      const headers = { Authorization: `Bearer ${token}` };

      // Stats
      const statsRes = await fetch(`${API_BASE}/cache/stats`, { headers });
      if (statsRes.ok) setStats(await statsRes.json());

      // Cached forms
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

  useEffect(() => {
    fetchData();
  }, []);

  // Cargar infos de caché cuando tengamos forms
  useEffect(() => {
    cachedForms.forEach((f) => fetchCacheInfo(f.project_id, f.form_id));
  }, [cachedForms]);

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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      alert("Error al limpiar");
    }
    setCleaning(false);
  };

  const handleCleanAll = async () => {
    if (!confirm("¿Estás seguro? Esto eliminará TODO el caché. Los datos se volverán a descargar de ODK Central cuando se necesiten.")) return;
    try {
      const token = localStorage.getItem("sigerfi_token");
      await fetch(`${API_BASE}/cache/clean-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      alert("Caché limpiado completamente");
      fetchData();
    } catch (e) {
      alert("Error al limpiar");
    }
  };

  const handleNewCache = async () => {
    if (!newProjectId || !newFormId) return;
    setCacheResult(null);
    try {
      const token = localStorage.getItem("sigerfi_token");
      const res = await fetch(`${API_BASE}/etl/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: parseInt(newProjectId), form_id: newFormId, force: true }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setCacheResult(`✅ ${data.rows} submissions, ${data.fields} campos`);
        fetchData();
      } else {
        setCacheResult(`❌ ${data.error || "Error"}`);
      }
    } catch (e) {
      setCacheResult("❌ Error de conexión");
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Verificando sesión...</div>;
  if (!user?.is_admin) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🔐 Administración</h1>
          <p className="text-muted-foreground text-sm">Gestión del caché ETL y datos homologados</p>
        </div>
        <Badge variant="outline" className="text-xs">
          🛡️ Admin
        </Badge>
      </div>

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

      {/* Formularios cacheados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">📦 Formularios cacheados</CardTitle>
            <CardDescription>Haz clic en Refrescar para actualizar los datos de un formulario desde ODK Central</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              Refrescar todos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cachedForms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No hay formularios en caché. Usa la sección "Cachear nuevo formulario" para empezar.</p>
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

      {/* Cachear nuevo formulario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" /> Cachear nuevo formulario
          </CardTitle>
          <CardDescription>
            Ingresa el ID del proyecto y el ID del formulario (xmlFormId) para cargarlo al caché ETL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="projectId">Proyecto ID</Label>
              <Input
                id="projectId"
                placeholder="Ej: 4"
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label htmlFor="formId">Formulario ID</Label>
              <Input
                id="formId"
                placeholder="Ej: Diagnostico_Comunitario_Integral"
                value={newFormId}
                onChange={(e) => setNewFormId(e.target.value)}
              />
            </div>
            <Button onClick={handleNewCache} disabled={!newProjectId || !newFormId}>
              Ejecutar ETL
            </Button>
          </div>
          {cacheResult && (
            <p className={`mt-3 text-sm ${cacheResult.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
              {cacheResult}
            </p>
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
