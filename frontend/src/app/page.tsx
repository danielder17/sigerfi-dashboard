"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjects } from "@/lib/api";
import { getStats } from "@/lib/stats";
import { ChartsSection } from "@/components/charts-section";
import type { Project } from "@/types";
import type { Stats } from "@/types/stats";
import {
  FolderKanban,
  FileText,
  Upload,
  Users,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const [projects, setProjects] = useState<
    (Project & { formsCount: number; submissionsCount: number })[]
  >([]);
  const [stats, setStats] = useState<Stats | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [pRes, sRes] = await Promise.all([
          getProjects(),
          getStats(),
        ]);
        if (pRes.error) {
          setError(pRes.error);
          setLoading(false);
          return;
        }
        if (sRes.stats) setStats(sRes.stats);

        const withStats = pRes.projects!.map((p) => {
          const pStats = sRes.stats?.submissions_por_proyecto.find(
            (sp) => sp.project_id === p.id
          );
          const formCount =
            sRes.stats?.submissions_por_formulario.filter(
              (sf) => sf.project_id === p.id
            ).length || 0;
          return {
            ...p,
            formsCount: formCount,
            submissionsCount: pStats?.count || 0,
          };
        });
        setProjects(withStats);
      } catch (e: any) {
        setError(e.message || "Error de conexión");
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Error de conexión</h2>
        <p className="text-muted-foreground text-sm max-w-md text-center">
          {error}
        </p>
        <Badge variant="outline" className="text-destructive">
          Verifica que el backend esté corriendo en puerto 8010
        </Badge>
      </div>
    );
  }

  const totalForms = projects.reduce((s, p) => s + p.formsCount, 0);
  const totalSubmissions = projects.reduce((s, p) => s + p.submissionsCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel de Control</h1>
        <p className="text-muted-foreground text-sm">
          Sistema de Encuestas Georreferenciadas RFI
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-[#00B4D8]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Proyectos</CardTitle>
            <FolderKanban className="h-4 w-4 text-[#00B4D8]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{projects.length}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#10b981]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Formularios</CardTitle>
            <FileText className="h-4 w-4 text-[#10b981]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalForms}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#f59e0b]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Registros</CardTitle>
            <Upload className="h-4 w-4 text-[#f59e0b]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSubmissions}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#8b5cf6]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Estado</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-[#8b5cf6]" />
          </CardHeader>
          <CardContent>
            <Badge className="bg-green-600 hover:bg-green-700">Conectado</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <ChartsSection stats={stats} loading={loading} />

      {/* Lista de proyectos */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          Proyectos
          <Badge variant="secondary">{projects.length}</Badge>
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:bg-accent/50 transition-all cursor-pointer hover:shadow-md group">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="text-muted-foreground text-xs font-mono">
                      [{p.id}]
                    </span>
                    {p.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {p.formsCount} formularios
                    </span>
                    <span className="flex items-center gap-1">
                      <Upload className="h-3.5 w-3.5" />
                      {p.submissionsCount} registros
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
