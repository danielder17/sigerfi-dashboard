"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { getForms, getAllSubmissions } from "@/lib/api";
import type { Submission, FormSummary } from "@/types";
import dynamic from "next/dynamic";
import { BarChart3, PieChart, GitBranch, Radar, Hexagon, Sigma, Filter, RefreshCw } from "lucide-react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface ReportTabProps {
  projectId: number;
}

const CHART_TYPES = [
  { id: "bar", label: "Barras", icon: BarChart3, needsNumeric: true },
  { id: "pie", label: "Pastel", icon: PieChart, needsNumeric: false },
  { id: "histogram", label: "Histograma", icon: Sigma, needsNumeric: true },
  { id: "radar", label: "Radar", icon: Radar, needsNumeric: true },
  { id: "treemap", label: "Treemap", icon: Hexagon, needsNumeric: true },
  { id: "sankey", label: "Sankey", icon: GitBranch, needsNumeric: false },
];

function classifyFields(submissions: Submission[]) {
  if (!submissions.length) return { numeric: [], text: [], geo: [], others: [] as string[] };
  const sample = submissions[0];
  const numeric: { name: string; values: number[] }[] = [];
  const text: string[] = [];
  const geo: string[] = [];
  const others: string[] = [];

  // Recorrer todas las keys de TODAS las submissions para tener valores completos
  const allKeys = new Set<string>();
  submissions.forEach(s => Object.keys(s).forEach(k => allKeys.add(k)));

  allKeys.forEach((k) => {
    if (k.startsWith("@") || k === "meta" || k === "__id") return;

    // Es geo?
    const v = sample[k as keyof Submission];
    if (v && typeof v === "object" && !Array.isArray(v) && (v as any).type) {
      geo.push(k);
      return;
    }

    // Recoger todos los valores de todas las submissions para clasificar
    const vals = submissions.map(s => s[k as keyof Submission]).filter(v => v !== null && v !== undefined);

    if (vals.length === 0) { others.push(k); return; }

    // Si todos los valores son números, es numérico
    if (vals.every(v => typeof v === "number")) {
      numeric.push({ name: k, values: vals as number[] });
      return;
    }

    // Si no, es texto
    text.push(k);
  });

  return { numeric, text, geo, others };
}

export function ReportTab({ projectId }: ReportTabProps) {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);

  // Selectores
  const [dimensionField, setDimensionField] = useState("");
  const [metricField, setMetricField] = useState("");
  const [chartType, setChartType] = useState("bar");

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
    getAllSubmissions(projectId, selectedForm).then((res) => {
      if (res.submissions) {
        setSubmissions(res.submissions);
        // Resetear selectores al cargar nuevo formulario
        setDimensionField("");
        setMetricField("");
      }
      setLoading(false);
    });
  }, [projectId, selectedForm]);

  const fields = useMemo(() => classifyFields(submissions), [submissions]);

  // Auto-seleccionar campos
  useEffect(() => {
    if (!dimensionField && fields.text.length > 0) {
      setDimensionField(fields.text[0]);
    }
    if (!metricField && fields.numeric.length > 0) {
      setMetricField(fields.numeric[0].name);
    } else if (!metricField && fields.text.length > 1) {
      setMetricField(fields.text[1]);
    }
  }, [fields, dimensionField, metricField]);

  // Datos para el gráfico
  const chartOption = useMemo(() => {
    if (!submissions.length || !dimensionField || !metricField) return null;

    // Agrupar por dimensión
    const groups = new Map<string, number[]>();
    submissions.forEach((s) => {
      const dimVal = String(s[dimensionField as keyof Submission] ?? "N/A");
      const metVal = Number(s[metricField as keyof Submission]);
      if (!groups.has(dimVal)) groups.set(dimVal, []);
      if (!isNaN(metVal)) groups.get(dimVal)!.push(metVal);
    });

    const categories = Array.from(groups.keys());
    const isNumMetric = fields.numeric.some(f => f.name === metricField);
    const isSingleCategory = categories.length <= 1;

    let seriesData: number[];
    if (isNumMetric) {
      seriesData = categories.map(c => {
        const vals = groups.get(c)!;
        return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
      });
    } else {
      seriesData = categories.map(c => groups.get(c)!.length);
    }

    const baseOption: any = {
      tooltip: { trigger: "axis" },
      grid: { left: 70, right: 30, bottom: isSingleCategory ? 40 : 80, top: 20 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { rotate: categories.length > 5 ? 45 : 0, fontSize: 11, interval: 0, overflow: "truncate" },
      },
      yAxis: { type: "value", name: isNumMetric ? `Prom. ${metricField}` : "Frecuencia" },
    };

    switch (chartType) {
      case "bar":
        return {
          ...baseOption,
          series: [{ type: "bar", data: seriesData, itemStyle: { color: "#3b82f6" }, barMaxWidth: 50 }],
        };

      case "pie":
        return {
          tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
          series: [{
            type: "pie",
            radius: ["30%", "60%"],
            data: categories.map((c, i) => ({ name: c, value: seriesData[i] })),
            label: { show: true, formatter: "{b}: {c}", fontSize: 11 },
            emphasis: { label: { show: true, fontSize: 14 } },
          }],
        };

      case "histogram": {
        if (!isNumMetric) return baseOption;
        const allVals = submissions
          .map(s => Number(s[metricField as keyof Submission]))
          .filter(v => !isNaN(v));
        const min = Math.min(...allVals);
        const max = Math.max(...allVals);
        const bins = Math.min(8, Math.max(3, categories.length));
        const bw = (max - min) / bins || 1;
        const hist = Array(bins).fill(0);
        allVals.forEach(v => {
          const idx = Math.min(Math.floor((v - min) / bw), bins - 1);
          hist[idx]++;
        });
        const labels = hist.map((_, i) => `${(min + i * bw).toFixed(1)}-${(min + (i + 1) * bw).toFixed(1)}`);
        return {
          tooltip: { trigger: "axis" },
          grid: { left: 60, right: 30, bottom: 80, top: 20 },
          xAxis: { type: "category", data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
          yAxis: { type: "value" },
          series: [{ type: "bar", data: hist, itemStyle: { color: "#10b981" } }],
        };
      }

      case "radar": {
        if (!isNumMetric || isSingleCategory) return baseOption;
        const maxVal = Math.max(...seriesData) * 1.2 || 100;
        return {
          tooltip: {},
          radar: {
            indicator: categories.map(c => ({ name: c, max: maxVal })),
          },
          series: [{
            type: "radar",
            data: [{ value: seriesData, name: metricField }],
            symbol: "none",
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.3 },
          }],
        };
      }

      case "treemap":
        return {
          tooltip: { formatter: "{b}: {c}" },
          series: [{
            type: "treemap",
            data: categories.map((c, i) => ({ name: c, value: seriesData[i] })),
          }],
        };

      case "sankey": {
        if (categories.length < 2) return baseOption;
        const links = categories.map((c, i) => ({
          source: dimensionField,
          target: c,
          value: seriesData[i],
        }));
        return {
          tooltip: { trigger: "item", formatter: "{b}: {c}" },
          series: [{
            type: "sankey",
            layout: "none",
            emphasis: { focus: "adjacency" },
            data: [{ name: dimensionField }, ...categories.map(c => ({ name: c }))],
            links,
          }],
        };
      }

      default:
        return baseOption;
    }
  }, [submissions, dimensionField, metricField, chartType, fields]);

  // KPIs
  const kpis = useMemo(() => {
    if (!submissions.length) return null;
    const total = submissions.length;
    const firstNum = fields.numeric[0];

    if (firstNum) {
      const vals = firstNum.values;
      const avg = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
      return {
        total,
        numericKpi: { field: firstNum.name, avg, min: Math.min(...vals), max: Math.max(...vals) },
      };
    }

    return { total, numericKpi: null };
  }, [submissions, fields]);

  if (loading) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Paso 1: Formulario */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            1. Seleccionar formulario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedForm} onValueChange={(v) => { if (v !== null) { setSelectedForm(v); setDimensionField(""); setMetricField(""); setChartType("bar"); } }}>
            <SelectTrigger className="w-80">
              <SelectValue placeholder="-- Seleccionar formulario --" />
            </SelectTrigger>
            <SelectContent>
              {forms.map((f) => (
                <SelectItem key={f.xmlFormId} value={f.xmlFormId}>{f.name || f.xmlFormId}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedForm && submissions.length > 0 && (
        <>
          {/* KPIs */}
          {kpis && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Registros</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Campos numéricos</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{fields.numeric.length}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Campos texto</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{fields.text.length}</div></CardContent>
              </Card>
              {kpis.numericKpi && (
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Prom. {kpis.numericKpi.field}</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{kpis.numericKpi.avg}</div></CardContent>
                </Card>
              )}
            </div>
          )}

          <Separator />

          {/* Paso 2-4: Configuración */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">2. Dimension (eje X)</CardTitle>
                <p className="text-xs text-muted-foreground">Campo categorico para agrupar datos</p>
              </CardHeader>
              <CardContent>
                <Select value={dimensionField} onValueChange={(v: string | null) => { if ((v)) setDimensionField((v)!); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="-- Seleccionar campo --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ninguno</SelectItem>
                    {fields.text.map(f => (
                      <SelectItem key={f} value={f}>{f} 📝</SelectItem>
                    ))}
                    {fields.numeric.map(f => (
                      <SelectItem key={f.name} value={f.name}>{f.name} 🔢</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">3. Metrica (eje Y)</CardTitle>
                <p className="text-xs text-muted-foreground">Campo numerico para medir</p>
              </CardHeader>
              <CardContent>
                <Select value={metricField} onValueChange={(v: string | null) => { if ((v)) setMetricField((v)!); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="-- Seleccionar campo --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ninguno</SelectItem>
                    {fields.numeric.map(f => (
                      <SelectItem key={f.name} value={f.name}>{f.name} 🔢</SelectItem>
                    ))}
                    {fields.text.map(f => (
                      <SelectItem key={f} value={f}>{f} 📝 (frecuencia)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {metricField && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    {fields.numeric.some(f => f.name === metricField) ? "Promedio por categoria" : "Conteo de frecuencia"}
                  </Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">4. Tipo de grafico</CardTitle>
                <p className="text-xs text-muted-foreground">Visualizacion de los datos</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {CHART_TYPES.map((ct) => {
                    const Icon = ct.icon;
                    const isNum = fields.numeric.some(f => f.name === metricField);
                    const disabled = ct.needsNumeric && !isNum;
                    return (
                      <Button
                        key={ct.id}
                        variant={chartType === ct.id ? "default" : "outline"}
                        size="sm"
                        className="flex-col h-16 gap-1 text-[10px]"
                        disabled={disabled}
                        onClick={() => setChartType(ct.id)}
                      >
                        <Icon className="h-4 w-4" />
                        {ct.label}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico */}
          {chartOption && dimensionField && metricField ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {dimensionField} por {metricField}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[400px]">
                <ReactECharts option={chartOption} style={{ height: "100%", width: "100%" }} />
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Selecciona dimension y metrica para visualizar
            </div>
          )}

          {/* Tabla de datos agrupados */}
          {chartOption && dimensionField && metricField && submissions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Datos agrupados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-48 overflow-y-auto text-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-1 pr-4 font-medium">{dimensionField}</th>
                        <th className="pb-1 font-medium">{metricField} {fields.numeric.some(f => f.name === metricField) ? "(promedio)" : "(conteo)"}</th>
                        <th className="pb-1 pl-4 font-medium">Registros</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const groups = new Map<string, number[]>();
                        submissions.forEach(s => {
                          const dv = String(s[dimensionField as keyof Submission] ?? "N/A");
                          const mv = Number(s[metricField as keyof Submission]);
                          if (!groups.has(dv)) groups.set(dv, []);
                          if (!isNaN(mv)) groups.get(dv)!.push(mv);
                        });
                        return Array.from(groups.entries()).map(([cat, vals]) => {
                          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                          return (
                            <tr key={cat} className="border-b last:border-0">
                              <td className="py-1 pr-4">{cat}</td>
                              <td className="py-1">{fields.numeric.some(f => f.name === metricField) ? avg.toFixed(1) : vals.length}</td>
                              <td className="py-1 pl-4 text-muted-foreground">{vals.length}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {selectedForm && submissions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Sin datos disponibles</div>
      )}
    </div>
  );
}
