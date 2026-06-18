"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { fetchApi } from "@/lib/api";
import type { ProjectSummary } from "@/types/summary";
import {
  FileText,
  Calendar,
  MapPin,
  BarChart3,
  User,
  Activity,
  Timer,
  Layers,
  ClipboardList,
} from "lucide-react";

interface Props {
  projectId: number;
  projectName: string;
  projectDescription?: string;
}

export function ProjectSummarySection({
  projectId,
  projectName,
  projectDescription,
}: Props) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchApi<ProjectSummary>(`/projects/${projectId}/summary`)
      .then((res) => {
        if (res.error) {
          setError(res.error);
        } else if (res.data) {
          setSummary(res.data);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Error al cargar resumen");
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive p-4 bg-destructive/10 rounded-lg">
        {error}
      </div>
    );
  }

  if (!summary) return null;

  const { project, ubicacion, envios_rangos } = summary;

  const estadoColor =
    project.estado === "implementado"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : project.estado === "en pausa"
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";

  const tieneUbicacion = ubicacion.estado || ubicacion.municipio || ubicacion.parroquia || ubicacion.sector_comunidad;

  return (
    <Card className="border-t-4 border-t-[#00B4D8]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {projectName}
              <Badge className={estadoColor} variant="outline">
                {project.estado}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {projectDescription || "Sin descripción"}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            ID #{projectId}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* KPIs rápidos */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div className="flex items-center gap-2 text-sm bg-muted/50 p-3 rounded-lg">
            <ClipboardList className="h-4 w-4 text-[#00B4D8]" />
            <span className="text-muted-foreground">Preguntas:</span>
            <span className="font-semibold">{project.num_preguntas}</span>
          </div>
          <div className="flex items-center gap-2 text-sm bg-muted/50 p-3 rounded-lg">
            <FileText className="h-4 w-4 text-[#00B4D8]" />
            <span className="text-muted-foreground">Registros:</span>
            <span className="font-semibold">{project.total_submissions}</span>
          </div>
          <div className="flex items-center gap-2 text-sm bg-muted/50 p-3 rounded-lg">
            <User className="h-4 w-4 text-[#00B4D8]" />
            <span className="text-muted-foreground">Propietario:</span>
            <span className="font-semibold truncate max-w-[120px]">
              {project.propietario}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm bg-muted/50 p-3 rounded-lg">
            <Timer className="h-4 w-4 text-[#00B4D8]" />
            <span className="text-muted-foreground">Último envío:</span>
            <span className="font-semibold">
              {project.last_submission || "N/A"}
            </span>
          </div>
        </div>

        {/* Grid principal: Info del proyecto + Ubicación */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Info del proyecto */}
          <div className="space-y-2 text-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Línea de tiempo
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Creado:</span>
              <span>{project.created_at || "N/A"}</span>
              <span className="text-muted-foreground">Última modificación:</span>
              <span>{project.updated_at || "N/A"}</span>
              <span className="text-muted-foreground">Última implementación:</span>
              <span>{project.last_implementation || "N/A"}</span>
              <span className="text-muted-foreground">Último envío:</span>
              <span>{project.last_submission || "N/A"}</span>
            </div>
          </div>

          {/* Ubicación */}
          <div className="space-y-2 text-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Ubicación
            </h4>
            {tieneUbicacion ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <span className="text-muted-foreground">Estado:</span>
                <span>{ubicacion.estado}</span>
                <span className="text-muted-foreground">Municipio:</span>
                <span>{ubicacion.municipio}</span>
                <span className="text-muted-foreground">Parroquia:</span>
                <span>{ubicacion.parroquia}</span>
                <span className="text-muted-foreground">Sector/Comunidad:</span>
                <span>{ubicacion.sector_comunidad}</span>
              </div>
            ) : (
              <p className="text-muted-foreground italic">
                Sin datos de ubicación en este proyecto
              </p>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        {/* Envíos por rango */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-3">
            <BarChart3 className="h-3 w-3" /> Envíos por período
          </h4>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div className="flex flex-col items-center p-3 rounded-lg bg-gradient-to-br from-[#00B4D8]/10 to-[#0077B6]/5 border border-[#00B4D8]/20">
              <span className="text-2xl font-bold text-[#00B4D8]">
                {envios_rangos.ultimos_7_dias}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Últimos 7 días
              </span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-gradient-to-br from-[#48CAE4]/10 to-[#00B4D8]/5 border border-[#48CAE4]/20">
              <span className="text-2xl font-bold text-[#48CAE4]">
                {envios_rangos.ultimos_31_dias}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Últimos 31 días
              </span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-gradient-to-br from-[#90E0EF]/10 to-[#48CAE4]/5 border border-[#90E0EF]/20">
              <span className="text-2xl font-bold text-[#90E0EF]/80">
                {envios_rangos.ultimos_3_meses}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Últimos 3 meses
              </span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-gradient-to-br from-[#CAF0F8]/10 to-[#90E0EF]/5 border border-[#CAF0F8]/20">
              <span className="text-2xl font-bold text-[#CAF0F8]/70">
                {envios_rangos.ultimos_12_meses}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Últimos 12 meses
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
