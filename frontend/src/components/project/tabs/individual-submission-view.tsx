"use client";

/**
 * IndividualSubmissionView - Modal que muestra una encuesta individual completa,
 * con sus preguntas, respuestas y etiquetas asociadas.
 */

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchApi } from "@/lib/api";
import type { Submission } from "@/types";
import {
  X,
  MapPin,
  Camera,
  Mic,
  Video,
  FileText,
  Hash,
  Calendar,
  CheckSquare,
  List,
  Globe,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

interface Props {
  projectId: number;
  submission: Submission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formLabel: string;
}

export function IndividualSubmissionView({
  projectId,
  submission,
  open,
  onOpenChange,
  formId,
  formLabel,
}: Props) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingLabels, setLoadingLabels] = useState(false);

  // Cargar labels del formulario
  useEffect(() => {
    if (!open || !formId) return;

    setLoadingLabels(true);
    // Intentar obtener labels del endpoint de schema
    fetchApi<{fields?: {name: string; label: string; type: string; options?: {label: string; value: string}[]}[]}>(
      `/forms/${formId}/schema?project_id=${projectId}`
    ).then((res) => {
      if (res.data?.fields) {
        const labelMap: Record<string, string> = {};
        for (const f of res.data.fields) {
          labelMap[f.name] = f.label || f.name;
        }
        setLabels(labelMap);
      }
    }).catch(() => {
      // Si falla, usar nombres como labels
    }).finally(() => setLoadingLabels(false));
  }, [open, formId, projectId]);

  if (!submission) return null;

  const getLabel = (field: string): string => {
    return labels[field] || field;
  };

  const getFieldIcon = (key: string, value: unknown) => {
    if (key === "ubicacion" || key === "location" || key === "geopoint") return <MapPin className="h-3.5 w-3.5" />;
    if (key.includes("foto") || key.includes("imagen") || key.includes("image") || key.includes("photo"))
      return <Camera className="h-3.5 w-3.5" />;
    if (key.includes("audio") || key.includes("voz")) return <Mic className="h-3.5 w-3.5" />;
    if (key.includes("video")) return <Video className="h-3.5 w-3.5" />;
    if (key === "start" || key === "end" || key === "today" || key.includes("fecha") || key.includes("date"))
      return <Calendar className="h-3.5 w-3.5" />;
    if (typeof value === "number") return <Hash className="h-3.5 w-3.5" />;
    if (typeof value === "boolean" || value === "yes" || value === "no" || value === "si" || value === "no")
      return <CheckSquare className="h-3.5 w-3.5" />;
    if (typeof value === "object" && value !== null) return <List className="h-3.5 w-3.5" />;
    return <FileText className="h-3.5 w-3.5" />;
  };

  const isMetaField = (key: string): boolean => {
    const metaKeys = ["__id", "__system", "meta", "@odata", "@id", "__system_submitterName", "deviceid",
      "simserial", "subscriberid", "username", "phonenumber"];
    return metaKeys.some((mk) => key.startsWith(mk) || key.startsWith("@"));
  };

  const isGeopoint = (key: string): boolean => {
    return key === "ubicacion" || key === "location" || key === "geopoint" ||
      key.includes("gps") || key.includes("coordenada");
  };

  const isRepeatGroup = (value: unknown): boolean => {
    return Array.isArray(value) && value.length > 0 && typeof value[0] === "object";
  };

  const isMediaUrl = (value: unknown): boolean => {
    return typeof value === "string" && (
      value.endsWith(".jpg") || value.endsWith(".jpeg") || value.endsWith(".png") ||
      value.endsWith(".m4a") || value.endsWith(".mp3") || value.endsWith(".mp4") ||
      value.endsWith(".3gp") || value.endsWith(".webm")
    );
  };

  const getMediaType = (value: string): "image" | "audio" | "video" | "other" => {
    if (value.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return "image";
    if (value.match(/\.(m4a|mp3|wav|ogg)$/i)) return "audio";
    if (value.match(/\.(mp4|3gp|webm|avi)$/i)) return "video";
    return "other";
  };

  const formatValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined) return <span className="text-muted-foreground italic">—</span>;
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (typeof value === "object") {
      if (isRepeatGroup(value)) return null; // Se maneja aparte
      return <code className="text-xs bg-muted p-1 rounded">{JSON.stringify(value)}</code>;
    }
    const str = String(value);
    if (isMediaUrl(str)) {
      const type = getMediaType(str);
      const mediaUrl = str.startsWith("http") ? str : null; // Podríamos construir URL de descarga
      return (
        <span className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] gap-1 px-1.5">
            {type === "image" && <Camera className="h-3 w-3" />}
            {type === "audio" && <Mic className="h-3 w-3" />}
            {type === "video" && <Video className="h-3 w-3" />}
            {type === "other" && <FileText className="h-3 w-3" />}
            {str.substring(0, 30)}...
          </Badge>
        </span>
      );
    }
    return <span>{str}</span>;
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Separar campos en categorías
  const fields: [string, unknown][] = Object.entries(submission)
    .filter(([k]) => !isMetaField(k) && !k.startsWith("@") && k !== "meta")
    .filter(([, v]) => !isRepeatGroup(v));

  const geopoints: [string, unknown][] = Object.entries(submission)
    .filter(([k]) => isGeopoint(k));

  const repeatGroups: [string, unknown][] = Object.entries(submission)
    .filter(([, v]) => isRepeatGroup(v));

  // Datos meta importantes
  const sysData = submission.__system as Record<string, unknown> | undefined;
  const metaInfo = {
    "ID": submission.__id?.substring(0, 30) + "...",
    "Fecha envío": (submission as Record<string, unknown>)["submissionDate"] || sysData?.submissionDate,
    "Encuestador": submission.nombre_encuestador || submission.username || submission.__system_submitterName,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Encuesta individual
                <Badge variant="outline" className="text-[10px] font-normal">{formLabel}</Badge>
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">
                {Object.entries(metaInfo)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <ScrollArea className="flex-1 max-h-[65vh]">
          <div className="py-4 px-1 space-y-4">
            {/* Geo puntos destacados */}
            {geopoints.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Ubicación
                </div>
                <div className="space-y-1">
                  {geopoints.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{getLabel(key)}</span>
                      <span className="font-mono">{formatValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Campos normales */}
            <div className="space-y-0.5">
              {fields.map(([key, value]) => {
                const label = getLabel(key);
                return (
                  <div
                    key={key}
                    className="flex items-start gap-3 py-2 px-2 rounded-md hover:bg-accent/30 transition-colors group"
                  >
                    <div className="mt-0.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                      {getFieldIcon(key, value)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground font-medium mb-0.5">{label}</div>
                      <div className="text-sm break-words">{formatValue(value)}</div>
                    </div>
                    <div className="text-[9px] text-muted-foreground/40 font-mono shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {key}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grupos repetidos */}
            {repeatGroups.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <List className="h-3.5 w-3.5" />
                  Grupos repetidos ({repeatGroups.length})
                </h4>
                {repeatGroups.map(([key, items]) => {
                  const isExpanded = expandedGroups.has(key);
                  const arr = items as Record<string, unknown>[];

                  return (
                    <div key={key} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleGroup(key)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted/20 hover:bg-muted/40 transition-colors"
                      >
                        <span>{getLabel(key)}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">{arr.length} registro(s)</Badge>
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="divide-y">
                          {arr.map((item, idx) => (
                            <div key={idx} className="p-3 space-y-1.5">
                              <div className="text-[10px] text-muted-foreground font-mono mb-1">
                                #{idx + 1}
                              </div>
                              {Object.entries(item).map(([ik, iv]) => (
                                <div key={ik} className="flex items-start gap-2 text-xs">
                                  <span className="text-muted-foreground shrink-0 w-28 truncate">
                                    {getLabel(ik)}
                                  </span>
                                  <span className="font-medium">{formatValue(iv)}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Metadatos (colapsados) */}
            <details className="text-xs text-muted-foreground pt-2 border-t">
              <summary className="cursor-pointer hover:text-foreground transition-colors font-medium">
                Metadatos técnicos
              </summary>
              <div className="mt-2 space-y-0.5">
                {Object.entries(submission)
                  .filter(([k]) => isMetaField(k) || k.startsWith("@"))
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="font-mono shrink-0">{k}</span>
                      <span className="truncate">{String(v).substring(0, 80)}</span>
                    </div>
                  ))}
              </div>
            </details>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
