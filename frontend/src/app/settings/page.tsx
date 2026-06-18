"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjects } from "@/lib/api";
import {
  Server,
  Globe,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Database,
  Activity,
} from "lucide-react";

export default function SettingsPage() {
  const [status, setStatus] = useState<{
    api: boolean;
    projects: number;
    error?: string;
  }>({ api: false, projects: 0 });
  const [loading, setLoading] = useState(true);

  const check = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8010/api/health");
      const health = await res.json();
      if (health.status === "ok") {
        const pRes = await getProjects();
        setStatus({
          api: true,
          projects: pRes.projects?.length || 0,
        });
      }
    } catch (e: any) {
      setStatus({ api: false, projects: 0, error: e.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    check();
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Estado del sistema y conexión ODK
        </p>
      </div>

      {/* Conexión */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Servidor ODK Central
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <code className="text-sm bg-muted px-2 py-1 rounded">
              https://odk-rfi.duckdns.org
            </code>
          </div>
          <div className="flex items-center gap-3">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Backend API local:
            </span>
            <code className="text-sm bg-muted px-2 py-1 rounded">
              http://localhost:8010
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Estado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Estado del sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">API Backend</span>
                {status.api ? (
                  <Badge className="bg-green-600 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Conectado
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" /> Desconectado
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Proyectos</span>
                <Badge variant="outline">{status.projects} proyectos</Badge>
              </div>
              {status.error && (
                <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                  {status.error}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={check}>
                <RefreshCw className="h-4 w-4 mr-1" /> Verificar conexión
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acerca de</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>SIGERFI Dashboard v2</strong> — Interfaz web moderna para
            visualizar datos de ODK Central.
          </p>
          <p>Stack: Next.js 16 + FastAPI + MapLibre GL + ECharts</p>
          <p className="text-xs">
            Conectado a: <code>odk-rfi.duckdns.org</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
