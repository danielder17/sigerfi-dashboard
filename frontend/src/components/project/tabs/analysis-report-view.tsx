"use client";
import React from "react";

/**
 * AnalysisReportView - Componente que muestra los módulos de análisis configurables.
 * Reemplaza la sección de grupos lógicos con el nuevo sistema de módulos.
 *
 * Cada módulo contiene queries con preguntas de negocio, campos resueltos,
 * tipo de gráfico y justificación pedagógica.
 */

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchApi } from "@/lib/api";
import type {
  AnalysisModule,
  AnalysisModulesResponse,
  ModuleReportResponse,
  LogicalGroup,
} from "@/types/report";
import type { SpatialFilter } from "@/types";
import ReactECharts from "echarts-for-react";
import {
  BarChart3,
  PieChart,
  Sigma,
  Users,
  Wifi,
  Tractor,
  Sprout,
  SprayCan,
  FlaskConical,
  Road,
  GitCompareArrows,
  Table2,
  Hash,
  MapPin,
  LineChart,
  Eye,
  EyeOff,
  Check,
  ChevronRight,
  HelpCircle,
  Loader2,
} from "lucide-react";

// Mapa de iconos por nombre de módulo
const MODULE_ICONS: Record<string, any> = {
  coverage: Users,
  connectivity: Wifi,
  producer_type: Tractor,
  production: Sprout,
  fumigation: SprayCan,
  fertilization: FlaskConical,
  access_associativity: Road,
  cross_analysis: GitCompareArrows,
  demographics: Users,
};

// Mapa de colores por módulo
const MODULE_COLORS: Record<string, string> = {
  coverage: "#4F46E5",       // Indigo
  connectivity: "#0891B2",   // Cyan
  producer_type: "#059669",  // Emerald
  production: "#65A30D",     // Lime
  fumigation: "#D97706",     // Amber
  fertilization: "#DC2626",  // Red
  access_associativity: "#7C3AED", // Violet
  cross_analysis: "#DB2777", // Pink
  demographics: "#2563EB",   // Blue
};

interface Props {
  projectId: number;
  selectedForm: string;
  spatialFilter?: SpatialFilter;
  filteredIds?: string[];
}

export function AnalysisReportView({ projectId, selectedForm, spatialFilter, filteredIds }: Props) {
  const [modules, setModules] = useState<AnalysisModule[]>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [report, setReport] = useState<ModuleReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingModules, setLoadingModules] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());

  // Auto-expandir todas las queries cuando hay reporte
  useEffect(() => {
    if (report?.modules) {
      const allQids = new Set<string>();
      for (const m of report.modules) {
        for (const q of (m.queries || [])) {
          allQids.add(q.query_id);
        }
      }
      setExpandedQueries(allQids);
    }
  }, [report]);

  // Cargar módulos activos
  useEffect(() => {
    if (!selectedForm) return;
    setLoadingModules(true);
    fetchApi<AnalysisModulesResponse>(`/forms/${selectedForm}/analysis-modules?project_id=${projectId}`)
      .then(r => {
        if (r.data?.modules) {
          setModules(r.data.modules);
        }
      })
      .finally(() => setLoadingModules(false));
  }, [selectedForm, projectId]);

  const toggleModule = (moduleId: string) => {
    setSelectedModuleIds(prev =>
      prev.includes(moduleId)
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
    setReport(null);
  };

  const generateReport = async () => {
    if (!selectedForm || selectedModuleIds.length === 0) return;
    setLoading(true);
    setReport(null);

    const body: Record<string, any> = {
      logical_groups: selectedModuleIds,
    };
    if (spatialFilter && spatialFilter.type !== "none" && filteredIds && filteredIds.length > 0) {
      body.filtered_ids = filteredIds;
    }

    const res = await fetchApi<ModuleReportResponse>(
      `/forms/${selectedForm}/module-report`,
      { method: "POST", body: JSON.stringify(body) }
    );

    if (res.error) {
      console.error("Module report error:", res.error);
    } else if (res.data) {
      setReport(res.data);
    }
    setLoading(false);
  };

  // Auto-generar al seleccionar módulo
  useEffect(() => {
    if (selectedForm && selectedModuleIds.length > 0 && !report && !loading) {
      generateReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedForm, selectedModuleIds]);

  const toggleQuery = (qid: string) => {
    setExpandedQueries(prev => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  };

  // Renderizar data de una query según su tipo
  const renderQueryData = (query: any) => {
    if (query.error) {
      return <div className="text-destructive text-xs p-2 bg-destructive/10 rounded">Error: {query.error}</div>;
    }

    const data = query.data;
    if (!data) {
      return <div className="text-muted-foreground text-xs p-2 italic">Sin datos disponibles</div>;
    }

    const chart = query.chart || "card";
    const hasLabels = data?.labels?.length > 0;

    switch (chart) {
      case "card": {
        const value = data.value ?? data.total ?? data.sum ?? 0;
        return (
          <div className="text-center py-4">
            <div className="text-3xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="text-xs text-muted-foreground mt-1">{data.label || "Total"}</div>
          </div>
        );
      }

      case "donut":
      case "pie":
        return <PieChartView data={data} />;

      case "horizontal_bar":
        return <HorizontalBarChart data={data} />;

      case "bar":
      case "histogram":
        return hasLabels ? <HorizontalBarChart data={data} /> : <NumericKPIView data={data} />;

      case "treemap":
        return <HorizontalBarChart data={data} maxItems={10} />;

      case "numeric":
      case "numeric_grouped":
        return <NumericKPIView data={data} />;

      case "boxplot":
        return <BoxplotView data={data} />;

      case "heatmap":
        return <HeatmapView data={data} />;

      case "word_cloud":
        return <WordCloudView data={data} />;

      case "scatter":
        return <ScatterView data={data} />;

      case "table":
        return <TableView data={data} />;

      case "stacked_bar":
      case "stacked_bar_100":
        return <StackedBarView data={data} />;

      default:
        return <pre className="text-xs text-muted-foreground overflow-auto max-h-32">{JSON.stringify(data, null, 2)}</pre>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Módulos de Análisis</h3>
          {selectedModuleIds.length > 0 && (
            <Badge variant="outline" className="text-xs font-normal">{selectedModuleIds.length} módulo(s)</Badge>
          )}
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="gap-1 h-7 text-xs text-muted-foreground"
        >
          {collapsed ? <><Eye className="h-3.5 w-3.5" /> Mostrar</> : <><EyeOff className="h-3.5 w-3.5" /> Ocultar</>}
        </Button>
      </div>

      <div style={{ display: collapsed ? 'none' : undefined }}>
        {/* Módulos disponibles */}
        {loadingModules ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : modules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No se detectaron módulos de análisis para este formulario.
            <br />
            <span className="text-xs">Los módulos requieren campos específicos (ej. estado, municipio, edad, género).</span>
          </div>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {modules.map(mod => {
                const Icon = MODULE_ICONS[mod.module_id] || BarChart3;
                const color = MODULE_COLORS[mod.module_id] || "#6B7280";
                const isActive = selectedModuleIds.includes(mod.module_id);

                return (
                  <button
                    key={mod.module_id}
                    onClick={() => toggleModule(mod.module_id)}
                    className={`relative text-left rounded-lg border p-3 transition-all hover:shadow-md ${
                      isActive ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-2 right-2">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-5 w-5" style={{ color }} />
                      <span className="font-medium text-sm leading-tight">{mod.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      <Badge variant={mod.status === "full" ? "default" : "secondary"} className="text-[9px] px-1 py-0 mr-1">
                        {mod.active_queries_count}/{mod.total_queries}
                      </Badge>
                      consultas activas
                    </div>
                    {mod.description && (
                      <div className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-2">{mod.description}</div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Botón generar */}
            {selectedModuleIds.length > 0 && (
              <Button onClick={generateReport} disabled={loading} size="sm" className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                {loading ? "Generando..." : "Generar informe de módulos seleccionados"}
              </Button>
            )}
          </>
        )}

        <Separator className="my-4" />

        {/* Resultados del reporte */}
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        )}

        {report && report.modules && report.modules.length > 0 && (
          <div className="space-y-6">
            {report.modules.map(mod => (
              <div key={mod.module_id} className="space-y-3">
                <div className="flex items-center gap-2">
                  {React.createElement(MODULE_ICONS[mod.module_id] || BarChart3, { className: "h-4 w-4", style: { color: MODULE_COLORS[mod.module_id] } })}
                  <h4 className="text-sm font-semibold">{mod.name}</h4>
                  <Badge variant="outline" className="text-[10px] font-normal">{mod.queries?.length || 0} consultas</Badge>
                </div>

                {mod.error && (
                  <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-md">{mod.error}</div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {(mod.queries || []).map(q => {
                    const isExpanded = expandedQueries.has(q.query_id);

                    return (
                      <Card key={q.query_id} className={`overflow-hidden ${isExpanded ? "md:col-span-2" : ""}`}>
                        <CardHeader
                          className="p-3 pb-2 cursor-pointer hover:bg-accent/50"
                          onClick={() => toggleQuery(q.query_id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium leading-tight">{q.question}</div>
                              {q.justification && (
                                <div className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                                  <HelpCircle className="h-3 w-3 shrink-0" />
                                  {q.justification}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">{q.type}</Badge>
                              <Badge variant="outline" className="text-[9px] px-1 py-0">{q.chart}</Badge>
                              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                          </div>
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="p-3 pt-0">
                            <Separator className="mb-3" />
                            {renderQueryData(q)}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Resumen */}
            <Card className="bg-muted/30">
              <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Sigma className="h-3.5 w-3.5" />
                Total: {report.total_submissions} registros analizados en {report.modules.length} módulo(s)
                ({report.modules.reduce((a, m) => a + (m.queries?.length || 0), 0)} consultas)
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componentes de renderizado de queries ───────

/** Gráfico de barras horizontal con ECharts */
function HorizontalBarChart({ data, maxItems }: { data: any; maxItems?: number }) {
  const labels = data?.labels || [];
  const values = data?.values || [];
  if (labels.length === 0) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;

  const sliced = labels.slice(0, maxItems || labels.length);
  const vals = values.slice(0, maxItems || values.length);

  const option = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 100, right: 20, top: 10, bottom: 20, containLabel: true },
    xAxis: { type: 'value' as const, axisLabel: { fontSize: 10 } },
    yAxis: {
      type: 'category' as const,
      data: sliced.map((l: string) => l.length > 20 ? l.substring(0, 20) + '...' : l).reverse(),
      axisLabel: { fontSize: 10 },
    },
    series: [{
      type: 'bar' as const,
      data: [...vals].reverse(),
      itemStyle: { borderRadius: [0, 3, 3, 0], color: '#4F46E5' },
      barMaxWidth: 20,
    }],
  };

  return <ReactECharts option={option} style={{ height: Math.max(150, sliced.length * 30) }} />;
}

/** Gráfico de pastel con ECharts */
function PieChartView({ data }: { data: any }) {
  const labels = data?.labels || [];
  const values = data?.values || [];
  if (labels.length === 0 && !data?.series) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;

  // Soporte para data con series (multidimensional)
  if (data?.series) {
    // Si hay series, intentar renderizar como múltiples barras
    const keys = Object.keys(data.series);
    if (keys.length > 0) {
      const option = {
        tooltip: { trigger: 'axis' as const },
        legend: { data: keys, bottom: 0, textStyle: { fontSize: 10 } },
        grid: { left: 40, right: 20, top: 30, bottom: 40, containLabel: true },
        xAxis: { type: 'category' as const, data: data.labels || [], axisLabel: { rotate: 30, fontSize: 9 } },
        yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 } },
        series: keys.map((k, i) => ({
          name: k,
          type: 'bar' as const,
          data: data.series[k],
          itemStyle: { color: ['#4F46E5', '#0891B2', '#059669', '#D97706'][i % 4] },
        })),
      };
      return <ReactECharts option={option} style={{ height: 250 }} />;
    }
  }

  const total = values.reduce((a: number, b: number) => a + b, 0);
  if (total === 0) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;

  const colors = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#65A30D'];
  const option = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie' as const,
      radius: ['30%', '60%'],
      center: ['50%', '45%'],
      data: labels.map((l: string, i: number) => ({
        name: l,
        value: values[i] || 0,
        itemStyle: { color: colors[i % colors.length] },
      })),
      label: { fontSize: 10, formatter: ({ name, percent }: { name: string; percent: number }) => `${name}\n${percent}%` },
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
    }],
  };

  return <ReactECharts option={option} style={{ height: 260 }} />;
}

/** KPIs numéricos */
function NumericKPIView({ data }: { data: any }) {
  if (!data || typeof data !== 'object') return null;
  const items = [
    { label: "Registros", value: data.count },
    { label: "Suma", value: data.sum?.toFixed?.(1) ?? data.sum },
    { label: "Promedio", value: data.avg?.toFixed?.(1) ?? data.avg },
    { label: "Mediana", value: data.median?.toFixed?.(1) ?? data.median },
    { label: "Mínimo", value: data.min?.toFixed?.(1) ?? data.min },
    { label: "Máximo", value: data.max?.toFixed?.(1) ?? data.max },
    { label: "Desv. Est.", value: data.std?.toFixed?.(1) ?? data.std },
  ].filter(i => i.value !== undefined && i.value !== null);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 py-2">
      {items.map(item => (
        <div key={item.label} className="text-center p-2 bg-muted/30 rounded-md">
          <div className="text-lg font-bold">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</div>
          <div className="text-[10px] text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Boxplot con ECharts */
function BoxplotView({ data }: { data: any }) {
  const groups: any[] = data?.groups || [];
  if (groups.length === 0) {
    // Si no hay grupos con suficientes datos pero hay KPI, mostrar KPIs
    if (data?.count > 0) {
      return <NumericKPIView data={data} />;
    }
    return <div className="text-xs text-muted-foreground text-center py-4">Sin datos suficientes (mín. 4 valores)</div>;
  }

  if (groups.length === 1 && groups[0].name === "General") {
    const g = groups[0];
    // Mostrar como KPIs mejorados en vez de boxplot para pocos grupos
    return (
      <div className="py-2">
        <NumericKPIView data={{
          count: g.count,
          min: g.min, max: g.max,
          median: g.median, avg: (g.q1 + g.q3) / 2,
          q1: g.q1, q3: g.q3,
        }} />
        <div className="text-[10px] text-muted-foreground mt-1 text-center">
          Q1: {g.q1} · Mediana: {g.median} · Q3: {g.q3}
          {g.outliers?.length > 0 && ` · ${g.outliers.length} valor(es) atípico(s)`}
        </div>
      </div>
    );
  }

  // Múltiples grupos: boxplot con ECharts
  const names = groups.map(g => g.name);
  const boxData = groups.map(g => [g.min, g.q1, g.median, g.q3, g.max]);
  const outliers = groups.flatMap((g, i) => (g.outliers || []).map((v: number) => [i, v]));

  const option = {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 80, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'category' as const, data: names.map((n: string) => n.length > 12 ? n.substring(0,12)+'...' : n), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 } },
    series: [
      {
        name: 'Boxplot',
        type: 'boxplot' as const,
        data: boxData,
        itemStyle: { color: '#4F46E5' },
        tooltip: { formatter: (p: any) => `${p.name}<br/>Min: ${p.data[0]}<br/>Q1: ${p.data[1]}<br/>Mediana: ${p.data[2]}<br/>Q3: ${p.data[3]}<br/>Max: ${p.data[4]}` },
      },
      ...(outliers.length > 0 ? [{
        name: 'Outliers',
        type: 'scatter' as const,
        data: outliers,
        symbolSize: 6,
        itemStyle: { color: '#DC2626' },
      }] : []),
    ],
  };

  return <ReactECharts option={option} style={{ height: 250 }} />;
}

/** Mapa de calor con ECharts */
function HeatmapView({ data }: { data: any }) {
  if (!data?.rows || !data?.col_labels) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;
  const rows: any[] = data.rows || [];
  const cols: string[] = data.col_labels || [];

  const heatData: [number, number, number][] = [];
  let maxVal = 0;
  rows.forEach((row, ri) => {
    cols.forEach((col, ci) => {
      const v = Number(row[col]) || 0;
      if (v > maxVal) maxVal = v;
      heatData.push([ci, ri, v]);
    });
  });

  if (heatData.length === 0) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;

  const option = {
    tooltip: { formatter: (p: any) => `${rows[p.data[1]].label} - ${cols[p.data[0]]}: ${p.data[2]}` },
    grid: { left: 80, right: 30, top: 10, bottom: 60 },
    xAxis: { type: 'category' as const, data: cols, axisLabel: { rotate: 30, fontSize: 9 } },
    yAxis: { type: 'category' as const, data: rows.map(r => r.label), axisLabel: { fontSize: 9 } },
    visualMap: {
      min: 0,
      max: maxVal || 1,
      calculable: true,
      orient: 'horizontal' as const,
      left: 'center',
      bottom: 0,
      inRange: { color: ['#EEF2FF', '#4F46E5'] },
    },
    series: [{
      type: 'heatmap' as const,
      data: heatData,
      label: { show: heatData.length < 50, fontSize: 9 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
    }],
  };

  return <ReactECharts option={option} style={{ height: 300 }} />;
}

/** Nube de palabras interactiva */
function WordCloudView({ data }: { data: any }) {
  if (!data || typeof data !== 'object') return null;
  const entries = Object.entries(data);
  if (entries.length === 0) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;
  return (
    <div className="space-y-2 py-2">
      {entries.slice(0, 2).map(([field, items]: [string, any]) => {
        if (!items || !Array.isArray(items)) return null;
        const maxCount = Math.max(...items.map((i: any) => i.count || 0), 1);
        return (
          <div key={field}>
            <div className="text-[10px] text-muted-foreground mb-1">{field}</div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {(items as any[]).slice(0, 40).map((item, i) => (
                <span
                  key={i}
                  className="inline-block px-1.5 py-0.5 bg-muted rounded-sm text-xs cursor-default hover:bg-primary/10 hover:scale-105 transition-all"
                  style={{
                    opacity: 0.4 + 0.6 * (item.count / maxCount),
                    fontSize: `${10 + 10 * (item.count / maxCount)}px`,
                    color: `hsl(${200 + i * 15}, 60%, ${35 + 20 * (item.count / maxCount)}%)`,
                  }}
                  title={`${item.word}: ${item.count} (${item.pct}%)`}
                >
                  {item.word}
                </span>
              ))}
            </div>
            <div className="text-[9px] text-muted-foreground text-center mt-1">
              {items.length} palabras únicas de {items.reduce((a: number, i: any) => a + i.count, 0)} ocurrencias
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Dispersión con ECharts */
function ScatterView({ data }: { data: any }) {
  const points: { x: number; y: number }[] = data?.points || [];
  if (points.length === 0) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;

  const option = {
    tooltip: { formatter: (p: any) => `${data.x_field}: ${p.data[0]}<br/>${data.y_field}: ${p.data[1]}` },
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'value' as const, name: data.x_field, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value' as const, name: data.y_field, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    series: [{
      type: 'scatter' as const,
      data: points.map(p => [p.x, p.y]),
      symbolSize: 8,
      itemStyle: { color: '#4F46E5', opacity: 0.7 },
    }],
  };

  return <ReactECharts option={option} style={{ height: 280 }} />;
}

/** Tabla de datos simple */
function TableView({ data }: { data: any }) {
  if (!data?.labels) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;
  const labels: string[] = data.labels || [];
  const values: number[] = data.values || [];
  const total = data.total || values.reduce((a: number, b: number) => a + b, 0);
  const showPct = total > 0;
  return (
    <div className="overflow-x-auto py-2">
      <table className="text-xs w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left px-2 py-1 text-muted-foreground">Categoría</th>
            <th className="text-right px-2 py-1 text-muted-foreground">Cantidad</th>
            {showPct && <th className="text-right px-2 py-1 text-muted-foreground">%</th>}
            {showPct && <th className="pl-2 py-1"><div className="w-20"></div></th>}
          </tr>
        </thead>
        <tbody>
          {labels.map((l: string, i: number) => (
            <tr key={i} className="border-t border-border/50">
              <td className="px-2 py-1">{l}</td>
              <td className="px-2 py-1 text-right font-medium">{values[i]}</td>
              {showPct && (
                <>
                  <td className="px-2 py-1 text-right text-muted-foreground">{Math.round(values[i] / total * 100)}%</td>
                  <td className="pl-2 py-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden w-20">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${values[i] / total * 100}%` }} />
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Barras apiladas con ECharts */
function StackedBarView({ data }: { data: any }) {
  if (!data?.labels || data.labels.length === 0) return <div className="text-xs text-muted-foreground text-center py-4">Sin datos</div>;
  const categories = data.categories || [];
  if (categories.length === 0 && data.data) {
    // Intentar inferir categorías desde las keys de data
    const inferredCats = Object.keys(data.data);
    if (inferredCats.length > 0) {
      const colors = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED'];
      const option = {
        tooltip: { trigger: 'axis' as const },
        legend: { data: inferredCats, bottom: 0, textStyle: { fontSize: 10 } },
        grid: { left: 60, right: 20, top: 20, bottom: 50 },
        xAxis: { type: 'category' as const, data: data.labels, axisLabel: { rotate: 30, fontSize: 9 } },
        yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 } },
        series: inferredCats.map((k: string, i: number) => ({
          name: k,
          type: 'bar' as const,
          stack: 'total',
          data: data.data[k],
          itemStyle: { color: colors[i % colors.length] },
        })),
      };
      return <ReactECharts option={option} style={{ height: 300 }} />;
    }
  }

  const colors = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626'];
  const option = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: categories, bottom: 0, textStyle: { fontSize: 10 } },
    grid: { left: 60, right: 20, top: 20, bottom: 50 },
    xAxis: { type: 'category' as const, data: data.labels, axisLabel: { rotate: 30, fontSize: 9 } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 } },
    series: categories.map((cat: string, i: number) => ({
      name: cat,
      type: 'bar' as const,
      stack: 'total',
      data: data.data[cat] || [],
      itemStyle: { color: colors[i % colors.length] },
    })),
  };

  return <ReactECharts option={option} style={{ height: 300 }} />;
}
