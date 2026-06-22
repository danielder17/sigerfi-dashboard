"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  Filter,
  Eye,
  EyeOff,
  Database,
  Table as TableIcon,
} from "lucide-react";
import { getForms, getSubmissions, getAllSubmissions } from "@/lib/api";
import type { Submission, FormSummary, SpatialFilter } from "@/types";
import { IndividualSubmissionView } from "./individual-submission-view";
import { useDptLabels } from "@/hooks/useDptLabels";

interface DataTabProps {
  projectId: number;
  spatialFilter?: SpatialFilter;
  filteredIds?: string[];
}

export function DataTab({ projectId, spatialFilter, filteredIds }: DataTabProps) {
  const { getLabel, resolve: resolveDpt, loading: dptLoading } = useDptLabels();
  const [collapsed, setCollapsed] = useState(false);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("__id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showIndividual, setShowIndividual] = useState(false);
  const [selectedFormName, setSelectedFormName] = useState("");

  useEffect(() => {
    getForms(projectId).then((res) => {
      if (res.forms) {
        setForms(res.forms);
        if (res.forms.length === 1) {
          setSelectedForm(res.forms[0].xmlFormId);
          setSelectedFormName(res.forms[0].name || res.forms[0].xmlFormId);
        }
      }
    });
  }, [projectId]);

  const loadSubmissions = useCallback(async (formId: string) => {
    if (!formId) return;
    setLoading(true);
    const res = await getAllSubmissions(projectId, formId);
    if (res.submissions) {
      setSubmissions(res.submissions);
      const cols: string[] = [];
      if (res.submissions.length > 0) {
        Object.keys(res.submissions[0]).forEach((k) => {
          if (!k.startsWith("@") && k !== "meta") cols.push(k);
        });
      }
      const allCols = Array.from(new Set(["__id", ...cols])) as string[];
      setAllColumns(allCols);
      setVisibleColumns(new Set(allCols.slice(0, 9)));
    }
    setLoading(false);
  }, [projectId]);

  // Resolver DPT labels cuando cambien submissions o columnas
  useEffect(() => {
    if (submissions.length > 0 && allColumns.length > 0) {
      resolveDpt(submissions, allColumns);
    }
  }, [submissions.length, allColumns.length, resolveDpt, submissions, allColumns]);

  useEffect(() => {
    if (selectedForm) loadSubmissions(selectedForm);
  }, [selectedForm, loadSubmissions]);

  const filtered = submissions
    .filter((s) => {
      if (spatialFilter && spatialFilter.type !== "none" && filteredIds && filteredIds.length > 0) {
        return filteredIds.includes(s.__id);
      }
      if (!searchTerm) return true;
      return Object.values(s).some((v) =>
        String(v).toLowerCase().includes(searchTerm.toLowerCase())
      );
    })
    .sort((a, b) => {
      const va = String(a[sortKey as keyof Submission] ?? "");
      const vb = String(b[sortKey as keyof Submission] ?? "");
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const toggleColumn = (col: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Toggle colapsar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TableIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Tabla de datos</h3>
          <Badge variant="outline" className="text-xs font-normal">{filtered.length} registros</Badge>
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
        {/* Barra de herramientas */}
        <Card>
          <CardContent className="p-3 flex items-center gap-4 flex-wrap">
            <Select value={selectedForm} onValueChange={(v: string | null) => {
              if (v) {
                setSelectedForm(v);
                const found = forms.find(f => f.xmlFormId === v);
                setSelectedFormName(found?.name || found?.xmlFormId || v);
              }
            }}>
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

            {selectedForm && (
              <>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    className="flex h-10 w-full rounded-md border border-input bg-background px-8 py-2 text-sm"
                    placeholder="Buscar en datos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Badge variant="secondary">{filtered.length} registros</Badge>
                {allColumns.length > 9 && (
                  <div className="flex items-center gap-1">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      className="text-xs border border-input rounded bg-background px-1.5 py-1 max-w-32"
                      value=""
                      onChange={(e) => { if (e.target.value) toggleColumn(e.target.value); e.target.value = ""; }}
                    >
                      <option value="">Columnas...</option>
                      {allColumns
                        .filter((c) => !visibleColumns.has(c))
                        .map((c) => (
                          <option key={c} value={c}>+ {c}</option>
                        ))}
                    </select>
                  </div>
                )}
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-4 w-4" /> Exportar
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Contenido */}
        {loading ? (
          <Card><CardContent className="p-6"><Skeleton className="h-80" /></CardContent></Card>
        ) : filtered.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="min-w-max">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {allColumns
                          .filter((c) => visibleColumns.has(c))
                          .map((col) => (
                            <th
                              key={col}
                              className="px-4 py-2 text-left font-medium cursor-pointer hover:bg-muted/80"
                              onClick={() => {
                                if (sortKey === col)
                                  setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                else { setSortKey(col); setSortDir("desc"); }
                              }}
                            >
                              <div className="flex items-center gap-1">
                                <span className="truncate max-w-32">{col}</span>
                                {sortKey === col && (sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                              </div>
                            </th>
                          ))}
                        <th className="px-4 py-2 w-10">
                          <Filter className="h-4 w-4 text-muted-foreground" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, i) => (
                        <tr key={row.__id || i} className="border-t hover:bg-accent/50">
                          {allColumns
                            .filter((c) => visibleColumns.has(c))
                            .map((col) => {
                              const rawVal = row[col as keyof Submission];
                              const label = getLabel(col, rawVal);
                              const display = typeof rawVal === "object"
                                ? JSON.stringify(rawVal).substring(0, 60)
                                : label || String(rawVal ?? "");
                              return (
                                <td key={col} className="px-4 py-2 max-w-48 truncate">
                                  {display}
                                </td>
                              );
                            })}
                          <td className="px-4 py-2">
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => {
                                setSelectedSubmission(row);
                                setShowIndividual(true);
                              }}
                              title="Ver encuesta completa"
                            >
                              <Eye size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : selectedForm ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Sin datos para este formulario
          </CardContent></Card>
        ) : (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Selecciona un formulario para ver los datos
          </CardContent></Card>
        )}
      </div>

      {/* Modal de encuesta individual */}
      <IndividualSubmissionView
        projectId={projectId}
        submission={selectedSubmission}
        open={showIndividual}
        onOpenChange={setShowIndividual}
        formId={selectedForm}
        formLabel={selectedFormName}
      />
    </div>
  );
}
