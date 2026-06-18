"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Stats } from "@/types/stats";

interface ChartsSectionProps {
  stats?: Stats;
  loading: boolean;
}

export function ChartsSection({ stats, loading }: ChartsSectionProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const pieFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stats || loading) return;

    async function draw() {
      const { init: eInit } = await import("echarts");

      // 1. Barras: registros por dia
      if (barRef.current) {
        const chart = eInit(barRef.current);
        chart.setOption({
          tooltip: { trigger: "axis" },
          grid: { left: 50, right: 20, bottom: 40, top: 20 },
          xAxis: {
            type: "category",
            data: stats!.submissions_por_dia.map((d) => {
              const parts = d.date.split("-");
              return `${parts[2]}/${parts[1]}`;
            }),
            axisLabel: { color: "#9ca3af" },
          },
          yAxis: {
            type: "value",
            minInterval: 1,
            axisLabel: { color: "#9ca3af" },
          },
          series: [
            {
              type: "bar",
              data: stats!.submissions_por_dia.map((d) => d.count),
              itemStyle: {
                color: "#00B4D8",
                borderRadius: [4, 4, 0, 0],
              },
              animationDuration: 800,
            },
          ],
        });
        chart.on("finished", () => chart.resize());

        const ro = new ResizeObserver(() => chart.resize());
        ro.observe(barRef.current);
        return () => ro.disconnect();
      }
    }

    draw();
  }, [stats, loading]);

  useEffect(() => {
    if (!stats || loading) return;

    async function drawPies() {
      const { init: eInit } = await import("echarts");

      // 2. Torta: % submissions por proyecto
      if (pieRef.current) {
        const chart = eInit(pieRef.current);
        const hasData = stats!.submissions_por_proyecto.some((p) => p.count > 0);
        chart.setOption({
          tooltip: {
            trigger: "item",
            formatter: "{b}: {c} ({d}%)",
          },
          series: [
            {
              type: "pie",
              radius: ["30%", "70%"],
              center: ["50%", "50%"],
              data: hasData
                ? stats!
                    .submissions_por_proyecto.filter((p) => p.count > 0)
                    .map((p) => ({
                      name:
                        p.project_name.replace(/[^\w\sáéíóúñ]/g, "").trim() ||
                        `Proyecto ${p.project_id}`,
                      value: p.count,
                    }))
                : [{ name: "Sin datos", value: 1 }],
              itemStyle: {
                borderRadius: 4,
              },
              label: {
                color: "#d1d5db",
                formatter: hasData ? "{b}\n({d}%)" : "{b}",
                fontSize: 11,
              },
              color: [
                "#00B4D8",
                "#10b981",
                "#f59e0b",
                "#8b5cf6",
                "#ef4444",
              ],
              animationDuration: 800,
            },
          ],
        });
        const ro = new ResizeObserver(() => chart.resize());
        ro.observe(pieRef.current);
        return () => ro.disconnect();
      }
    }

    drawPies();
  }, [stats, loading]);

  useEffect(() => {
    if (!stats || loading) return;

    async function drawPieForms() {
      const { init: eInit } = await import("echarts");

      // 3. Torta: registros por formulario
      if (pieFormRef.current) {
        const chart = eInit(pieFormRef.current);
        const hasData = stats!.submissions_por_formulario.some(
          (f) => f.count > 0
        );
        chart.setOption({
          tooltip: {
            trigger: "item",
            formatter: "{b}: {c} ({d}%)",
          },
          series: [
            {
              type: "pie",
              radius: ["30%", "70%"],
              center: ["50%", "50%"],
              data: hasData
                ? stats!
                    .submissions_por_formulario.filter((f) => f.count > 0)
                    .map((f) => ({
                      name: f.form_name || f.form_id,
                      value: f.count,
                    }))
                : [{ name: "Sin datos", value: 1 }],
              itemStyle: {
                borderRadius: 4,
              },
              label: {
                color: "#d1d5db",
                formatter: hasData ? "{b}\n({d}%)" : "{b}",
                fontSize: 11,
              },
              color: [
                "#00B4D8",
                "#10b981",
                "#f59e0b",
                "#8b5cf6",
                "#ef4444",
                "#ec4899",
              ],
              animationDuration: 800,
            },
          ],
        });
        const ro = new ResizeObserver(() => chart.resize());
        ro.observe(pieFormRef.current);
        return () => ro.disconnect();
      }
    }

    drawPieForms();
  }, [stats, loading]);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Registros por día
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={barRef} className="h-64" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Registros por proyecto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={pieRef} className="h-64" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Registros por formulario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={pieFormRef} className="h-64" />
        </CardContent>
      </Card>
    </div>
  );
}
