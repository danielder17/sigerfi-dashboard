"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getForms, getAllSubmissions } from "@/lib/api";
import type { Submission, FormSummary } from "@/types";
import {
  Download,
  FileSpreadsheet,
  FileJson,
  FileText,
  Map,
  FileArchive,
  DownloadCloud,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";

interface DownloadsTabProps {
  projectId: number;
}

const FORMATS = [
  { id: "csv", label: "CSV", icon: FileText, desc: "Valores separados por comas" },
  { id: "xlsx", label: "Excel", icon: FileSpreadsheet, desc: "Libro de Excel (.xlsx)" },
  { id: "json", label: "JSON", icon: FileJson, desc: "Formato JSON completo" },
  { id: "geojson", label: "GeoJSON", icon: Map, desc: "GeoJSON con geometrías" },
  { id: "shapefile", label: "Shapefile", icon: FileArchive, desc: "ZIP con SHP (puntos)" },
];

export function DownloadsTab({ projectId }: DownloadsTabProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string>("csv");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    getForms(projectId).then((res) => {
      if (res.forms) setForms(res.forms);
    });
  }, [projectId]);

  useEffect(() => {
    if (!selectedForm) return;
    setLoading(true);
    getAllSubmissions(projectId, selectedForm).then((res) => {
      if (res.submissions) setSubmissions(res.submissions);
      setLoading(false);
    });
  }, [projectId, selectedForm]);

  const handleDownload = async (formatId: string) => {
    setDownloading(formatId);
    const fmt = FORMATS.find((f) => f.id === formatId)!;

    let content = "";
    let mimeType = "text/plain";
    let filename = `${selectedForm}_export.${formatId}`;

    const allKeys = submissions.length > 0
      ? Object.keys(submissions[0]).filter((k) => !k.startsWith("@") && k !== "meta")
      : [];

    if (formatId === "csv") {
      const headers = allKeys.join(",");
      const rows = submissions.map((s) =>
        allKeys.map((k) => `"${String(s[k as keyof Submission] ?? "").replace(/"/g, '""')}"`).join(",")
      );
      content = [headers, ...rows].join("\n");
      mimeType = "text/csv";
      filename = `${selectedForm}_export.csv`;
    } else if (formatId === "json") {
      content = JSON.stringify(submissions, null, 2);
      mimeType = "application/json";
      filename = `${selectedForm}_export.json`;
    } else {
      content = JSON.stringify(submissions, null, 2);
      mimeType = "application/json";
      filename = `${selectedForm}_export.json`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setTimeout(() => setDownloading(null), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Toggle colapsar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Descargas</h3>
          {selectedForm && <Badge variant="outline" className="text-xs font-normal">{submissions.length} registros</Badge>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="gap-1 h-7 text-xs text-muted-foreground"
        >
          {collapsed ? <><Eye className="h-3.5 w-3.5" /> Mostrar</> : <><EyeOff className="h-3.5 w-3.5" /> Ocultar</>}
        </Button>
      </div>

      <div style={{ display: collapsed ? 'none' : undefined }}>
        <Select value={selectedForm} onValueChange={(v) => setSelectedForm(v||"")}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Seleccionar formulario" />
          </SelectTrigger>
          <SelectContent>
            {forms.map((f) => (
              <SelectItem key={f.xmlFormId} value={f.xmlFormId}>
                {f.name || f.xmlFormId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {loading ? (
          <Skeleton className="h-64" />
        ) : selectedForm ? (
          <>
            <div className="text-sm text-muted-foreground mb-4">
              {submissions.length} registros disponibles para exportar
            </div>

            {submissions.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {FORMATS.map((fmt) => {
                  const Icon = fmt.icon;
                  const isDownloading = downloading === fmt.id;
                  return (
                    <Card
                      key={fmt.id}
                      className={`cursor-pointer transition-all hover:border-primary ${
                        selectedFormat === fmt.id ? "border-primary ring-1 ring-primary" : ""
                      }`}
                      onClick={() => setSelectedFormat(fmt.id)}
                    >
                      <CardContent className="p-4 flex items-start gap-3">
                        <Icon className="h-8 w-8 text-muted-foreground shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{fmt.label}</div>
                          <div className="text-xs text-muted-foreground">{fmt.desc}</div>
                        </div>
                        {selectedFormat === fmt.id && (
                          <Check className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">Sin datos para exportar</div>
            )}

            {submissions.length > 0 && (
              <Button size="lg" className="mt-4" onClick={() => handleDownload(selectedFormat)} disabled={downloading !== null}>
                {downloading ? (
                  <>Descargando...</>
                ) : (
                  <><DownloadCloud className="mr-2 h-5 w-5" /> Descargar como {FORMATS.find((f) => f.id === selectedFormat)?.label}</>
                )}
              </Button>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Selecciona un formulario para ver las opciones de descarga
          </div>
        )}
      </div>
    </div>
  );
}
