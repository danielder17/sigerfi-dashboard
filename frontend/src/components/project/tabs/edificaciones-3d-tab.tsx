"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import { getForms } from "@/lib/api";
import type { FormSummary } from "@/types";
import { Layers, Maximize2, Building2, Table2, MapIcon, Globe, List, Eye, EyeOff, Search, RotateCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Estilos de mapa base ─────────────────────────
const MAP_STYLES = {
  dark: { label: "Oscuro", icon: "🌙", url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
  street: { label: "Calles", icon: "🏙️", url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" },
  satellite: { label: "Satelital", icon: "🛰️", url: "custom" },
  relief: { label: "Relieve", icon: "⛰️", url: "custom" },
} as const;

type MapStyleKey = keyof typeof MAP_STYLES;

// Estilos raster personalizados (se cargan como estilo en línea)
function buildRasterStyle(tiles: string[], attribution: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      raster: {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution,
      },
    },
    layers: [
      { id: "raster-layer", type: "raster", source: "raster" },
    ],
  };
}

const SATELLITE_STYLE = buildRasterStyle(
  ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  "Esri, Maxar, Earthstar Geographics"
);

const RELIEF_STYLE = buildRasterStyle(
  ["https://tile.openstreetmap.de/{z}/{x}/{y}.png"],
  "© OpenStreetMap contributors"
);

// ─── Colores por tipo ─────────────────────────────
const TIPO_COLORS: Record<string, { color: string; label: string }> = {
  vivienda: { color: "#66BB6A", label: "Vivienda" },
  vivienda_multifamiliar: { color: "#42A5F5", label: "Vivienda Multifamiliar" },
  comercio: { color: "#FFA726", label: "Comercio" },
  bodega: { color: "#8D6E63", label: "Bodega/Almacén" },
  oficina: { color: "#78909C", label: "Oficina" },
  industrial: { color: "#AB47BC", label: "Industrial" },
  educacion: { color: "#26C6DA", label: "Educación" },
  salud: { color: "#EF5350", label: "Salud" },
  religioso: { color: "#FFCA28", label: "Religioso" },
  otro: { color: "#BDBDBD", label: "Otro" },
};

// ─── Tipos ────────────────────────────────────────
interface EdifProperties {
  id: string;
  nombre: string;
  tipo: string;
  altura_m: number;
  area_m2: number | null;
  volumen_m3: number | null;
  estado: string;
  situacion: string;
  foto_url: string | null;
  encuestador: string;
  anios_construccion: number | null;
  center_lon: number | null;
  center_lat: number | null;
  dpt_parroquia: string | null;
}

interface EdifFeature {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: EdifProperties;
}

interface FeatureCollection {
  type: "FeatureCollection";
  features: EdifFeature[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────
function getTipoColor(tipo: string): string {
  return TIPO_COLORS[tipo]?.color || "#BDBDBD";
}
function getTipoLabel(tipo: string): string {
  return TIPO_COLORS[tipo]?.label || tipo;
}

interface Props {
  projectId: number;
}

export default function Edificaciones3DTab({ projectId }: Props) {
  // Estado de formularios
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [loadingForms, setLoadingForms] = useState(true);

  // Estado de datos
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);

  // Estado del mapa
  const [mapStyle, setMapStyle] = useState<MapStyleKey>("dark");
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(Object.keys(TIPO_COLORS)));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFeature, setSelectedFeature] = useState<EdifFeature | null>(null);
  const [popupInfo, setPopupInfo] = useState<EdifProperties | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "table">("map");

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const flyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cargar formularios ──────────────────────────
  useEffect(() => {
    getForms(projectId)
      .then((res) => {
        const f = res.forms || [];
        setForms(f);
        const edifForm = f.find((x) => x.xmlFormId?.toLowerCase().includes("edificacion"));
        if (edifForm) setSelectedFormId(edifForm.xmlFormId);
        setLoadingForms(false);
      })
      .catch(() => setLoadingForms(false));
  }, [projectId]);

  // ── Cargar datos ────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedFormId) return;
    setLoading(true);
    setPopupInfo(null);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
      const res = await fetch(`${baseUrl}/api/v2/projects/${projectId}/forms/${selectedFormId}/edificaciones-3d`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json: FeatureCollection = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedFormId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Obtener tipos únicos presentes en los datos
  const presentTypes = useMemo(() => {
    if (!data) return new Set<string>();
    const types = new Set(data.features.map((f) => f.properties.tipo));
    // Asegurar que 'otro' esté si hay tipos no mapeados
    return types;
  }, [data]);

  // ── Inicializar mapa ────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Limpiar mapa anterior
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const style = MAP_STYLES[mapStyle];
    const styleDef = style.url === "custom"
      ? (mapStyle === "satellite" ? SATELLITE_STYLE : RELIEF_STYLE)
      : style.url;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleDef as any,
      center: [-66.85, 10.48],
      zoom: 11,
      pitch: 60,
      bearing: 0,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.on("load", () => {
      mapRef.current = map;
      add3DLayers(map);
      updateLayerVisibility(map);
    });

    map.on("click", "edificaciones-3d", (e) => {
      if (!e.features?.[0]) return;
      const props = e.features[0].properties as unknown as EdifProperties;
      handleFeatureClick(props);
    });

    map.on("mousemove", "edificaciones-3d", (e) => {
      map.getCanvas().style.cursor = e.features?.length ? "pointer" : "";
    });
    map.on("mouseleave", "edificaciones-3d", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapStyle, data, visibleTypes]);

  // ── Añadir capas 3D ─────────────────────────────
  const add3DLayers = useCallback((map: maplibregl.Map) => {
    if (!data || data.features.length === 0) return;

    // Limpiar capas anteriores
    ["edificaciones-outline", "edificaciones-3d", "edificaciones"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });

    map.addSource("edificaciones", {
      type: "geojson",
      data: data as any,
    });

    map.addLayer({
      id: "edificaciones-3d",
      type: "fill-extrusion",
      source: "edificaciones",
      paint: {
        "fill-extrusion-color": [
          "match",
          ["get", "tipo"],
          "vivienda", "#66BB6A",
          "vivienda_multifamiliar", "#42A5F5",
          "comercio", "#FFA726",
          "bodega", "#8D6E63",
          "oficina", "#78909C",
          "industrial", "#AB47BC",
          "educacion", "#26C6DA",
          "salud", "#EF5350",
          "religioso", "#FFCA28",
          "#BDBDBD",
        ] as maplibregl.ExpressionSpecification,
        "fill-extrusion-height": ["get", "altura_m"] as maplibregl.ExpressionSpecification,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.75,
      },
    });

    map.addLayer({
      id: "edificaciones-outline",
      type: "line",
      source: "edificaciones",
      paint: {
        "line-color": "#ffffff",
        "line-width": 1,
        "line-opacity": 0.3,
      },
    });

    // Fit bounds en primera carga
    const bounds = new maplibregl.LngLatBounds();
    data.features.forEach((f) => {
      f.geometry.coordinates[0].forEach((c) => bounds.extend(c as [number, number]));
    });
    map.fitBounds(bounds, { padding: 50, maxZoom: 18, duration: 1000 });
  }, [data]);

  // ── Actualizar visibilidad de capas ──────────────
  const updateLayerVisibility = useCallback((map: maplibregl.Map) => {
    if (!map || !data) return;

    // Usamos filter expressions en vez de remover/agregar capas
    const layer = map.getLayer("edificaciones-3d");
    if (!layer) return;

    const filter: any = ["in", ["get", "tipo"], ...Array.from(visibleTypes)];
    map.setFilter("edificaciones-3d", filter as any);
    map.setFilter("edificaciones-outline", filter as any);
  }, [data, visibleTypes]);

  // ── Fly a feature ────────────────────────────────
  const flyToFeature = useCallback((feature: EdifFeature) => {
    const map = mapRef.current;
    if (!map) return;

    const { center_lon, center_lat, altura_m } = feature.properties;
    if (center_lon && center_lat) {
      map.flyTo({
        center: [center_lon, center_lat],
        zoom: 17,
        pitch: 65,
        bearing: -30,
        duration: 1500,
      });

      // Mostrar popup después del fly
      if (flyTimeoutRef.current) clearTimeout(flyTimeoutRef.current);
      flyTimeoutRef.current = setTimeout(() => {
        if (popupRef.current) popupRef.current.remove();
        const popup = new maplibregl.Popup({
          closeButton: true,
          maxWidth: "340px",
          offset: [0, -10],
        })
          .setLngLat([center_lon, center_lat])
          .setHTML(buildPopupHTML(feature.properties))
          .addTo(map);
        popupRef.current = popup;
        setSelectedFeature(feature);
      }, 1600);
    }
  }, []);

  // ── Click en feature (desde el mapa) ────────────
  const handleFeatureClick = useCallback((props: EdifProperties) => {
    setPopupInfo(props);
    if (popupRef.current) popupRef.current.remove();
    if (props.center_lon && props.center_lat) {
      const popup = new maplibregl.Popup({
        closeButton: true,
        maxWidth: "340px",
        offset: [0, -10],
      })
        .setLngLat([props.center_lon, props.center_lat])
        .setHTML(buildPopupHTML(props))
        .addTo(mapRef.current!);
      popupRef.current = popup;
    }
  }, []);

  // ── Popup HTML ──────────────────────────────────
  const buildPopupHTML = (props: EdifProperties): string => {
    const tipoColor = getTipoColor(props.tipo);
    return `
      <div style="font-size: 13px; line-height: 1.6;">
        <strong style="font-size: 15px;">${props.nombre || "Sin nombre"}</strong>
        <div style="margin-top: 6px;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;color:white;background:${tipoColor};font-size:11px;">
            ${getTipoLabel(props.tipo)}
          </span>
        </div>
        <div style="margin-top: 6px;">
          <strong>Altura:</strong> ${props.altura_m} m<br/>
          <strong>Área:</strong> ${props.area_m2 ? `${props.area_m2.toFixed(1)} m²` : "—"}<br/>
          <strong>Volumen:</strong> ${props.volumen_m3 ? `${props.volumen_m3.toFixed(1)} m³` : "—"}<br/>
          ${props.situacion ? `<strong>Estado:</strong> ${props.situacion}<br/>` : ""}
          ${props.anios_construccion ? `<strong>Años construcción:</strong> ${props.anios_construccion}<br/>` : ""}
          ${props.dpt_parroquia ? `<strong>Parroquia:</strong> ${props.dpt_parroquia}<br/>` : ""}
          <span style="color:#888;font-size:11px;">Encuestador: ${props.encuestador || "—"}</span>
        </div>
        ${props.foto_url
          ? `<img src="${props.foto_url}" style="margin-top:8px;border-radius:6px;width:100%;height:100px;object-fit:cover;" onerror="this.style.display='none'"/>`
          : ""}
      </div>
    `;
  };

  // ── Toggle tipo en leyenda ──────────────────────
  const toggleType = (tipo: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
  };

  // ── Features filtrados por búsqueda ─────────────
  const filteredFeatures = useMemo(() => {
    if (!data) return [];
    let features = data.features;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      features = features.filter(
        (f) =>
          f.properties.nombre?.toLowerCase().includes(term) ||
          f.properties.tipo?.toLowerCase().includes(term) ||
          f.properties.dpt_parroquia?.toLowerCase().includes(term) ||
          f.properties.encuestador?.toLowerCase().includes(term)
      );
    }
    return features;
  }, [data, searchTerm]);

  // ── Render ──────────────────────────────────────
  if (loadingForms) {
    return <Skeleton className="h-[600px] w-full rounded-lg" />;
  }

  // Contador visible
  const visibleCount = data?.features.filter((f) => visibleTypes.has(f.properties.tipo)).length || 0;

  return (
    <div className="space-y-4">
      {/* ── Barra superior ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Formulario:</span>
        </div>
        <Select value={selectedFormId} onValueChange={(v) => setSelectedFormId(v ?? "")}>
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Seleccionar formulario..." />
          </SelectTrigger>
          <SelectContent>
            {forms.map((f) => (
              <SelectItem key={f.xmlFormId} value={f.xmlFormId}>
                {f.name || f.xmlFormId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadData} disabled={!selectedFormId || loading}>
          {loading ? "Cargando..." : "Cargar"}
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Selector de mapa base */}
        <div className="flex items-center gap-1">
          <Layers className="h-4 w-4 text-muted-foreground" />
          {Object.entries(MAP_STYLES).map(([key, style]) => (
            <TooltipProvider key={key}>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant={mapStyle === key ? "default" : "outline"}
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setMapStyle(key as MapStyleKey)}
                  >
                    {style.icon}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{style.label}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>

      {/* ── Panel principal ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ── Columna izquierda: Tabla + Leyenda ── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Tabla de edificaciones */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <List className="h-4 w-4" />
                  Edificaciones
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {filteredFeatures.length}
                  </Badge>
                </CardTitle>
                <Input
                  placeholder="Buscar..."
                  className="h-7 w-[130px] text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[320px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] w-8">#</TableHead>
                      <TableHead className="text-[10px]">Nombre</TableHead>
                      <TableHead className="text-[10px] w-16">Altura</TableHead>
                      <TableHead className="text-[10px] w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFeatures.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">
                          {searchTerm ? "Sin resultados" : "Sin datos"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredFeatures.map((f, i) => {
                        const p = f.properties;
                        const isSelected = selectedFeature?.properties.id === p.id;
                        const isVisible = visibleTypes.has(p.tipo);
                        return (
                          <TableRow
                            key={p.id || i}
                            className={`cursor-pointer text-xs ${
                              isSelected ? "bg-primary/10" : ""
                            } ${!isVisible ? "opacity-40" : ""}`}
                            onClick={() => {
                              flyToFeature(f);
                              setViewMode("map");
                            }}
                          >
                            <TableCell className="py-1 text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="py-1 font-medium truncate max-w-[120px]">
                              <span className="flex items-center gap-1">
                                <span
                                  className="w-2 h-2 rounded-full inline-block shrink-0"
                                  style={{ backgroundColor: getTipoColor(p.tipo) }}
                                />
                                {p.nombre || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="py-1">{p.altura_m}m</TableCell>
                            <TableCell className="py-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  flyToFeature(f);
                                }}
                              >
                                <MapIcon className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Leyenda interactiva */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Eye className="h-4 w-4" />
                  Leyenda
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {visibleCount}/{data?.features.length || 0} visibles
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="space-y-1.5">
                {Object.entries(TIPO_COLORS).map(([tipo, info]) => {
                  const count = data?.features.filter((f) => f.properties.tipo === tipo).length || 0;
                  if (!presentTypes.has(tipo) && count === 0) return null;
                  const isVisible = visibleTypes.has(tipo);
                  return (
                    <div
                      key={tipo}
                      className={`flex items-center gap-2 py-1 px-2 rounded-md cursor-pointer transition-colors hover:bg-muted ${
                        !isVisible ? "opacity-40" : ""
                      }`}
                      onClick={() => toggleType(tipo)}
                    >
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: isVisible ? info.color : "#666" }}
                      />
                      <span className="text-xs flex-1">{info.label}</span>
                      <span className="text-[10px] text-muted-foreground">{count}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleType(tipo);
                        }}
                      >
                        {isVisible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Columna derecha: Mapa ── */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-3 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Visualizador 3D 🏗️</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data
                      ? `${visibleCount} de ${data.total} edificaciones visibles`
                      : "Selecciona un formulario y presiona Cargar"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (data && data.features.length > 0) {
                        const bounds = new maplibregl.LngLatBounds();
                        data.features.forEach((f) => {
                          f.geometry.coordinates[0].forEach((c) =>
                            bounds.extend(c as [number, number])
                          );
                        });
                        mapRef.current?.fitBounds(bounds, { padding: 50, maxZoom: 18 });
                      }
                    }}
                    disabled={!data}
                  >
                    <Maximize2 className="h-3 w-3 mr-1" />
                    Ajustar vista
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Skeleton className="h-[600px] w-full rounded-lg" />
              ) : !data || data.features.length === 0 ? (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground border rounded-lg">
                  {selectedFormId
                    ? "No se encontraron edificaciones con polígono en este formulario."
                    : "Selecciona un formulario con datos de edificaciones."}
                </div>
              ) : (
                <div
                  ref={mapContainerRef}
                  className="h-[650px] w-full rounded-lg overflow-hidden border"
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
