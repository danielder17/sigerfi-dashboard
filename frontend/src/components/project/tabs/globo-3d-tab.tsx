"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

// ─── Tipos ───
interface CapaInfo {
  name: string;
  visible: boolean;
}

interface EdificacionProperties {
  nombre?: string;
  altura?: number;
  pisos?: number;
  uso?: string;
}

// ─── Constantes ───
const VENEZUELA_CENTER = { lon: -66.85, lat: 7.0, alt: 4000000 };
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

// ─── Colores por tipo de edificación (heredados del tab MapLibre) ───
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

// ─── Helper: Esperar a que Cesium esté disponible ───
function waitForCesium(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as any).Cesium) {
      resolve();
      return;
    }

    let attempts = 0;
    const maxAttempts = 100;
    const interval = setInterval(() => {
      attempts++;
      if ((window as any).Cesium) {
        clearInterval(interval);
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error("CesiumJS no se cargó después de 10 segundos"));
      }
    }, 100);
  });
}

// ─── Componente Principal ───
export default function Globo3DTab({ projectId }: { projectId: number }) {
  // ─── Estado ───
  const [viewerStatus, setViewerStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [capas, setCapas] = useState<CapaInfo[]>([]);
  const [terrainEnabled, setTerrainEnabled] = useState(true);
  const [currentBaseMap, setCurrentBaseMap] = useState<"bing" | "bing_labels" | "bing_road" | "osm" | "maptiler">("bing");
  const [edificacionesCargadas, setEdificacionesCargadas] = useState(false);
  const [edificacionesCount, setEdificacionesCount] = useState(0);
  const [loadingEdificaciones, setLoadingEdificaciones] = useState(false);
  const [osmBuildingsVisible, setOsmBuildingsVisible] = useState(false);
  const edificacionesDsRef = useRef<any>(null);
  const osmBuildingsRef = useRef<any>(null);

  // ─── Estado de formularios ───
  const [forms, setForms] = useState<any[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [formsLoading, setFormsLoading] = useState(true);
  const [autoLoaded, setAutoLoaded] = useState(false);

  // ─── Refs ───
  const viewerRef = useRef<any>(null);
  const destroyedRef = useRef(false);
  const mountCountRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Cargar formularios del proyecto ───
  useEffect(() => {
    (async () => {
      setFormsLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/projects/${projectId}/forms`);
        if (!res.ok) return;
        const data = await res.json();
        const formList = data.forms || [];
        setForms(formList);

        // Auto-seleccionar formulario de edificaciones si existe
        const ef = formList.find(
          (f: any) =>
            f.xmlFormId?.toLowerCase().includes("edificacion") ||
            f.name?.toLowerCase().includes("edificacion")
        );
        if (ef) {
          setSelectedFormId(ef.xmlFormId);
          setAutoLoaded(true);
        } else if (formList.length > 0) {
          setSelectedFormId(formList[0].xmlFormId);
        }
      } catch (e) {
        console.warn("[Globo] Error cargando formularios:", e);
      } finally {
        setFormsLoading(false);
      }
    })();
  }, [projectId]);

  // ─── Actualizar lista de capas ───
  const updateCapasList = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const layers = viewer.imageryLayers;
    const list: CapaInfo[] = [];
    for (let i = 0; i < layers.length; i++) {
      const layer = layers.get(i);
      const name =
        layer.imageryProvider?.constructor?.name?.replace("ImageryProvider", "") ||
        `Capa ${i + 1}`;
      list.push({ name, visible: layer.show });
    }
    setCapas(list);
  }, []);

  // ─── Inicializar Cesium ───
  useEffect(() => {
    mountCountRef.current += 1;
    const mountId = mountCountRef.current;
    destroyedRef.current = false;

    async function init() {
      try {
        setViewerStatus("loading");
        setErrorMessage("");

        await waitForCesium();

        if (destroyedRef.current || mountId !== mountCountRef.current) {
          console.log(`[Globo] Montaje ${mountId} abortado (desmontado)`);
          return;
        }

        const container = containerRef.current;
        if (!container) {
          throw new Error("No se encontró el contenedor del globo");
        }

        const Cesium = (window as any).Cesium;

        const token = (window as any).__CESIUM_TOKEN__ || process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
        if (token) Cesium.Ion.defaultAccessToken = token;

        const viewer = new Cesium.Viewer(container, {
          terrain: Cesium.Terrain.fromWorldTerrain({
            requestVertexNormals: true,
            requestWaterMask: true,
          }),
          imageryProvider: false,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          sceneModePicker: false,
          homeButton: false,
          navigationHelpButton: false,
          geocoder: false,
          infoBox: false,
          selectionIndicator: false,
          shadows: false,
          contextOptions: {
            webgl: {
              alpha: false,
              depth: true,
              stencil: true,
              antialias: true,
              preserveDrawingBuffer: true,
              failIfMajorPerformanceCaveat: false,
            },
          },
        });

        if (destroyedRef.current || mountId !== mountCountRef.current) {
          viewer.destroy();
          return;
        }

        viewerRef.current = viewer;

        // ─── Agregar capa Bing Maps ───
        try {
          const bingLayer = await Cesium.IonImageryProvider.fromAssetId(2);
          if (!destroyedRef.current && mountId === mountCountRef.current) {
            viewer.imageryLayers.addImageryProvider(bingLayer);
          }
        } catch (bingError) {
          console.warn("[Globo] Bing Maps no disponible, usando OSM:", bingError);
          const osmLayer = new Cesium.OpenStreetMapImageryProvider({
            url: "https://tile.openstreetmap.org/",
          });
          if (!destroyedRef.current && mountId === mountCountRef.current) {
            viewer.imageryLayers.addImageryProvider(osmLayer);
            setCurrentBaseMap("osm");
          }
        }

        // ─── Cámara a Venezuela ───
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            VENEZUELA_CENTER.lon,
            VENEZUELA_CENTER.lat,
            VENEZUELA_CENTER.alt
          ),
          duration: 2,
        });

        // ─── Eventos de capas ───
        viewer.imageryLayers.layerAdded.addEventListener(updateCapasList);
        viewer.imageryLayers.layerRemoved.addEventListener(updateCapasList);
        viewer.imageryLayers.layerShownOrHidden.addEventListener(updateCapasList);

        updateCapasList();

        if (!destroyedRef.current && mountId === mountCountRef.current) {
          setViewerStatus("ready");
          console.log("[Globo] ✅ Inicialización completa");
        }
      } catch (error: any) {
        console.error("[Globo] ❌ Error de inicialización:", error);
        if (!destroyedRef.current) {
          setViewerStatus("error");
          setErrorMessage(error.message || "Error desconocido");
        }
      }
    }

    init();

    return () => {
      destroyedRef.current = true;
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        try {
          viewer.imageryLayers.layerAdded.removeEventListener(updateCapasList);
          viewer.imageryLayers.layerRemoved.removeEventListener(updateCapasList);
          viewer.imageryLayers.layerShownOrHidden.removeEventListener(updateCapasList);
        } catch (e) {}
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cambiar capa base ───
  const cambiarCapaBase = useCallback(
    async (tipo: "bing" | "bing_labels" | "bing_road" | "osm" | "maptiler") => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      const Cesium = (window as any).Cesium;

      while (viewer.imageryLayers.length > 0) {
        viewer.imageryLayers.remove(viewer.imageryLayers.get(0));
      }

      try {
        if (tipo === "bing") {
          const layer = await Cesium.IonImageryProvider.fromAssetId(2);
          viewer.imageryLayers.addImageryProvider(layer);
        } else if (tipo === "bing_labels") {
          const layer = await Cesium.IonImageryProvider.fromAssetId(3);
          viewer.imageryLayers.addImageryProvider(layer);
        } else if (tipo === "bing_road") {
          const layer = await Cesium.IonImageryProvider.fromAssetId(4);
          viewer.imageryLayers.addImageryProvider(layer);
        } else if (tipo === "osm") {
          const layer = new Cesium.OpenStreetMapImageryProvider({
            url: "https://tile.openstreetmap.org/",
          });
          viewer.imageryLayers.addImageryProvider(layer);
        } else if (tipo === "maptiler" && MAPTILER_KEY) {
          const layer = new Cesium.UrlTemplateImageryProvider({
            url: `https://api.maptiler.com/tiles/satellite/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`,
            maximumLevel: 19,
            credit: "© MapTiler",
          });
          viewer.imageryLayers.addImageryProvider(layer);
        }
        setCurrentBaseMap(tipo);
        updateCapasList();
      } catch (error) {
        console.error(`[Globo] Error al cambiar a ${tipo}:`, error);
      }
    },
    [updateCapasList]
  );

  // ─── Ajustar heightReference de edificaciones al toggle de relieve ───
  const actualizarHeightRefEdificaciones = useCallback(
    (conRelieve: boolean, viewer: any, Cesium: any) => {
      if (edificacionesDsRef.current) {
        const entities = edificacionesDsRef.current.entities.values;
        entities.forEach((entity: any) => {
          if (entity.polygon) {
            if (conRelieve) {
              entity.polygon.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
              entity.polygon.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
            } else {
              entity.polygon.heightReference = Cesium.HeightReference.NONE;
              entity.polygon.extrudedHeightReference = Cesium.HeightReference.NONE;
            }
          }
        });
      }
    },
    []
  );

  // ─── Toggle relieve ───
  const toggleTerrain = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const Cesium = (window as any).Cesium;

    if (terrainEnabled) {
      viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      setTerrainEnabled(false);
      // Actualizar edificaciones existentes a modo plano
      actualizarHeightRefEdificaciones(false, viewer, Cesium);
    } else {
      viewer.scene.terrainProvider = Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: true,
        requestWaterMask: true,
      });
      setTerrainEnabled(true);
      // Actualizar edificaciones existentes a modo relieve
      actualizarHeightRefEdificaciones(true, viewer, Cesium);
    }
  }, [terrainEnabled]);

  // ─── Volar a Venezuela ───
  const flyToHome = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const Cesium = (window as any).Cesium;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        VENEZUELA_CENTER.lon,
        VENEZUELA_CENTER.lat,
        VENEZUELA_CENTER.alt
      ),
      duration: 2,
    });
  }, []);

  // ─── Toggle OSM Buildings ───
  const toggleOsmBuildings = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const Cesium = (window as any).Cesium;

    if (osmBuildingsRef.current) {
      // Remover
      viewer.scene.primitives.remove(osmBuildingsRef.current);
      osmBuildingsRef.current = null;
      setOsmBuildingsVisible(false);
    } else {
      // Agregar OSM Buildings desde Cesium Ion (carga async)
      Cesium.Cesium3DTileset.fromIonAssetId(96188)
        .then((tileset: any) => {
          if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
          const ts = viewerRef.current.scene.primitives.add(tileset);
          osmBuildingsRef.current = ts;
          setOsmBuildingsVisible(true);
          tileset.style = new Cesium.Cesium3DTileStyle({
            color: "color('white', 0.85)",
          });
          viewerRef.current.flyTo(tileset);
        })
        .catch((e: any) => {
          console.warn("[Globo] Error cargando OSM Buildings:", e);
        });
    }
  }, []);

  // ─── Cargar edificaciones 3D ───
  const cargarEdificaciones = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const Cesium = (window as any).Cesium;

    if (!selectedFormId) {
      console.warn("[Edificaciones] No hay formulario seleccionado");
      return;
    }

    setLoadingEdificaciones(true);
    setEdificacionesCargadas(false);

    try {
      // Remover dataSource anterior
      if (edificacionesDsRef.current) {
        try { viewer.dataSources.remove(edificacionesDsRef.current, true); } catch {}
        edificacionesDsRef.current = null;
      }

      const response = await fetch(
        `${API_URL}/api/v2/projects/${projectId}/forms/${selectedFormId}/edificaciones-3d`
      );

      if (!response.ok) {
        console.warn("[Edificaciones] Sin datos disponibles");
        setLoadingEdificaciones(false);
        return;
      }

      const geojson = await response.json();

      if (!geojson.features || geojson.features.length === 0) {
        console.warn("[Edificaciones] Sin features con polígono");
        setLoadingEdificaciones(false);
        return;
      }

      // Cargar GeoJSON
      const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
        fill: Cesium.Color.fromAlpha(Cesium.Color.DODGERBLUE, 0.6),
        stroke: Cesium.Color.WHITE,
        strokeWidth: 2,
      });

      // Personalizar entidades
      const entities = dataSource.entities.values;
      entities.forEach((entity: any) => {
        if (entity.polygon && entity.properties) {
          const props = entity.properties.getValue() as EdificacionProperties;
          const altura = Math.max(props.altura || 0, 3);
          const pisos = props.pisos || 1;
          const alturaTotal = altura * pisos;

          entity.polygon.extrudedHeight = alturaTotal;
          entity.polygon.material = Cesium.Color.fromHsl(
            0.55 + (pisos * 0.02),
            0.7,
            0.5,
            0.8
          );
          entity.polygon.outline = true;
          entity.polygon.outlineColor = Cesium.Color.WHITE;
          entity.polygon.outlineWidth = 2;

          // ─── Adaptar al relieve/plano ───
          // Si el relieve está activo, las edificaciones se adhieren al terreno
          // Si no, se mantienen sobre el elipsoide (plano)
          if (terrainEnabled) {
            entity.polygon.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
            entity.polygon.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
          } else {
            entity.polygon.heightReference = Cesium.HeightReference.NONE;
            entity.polygon.extrudedHeightReference = Cesium.HeightReference.NONE;
          }

          entity.label = new Cesium.LabelGraphics({
            text: props.nombre || `Edificio ${pisos} pisos`,
            font: "12pt Inter, sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000),
          });
        }
      });

      viewer.dataSources.add(dataSource);
      edificacionesDsRef.current = dataSource;
      setEdificacionesCount(geojson.features.length);
      setEdificacionesCargadas(true);

      viewer.flyTo(dataSource, { duration: 2 });
    } catch (error) {
      console.error("[Edificaciones] Error:", error);
    } finally {
      setLoadingEdificaciones(false);
    }
  }, [projectId, selectedFormId]);

  // ─── Auto-cargar edificaciones cuando viewer y formulario estén listos ───
  useEffect(() => {
    if (viewerStatus === "ready" && selectedFormId && autoLoaded) {
      // Pequeña pausa para que el viewer termine de renderizar
      const timer = setTimeout(() => cargarEdificaciones(), 2000);
      return () => clearTimeout(timer);
    }
  }, [viewerStatus, selectedFormId, autoLoaded, cargarEdificaciones]);

  // ─── Render ───
  return (
    <div className="relative w-full h-full min-h-[600px] flex flex-col">
      {/* ─── Barra superior ─── */}
      <div
        className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 z-30"
        style={{ position: "relative" }}
      >
        {/* Selector de formulario */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">
            🏗️ Formulario:
          </span>
          <select
            value={selectedFormId}
            onChange={(e) => {
              setSelectedFormId(e.target.value);
              setAutoLoaded(false);
              // Limpiar edificaciones anteriores
              const viewer = viewerRef.current;
              const Cesium = (window as any).Cesium;
              if (viewer && !viewer.isDestroyed()) {
                if (edificacionesDsRef.current) {
                  try { viewer.dataSources.remove(edificacionesDsRef.current, true); } catch {}
                  edificacionesDsRef.current = null;
                }
                setEdificacionesCargadas(false);
                setEdificacionesCount(0);
              }
            }}
            disabled={formsLoading || forms.length === 0}
            className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 min-w-[200px]"
          >
            {formsLoading ? (
              <option value="">Cargando...</option>
            ) : forms.length === 0 ? (
              <option value="">Sin formularios</option>
            ) : (
              forms.map((f: any) => (
                <option key={f.xmlFormId} value={f.xmlFormId}>
                  {f.name || f.xmlFormId}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {/* Botón cargar */}
        <button
          onClick={cargarEdificaciones}
          disabled={!selectedFormId || loadingEdificaciones}
          className={`text-xs px-4 py-1.5 rounded font-medium transition-all ${
            loadingEdificaciones
              ? "bg-purple-800 text-purple-300 cursor-not-allowed"
              : "bg-purple-600 hover:bg-purple-500 text-white"
          }`}
        >
          {loadingEdificaciones
            ? "⏳ Cargando..."
            : edificacionesCargadas
              ? "🔄 Recargar"
              : "🚀 Cargar 3D"}
        </button>

        {/* Contador de edificaciones */}
        {edificacionesCargadas && (
          <span className="text-xs text-green-400 font-medium">
            🏢 {edificacionesCount} edificaciones
          </span>
        )}

        <div className="flex-1" />

        {/* Badge versión */}
        <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded font-mono">
          CesiumJS 1.142
        </span>
      </div>

      {/* ─── Contenedor del Globo ─── */}
      <div className="relative flex-1">
        <div
          id="cesiumContainer"
          ref={containerRef}
          className="absolute inset-0"
        />

        {/* ─── Overlay de carga ─── */}
        {viewerStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-20">
            <div className="text-white text-center">
              <div className="animate-bounce text-6xl mb-4">🌐</div>
              <p className="text-lg font-semibold">Cargando Globo 3D...</p>
              <p className="text-sm text-gray-400 mt-2">Preparando relieve e imágenes satelitales</p>
            </div>
          </div>
        )}

        {/* ─── Overlay de error ─── */}
        {viewerStatus === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-20">
            <div className="text-white text-center max-w-md p-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold mb-2">Error al cargar el Globo</h3>
              <p className="text-sm text-red-400 mb-4">{errorMessage}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold"
              >
                🔄 Reintentar
              </button>
            </div>
          </div>
        )}

        {/* ─── Panel de Controles ─── */}
        {viewerRef.current && (
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 max-w-[200px]">
            {/* Selector de capa base */}
            <div className="bg-black bg-opacity-80 text-white rounded-lg p-2.5 backdrop-blur-sm shadow-lg border border-gray-700">
              <h4 className="text-[10px] font-bold mb-1.5 uppercase tracking-wider text-gray-400">
                🗺️ Capa Base
              </h4>
              <div className="flex flex-col gap-0.5">
                {[
                  { id: "bing" as const, label: "🛰️ Bing Satelital" },
                  { id: "bing_labels" as const, label: "🏷️ Bing Etiquetado" },
                  { id: "bing_road" as const, label: "🛣️ Bing Calles" },
                  { id: "osm" as const, label: "🗺️ OpenStreetMap" },
                  ...(MAPTILER_KEY
                    ? [{ id: "maptiler" as const, label: "📡 MapTiler" }]
                    : []),
                ].map((capa) => (
                  <button
                    key={capa.id}
                    onClick={() => cambiarCapaBase(capa.id)}
                    className={`text-xs px-2 py-1 rounded text-left transition-colors ${
                      currentBaseMap === capa.id
                        ? "bg-blue-600 text-white font-medium"
                        : "hover:bg-gray-700 text-gray-300"
                    }`}
                  >
                    {capa.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Controles */}
            <div className="bg-black bg-opacity-80 text-white rounded-lg p-2.5 backdrop-blur-sm shadow-lg border border-gray-700 flex flex-col gap-1">
              <button
                onClick={toggleTerrain}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  terrainEnabled
                    ? "bg-green-700 hover:bg-green-600 font-medium"
                    : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                }`}
              >
                🏔️ Relieve: {terrainEnabled ? "ON" : "OFF"}
              </button>
              <button
                onClick={toggleOsmBuildings}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  osmBuildingsVisible
                    ? "bg-blue-700 hover:bg-blue-600 font-medium"
                    : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                }`}
              >
                🏢 OSM Buildings: {osmBuildingsVisible ? "ON" : "OFF"}
              </button>
              <button
                onClick={flyToHome}
                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                🏠 Venezuela
              </button>
            </div>

            {/* Lista de capas activas */}
            {capas.length > 0 && (
              <div className="bg-black bg-opacity-80 text-white rounded-lg p-2.5 backdrop-blur-sm shadow-lg border border-gray-700">
                <h4 className="text-[10px] font-bold mb-1 uppercase tracking-wider text-gray-400">
                  📑 Capas ({capas.length})
                </h4>
                <div className="flex flex-col gap-0.5">
                  {capas.map((capa, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          capa.visible ? "bg-green-400" : "bg-gray-500"
                        }`}
                      />
                      <span className="text-gray-300 truncate">{capa.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Barra de créditos ─── */}
        <div className="absolute bottom-2 right-2 z-10 text-[10px] text-gray-400 bg-black bg-opacity-60 px-2 py-0.5 rounded">
          CesiumJS · SIGERFI Dashboard
        </div>
      </div>
    </div>
  );
}
