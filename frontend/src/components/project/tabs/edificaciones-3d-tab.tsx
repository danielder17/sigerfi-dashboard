"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Map, { Source, Layer, NavigationControl, Popup, MapRef, ScaleControl, LngLatBounds } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getForms, fetchApi } from "@/lib/api";
import type { FormSummary } from "@/types";
import { Layers, Maximize2, Building2 } from "lucide-react";

// ──────────────────────────────────────────────
//  ESTILOS DE MAPA
// ──────────────────────────────────────────────
const MAP_STYLES: Record<string, string> = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  street: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  satellite: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json", // fallback visual
};

// ──────────────────────────────────────────────
//  TIPOS
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
//  COLORES POR TIPO
// ──────────────────────────────────────────────
const TIPO_COLORS: Record<string, string> = {
  vivienda: "#66BB6A",
  vivienda_multifamiliar: "#42A5F5",
  comercio: "#FFA726",
  bodega: "#8D6E63",
  oficina: "#78909C",
  industrial: "#AB47BC",
  educacion: "#26C6DA",
  salud: "#EF5350",
  religioso: "#FFCA28",
};

function getTipoColor(tipo: string): string {
  return TIPO_COLORS[tipo] || "#BDBDBD";
}

// ──────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────
interface Props {
  projectId: number;
}

export default function Edificaciones3DTab({ projectId }: Props) {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingForms, setLoadingForms] = useState(true);
  const [mapStyle, setMapStyle] = useState("dark");
  const [popupInfo, setPopupInfo] = useState<EdifProperties | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const mapRef = useRef<MapRef>(null);

  // Cargar formularios al montar
  useEffect(() => {
    getForms(projectId)
      .then((res) => {
        const f = res.forms || [];
        setForms(f);
        // Auto-seleccionar Encuesta_Edificaciones si existe
        const edifForm = f.find((x) => x.formId?.toLowerCase().includes("edificacion"));
        if (edifForm) {
          setSelectedFormId(edifForm.formId);
        }
        setLoadingForms(false);
      })
      .catch(() => setLoadingForms(false));
  }, [projectId]);

  // Cargar datos 3D cuando se selecciona formulario
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

      // Ajustar vista si hay datos
      if (json.features.length > 0 && mapRef.current) {
        const bounds = new LngLatBounds();
        json.features.forEach((f) => {
          f.geometry.coordinates[0].forEach((c) => bounds.extend(c as [number, number]));
        });
        mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 18, duration: 1000 });
      }
    } catch (err: any) {
      console.error("Error cargando datos 3D:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedFormId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ajustar vista
  const fitToData = () => {
    if (!data?.features.length || !mapRef.current) return;
    const bounds = new LngLatBounds();
    data.features.forEach((f) => {
      f.geometry.coordinates[0].forEach((c) => bounds.extend(c as [number, number]));
    });
    mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 18, duration: 1000 });
  };

  // Capa de edificios 3D
  const buildingLayer: any = {
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
      ],
      "fill-extrusion-height": ["get", "altura_m"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": [
        "case",
        ["boolean", ["==", ["get", "id"], hoveredId ?? ""], false],
        0.95,
        0.75,
      ],
    },
  };

  const outlineLayer: any = {
    id: "edificaciones-outline",
    type: "line",
    source: "edificaciones",
    paint: {
      "line-color": "#ffffff",
      "line-width": 1,
      "line-opacity": 0.3,
    },
  };

  if (loadingForms) {
    return <Skeleton className="h-[600px] w-full rounded-lg" />;
  }

  return (
    <div className="space-y-4">
      {/* Selector de formulario */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Formulario:</span>
        </div>
        <Select value={selectedFormId} onValueChange={setSelectedFormId}>
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Seleccionar formulario..." />
          </SelectTrigger>
          <SelectContent>
            {forms.map((f) => (
              <SelectItem key={f.formId} value={f.formId}>
                {f.name || f.formId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadData} disabled={!selectedFormId || loading}>
          {loading ? "Cargando..." : "Cargar"}
        </Button>
      </div>

      {/* Mapa 3D */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Visualizador 3D de Edificaciones 🏗️</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {data
                  ? `${data.total} edificaciones con extrusión por altura real (${data.features.filter((f) => f.properties.altura_m > 0).length} con altura > 0m)`
                  : "Selecciona un formulario y presiona Cargar"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={mapStyle} onValueChange={setMapStyle}>
                <SelectTrigger className="w-[130px]">
                  <Layers className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Oscuro</SelectItem>
                  <SelectItem value="street">Calles</SelectItem>
                  <SelectItem value="satellite">Satelital</SelectItem>
                </SelectContent>
              </Select>
              {data && data.features.length > 0 && (
                <Badge variant="outline" className="cursor-pointer" onClick={fitToData}>
                  <Maximize2 className="h-3 w-3 mr-1" /> Ajustar
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[600px] w-full rounded-lg" />
          ) : !data || data.features.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground border rounded-lg">
              {selectedFormId
                ? "No se encontraron edificaciones con polígono en este formulario."
                : "Selecciona un formulario con datos de edificaciones."}
            </div>
          ) : (
            <div className="h-[600px] w-full rounded-lg overflow-hidden border">
              <Map
                ref={mapRef}
                mapStyle={MAP_STYLES[mapStyle] || MAP_STYLES.dark}
                initialViewState={{
                  longitude: -66.85,
                  latitude: 10.48,
                  zoom: 11,
                  pitch: 60,
                  bearing: 0,
                }}
                style={{ width: "100%", height: "100%" }}
                interactiveLayerIds={["edificaciones-3d"]}
                onMouseEnter={(e) => {
                  if (e.features?.[0]) setHoveredId(e.features[0].properties?.id);
                }}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => {
                  if (e.features?.[0]) {
                    setPopupInfo(e.features[0].properties as EdifProperties);
                  }
                }}
              >
                <NavigationControl position="top-right" />
                <ScaleControl position="bottom-left" />

                <Source id="edificaciones" type="geojson" data={data as any}>
                  <Layer {...buildingLayer} />
                  <Layer {...outlineLayer} />
                </Source>

                {popupInfo && popupInfo.center_lon && popupInfo.center_lat && (
                  <Popup
                    longitude={popupInfo.center_lon}
                    latitude={popupInfo.center_lat}
                    onClose={() => setPopupInfo(null)}
                    closeButton={true}
                    maxWidth="320px"
                    offset={[0, -10]}
                  >
                    <div className="space-y-1.5 p-1 text-sm">
                      <h3 className="font-semibold text-base">{popupInfo.nombre}</h3>
                      <div className="space-y-1">
                        <p>
                          <span className="font-medium">Tipo:</span>{" "}
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs text-white"
                            style={{ backgroundColor: getTipoColor(popupInfo.tipo) }}
                          >
                            {popupInfo.tipo}
                          </span>
                        </p>
                        <p><span className="font-medium">Altura:</span> {popupInfo.altura_m} m</p>
                        <p>
                          <span className="font-medium">Área:</span>{" "}
                          {popupInfo.area_m2 ? `${popupInfo.area_m2.toFixed(1)} m²` : "—"}
                        </p>
                        <p>
                          <span className="font-medium">Volumen:</span>{" "}
                          {popupInfo.volumen_m3 ? `${popupInfo.volumen_m3.toFixed(1)} m³` : "—"}
                        </p>
                        {popupInfo.situacion && (
                          <p><span className="font-medium">Estado:</span> {popupInfo.situacion}</p>
                        )}
                        {popupInfo.anios_construccion && (
                          <p><span className="font-medium">Años:</span> {popupInfo.anios_construccion}</p>
                        )}
                        {popupInfo.dpt_parroquia && (
                          <p><span className="font-medium">Parroquia:</span> {popupInfo.dpt_parroquia}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Encuestador: {popupInfo.encuestador || "—"}
                        </p>
                      </div>
                      {popupInfo.foto_url && (
                        <img
                          src={popupInfo.foto_url}
                          alt="Foto edificación"
                          className="mt-2 rounded-md w-full h-28 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                    </div>
                  </Popup>
                )}
              </Map>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leyenda de tipos */}
      {data && data.features.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Leyenda</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(TIPO_COLORS).map(([tipo, color]) => {
                const count = data.features.filter((f) => f.properties.tipo === tipo).length;
                if (count === 0) return null;
                return (
                  <Badge key={tipo} variant="secondary" className="gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: color }}
                    />
                    {tipo}
                    <span className="text-muted-foreground text-[10px]">({count})</span>
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
