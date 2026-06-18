"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getForms, getAllSubmissions, fetchApi } from "@/lib/api";
import type { Submission, FormSummary, SpatialFilter, RectangleFilter, CircleFilter } from "@/types";
import { MapPin, Filter, Trash2, Crop, Circle, Eye, EyeOff, Map as MapIcon } from "lucide-react";

const MapLibreMap = dynamic(
  () => import("./maplibre-map").then((m) => m.MapLibreMap),
  { ssr: false, loading: () => <Skeleton className="h-[450px] w-full rounded-lg" /> }
);

interface MapLibreTabProps {
  projectId: number;
  onSpatialFilterChange?: (filter: SpatialFilter) => void;
  onFilteredIdsChange?: (ids: string[]) => void;
}

const COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#34495e", "#e91e63", "#00bcd4",
  "#ff6384", "#36a2eb", "#cc65ff", "#ffce56",
];

// ──────────────────────────────────────────────
//  PARSEO DE GEOPUNTOS
// ──────────────────────────────────────────────

interface GeoPoint {
  lat: number;
  lon: number;
}

function parseGeopoint(value: unknown): GeoPoint | null {
  if (!value) return null;

  // Caso 1: Objeto GeoJSON { type: "Point", coordinates: [lon, lat] }
  if (typeof value === "object" && !Array.isArray(value)) {
    const g = value as any;
    if (g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      return { lon: Number(g.coordinates[0]), lat: Number(g.coordinates[1]) };
    }
    // Objeto con lat/lon directos
    if (g.lat != null && g.lon != null) return { lat: Number(g.lat), lon: Number(g.lon) };
    if (g.latitude != null && g.longitude != null) return { lat: Number(g.latitude), lon: Number(g.longitude) };
  }

  // Caso 2: String "lat lon alt prec" (formato ODK)
  if (typeof value === "string") {
    const parts = value.trim().split(/\s+/);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
    }
  }

  // Caso 3: Array [lat, lon]
  if (Array.isArray(value) && value.length >= 2) {
    const lat = parseFloat(value[0]);
    const lon = parseFloat(value[1]);
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  }

  return null;
}

function detectAllGeoFields(subs: Submission[]): string[] {
  if (!subs.length) return [];
  const geo = new Set<string>();

  Object.keys(subs[0]).forEach((k) => {
    if (k.startsWith("@") || k === "meta" || k === "__id") return;
    const vals = subs.map((s) => s[k as keyof Submission]).filter(Boolean);
    const parsed = vals.map((v) => parseGeopoint(v)).filter(Boolean);
    if (parsed.length >= 1) geo.add(k);
  });

  return Array.from(geo);
}

function extractGeo(submission: Submission, field: string): GeoPoint | null {
  const v = submission[field as keyof Submission];
  return parseGeopoint(v);
}

// ──────────────────────────────────────────────
//  CLASIFICACIÓN DE CAMPOS
// ──────────────────────────────────────────────

function classifyFields(subs: Submission[]) {
  if (!subs.length) return { numeric: [] as string[], text: [] as string[] };
  const numeric: string[] = [];
  const text: string[] = [];
  Object.entries(subs[0]).forEach(([k, v]) => {
    if (k.startsWith("@") || k === "meta" || k === "__id") return;
    if (v && typeof v === "object" && !Array.isArray(v) && (v as any).type) return;
    const vals = subs.map((s) => s[k as keyof Submission]).filter((x) => x != null);
    if (vals.length && vals.every((x) => typeof x === "number")) numeric.push(k);
    else text.push(k);
  });
  return { numeric, text };
}

// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
//  FILTRO ESPACIAL
// ──────────────────────────────────────────────

type SpatialFilterType = "rectangle" | "circle" | "none";

function haversineKm(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applySpatialFilter(
  features: MapFeature[],
  filter: SpatialFilter
): MapFeature[] {
  if (filter.type === "none") return features;

  return features.filter((f) => {
    const pt: GeoPoint = { lat: f.coord[1], lon: f.coord[0] };

    if (filter.type === "rectangle") {
      const r = filter.rect;
      return (
        pt.lat >= r.minLat &&
        pt.lat <= r.maxLat &&
        pt.lon >= r.minLon &&
        pt.lon <= r.maxLon
      );
    }

    if (filter.type === "circle") {
      const c = filter.circle;
      const dist = haversineKm(pt, c.center);
      return dist <= c.radiusKm;
    }

    return true;
  });
}

// ──────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────

interface MapFeature {
  coord: [number, number]; // [lon, lat]
  cat: string;
  label: string;
  submission: Submission;
}

export function MapLibreTab({ projectId, onSpatialFilterChange, onFilteredIdsChange }: MapLibreTabProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);

  const [geoField, setGeoField] = useState("");
  const [colorField, setColorField] = useState("");
  const [labelField, setLabelField] = useState("");
  const [error, setError] = useState("");

  // Estado del filtro espacial
  const [filterMode, setFilterMode] = useState<SpatialFilterType>("none");
  const [spatialFilter, setSpatialFilter] = useState<SpatialFilter>({ type: "none" });
  const [drawingRect, setDrawingRect] = useState<{
    start: GeoPoint;
    current: GeoPoint;
  } | null>(null);
  const [drawingCircle, setDrawingCircle] = useState<{
    center: GeoPoint;
    currentRadiusKm: number;
  } | null>(null);
  const [showLegend, setShowLegend] = useState(true);

  // Callbacks desde el mapa
  const handleRectDrawn = useCallback(
    (rect: RectangleFilter) => {
      setSpatialFilter({ type: "rectangle", rect });
      setFilterMode("none");
    },
    []
  );

  const handleCircleDrawn = useCallback(
    (circle: CircleFilter) => {
      setSpatialFilter({ type: "circle", circle });
      setFilterMode("none");
    },
    []
  );

  const clearFilter = useCallback(() => {
    setSpatialFilter({ type: "none" });
    setFilterMode("none");
  }, []);

  useEffect(() => {
    getForms(projectId).then((res) => {
      if (res.forms) setForms(res.forms);
    });
  }, [projectId]);

  useEffect(() => {
    if (!selectedForm && forms.length === 1) {
      setSelectedForm(forms[0].xmlFormId);
    }
  }, [forms, selectedForm]);

  useEffect(() => {
    if (!selectedForm) return;
    setLoading(true);
    setError("");
    clearFilter();
    getAllSubmissions(projectId, selectedForm).then((res) => {
      if (res.submissions) {
        setSubmissions(res.submissions);
        const geoFields = detectAllGeoFields(res.submissions);
        setGeoField(geoFields[0] || "");
        setColorField("");
        setLabelField("");
      } else {
        setError(res.error || "Error al cargar datos");
      }
      setLoading(false);
    });
  }, [projectId, selectedForm]);

  const fields = useMemo(() => classifyFields(submissions), [submissions]);
  const geoFields = useMemo(() => detectAllGeoFields(submissions), [submissions]);

  // Features sin filtrar
  const rawFeatures = useMemo(() => {
    if (!geoField || !submissions.length) return [];
    return submissions
      .map((s) => {
        const g = extractGeo(s, geoField);
        if (!g) return null;
        const catVal = colorField ? String(s[colorField as keyof Submission] ?? "N/A") : "";
        const lblVal = labelField ? String(s[labelField as keyof Submission] ?? "") : "";
        return { coord: [g.lon, g.lat] as [number, number], cat: catVal, label: lblVal, submission: s };
      })
      .filter(Boolean) as MapFeature[];
  }, [submissions, geoField, colorField, labelField]);

  // Features filtradas espacialmente
  const filteredFeatures = useMemo(
    () => applySpatialFilter(rawFeatures, spatialFilter),
    [rawFeatures, spatialFilter]
  );

  // Features mostradas en mapa (raw + rectángulo de filtro)
  const mapFeatures = useMemo(() => {
    // Si hay filtro activo, dibujar solo puntos filtrados
    if (spatialFilter.type !== "none") return filteredFeatures;
    return rawFeatures;
  }, [rawFeatures, filteredFeatures, spatialFilter]);

  // Colores por categoría
  const catColors = useMemo(() => {
    const m: Record<string, string> = {};
    let i = 0;
    rawFeatures.forEach((f) => {
      const key = f.cat || "Punto";
      if (!m[key]) {
        m[key] = COLORS[i % COLORS.length];
        i++;
      }
    });
    return m;
  }, [rawFeatures]);

  // Sí el filtro está activo, mostrar info
  const filterInfo =
    spatialFilter.type !== "none"
      ? {
          total: rawFeatures.length,
          filtered: filteredFeatures.length,
          excluded: rawFeatures.length - filteredFeatures.length,
        }
      : null;

  // Emitir cambios de filtro espacial al padre
  useEffect(() => {
    onSpatialFilterChange?.(spatialFilter);
  }, [spatialFilter, onSpatialFilterChange]);

  useEffect(() => {
    if (spatialFilter.type !== "none" && filteredFeatures.length > 0) {
      onFilteredIdsChange?.(filteredFeatures.map((f) => f.submission.__id));
    } else if (spatialFilter.type === "none") {
      onFilteredIdsChange?.([]);
    }
  }, [filteredFeatures, spatialFilter, onFilteredIdsChange]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-[450px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">{error}</div>
      )}

      {/* Toggle colapsar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Mapa interactivo</h3>
          {rawFeatures.length > 0 && <Badge variant="outline" className="text-xs font-normal">{rawFeatures.length} puntos</Badge>}
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
      {/* Selectores */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="min-w-[180px]">
            <Select
              value={selectedForm}
              onValueChange={(v: string | null) => {
                if (v) setSelectedForm(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Formulario" />
              </SelectTrigger>
              <SelectContent>
                {forms.map((f) => (
                  <SelectItem key={f.xmlFormId} value={f.xmlFormId}>
                    {f.name || f.xmlFormId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[180px]">
            <Select
              value={geoField}
              onValueChange={(v: string | null) => setGeoField(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Geometría" />
              </SelectTrigger>
              <SelectContent>
                {geoFields.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f} 🗺️
                  </SelectItem>
                ))}
                {fields.text.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f} 📍
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[180px]">
            <Select
              value={colorField}
              onValueChange={(v: string | null) => setColorField(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Color temático" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin color</SelectItem>
                {[...fields.text, ...fields.numeric].map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[180px]">
            <Select
              value={labelField}
              onValueChange={(v: string | null) => setLabelField(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Etiqueta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin etiqueta</SelectItem>
                {fields.text.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Badge variant="secondary" className="gap-1">
          <MapPin className="h-3 w-3" /> {rawFeatures.length} ubicaciones de{" "}
          {submissions.length} registros
        </Badge>

        {/* Controles de filtro espacial */}
        <div className="flex items-center gap-2">
          {/* Botones de filtro */}
          <Button
            variant={filterMode === "rectangle" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              if (filterMode === "rectangle") {
                setFilterMode("none");
              } else {
                setFilterMode("rectangle");
                setDrawingRect(null);
              }
            }}
            className="gap-1.5"
          >
            <Crop className="h-3.5 w-3.5" />
            Rectángulo
          </Button>
          <Button
            variant={filterMode === "circle" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              if (filterMode === "circle") {
                setFilterMode("none");
              } else {
                setFilterMode("circle");
                setDrawingCircle(null);
              }
            }}
            className="gap-1.5"
          >
            <Circle className="h-3.5 w-3.5" />
            Círculo
          </Button>

          {spatialFilter.type !== "none" && (
            <>
              <Badge variant="secondary" className="gap-1 text-xs">
                <Filter className="h-3 w-3" />
                {filterInfo?.filtered}/{filterInfo?.total} puntos
                {filterInfo && filterInfo.excluded > 0 && (
                  <span className="text-muted-foreground">
                    ({filterInfo.excluded} excluidos)
                  </span>
                )}
              </Badge>
              <Button variant="ghost" size="sm" onClick={clearFilter} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Limpiar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Mapa */}
      <Card>
        <CardContent className="p-0 relative overflow-hidden rounded-lg">
          {mapFeatures.length > 0 || spatialFilter.type !== "none" ? (
            <MapLibreMap
              features={mapFeatures}
              catColors={catColors}
              labelField={labelField}
              spatialFilter={spatialFilter}
              filterMode={filterMode}
              onRectDrawn={handleRectDrawn}
              onCircleDrawn={handleCircleDrawn}
            />
          ) : (
            <div className="h-[450px] flex items-center justify-center text-muted-foreground">
              {geoField
                ? "Coordenadas no encontradas en los datos"
                : "Selecciona un campo de geometría"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leyenda con toggle */}
      {Object.keys(catColors).length > 1 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Leyenda</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLegend(!showLegend)}
              className="gap-1 h-7"
            >
              {showLegend ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showLegend ? "Ocultar" : "Mostrar"}
            </Button>
          </CardHeader>
          {showLegend && (
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {Object.entries(catColors).map(([cat, color]) => (
                  <label
                    key={cat}
                    className="flex items-center gap-1.5 text-sm cursor-pointer hover:bg-muted/50 px-1.5 py-0.5 rounded"
                  >
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded"
                      style={{ accentColor: color }}
                      onChange={(e) => {
                        // Toggle visibilidad de marcadores de esta categoría
                        const checked = e.target.checked;
                        document.querySelectorAll(`.custom-marker[data-cat="${cat}"]`).forEach(
                          (el) => ((el as HTMLElement).style.display = checked ? "" : "none")
                        );
                      }}
                    />
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span>{cat}</span>
                    <span className="text-muted-foreground text-xs">
                      ({rawFeatures.filter((f) => (f.cat || "Punto") === cat).length})
                    </span>
                  </label>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Tabla de ubicaciones filtradas */}
      {filteredFeatures.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Ubicaciones
              {spatialFilter.type !== "none" && (
                <span className="text-muted-foreground text-xs ml-2">
                  ({filteredFeatures.length} de {rawFeatures.length} dentro del área)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 overflow-y-auto">
            <div className="text-xs">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-1 pr-4">#</th>
                    <th className="pb-1 pr-4">Coordenadas</th>
                    {colorField && <th className="pb-1 pr-4">{colorField}</th>}
                    {labelField && <th className="pb-1">{labelField}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredFeatures.map((f, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-1 pr-4 font-mono">
                        {f.coord[1].toFixed(4)}, {f.coord[0].toFixed(4)}
                      </td>
                      {colorField && <td className="py-1 pr-4">{f.cat}</td>}
                      {labelField && <td className="py-1">{f.label}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mensaje cuando filtro activo pero 0 resultados */}
      {filteredFeatures.length === 0 && spatialFilter.type !== "none" && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Ningún punto dentro del área seleccionada</p>
            <p className="text-xs mt-1">Ajusta el filtro o limpia la selección</p>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
