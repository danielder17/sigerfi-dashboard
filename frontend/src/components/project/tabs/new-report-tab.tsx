"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchApi } from "@/lib/api";
import { AnalysisReportView } from "./analysis-report-view";
import type {
  FormField,
  FormSchema,
  LogicalGroup,
  ReportResponse,
  ReportKPI,
  WordCloudItem,
  WordCloudData,
  ContingencyTable,
  PopulationPyramid,
} from "@/types/report";
import type { SpatialFilter } from "@/types";
import dynamic from "next/dynamic";
import {
  BarChart3,
  PieChart,
  Sigma,
  MapPin,
  Layers,
  RefreshCw,
  Table2,
  Tally1,
  Hash,
  MapIcon,
  GitCompareArrows,
  GanttChartSquare,
  LineChart,
  Circle,
  Radar,
  Globe,
  Radio,
  // icons for toggle
  Check,
  Plus,
  Users,
  ArrowUpDown,
  Info,
  Eye,
  EyeOff,
} from "lucide-react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });
// Import echarts-wordcloud plugin to register the wordCloud chart type
import "echarts-wordcloud";

interface Props {
  projectId: number;
  spatialFilter?: SpatialFilter;
  filteredIds?: string[];
}

const COLOR_PALETTES: Record<string, string[]> = {
  ocean: ["#00B4D8","#48CAE4","#90E0EF","#0077B6","#023E8A","#03045E","#0096C7","#ADE8F4"],
  sunset: ["#FF6B6B","#FFD93D","#FF9F1C","#F72585","#B5179E","#7209B7","#3A0CA3","#FF8C00"],
  forest: ["#2D6A4F","#40916C","#52B788","#95D5B2","#B7E4C7","#1B4332","#74C69D","#D8F3DC"],
  neon: ["#39FF14","#FF00FF","#00FFFF","#FFFF00","#FF4500","#7FFF00","#FF1493","#00BFFF"],
  pastel: ["#FFB3BA","#FFDFBA","#FFFFBA","#BAFFC9","#BAE1FF","#D4BAFF","#FFB3E6","#B3FFE6"],
};

const PALETTE_NAMES: Record<string, string> = {
  ocean: "Océano", sunset: "Atardecer", forest: "Bosque", neon: "Neón", pastel: "Pastel",
};

type ChartStyle = "bar" | "horizontal" | "line" | "area" | "pie" | "donut" | "polar" | "radar";
type StackMode = "none" | "stack" | "percent";

const CHART_STYLES: { value: ChartStyle; label: string }[] = [
  { value: "bar", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "line", label: "Línea" },
  { value: "area", label: "Área" },
  { value: "pie", label: "Circular" },
  { value: "donut", label: "Rosquilla" },
  { value: "polar", label: "Zona Polar" },
  { value: "radar", label: "Radar" },
];

// Mapa de iconos para grupos lógicos
const GROUP_ICONS: Record<string, React.ReactNode> = {
  id: <Hash className="h-4 w-4" />,
  map: <MapIcon className="h-4 w-4" />,
  bar: <BarChart3 className="h-4 w-4" />,
  radar: <Radar className="h-4 w-4" />,
  pie: <PieChart className="h-4 w-4" />,
  line: <LineChart className="h-4 w-4" />,
  table: <Table2 className="h-4 w-4" />,
  globe: <Globe className="h-4 w-4" />,
  default: <Sigma className="h-4 w-4" />,
};

// Mapa de análisis → chartStyle
const ANALYSIS_TO_STYLE: Record<string, ChartStyle> = {
  count: "bar",
  geo: "horizontal",
  bar: "bar",
  bar_stacked: "bar",
  pie: "pie",
  line: "line",
  radar: "radar",
  histogram: "horizontal",
  raw: "table" as any,
};

// Mapa de análisis → stackMode
const ANALYSIS_TO_STACK: Record<string, StackMode> = {
  bar_stacked: "stack",
};

function isNumeric(f: FormField) { return ["integer","decimal","int"].includes(f.type); }
function isCategorical(f: FormField) { return ["select_one","select_multiple","text"].includes(f.type); }
function isDate(f: FormField) { return ["date","dateTime","dateTime"].includes(f.type); }
function isGeo(f: FormField) { return ["geopoint","geotrace","geoshape"].includes(f.type); }

function buildChartOpts(
  labels: string[],
  series: { name: string; data: number[] }[],
  style: ChartStyle,
  palette: string[],
  stack: StackMode,
): object | null {
  if (style === "pie" || style === "donut") {
    const vals = series[0]?.data ?? [];
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      series: [{
        type: "pie", radius: style === "donut" ? ["35%","60%"] : "60%", center: ["50%","55%"],
        label: { formatter: "{b}", fontSize: 11 },
        data: labels.map((l,i) => ({ name: l, value: vals[i]??0, itemStyle: { color: palette[i % palette.length] } })),
      }],
    };
  }
  if (style === "polar") {
    return {
      tooltip: { trigger: "axis" },
      angleAxis: { type: "category", data: labels, startAngle: 90 },
      radiusAxis: {}, polar: {},
      series: series.map((s,i) => ({ type:"bar", coordinateSystem:"polar", name:s.name, data:s.data, itemStyle:{color:palette[i%palette.length]} })),
    };
  }
  if (style === "radar") {
    return {
      tooltip: { trigger: "item" },
      radar: { indicator: labels.map(l=>({name:l})), shape:"polygon" },
      series: series.map((s,i) => ({ type:"radar", name:s.name, data:[s.data], itemStyle:{color:palette[i%palette.length]}, lineStyle:{color:palette[i%palette.length]}, areaStyle:{opacity:0.1} })),
    };
  }
  const multi = series.length > 1;
  if (style === "line" || style === "area") {
    return {
      tooltip: { trigger: "axis" },
      legend: multi ? { data: series.map(s=>s.name) } : undefined,
      grid: { left: 60, right: 20, top: multi ? 50 : 40, bottom: 50 },
      xAxis: { type:"category", data: labels, axisLabel: { rotate: 45, fontSize: 11 } },
      yAxis: { type:"value" },
      series: series.map((s,i) => ({
        name: multi ? s.name : undefined, type:"line", data: s.data, smooth: true,
        areaStyle: style==="area" ? { opacity:0.4, color: palette[i%palette.length] } : undefined,
        lineStyle: { color: palette[i%palette.length] }, itemStyle: { color: palette[i%palette.length] },
        stack: stack!=="none" ? "total" : undefined, stackStrategy: stack==="percent" ? "all" : undefined,
      })),
    };
  }
  if (style === "horizontal") {
    return {
      tooltip: { trigger:"axis", axisPointer:{type:"shadow"} },
      legend: multi ? { data: series.map(s=>s.name) } : undefined,
      grid: { left: 100, right: 20, top: multi ? 50 : 40, bottom: 40 },
      xAxis: { type:"value" },
      yAxis: { type:"category", data: [...labels].reverse(), axisLabel: { fontSize: 11 } },
      series: series.map((s,i) => ({
        name: multi ? s.name : undefined, type:"bar", data: [...s.data].reverse(),
        itemStyle: { color: palette[i%palette.length], borderRadius: [0,4,4,0] },
        stack: stack!=="none" ? "total" : undefined, stackStrategy: stack==="percent" ? "all" : undefined,
      })),
    };
  }
  return {
    tooltip: { trigger:"axis" },
    legend: multi ? { data: series.map(s=>s.name) } : undefined,
    grid: { left: 60, right: 20, top: multi ? 50 : 40, bottom: 50 },
    xAxis: { type:"category", data: labels, axisLabel: { rotate:45, fontSize:11 } },
    yAxis: { type:"value" },
    series: series.map((s,i) => ({
      name: multi ? s.name : undefined, type:"bar", data:s.data,
      itemStyle: { color: palette[i%palette.length], borderRadius: [4,4,0,0] },
      stack: stack!=="none" ? "total" : undefined, stackStrategy: stack==="percent" ? "all" : undefined,
    })),
  };
}

function buildPieOpts(counts: Record<string,number>, palette: string[]) {
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return {
    tooltip: { trigger:"item", formatter:"{b}: {c} ({d}%)" },
    series: [{
      type:"pie", radius:["35%","60%"], center:["50%","55%"],
      label: { formatter:"{b}", fontSize:11 },
      data: entries.map(([n,v],i) => ({ name:n, value:v, itemStyle:{color:palette[i%palette.length]} })),
    }],
  };
}

function buildWordCloudOpts(items: WordCloudItem[], palette: string[]) {
  const maxC = Math.max(...items.map(i=>i.count), 1);
  const numItems = items.length;
  const vividPalette = ["#e63946","#457b9d","#2a9d8f","#e9c46a","#f4a261","#264653","#6d597a","#b56576","#219ebc","#ff006e","#8338ec","#3a86ff","#fb5607","#ffbe0b"];
  
  // Multiplicador para amplificar diferencias pequeÃ±as entre conteos
  // Si max es 5, valor * 30 = rango 30-150 en sizeRange [12,72]
  const multiplier = maxC <= 5 ? 30 : maxC <= 10 ? 15 : 8;
  
  return {
    tooltip: { trigger:"item", formatter:"{b}: {c}" },
    backgroundColor: "transparent",
    series: [{
      type:"wordCloud",
      shape: "circle",
      left: "center",
      top: "center",
      width: "100%",
      height: "100%",
      sizeRange: [12, 72],
      rotationRange: [0, 0],
      rotationStep: 0,
      gridSize: 8,
      drawOutOfBound: false,
      layoutAnimation: true,
      textStyle: {
        fontFamily: "Inter, sans-serif",
        fontWeight: 'bold',
        color: () => vividPalette[Math.floor(Math.random() * vividPalette.length)],
      },
      data: items.map(i => ({
        name: i.word,
        value: i.count * multiplier,
      })),
    }],
  };
}

function KPICard({ name, kpi, icon }: { name:string; kpi:ReportKPI; icon:React.ReactNode }) {
  return (
    <Card className="border-l-4 border-l-[#00B4D8]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium truncate max-w-[150px]">{name}</CardTitle>
        <div className="text-[#00B4D8]">{icon}</div>
      </CardHeader>
      <CardContent>
        {kpi.type==="categorical" || kpi.categories ? (
          <div className="space-y-1">
            <p className="text-2xl font-bold">{kpi.count}</p>
            <p className="text-xs text-muted-foreground">registros</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(kpi.categories??{}).slice(0,5).map(([c,n]) => <Badge key={c} variant="secondary" className="text-xs">{c}: {n}</Badge>)}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div><span className="text-muted-foreground">Promedio</span><p className="font-semibold">{kpi.avg}</p></div>
            <div><span className="text-muted-foreground">Mediana</span><p className="font-semibold">{kpi.median}</p></div>
            <div><span className="text-muted-foreground">Mín</span><p className="font-semibold">{kpi.min}</p></div>
            <div><span className="text-muted-foreground">Máx</span><p className="font-semibold">{kpi.max}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StyleEditor({ chartStyle, setChartStyle, paletteKey, setPaletteKey, stackMode, setStackMode }: {
  chartStyle: ChartStyle; setChartStyle: (v:ChartStyle)=>void;
  paletteKey: string; setPaletteKey: (v:string)=>void;
  stackMode: StackMode; setStackMode: (v:StackMode)=>void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" />Editor de estilo</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-3">
          <label className="text-xs text-muted-foreground block mb-2">Tipo de gráfico</label>
          <div className="grid grid-cols-4 gap-1">
            {CHART_STYLES.map(cs => (
              <button key={cs.value} onClick={()=>setChartStyle(cs.value)}
                className={`px-2 py-1.5 text-xs rounded-md border transition-all ${chartStyle===cs.value ? "border-[#00B4D8] bg-[#00B4D8]/10 text-[#00B4D8] font-medium" : "border-border hover:border-muted-foreground/40"}`}>
                {cs.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs text-muted-foreground block mb-1">Paleta de colores</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(COLOR_PALETTES).map(([key,colors]) => (
              <button key={key} onClick={()=>setPaletteKey(key)}
                className={`p-1 rounded-md border transition-all ${paletteKey===key ? "border-[#00B4D8] ring-1 ring-[#00B4D8]" : "border-border"}`} title={PALETTE_NAMES[key]}>
                <div className="flex gap-0.5">{colors.slice(0,4).map((c,i)=><div key={i} className="w-4 h-4 rounded-sm" style={{backgroundColor:c}}/>)}</div>
                <span className="text-[10px] text-muted-foreground">{PALETTE_NAMES[key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Agrupar por</label>
          <div className="flex gap-1">
            {([["none","Individual"],["stack","Apilado"],["percent","Porcentual"]] as [StackMode,string][]).map(([v,l]) => (
              <button key={v} onClick={()=>setStackMode(v)}
                className={`px-2 py-1 text-xs rounded-md border transition-all ${stackMode===v ? "border-[#00B4D8] bg-[#00B4D8]/10 text-[#00B4D8] font-medium" : "border-border hover:border-muted-foreground/40"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Componente de grupo lógico clickeable */
function LogicalGroupCard({
  group,
  allFields,
  isActive,
  onClick,
}: {
  group: LogicalGroup;
  allFields: FormField[];
  isActive: boolean;
  onClick: () => void;
}) {
  const numericCount = group.fields.filter(f => isNumeric(f)).length;
  const catCount = group.fields.filter(f => isCategorical(f)).length;
  const geoCount = group.fields.filter(f => isGeo(f)).length;
  const icon = GROUP_ICONS[group.icon] ?? GROUP_ICONS.default;

  const analysisLabel: Record<string, string> = {
    count: "Identificación",
    geo: "Geo-espacial",
    bar: "Barras",
    bar_stacked: "Barras Apiladas",
    pie: "Circular",
    radar: "Radar",
    line: "Línea Temporal",
    histogram: "Histograma",
    raw: "Tabla",
  };

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col gap-2 p-3 rounded-xl border-2 text-left transition-all min-h-[100px]
        ${isActive
          ? "border-[#00B4D8] bg-[#00B4D8]/10 shadow-md shadow-[#00B4D8]/20"
          : "border-border/60 hover:border-muted-foreground/30 hover:bg-muted/40"
        }`}
    >
      {/* Check activo */}
      {isActive && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#00B4D8] flex items-center justify-center">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Icono + nombre */}
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${isActive ? "bg-[#00B4D8]/20 text-[#00B4D8]" : "bg-muted text-muted-foreground"}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{group.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{analysisLabel[group.analysis] ?? group.analysis}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-2 flex-wrap">
        {numericCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{numericCount} num</Badge>
        )}
        {catCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{catCount} cat</Badge>
        )}
        {geoCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            <MapPin className="h-2.5 w-2.5 inline mr-0.5" />{geoCount}
          </Badge>
        )}
      </div>

      {/* Campos */}
      <div className="flex flex-wrap gap-1">
        {group.fields.slice(0, 5).map(f => (
          <span key={f.name} className="text-[9px] px-1 py-0.5 rounded bg-muted-foreground/10 text-muted-foreground truncate max-w-[80px]">
            {f.label?.slice(0, 12) || f.name.slice(0, 12)}
          </span>
        ))}
        {group.fields.length > 5 && (
          <span className="text-[9px] text-muted-foreground">+{group.fields.length - 5}</span>
        )}
      </div>
    </button>
  );
}

export function NewReportTab({ projectId, spatialFilter, filteredIds }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<"legacy" | "modules">("legacy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [forms, setForms] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [expandRepeat, setExpandRepeat] = useState<string>("");
  const [geopointField, setGeopointField] = useState<string>("");
  const [temporalField, setTemporalField] = useState<string>("");
  const [temporalGrouping, setTemporalGrouping] = useState("month");
  const [logicalGroups, setLogicalGroups] = useState<LogicalGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("bar");
  const [paletteKey, setPaletteKey] = useState<string>("ocean");
  const [stackMode, setStackMode] = useState<StackMode>("none");

  const palette = useMemo(() => COLOR_PALETTES[paletteKey] ?? COLOR_PALETTES.ocean, [paletteKey]);
  const [dptLabels, setDptLabels] = useState<Record<string,string>>({});
  const [selectedWcFields, setSelectedWcFields] = useState<string[]>([]);

  // Cache de labels DPT: resolve individual con cache local
  const dptCache = useMemo(() => new Map<string,string>(), []);
  const getDptLabel = useCallback((dim: string, code: string): string => {
    const key = `${dim}:${code}`;
    return dptLabels[key] || dptCache.get(key) || code;
  }, [dptLabels, dptCache]);

  // Resolver labels DPT cuando cambia el reporte
  useEffect(() => {
    if (!report?.report?.grouped_data) return;
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const nuevos: Record<string,string> = {};
    const pendientes: {dim: string; code: string}[] = [];

    for (const dim of Object.keys(report.report.grouped_data)) {
      const codes = Object.keys(report.report.grouped_data[dim]);
      for (const code of codes) {
        const key = `${dim}:${code}`;
        if (dptCache.has(key)) {
          nuevos[key] = dptCache.get(key)!;
        } else {
          pendientes.push({ dim, code });
        }
      }
    }

    if (pendientes.length === 0) {
      setDptLabels(nuevos);
      return;
    }

    (async () => {
      for (const p of pendientes) {
        try {
          const res = await fetch(`${api}/api/v2/labels/dpt/resolve?${p.dim}=${encodeURIComponent(p.code)}`);
          const data = await res.json();
          const label = data[p.dim] || p.code;
          const key = `${p.dim}:${p.code}`;
          nuevos[key] = label;
          dptCache.set(key, label);
        } catch {
          nuevos[`${p.dim}:${p.code}`] = p.code;
        }
      }
      setDptLabels(nuevos);
    })();
  }, [report, dptCache]);

  useEffect(() => {
    fetchApi<any>(`/projects/${projectId}/forms`).then(r => {
      if (r.data?.forms) { setForms(r.data.forms); if (r.data.forms.length===1) setSelectedForm(r.data.forms[0].xmlFormId); }
    });
  }, [projectId]);

  useEffect(() => {
    if (!selectedForm) return;
    fetchApi<FormSchema>(`/forms/${selectedForm}/schema?project_id=${projectId}`).then(r => {
      if (r.data?.fields) setFields(r.data.fields);
    });
    fetchApi<{form_id: string; groups: LogicalGroup[]}>(`/forms/${selectedForm}/logical-groups?project_id=${projectId}`).then(r => {
      if (r.data?.groups) setLogicalGroups(r.data.groups);
    });
  }, [selectedForm, projectId]);

  const numericFields = useMemo(() => fields.filter(f => isNumeric(f) && !f.is_repeat), [fields]);
  const categoricalFields = useMemo(() => fields.filter(f => isCategorical(f) && !f.is_repeat), [fields]);
  const metricFields = useMemo(() => [
    ...numericFields,
    ...categoricalFields.filter(f => 
      !['id_encuesta','mostrar_id_encuesta','deviceid','subscriberid','simserial','phonenumber','username','localizacion','nombre_apellido','sexo','profesion','cargo','institucion','estado','municipio','parroquia','sector','comunidad','comuna','consejo_comunal','foto_entrevistado','foto_institucion','grabacion_audio','nota_audio'].includes(f.name)
    )
  ], [numericFields, categoricalFields]);
  const dateFields = useMemo(() => fields.filter(f => isDate(f)), [fields]);
  const geoFields = useMemo(() => fields.filter(f => isGeo(f)), [fields]);
  const repeatGroups = useMemo(() => fields.filter(f => f.is_repeat), [fields]);

  /** Toggle selección de grupo lógico (multi-select) */
  const toggleGroup = useCallback((groupName: string) => {
    setSelectedGroups(prev => {
      const isActive = prev.includes(groupName);
      if (isActive) {
        return prev.filter(g => g !== groupName);
      } else {
        return [...prev, groupName];
      }
    });
    setReport(null);
  }, []);

  const toggleMetric = (name: string) => {
    setReport(null);
    setMetrics(p => p.includes(name) ? p.filter(m => m !== name) : [...p, name]);
  };

  const generateReport = useCallback(async () => {
    if (!selectedForm) return;
    // Si hay grupos seleccionados, delegar al backend la auto-configuración
    // Si no hay grupos pero sí métricas, enviar manual
    const hasGroups = selectedGroups.length > 0;
    if (!hasGroups && metrics.length === 0) return;

    setLoading(true); setError("");
    const body: Record<string,any> = {};

    if (hasGroups) {
      // Enviar grupos lógicos al backend para auto-configuración
      body.logical_groups = selectedGroups;
      // También pasar filtros manuales que el usuario haya configurado
      if (metrics.length > 0) body.metrics = metrics;
      if (dimensions.length > 0) body.dimensions = dimensions;
    } else {
      body.metrics = metrics;
      body.dimensions = dimensions;
    }

    if (expandRepeat) body.expand_repeat = expandRepeat;
    if (geopointField) body.geopoint_field = geopointField;
    if (temporalField) { body.temporal_field = temporalField; body.temporal_grouping = temporalGrouping; }
    // Pasar filtro espacial al backend
    if (spatialFilter && spatialFilter.type !== "none" && filteredIds && filteredIds.length > 0) {
      body.filtered_ids = filteredIds;
    }
    const res = await fetchApi<ReportResponse>(`/forms/${selectedForm}/report`, { method:"POST", body:JSON.stringify(body) });
    if (res.error) setError(res.error);
    else if (res.data) setReport(res.data);
    setLoading(false);
  }, [selectedForm, metrics, dimensions, expandRepeat, geopointField, temporalField, temporalGrouping, spatialFilter, filteredIds, selectedGroups]);

  useEffect(() => {
    // Auto-generar cuando se seleccionan grupos lógicos (no en primera carga)
    if (selectedForm && selectedGroups.length > 0 && !report) {
      generateReport();
    }
  }, [selectedForm, selectedGroups, generateReport, report]);

  return (
    <div className="space-y-6">
      {/* Toggle colapsar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Informe Automático</h3>
          {selectedGroups.length > 0 && <Badge variant="outline" className="text-xs font-normal">{selectedGroups.length} grupo(s)</Badge>}
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
      {/* Selector de formulario */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Informe Automático</CardTitle></CardHeader>
        <CardContent>
          <div className="max-w-sm mb-4">
            <label className="text-xs text-muted-foreground block mb-1">Formulario</label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={selectedForm} onChange={e=>{setSelectedForm(e.target.value); setReport(null); setSelectedGroups([]);}}>
              <option value="">Seleccionar...</option>
              {forms.map(f=><option key={f.xmlFormId} value={f.xmlFormId}>{f.name||f.xmlFormId}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Toggle de modo */}
      {selectedForm && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setMode("legacy")}
              className={`px-3 py-1 text-xs rounded-md transition-all ${mode === "legacy" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Grupos Lógicos
            </button>
            <button
              onClick={() => setMode("modules")}
              className={`px-3 py-1 text-xs rounded-md transition-all ${mode === "modules" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Módulos de Análisis
            </button>
          </div>
          <span className="text-[10px] text-muted-foreground/60">{mode === "legacy" ? "Agrupación automática por campos" : "Consultas estructuradas con preguntas de negocio"}</span>
        </div>
      )}

      {/* Modo Legacy: Grupos lógicos */}
      {mode === "legacy" && selectedForm && logicalGroups.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4" />
            Grupos de análisis
            <span className="text-[10px] text-muted-foreground/60 font-normal">— haz clic para seleccionar</span>
          </h3>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {logicalGroups
              .filter(g => g.name !== "Fechas" && g.name !== "Otros")
              .map(g => (
                <LogicalGroupCard
                  key={g.name}
                  group={g}
                  allFields={fields}
                  isActive={selectedGroups.includes(g.name)}
                  onClick={() => toggleGroup(g.name)}
                />
              ))}
          </div>
        </div>
      )}

      {/* Selectores manuales (siempre visibles) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Selectores avanzados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Métricas (elige varias)</label>
              <div className="flex flex-wrap gap-1 p-2 rounded-md border border-input min-h-[2.25rem]">
                {metricFields.slice(0, 16).map(f => {
                  const isNum = numericFields.includes(f);
                  return (
                    <button key={f.name}
                      onClick={()=>toggleMetric(f.name)}
                      title={isNum ? 'NumÃ©rica — suma, promedio, min/max' : 'Frecuencia — conteo de respuestas'}
                      className={`px-2 py-0.5 text-xs rounded-full border transition-all ${metrics.includes(f.name) ? "bg-[#00B4D8] text-white border-[#00B4D8]" : "border-border hover:border-muted-foreground/40"}`}
                    >{f.label||f.name}
                      {isNum ? null : <span className="ml-1 text-[8px] opacity-60">#</span>}
                    </button>
                  );
                })}
              </div>
              {metrics.length>0 && <p className="text-[10px] text-muted-foreground mt-1">{metrics.length} seleccionada(s) — {metrics.filter(m => numericFields.find(n => n.name === m)).length} numÃ©ricas, {metrics.filter(m => !numericFields.find(n => n.name === m)).length} frecuencias</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Dimensión</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={dimensions[0]??""} onChange={e=>{setDimensions(e.target.value?[e.target.value]:[]); setReport(null);}}>
                <option value="">Sin dimensión</option>
                {categoricalFields.map(f=><option key={f.name} value={f.name}>{f.label||f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Agrupar por fecha</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={temporalField} onChange={e=>setTemporalField(e.target.value)}>
                <option value="">Sin fecha</option>
                {dateFields.map(f=><option key={f.name} value={f.name}>{f.label||f.name}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={generateReport}
                disabled={loading||!selectedForm||(selectedGroups.length===0&&metrics.length===0)}
                className="bg-[#00B4D8] hover:bg-[#0077B6] w-full">
                {loading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generando...</>
                  : <><RefreshCw className="h-4 w-4 mr-2" />Generar</>}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {repeatGroups.length>0 && <div>
              <label className="text-xs text-muted-foreground block mb-1">Grupo repetido</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={expandRepeat} onChange={e=>setExpandRepeat(e.target.value)}>
                <option value="">No expandir</option>
                {repeatGroups.map(f=><option key={f.path} value={f.path}>{f.label||f.name}</option>)}
              </select>
            </div>}
            {geoFields.length>0 && <div>
              <label className="text-xs text-muted-foreground block mb-1">Ubicación</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={geopointField} onChange={e=>setGeopointField(e.target.value)}>
                <option value="">Sin ubicación</option>
                {geoFields.map(f=><option key={f.name} value={f.name}>{f.label||f.name}</option>)}
              </select>
            </div>}
            {temporalField && <div>
              <label className="text-xs text-muted-foreground block mb-1">Intervalo temporal</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={temporalGrouping} onChange={e=>setTemporalGrouping(e.target.value)}>
                <option value="day">Día</option><option value="week">Semana</option>
                <option value="month">Mes</option><option value="quarter">Trimestre</option><option value="year">Año</option>
              </select>
            </div>}
          </div>
        </CardContent>
      </Card>

      {error && <div className="p-4 bg-destructive/10 rounded-lg text-sm text-destructive">{error}</div>}
      {loading && <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-48 rounded-xl" />)}</div>}

      {report && !loading && <div className="space-y-6">
        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Object.entries(report.report.kpis).map(([name,kpi]) => (
            <KPICard key={name} name={name} kpi={kpi}
              icon={name.toLowerCase().includes("ingreso")||name.toLowerCase().includes("familia") ? <Tally1 className="h-4 w-4" /> : <Sigma className="h-4 w-4" />} />
          ))}
        </div>

        <Separator />

        {/* Editor + Gráfico principal */}
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <StyleEditor chartStyle={chartStyle} setChartStyle={setChartStyle}
              paletteKey={paletteKey} setPaletteKey={setPaletteKey}
              stackMode={stackMode} setStackMode={setStackMode} />
          </div>
          <div className="lg:col-span-3 space-y-4">
            {/* Gráfico por dimensión */}
            {dimensions.length>0 && report.report.grouped_data[dimensions[0]] && (()=>{
              const dd = report.report.grouped_data[dimensions[0]];
              const rawLabels = Object.keys(dd);
              const labels = rawLabels.map(l => getDptLabel(dimensions[0], l));
              const seriesData = metrics.map(m => {
                const kpi = report.report.kpis[m];
                if (!kpi) return null;
                if (kpi.type !== "categorical") {
                  // Métrica numérica: count por grupo
                  return { name: m, data: rawLabels.map(l => dd[l]?.[m]?.count ?? 0) };
                }
                // Métrica categórica: mostrar frecuencia total por grupo + top categoría
                const values = rawLabels.map(l => {
                  const g = dd[l]?.[m];
                  return g?.count ?? 0;
                });
                return { name: `${m} (frec)`, data: values };
              }).filter((x): x is { name: string; data: number[] } => x !== null);
              if (seriesData.length===0) return null;
              const opt = buildChartOpts(labels, seriesData, chartStyle, palette, stackMode);
              return opt ? <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#00B4D8]" />{metrics.join(", ")} por {dimensions[0]}</CardTitle></CardHeader>
                <CardContent><ReactECharts option={opt} style={{height:320}} key={`${chartStyle}-${paletteKey}-${stackMode}-main`} /></CardContent>
              </Card> : null;
            })()}

            {/* Temporal */}
            {report.report.temporal_data?.data && Object.keys(report.report.temporal_data.data).length>0 && (()=>{
              const td = report.report.temporal_data;
              const opt = buildChartOpts(Object.keys(td.data), [{name:"Registros", data:Object.values(td.data)}],
                chartStyle==="pie"||chartStyle==="donut" ? "line" : chartStyle, palette, stackMode);
              return opt ? <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#00B4D8]" />Registros por {td.grouping}</CardTitle></CardHeader>
                <CardContent><ReactECharts option={opt} style={{height:320}} key={`${chartStyle}-${paletteKey}-${stackMode}-temp`} /></CardContent>
              </Card> : null;
            })()}
          </div>
        </div>

        {/* Gráficos individuales por métrica */}
        {metrics.length>1 && <>
          <Separator />
          <h3 className="text-sm font-medium text-muted-foreground">Distribución individual por métrica</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {metrics.map(metric => {
              const kpi = report.report.kpis[metric];
              if (!kpi) return null;
              // Métrica categórica (texto, select) — mostrar barras con frecuencia
              if (kpi.type === "categorical" && kpi.categories) {
                const cats = Object.entries(kpi.categories).slice(0, 15);
                if (cats.length === 0) return null;
                const labels = cats.map(([c]) => c);
                const counts = cats.map(([,n]) => n);
                const style = chartStyle==="pie"||chartStyle==="donut" ? chartStyle : "bar";
                const opt = buildChartOpts(labels, [{name:metric, data:counts}], style, palette, "none");
                return opt ? <Card key={metric}>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{metric} <span className="text-[10px] font-normal text-muted-foreground">(frecuencia)</span></CardTitle></CardHeader>
                  <CardContent><ReactECharts option={opt} style={{height:250}} key={`cat-${metric}`} /></CardContent>
                </Card> : null;
              }
              // Métrica numérica — histograma
              const values = (report.report.raw_data ?? []).map(s => Number(s[metric as keyof typeof s])).filter(v => !isNaN(v));
              if (values.length===0) return null;
              const min = Math.min(...values); const max = Math.max(...values);
              const bins = 5; const binSize = (max-min)/bins || 1;
              const dist: Record<string,number> = {};
              for (let i=0; i<bins; i++) dist[`${(min+i*binSize).toFixed(1)}-${(min+(i+1)*binSize).toFixed(1)}`] = 0;
              values.forEach(v => {
                const idx = Math.min(Math.floor((v-min)/binSize), bins-1);
                const label = `${(min+idx*binSize).toFixed(1)}-${(min+(idx+1)*binSize).toFixed(1)}`;
                dist[label] = (dist[label]??0)+1;
              });
              const style = chartStyle==="pie"||chartStyle==="donut" ? chartStyle : "bar";
              const opt = buildChartOpts(Object.keys(dist), [{name:metric, data:Object.values(dist)}], style, palette, "none");
              return opt ? <Card key={metric}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{metric}</CardTitle></CardHeader>
                <CardContent><ReactECharts option={opt} style={{height:250}} key={`${chartStyle}-${paletteKey}-${metric}`} /></CardContent>
              </Card> : null;
            })}
          </div>
        </>}

        {/* Nube de palabras interactiva con selector de campos */}
        {fields.length > 0 && (() => {
          const textLikeFields = fields.filter(f => 
            !f.is_repeat && 
            !['id_encuesta','mostrar_id_encuesta','deviceid','subscriberid','simserial','phonenumber','username','localizacion','foto_entrevistado','foto_institucion','grabacion_audio','nota_audio','nombre_apellido','sexo','profesion','cargo','institucion'].includes(f.name) &&
            (f.type === 'text' || f.type === 'select_one' || f.type === 'select_multiple') &&
            report.report.raw_data.length > 0 &&
            report.report.raw_data.some(s => s[f.name] && typeof s[f.name] === 'string' && s[f.name].trim().length > 0)
          );
          if (textLikeFields.length === 0) return null;
          return <>
            <Separator />
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Sigma className="h-4 w-4" />Nubes de palabras</h3>
              <div className="flex flex-wrap gap-1.5">
                {textLikeFields.map(f => {
                  const selected = selectedWcFields.includes(f.name);
                  return (
                    <button key={f.name}
                      onClick={() => {
                        setSelectedWcFields(prev =>
                          prev.includes(f.name)
                            ? prev.filter(n => n !== f.name)
                            : [...prev, f.name]
                        );
                      }}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                        selected
                          ? 'bg-[#00B4D8] text-white border-[#00B4D8]'
                          : 'border-border hover:border-muted-foreground/40'
                      }`}
                    >{f.label || f.name}</button>
                  );
                })}
              </div>
              {selectedWcFields.length === 0 && (
                <p className="text-xs text-muted-foreground">Selecciona uno o más campos para generar nubes de palabras</p>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {selectedWcFields.map(field => {
                  const rawData = report.report.raw_data;
                  // Contar respuestas COMPLETAS (categorías), no palabras sueltas
                  const counter = new Map<string, number>();
                  let totalDocs = 0;
                  rawData.forEach(s => {
                    const val = s[field];
                    if (val !== undefined && val !== null && val !== '') {
                      totalDocs++;
                      const responseKey = String(val).trim();
                      if (responseKey) counter.set(responseKey, (counter.get(responseKey) || 0) + 1);
                    }
                  });
                  if (counter.size === 0) return null;
                  const sorted = [...counter.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([response, count], i) => ({
                      word: response,
                      count,
                      frequency: count / rawData.length,
                      pct: Math.round(count / rawData.length * 100),
                      rank: i + 1,
                      documents: count, // cada documento que eligió esta respuesta
                    }));
                  const totalResp = sorted.reduce((a, i) => a + i.count, 0);
                  const stats = {
                    total_respuestas: totalResp,
                    unique_respuestas: counter.size,
                    total_documents: totalDocs,
                    avg_words_per_doc: 1,
                    top_words: sorted.slice(0, 10).map(i => [i.word, i.count] as [string, number]),
                  };
                  const opt = buildWordCloudOpts(sorted, palette);
                  const label = fields.find(f => f.name === field)?.label || field;
                  return <Card key={field}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Sigma className="h-4 w-4 text-[#00B4D8]" />Nube — {label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReactECharts option={opt} style={{height:260}} key={`wc-${field}`} />
                      <div className="mt-2 grid grid-cols-4 gap-2 text-[10px]">
                        <div className="bg-muted/50 rounded p-1.5 text-center">
                          <p className="font-semibold text-xs">{stats.total_respuestas}</p>
                          <p className="text-muted-foreground">Respuestas</p>
                        </div>
                        <div className="bg-muted/50 rounded p-1.5 text-center">
                          <p className="font-semibold text-xs">{stats.unique_respuestas}</p>
                          <p className="text-muted-foreground">Categorías</p>
                        </div>
                        <div className="bg-muted/50 rounded p-1.5 text-center">
                          <p className="font-semibold text-xs">{stats.total_documents}</p>
                          <p className="text-muted-foreground">Registros</p>
                        </div>
                        <div className="bg-muted/50 rounded p-1.5 text-center">
                          <p className="font-semibold text-xs">{(stats.total_documents / Math.max(sorted.length,1)).toFixed(1)}</p>
                          <p className="text-muted-foreground">Prom/cat</p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">Top respuestas por frecuencia</p>
                        <div className="flex flex-wrap gap-1">
                          {sorted.slice(0, 10).map(item => (
                            <Badge key={item.word} variant="secondary" className="text-[9px] px-1.5 py-0">
                              {item.word}
                              <span className="ml-1 text-muted-foreground/70">({item.count}, {item.pct}%)</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>;
                })}
              </div>
            </div>
          </>;
        })()}

        {/* PIRÁMIDE POBLACIONAL */}
        {report.report.population_pyramid && (()=>{
          const pp = report.report.population_pyramid;
          if (!pp.data.totals.reduce((a:number,b:number)=>a+b, 0)) return null;
          const pyramidOpt = {
            tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
            grid: { left: 80, right: 60, top: 40, bottom: 40 },
            xAxis: {
              type: 'value' as const,
              axisLabel: { formatter: (v: number) => Math.abs(v).toString() },
            },
            yAxis: { type: 'category' as const, data: [...pp.ranges].reverse(), axisLabel: { fontSize: 10 } },
            series: [
              {
                name: 'Hombres', type: 'bar' as const, stack: 'total',
                data: [...pp.data.hombres].reverse().map((v: number) => -Math.abs(v)),
                itemStyle: { color: '#00B4D8', borderRadius: [4,0,0,4] },
                barWidth: '80%',
              },
              {
                name: 'Mujeres', type: 'bar' as const, stack: 'total',
                data: [...pp.data.mujeres].reverse(),
                itemStyle: { color: '#FF6B6B', borderRadius: [0,4,4,0] },
                barWidth: '80%',
              },
              {
                name: 'Sin dato', type: 'bar' as const, stack: 'total',
                data: [...pp.data.sin_dato].reverse(),
                itemStyle: { color: '#CBD5E1', borderRadius: [0,4,4,0] },
                barWidth: '80%',
              },
            ],
          };
          return <>
            <Separator />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-[#00B4D8]" />Pirámide Poblacional</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 mb-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{pp.total_population}</p>
                    <p className="text-xs text-muted-foreground">Población total</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-[#00B4D8]">{pp.stats.total_hombres}</p>
                    <p className="text-xs text-muted-foreground">Hombres</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-[#FF6B6B]">{pp.stats.total_mujeres}</p>
                    <p className="text-xs text-muted-foreground">Mujeres</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3 mb-4 text-xs text-muted-foreground">
                  <div className="text-center">Edad mín: <strong>{pp.stats.edad_minima}</strong></div>
                  <div className="text-center">Edad máx: <strong>{pp.stats.edad_maxima}</strong></div>
                  <div className="text-center">Promedio: <strong>{pp.stats.edad_promedio}</strong></div>
                </div>
                <ReactECharts option={pyramidOpt} style={{height:350}} />
              </CardContent>
            </Card>
          </>;
        })()}

        {/* TABLAS DE CONTINGENCIA */}
        {report.report.contingency_tables && report.report.contingency_tables.length>0 && <>
          <Separator />
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><ArrowUpDown className="h-4 w-4" />Cruces de variables — Análisis de contingencia</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {report.report.contingency_tables.map((ct, ci) => {
              const table = ct as ContingencyTable;
              const colLabels = table.col_labels;
              return <Card key={ci}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#00B4D8]" />
                    {table.row_label || table.row_field} × {table.col_label || table.col_field}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">
                    Chi-cuadrado: {table.chi_square} · Total: {table.total} registros
                  </p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-56">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 px-1.5 font-medium">{table.row_label || table.row_field}</th>
                          {colLabels.map(cl => <th key={cl} className="text-right py-1 px-1.5 font-medium">{cl}</th>)}
                          <th className="text-right py-1 px-1.5 font-medium text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map(row => (
                          <tr key={row.label} className="border-b last:border-0">
                            <td className="py-1 px-1.5 font-medium">{row.label}</td>
                            {colLabels.map(cl => (
                              <td key={cl} className="text-right py-1 px-1.5">{row[cl] ?? 0}</td>
                            ))}
                            <td className="text-right py-1 px-1.5 font-medium">{row._row_total}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 font-medium">
                          <td className="py-1 px-1.5 text-muted-foreground">Total</td>
                          {colLabels.map(cl => (
                            <td key={cl} className="text-right py-1 px-1.5 text-muted-foreground">{table.col_totals[cl] ?? 0}</td>
                          ))}
                          <td className="text-right py-1 px-1.5 text-muted-foreground">{table.col_totals._row_total}</td>
                        </tr>
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>;
            })}
          </div>
        </>}

        {/* Torta de distribución */}
        <div className="grid gap-6 md:grid-cols-2">
          {dimensions.length>0 && report.report.grouped_data[dimensions[0]] && <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><PieChart className="h-4 w-4 text-[#00B4D8]" />Distribución por {dimensions[0]}</CardTitle></CardHeader>
            <CardContent>{(()=>{
              const dd = report.report.grouped_data[dimensions[0]];
              const counts: Record<string,number> = {};
              Object.entries(dd).forEach(([cat,m])=> { counts[cat] = Object.values(m).reduce((s:number,kpi:any)=>s+(kpi.count||0),0); });
              return <ReactECharts option={buildPieOpts(counts, palette)} style={{height:280}} />;
            })()}</CardContent>
          </Card>}
        </div>

        {/* Tabla */}
        {dimensions.length>0 && report.report.grouped_data[dimensions[0]] && <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Table2 className="h-4 w-4 text-[#00B4D8]" />Datos agrupados por {dimensions[0]}</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="max-h-72">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">{dimensions[0]}</th>
                  {metrics.map(m=><th key={m} className="text-right py-2 px-2 font-medium">{m} (count)</th>)}
                </tr></thead>
                <tbody>
                  {Object.entries(report.report.grouped_data[dimensions[0]]).map(([label,mObj])=>(
                    <tr key={label} className="border-b last:border-0">
                      <td className="py-1.5 px-2 font-medium">{label}</td>
                      {metrics.map(m=><td key={m} className="text-right py-1.5 px-2">{(mObj as any)[m]?.count||0}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>}

        {/* Geo */}
        {report.report.geo_points && report.report.geo_points.length>0 && <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-[#00B4D8]" />Ubicaciones ({report.report.geo_points.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {report.report.geo_points.map((pt,i)=> (
                <div key={i} className="p-2 bg-muted/50 rounded-lg text-xs">
                  <p className="font-medium">{pt.lat.toFixed(4)}, {pt.lon.toFixed(4)}</p>
                  <p className="text-muted-foreground truncate">{pt.address||pt.city||pt.state||"Sin dirección"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>}
      </div>}

      {/* Modo Módulos de Análisis */}
      {mode === "modules" && (
        <AnalysisReportView
          projectId={projectId}
          selectedForm={selectedForm}
          spatialFilter={spatialFilter}
          filteredIds={filteredIds}
        />
      )}
      </div>
    </div>
  );
}
