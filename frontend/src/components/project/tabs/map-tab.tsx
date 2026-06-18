"use client";

import { useEffect, useState, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getForms, getAllSubmissions } from "@/lib/api";
import type { Submission, FormSummary } from "@/types";
import dynamic from "next/dynamic";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface MapTabProps {
  projectId: number;
}

export function MapTab({ projectId }: MapTabProps) {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [colorField, setColorField] = useState<string>("");

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

  // Detectar puntos con coordenadas
  const points = submissions
    .map((s) => {
      const lat = Number(s["_latitude"] || s["Latitude"] || 0);
      const lon = Number(s["_longitude"] || s["Longitude"] || 0);
      if (lat && lon && Math.abs(lat) < 90 && Math.abs(lon) < 180) {
        return {
          lat,
          lon,
          label: s["__id"]?.toString().substring(0, 12) || "",
          submission: s,
        };
      }
      return null;
    })
    .filter(Boolean) as {
    lat: number;
    lon: number;
    label: string;
    submission: Submission;
  }[];

  // Detectar campos categóricos para colorear
  const categoricalFields = points.length > 0
    ? Object.keys(points[0].submission).filter(
        (k) =>
          !k.startsWith("__") &&
          !k.includes("_latitude") &&
          !k.includes("_longitude") &&
          !k.includes("_altitude") &&
          typeof points[0].submission[k as keyof Submission] === "string"
      )
    : [];

  useEffect(() => {
    if (categoricalFields.length > 0 && !colorField) {
      setColorField(categoricalFields[0]);
    }
  }, [categoricalFields, colorField]);

  // Asignar colores por categoría
  const colorPalette = [
    "#e74c3c", "#3498db", "#2ecc71", "#f39c12",
    "#9b59b6", "#1abc9c", "#e67e22", "#34495e",
  ];
  const categories = new Map<string, string>();
  let colorIdx = 0;
  points.forEach((pt) => {
    const val = String(pt.submission[colorField as keyof Submission] ?? "Sin dato");
    if (!categories.has(val)) {
      categories.set(val, colorPalette[colorIdx % colorPalette.length]);
      colorIdx++;
    }
  });

  // Datos para scatter plot (como mapa proxy)
  const scatterData = points.map((pt) => ({
    name: pt.label,
    value: [pt.lon, pt.lat],
    category: String(pt.submission[colorField as keyof Submission] ?? "Sin dato"),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
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

        {categoricalFields.length > 0 && (
          <Select value={colorField} onValueChange={(v) => setColorField(v||"")}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Color por campo" />
            </SelectTrigger>
            <SelectContent>
              {categoricalFields.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Badge variant="secondary">{points.length} puntos</Badge>
      </div>

      {loading ? (
        <Skeleton className="h-96" />
      ) : selectedForm && points.length > 0 ? (
        <>
          {/* Mapa proxy con ECharts scatter (MapLibre se integrará después) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ubicaciones {colorField && `(coloreado por: ${colorField})`}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[500px]">
              <ReactECharts
                option={{
                  tooltip: {
                    formatter: (params: any) => {
                      const d = params.data;
                      return `<b>${d.name}</b><br/>Cat: ${d.category}<br/>Lon: ${d.value[0].toFixed(4)}<br/>Lat: ${d.value[1].toFixed(4)}`;
                    },
                  },
                  grid: { left: 20, right: 20, bottom: 20, top: 10 },
                  xAxis: {
                    type: "value",
                    splitLine: { show: false },
                    axisLabel: { show: false },
                  },
                  yAxis: {
                    type: "value",
                    splitLine: { show: false },
                    axisLabel: { show: false },
                  },
                  series: [
                    {
                      type: "scatter",
                      symbolSize: 12,
                      data: scatterData.map((d) => ({
                        ...d,
                        itemStyle: {
                          color: categories.get(d.category) || "#666",
                        },
                      })),
                      encode: { x: 0, y: 1 },
                    },
                  ],
                }}
                style={{ height: "100%" }}
              />
            </CardContent>
          </Card>

          {/* Leyenda de colores */}
          <div className="flex gap-4 flex-wrap">
            {Array.from(categories.entries()).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{cat}</span>
              </div>
            ))}
          </div>

          {/* Lista de puntos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lista de ubicaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {points.map((pt, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm py-1 border-b last:border-0"
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          categories.get(
                            String(
                              pt.submission[
                                colorField as keyof Submission
                              ] ?? "Sin dato"
                            )
                          ) || "#666",
                      }}
                    />
                    <span className="font-mono text-xs text-muted-foreground w-20 truncate">
                      {pt.label}
                    </span>
                    <span className="text-muted-foreground">
                      {pt.lat.toFixed(4)}, {pt.lon.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : selectedForm ? (
        <div className="text-center py-12 text-muted-foreground">
          No se encontraron coordenadas en este formulario
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          Selecciona un formulario para ver el mapa
        </div>
      )}
    </div>
  );
}
