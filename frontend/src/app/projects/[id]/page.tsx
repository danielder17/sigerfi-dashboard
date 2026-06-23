"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getProjects, getForms } from "@/lib/api";
import { ProjectSummarySection } from "@/components/project-summary-section";
import type { Project, FormSummary, SpatialFilter } from "@/types";
import { Table, BarChart3, Image, Download, Map, Building2 } from "lucide-react";

// Lazy loading de cada tab - se cargan solo cuando se activan
const DataTab = dynamic(
  () => import("@/components/project/tabs/data-tab").then((m) => m.DataTab),
  { loading: () => <Skeleton className="h-80" /> }
);

const ReportTab = dynamic(
  () => import("@/components/project/tabs/new-report-tab").then((m) => m.NewReportTab),
  { loading: () => <Skeleton className="h-80" /> }
);

const GalleryTab = dynamic(
  () => import("@/components/project/tabs/gallery-tab").then((m) => m.GalleryTab),
  { loading: () => <Skeleton className="h-80" /> }
);

const DownloadsTab = dynamic(
  () => import("@/components/project/tabs/downloads-tab").then((m) => m.DownloadsTab),
  { loading: () => <Skeleton className="h-80" /> }
);

const MapLibreTab = dynamic(
  () => import("@/components/project/tabs/maplibre-tab").then((m) => m.MapLibreTab),
  { loading: () => <Skeleton className="h-80" />, ssr: false }
);

const Edificaciones3DTab = dynamic(
  () => import("@/components/project/tabs/edificaciones-3d-tab"),
  { loading: () => <Skeleton className="h-80" />, ssr: false }
);

const TABS = [
  { id: "data", label: "Datos", icon: Table },
  { id: "report", label: "Informe", icon: BarChart3 },
  { id: "gallery", label: "Galería", icon: Image },
  { id: "download", label: "Descargas", icon: Download },
  { id: "map", label: "Mapa", icon: Map },
  { id: "3d", label: "3D 🏗️", icon: Building2 },
];

export default function ProjectPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const [project, setProject] = useState<Project | null>(null);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("data");
  const [error, setError] = useState("");

  // Estado compartido del filtro espacial (desde el tab Mapa)
  const [spatialFilter, setSpatialFilter] = useState<SpatialFilter>({ type: "none" });
  const [filteredIds, setFilteredIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([getProjects(), getForms(projectId)])
      .then(([pRes, fRes]) => {
        if (pRes.projects) {
          const found = pRes.projects.find((x) => x.id === projectId);
          if (found) {
            setProject(found);
          } else {
            setError("Proyecto no encontrado");
          }
        }
        if (fRes.forms) setForms(fRes.forms);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Error al cargar proyecto");
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <h2 className="text-2xl font-semibold">
          {error || "Proyecto no encontrado"}
        </h2>
        <p className="text-sm">ID {projectId} no existe o sin acceso</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* HEADER con información del proyecto */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {forms.length} formulario(s)
            </p>
          </div>
          <Badge variant="outline">ID: {project.id}</Badge>
        </div>

        <ProjectSummarySection
          projectId={projectId}
          projectName={project.name}
          projectDescription={project.description}
        />

        <div className="mt-6 mb-2" />

        {/* Tabs tipo botones -> estilo referencia */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  active
                    ? "bg-[#00B4D8] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENIDO DE CADA TAB */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "data" && <DataTab projectId={projectId} spatialFilter={spatialFilter} filteredIds={filteredIds} />}
        {activeTab === "report" && <ReportTab projectId={projectId} spatialFilter={spatialFilter} filteredIds={filteredIds} />}
        {activeTab === "gallery" && <GalleryTab projectId={projectId} />}
        {activeTab === "download" && <DownloadsTab projectId={projectId} />}
        {activeTab === "map" && <MapLibreTab projectId={projectId} onSpatialFilterChange={setSpatialFilter} onFilteredIdsChange={setFilteredIds} />}
        {activeTab === "3d" && <Edificaciones3DTab projectId={projectId} />}
      </div>
    </div>
  );
}
