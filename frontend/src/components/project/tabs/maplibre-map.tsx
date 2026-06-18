"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface GeoPoint { lat: number; lon: number; }

interface RectangleFilter { minLat: number; maxLat: number; minLon: number; maxLon: number; }

interface CircleFilter { center: GeoPoint; radiusKm: number; }

type SpatialFilter =
  | { type: "none" }
  | { type: "rectangle"; rect: RectangleFilter }
  | { type: "circle"; circle: CircleFilter };

interface MapFeature { coord: [number, number]; cat: string; label: string; }

interface MapLibreMapProps {
  features: MapFeature[];
  catColors: Record<string, string>;
  labelField: string;
  spatialFilter?: SpatialFilter;
  filterMode?: "rectangle" | "circle" | "none";
  onRectDrawn?: (rect: RectangleFilter) => void;
  onCircleDrawn?: (circle: CircleFilter) => void;
}

interface MapStyle {
  name: string;
  uri: string;
  icon: string;
  isRaster?: boolean;
}

const createSatelliteStyle = () => ({
  version: 8 as const,
  name: "Satelital (Esri)",
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
      minzoom: 0,
      maxzoom: 19,
    },
  },
  layers: [
    { id: "esri-satellite-layer", type: "raster", source: "esri-satellite" },
  ],
});

const MAP_STYLES: MapStyle[] = [
  { name: "Oscuro (CARTO)", uri: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json", icon: "🌙" },
  { name: "Claro (CARTO)", uri: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json", icon: "☀️" },
  { name: "Satelital (Esri)", uri: "satellite", icon: "🛰️", isRaster: true },
  { name: "OSM Liberty", uri: "https://tiles.openfreemap.org/styles/liberty", icon: "🌍" },
];

const DEFAULT_STYLE = MAP_STYLES[0].uri;

function haversineKm(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((p1.lat * Math.PI) / 180) * Math.cos((p2.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function MapLibreMap({
  features,
  catColors,
  labelField,
  spatialFilter = { type: "none" },
  filterMode = "none",
  onRectDrawn,
  onCircleDrawn,
}: MapLibreMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const popupRef = useRef<any>(null);
  const [mapStyle, setMapStyle] = useState(DEFAULT_STYLE);

  // Refs para que event listeners tengan valores frescos
  const filterModeRef = useRef(filterMode);
  filterModeRef.current = filterMode;
  const onRectDrawnRef = useRef(onRectDrawn);
  onRectDrawnRef.current = onRectDrawn;
  const onCircleDrawnRef = useRef(onCircleDrawn);
  onCircleDrawnRef.current = onCircleDrawn;
  const catColorsRef = useRef(catColors);
  catColorsRef.current = catColors;
  const labelFieldRef = useRef(labelField);
  labelFieldRef.current = labelField;
  const featuresRef = useRef(features);
  featuresRef.current = features;

  // Estado de dibujo (en ref para eventos)
  const drawState = useRef({
    active: false,
    startLngLat: null as [number, number] | null,
    currentLngLat: null as [number, number] | null,
  });

  // Inicializar mapa (una vez)
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
    document.head.appendChild(link);

    let cancelled = false;
    let maplibreglModule: any = null;

    import("maplibre-gl").then((maplibregl: any) => {
      if (cancelled || !container.current) return;
      maplibreglModule = maplibregl;

      const map = new maplibregl.Map({
        container: container.current,
        style: DEFAULT_STYLE,
        center: [-66.9, 10.5],
        zoom: 7,
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapRef.current = map;

      let bounds = new maplibregl.LngLatBounds();
      let hasBounds = false;

      // Esperar style load para empezar a agregar cosas
      map.on("style.load", () => {
        if (cancelled) return;

        // Agregar markers actuales
        const feats = featuresRef.current;
        const cats = catColorsRef.current;
        const lbl = labelFieldRef.current;

        markersRef.current.forEach((m: any) => m.remove());
        markersRef.current = [];
        bounds = new maplibregl.LngLatBounds();
        hasBounds = false;

        feats.forEach((f) => {
          const color = cats[f.cat || "Punto"] || "#666";
          const [lon, lat] = f.coord;

          const el = document.createElement("div");
          el.className = "custom-marker";
          el.setAttribute("data-cat", f.cat || "Punto");
          el.style.cssText = `width:18px;height:18px;background:${color};border:2px solid white;border-radius:50%;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;position:relative;`;

          // Etiqueta sobre el marcador
          if (f.label) {
            const labelEl = document.createElement("div");
            labelEl.className = "marker-label";
            labelEl.textContent = f.label;
            labelEl.style.cssText = "position:absolute;top:-20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:white;padding:1px 6px;border-radius:3px;font-size:10px;white-space:nowrap;pointer-events:none;font-family:sans-serif;";
            el.appendChild(labelEl);
          }

          const popup = new maplibregl.Popup({ offset: 25, maxWidth: "280px" }).setHTML(
            `<div style="font-size:12px;line-height:1.5;font-family:sans-serif;">
              ${f.label ? `<b>${lbl}:</b> ${f.label}<br/>` : ""}
              <span style="font-size:11px;color:#666">${lat.toFixed(4)}, ${lon.toFixed(4)}</span>
            </div>`
          );

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lon, lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.push(marker);
          bounds.extend([lon, lat]);
          hasBounds = true;
        });

        if (hasBounds) map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
      });

      // Trigger manual si ya está cargado
      if (map.loaded() || map.isStyleLoaded()) {
        map.fire("style.load");
      }

      // ── CLICK: interactivo para filtro o popup ──
      map.on("click", (e: any) => {
        const ds = drawState.current;
        const mode = filterModeRef.current;

        if (mode !== "none" && onRectDrawnRef.current && onCircleDrawnRef.current) {
          const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

          if (mode === "rectangle") {
            if (!ds.active) {
              ds.active = true;
              ds.startLngLat = lngLat;
              ds.currentLngLat = lngLat;
              map.getCanvas().style.cursor = "crosshair";
              return;
            } else {
              ds.active = false;
              map.getCanvas().style.cursor = "";
              // Usar lngLat del clic ACTUAL, no ds.currentLngLat (que es del mousemove)
              if (ds.startLngLat) {
                const minLat = Math.min(ds.startLngLat[1], lngLat[1]);
                const maxLat = Math.max(ds.startLngLat[1], lngLat[1]);
                const minLon = Math.min(ds.startLngLat[0], lngLat[0]);
                const maxLon = Math.max(ds.startLngLat[0], lngLat[0]);
                removeDrawingOverlay(maplibreglModule, map);
                onRectDrawnRef.current({ minLat, maxLat, minLon, maxLon });
                return;
              }
            }
          } else if (mode === "circle") {
            if (!ds.active) {
              ds.active = true;
              ds.startLngLat = lngLat;
              ds.currentLngLat = lngLat;
              map.getCanvas().style.cursor = "crosshair";
              return;
            } else {
              ds.active = false;
              map.getCanvas().style.cursor = "";
              if (ds.startLngLat) {
                const center: GeoPoint = { lat: ds.startLngLat[1], lon: ds.startLngLat[0] };
                const edge: GeoPoint = { lat: lngLat[1], lon: lngLat[0] };
                const radiusKm = haversineKm(center, edge);
                removeDrawingOverlay(maplibreglModule, map);
                onCircleDrawnRef.current({ center, radiusKm });
                return;
              }
            }
          }
        }
        // Si no hay filtro activo, el popup lo maneja el Marker automáticamente
      });

      // ── MOUSEMOVE: preview de dibujo ──
      map.on("mousemove", (e: any) => {
        const ds = drawState.current;
        const mode = filterModeRef.current;
        if (!ds.active || mode === "none") return;
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        if (mode === "rectangle") {
          drawRectPreview(map, maplibreglModule, ds.startLngLat!, lngLat);
        } else if (mode === "circle") {
          drawCirclePreview(map, maplibreglModule, ds.startLngLat!, lngLat);
        }
      });
    });

    return () => {
      cancelled = true;
      removeDrawingOverlay(null, null);
      markersRef.current.forEach((m: any) => m.remove());
      markersRef.current = [];
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
      }
    };
  }, []);

  // ── Sincronizar markers cuando cambian features ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import("maplibre-gl").then((maplibregl: any) => {
      markersRef.current.forEach((m: any) => m.remove());
      markersRef.current = [];

      const cats = catColors;
      const lbl = labelField;

      const bounds = new maplibregl.LngLatBounds();
      let hasBounds = false;

      features.forEach((f) => {
        const color = cats[f.cat || "Punto"] || "#666";
        const [lon, lat] = f.coord;

        const el = document.createElement("div");
        el.className = "custom-marker";
        el.setAttribute("data-cat", f.cat || "Punto");
        el.style.cssText = `width:18px;height:18px;background:${color};border:2px solid white;border-radius:50%;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);position:relative;display:flex;align-items:center;justify-content:center;`;

        if (f.label) {
          const labelEl = document.createElement("div");
          labelEl.textContent = f.label;
          labelEl.style.cssText = "position:absolute;top:-20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:white;padding:1px 6px;border-radius:3px;font-size:10px;white-space:nowrap;pointer-events:none;font-family:sans-serif;";
          el.appendChild(labelEl);
        }

        const popup = new maplibregl.Popup({ offset: 25, maxWidth: "280px" }).setHTML(
          `<div style="font-size:12px;line-height:1.5;font-family:sans-serif;">
            ${f.label ? `<b>${lbl}:</b> ${f.label}<br/>` : ""}
            <span style="font-size:11px;color:#666">${lat.toFixed(4)}, ${lon.toFixed(4)}</span>
          </div>`
        );

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
        bounds.extend([lon, lat]);
        hasBounds = true;
      });

      if (hasBounds && spatialFilter.type === "none") {
        map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
      }
    });
  }, [features, catColors, labelField]);

  // ── Sincronizar spatialFilter al cambiar ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    import("maplibre-gl").then((maplibregl: any) => {
      removeDrawingOverlay(maplibregl, map);
      if (spatialFilter.type === "rectangle") {
        drawFilterRect(maplibregl, map, spatialFilter.rect);
      } else if (spatialFilter.type === "circle") {
        drawFilterCircle(maplibregl, map, spatialFilter.circle);
      }
    });
  }, [spatialFilter]);

  // ── Cambiar estilo de mapa (soporta raster inline) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mapStyle === "satellite") {
      map.setStyle(createSatelliteStyle());
    } else {
      map.setStyle(mapStyle);
    }
  }, [mapStyle]);

  // ── Funciones de overlay ──

  function removeDrawingOverlay(maplibregl: any, map: any) {
    if (!map || !maplibregl) {
      // Intentar limpiar igual
      const m = mapRef.current;
      if (!m) return;
      try {
        if (m.getLayer("rect-fill")) m.removeLayer("rect-fill");
        if (m.getLayer("rect-outline")) m.removeLayer("rect-outline");
        if (m.getSource("rect-source")) m.removeSource("rect-source");
        if (m.getLayer("circle-fill")) m.removeLayer("circle-fill");
        if (m.getLayer("circle-outline")) m.removeLayer("circle-outline");
        if (m.getSource("circle-source")) m.removeSource("circle-source");
      } catch {}
      return;
    }
    try {
      if (map.getLayer("rect-fill")) map.removeLayer("rect-fill");
      if (map.getLayer("rect-outline")) map.removeLayer("rect-outline");
      if (map.getSource("rect-source")) map.removeSource("rect-source");
      if (map.getLayer("circle-fill")) map.removeLayer("circle-fill");
      if (map.getLayer("circle-outline")) map.removeLayer("circle-outline");
      if (map.getSource("circle-source")) map.removeSource("circle-source");
    } catch {}
  }

  function drawRectPreview(map: any, maplibregl: any, start: [number, number], end: [number, number]) {
    const minLon = Math.min(start[0], end[0]);
    const maxLon = Math.max(start[0], end[0]);
    const minLat = Math.min(start[1], end[1]);
    const maxLat = Math.max(start[1], end[1]);
    const polygon = { type: "Polygon", coordinates: [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]] };

    if (map.getSource("rect-source")) {
      try { (map.getSource("rect-source") as any).setData(polygon); } catch {}
    } else {
      try {
        map.addSource("rect-source", { type: "geojson", data: polygon });
        map.addLayer({ id: "rect-fill", type: "fill", source: "rect-source", paint: { "fill-color": "#00B4D8", "fill-opacity": 0.15 } });
        map.addLayer({ id: "rect-outline", type: "line", source: "rect-source", paint: { "line-color": "#00B4D8", "line-width": 2, "line-dasharray": [4, 3] } });
      } catch {}
    }
  }

  function drawCirclePreview(map: any, maplibregl: any, center: [number, number], edge: [number, number]) {
    const centerPt: GeoPoint = { lat: center[1], lon: center[0] };
    const edgePt: GeoPoint = { lat: edge[1], lon: edge[0] };
    const radiusKm = haversineKm(centerPt, edgePt);
    const radiusDeg = radiusKm / 111.32;
    const points: [number, number][] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const dlat = radiusDeg * Math.cos(angle);
      const dlon = radiusDeg * Math.sin(angle) / Math.cos((centerPt.lat * Math.PI) / 180);
      points.push([centerPt.lon + dlon, centerPt.lat + dlat]);
    }
    const polygon = { type: "Polygon", coordinates: [points] };

    if (map.getSource("circle-source")) {
      try { (map.getSource("circle-source") as any).setData(polygon); } catch {}
    } else {
      try {
        map.addSource("circle-source", { type: "geojson", data: polygon });
        map.addLayer({ id: "circle-fill", type: "fill", source: "circle-source", paint: { "fill-color": "#FF6B6B", "fill-opacity": 0.15 } });
        map.addLayer({ id: "circle-outline", type: "line", source: "circle-source", paint: { "line-color": "#FF6B6B", "line-width": 2, "line-dasharray": [4, 3] } });
      } catch {}
    }
  }

  function drawFilterRect(maplibregl: any, map: any, rect: RectangleFilter) {
    const polygon = { type: "Polygon", coordinates: [[[rect.minLon, rect.minLat], [rect.maxLon, rect.minLat], [rect.maxLon, rect.maxLat], [rect.minLon, rect.maxLat], [rect.minLon, rect.minLat]]] };
    try {
      map.addSource("rect-source", { type: "geojson", data: polygon });
      map.addLayer({ id: "rect-fill", type: "fill", source: "rect-source", paint: { "fill-color": "#00B4D8", "fill-opacity": 0.2 } });
      map.addLayer({ id: "rect-outline", type: "line", source: "rect-source", paint: { "line-color": "#00B4D8", "line-width": 2, "line-dasharray": [4, 3] } });
    } catch {}
  }

  function drawFilterCircle(maplibregl: any, map: any, circle: CircleFilter) {
    const radiusDeg = circle.radiusKm / 111.32;
    const centerLat = circle.center.lat;
    const centerLon = circle.center.lon;
    const points: [number, number][] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const dlat = radiusDeg * Math.cos(angle);
      const dlon = radiusDeg * Math.sin(angle) / Math.cos((centerLat * Math.PI) / 180);
      points.push([centerLon + dlon, centerLat + dlat]);
    }
    const polygon = { type: "Polygon", coordinates: [points] };
    try {
      map.addSource("circle-source", { type: "geojson", data: polygon });
      map.addLayer({ id: "circle-fill", type: "fill", source: "circle-source", paint: { "fill-color": "#FF6B6B", "fill-opacity": 0.2 } });
      map.addLayer({ id: "circle-outline", type: "line", source: "circle-source", paint: { "line-color": "#FF6B6B", "line-width": 2, "line-dasharray": [4, 3] } });
    } catch {}
  }

  return (
    <div className="relative">
      <div ref={container} className="h-[450px] w-full rounded-lg" />

      {/* Selector de Mapas Base */}
      <div className="absolute top-3 left-3 z-10">
        <select
          onChange={(e) => setMapStyle(e.target.value)}
          value={mapStyle}
          className="bg-background/90 backdrop-blur-sm border shadow-sm rounded-md px-3 py-1.5 text-xs cursor-pointer hover:bg-background transition-colors"
        >
          {MAP_STYLES.map((ms) => (
            <option key={ms.uri} value={ms.uri}>
              {ms.icon} {ms.name}
            </option>
          ))}
        </select>
      </div>

      {/* Indicador de modo dibujo */}
      {filterMode !== "none" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-background/90 backdrop-blur-sm border shadow-sm rounded-md px-4 py-2 text-xs flex items-center gap-2">
            {filterMode === "rectangle" ? (
              <>
                <span className="inline-block w-3 h-3 rounded-sm border-2 border-[#00B4D8] bg-[#00B4D8]/20" />
                Haz clic para iniciar, clic de nuevo para completar
              </>
            ) : (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-[#FF6B6B] bg-[#FF6B6B]/20" />
                Centro → clic para radio
              </>
            )}
          </div>
        </div>
      )}

      {/* Info de filtro */}
      {spatialFilter.type !== "none" && (
        <div className="absolute bottom-3 right-3 z-10 text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded border">
          {spatialFilter.type === "rectangle" ? "Rectángulo" : "Círculo"}: {features.length} puntos
        </div>
      )}
    </div>
  );
}
