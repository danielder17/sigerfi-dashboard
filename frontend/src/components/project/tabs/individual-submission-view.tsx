"use client";

/**
 * IndividualSubmissionView v4 — Visor tipo ficha técnica
 * - Expande objetos anidados (dicts) con sub-campos
 * - Diseño responsivo: Sheet mobile / Dialog desktop a pantalla completa
 * - Tarjetas con sombra, iconos semánticos coloreados, grid adaptativo
 * - Soporte multimedia, grupos repetidos, DPT resuelto
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchApi } from "@/lib/api";
import type { Submission } from "@/types";
import {
  MapPin,
  Camera,
  Mic,
  Video,
  FileText,
  Hash,
  Calendar,
  List,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  User,
  Clock,
  ImageIcon,
  Building2,
  Home,
  Phone,
  Mail,
  Download,
  LucideIcon,
  Layers,
  Info,
  Wifi,
  Droplets,
  Zap,
  Flame,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  projectId: number;
  submission: Submission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formLabel: string;
}

// ─── Helpers ────────────────────────────────────────────────

const META_FIELDS = new Set([
  "__submission_id", "__instance_id", "__submitter_id", "__created_at",
  "__media_urls", "__id", "__system", "meta", "@odata", "@id",
  "__system_submitterName", "deviceid", "simserial", "subscriberid",
  "username", "phonenonenumber", "phonenumber",
]);

const MEDIA_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".mp4", ".webm", ".mov", ".3gp"]);

const SI_NO_MAP: Record<string, string> = {
  si: "Sí", no: "No", true: "Sí", false: "No",
  verde: "🟢 Verde", amarillo: "🟡 Amarillo", rojo: "🔴 Rojo",
  baja: "Baja", media: "Media", alta: "Alta",
};

function isMetaField(key: string): boolean {
  return META_FIELDS.has(key) || key.startsWith("@") || key.startsWith("__");
}

function isMediaFile(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const ext = value.substring(value.lastIndexOf(".")).toLowerCase();
  return MEDIA_EXTS.has(ext);
}

function getMediaType(value: string): "image" | "audio" | "video" | "other" {
  const ext = value.substring(value.lastIndexOf(".")).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) return "image";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".aac"].includes(ext)) return "audio";
  if ([".mp4", ".webm", ".mov", ".3gp"].includes(ext)) return "video";
  return "other";
}

function isGeojsonPoint(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.type === "Point" && Array.isArray(v.coordinates) && v.coordinates.length >= 2;
}

interface DptEntry {
  name: string;
  display_name: string;
  tipo: string;
  parent?: string;
}

// type alias for flat dpt map { code: label }
type DptFlatMap = Record<string, string>;

function isRepeatGroup(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === "object";
}

function isNestedDict(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    !(value as Record<string, unknown>).type &&
    (value as Record<string, unknown>).coordinates === undefined &&
    (value as Record<string, unknown>).instanceID === undefined;
}

function isDptField(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("estado") || lower.includes("municipio") ||
    lower.includes("parroquia") || lower.includes("sector") ||
    lower.includes("comunidad") || lower.includes("codigo_dpt") ||
    lower.includes("cod_dpt") || lower.includes("dpt_");
}

function stripMetaFromObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!isMetaField(k)) result[k] = v;
  }
  return result;
}

function isNullOrEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || v === "N/A";
}

function formatValue(v: unknown): string {
  if (isNullOrEmpty(v)) return "";
  const s = String(v).trim().toLowerCase();
  return SI_NO_MAP[s] || String(v);
}

// ─── Mapa de iconos por tipo de campo ───────────────────────

const FIELD_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  dpt: { icon: Building2, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
  geo: { icon: MapPin, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  foto: { icon: Camera, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
  audio: { icon: Mic, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
  video: { icon: Video, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
  calendar: { icon: Calendar, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
  number: { icon: Hash, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/30" },
  user: { icon: User, color: "text-slate-600", bg: "bg-slate-50 dark:bg-slate-950/30" },
  contact: { icon: Phone, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
  email: { icon: Mail, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
  home: { icon: Home, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  gas: { icon: Flame, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
  luz: { icon: Zap, color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  agua: { icon: Droplets, color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950/30" },
  internet: { icon: Wifi, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
  notes: { icon: FileText, color: "text-gray-600", bg: "bg-gray-50 dark:bg-gray-950/30" },
};

function getFieldIcon(key: string, value: unknown): { icon: LucideIcon; color: string; bg: string } {
  if (isDptField(key)) return FIELD_ICONS.dpt;
  if (isGeojsonPoint(value)) return FIELD_ICONS.geo;

  const lower = key.toLowerCase();
  if (lower.includes("foto") || lower.includes("imagen") || lower.includes("image") ||
      lower.includes("photo") || lower.includes("firma")) return FIELD_ICONS.foto;
  if (lower.includes("audio") || lower.includes("voz") || lower.includes("grabacion")) return FIELD_ICONS.audio;
  if (lower.includes("video")) return FIELD_ICONS.video;
  if (lower.includes("gps") || lower.includes("coord") || lower.includes("latitud") ||
      lower.includes("longitud") || lower.includes("ubicacion")) return FIELD_ICONS.geo;
  if (lower === "start" || lower === "end" || lower === "today" || lower.includes("fecha") ||
      lower.includes("date") || lower.includes("hora")) return FIELD_ICONS.calendar;
  if (typeof value === "number") return FIELD_ICONS.number;
  if (lower.includes("nombre") || lower.includes("apellido") || lower.includes("encuestador") ||
      lower.includes("responsable") || lower.includes("cedula")) return FIELD_ICONS.user;
  if (lower.includes("email") || lower.includes("mail")) return FIELD_ICONS.email;
  if (lower.includes("telefono") || lower.includes("celular") || lower.includes("tlf")) return FIELD_ICONS.contact;
  if (lower.includes("direccion") || lower.includes("domicilio")) return FIELD_ICONS.home;
  if (lower.includes("gas")) return FIELD_ICONS.gas;
  if (lower.includes("luz") || lower.includes("electricidad")) return FIELD_ICONS.luz;
  if (lower.includes("agua")) return FIELD_ICONS.agua;
  if (lower.includes("internet") || lower.includes("wifi")) return FIELD_ICONS.internet;
  if (lower.includes("observacion") || lower.includes("nota") || lower.includes("comentario")) return FIELD_ICONS.notes;
  return FIELD_ICONS.notes;
}

function getIconForFieldName(name: string): LucideIcon {
  name = name.toLowerCase();
  if (name.includes("gas")) return Flame;
  if (name.includes("luz") || name.includes("electricidad")) return Zap;
  if (name.includes("agua")) return Droplets;
  if (name.includes("internet") || name.includes("wifi")) return Wifi;
  if (name.includes("fuga")) return Droplets;
  if (name.includes("fecha")) return Calendar;
  if (name.includes("nombre") || name.includes("apellido") || name.includes("encuestador")) return User;
  if (name.includes("telefono")) return Phone;
  if (name.includes("observacion") || name.includes("nota")) return FileText;
  return GripVertical;
}

function getColorForFieldName(name: string): string {
  name = name.toLowerCase();
  if (name.includes("gas")) return "text-orange-600";
  if (name.includes("luz") || name.includes("electricidad")) return "text-yellow-500";
  if (name.includes("agua")) return "text-cyan-600";
  if (name.includes("internet") || name.includes("wifi")) return "text-blue-500";
  if (name.includes("fuga")) return "text-red-500";
  if (name.includes("fecha")) return "text-orange-500";
  return "text-muted-foreground";
}

// ─── Componente principal ────────────────────────────────────

export function IndividualSubmissionView({
  projectId,
  submission,
  open,
  onOpenChange,
  formId,
  formLabel,
}: Props) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [dptMap, setDptMap] = useState<DptFlatMap | Record<string, DptEntry>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);

  // Responsive detector
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Cargar labels del formulario
  useEffect(() => {
    if (!open || !formId) return;
    fetchApi<{ fields?: { name: string; label: string }[] }>(
      `/forms/${formId}/schema?project_id=${projectId}`
    ).then((res) => {
      if (res.data?.fields) {
        const labelMap: Record<string, string> = {};
        for (const f of res.data.fields) labelMap[f.name] = f.label || f.name;
        setLabels(labelMap);
      }
    }).catch(() => {});
  }, [open, formId, projectId]);

  // Cargar mapa DPT
  useEffect(() => {
    if (!open) return;
    fetchApi<DptFlatMap>("/v2/labels/dpt/list").then((res) => {
      if (res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
        setDptMap(res.data);
      }
    }).catch(() => {});
  }, [open]);

  const getLabel = useCallback((field: string): string =>
    labels[field] || field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  [labels]);

  const resolveDpt = useCallback((code: string): string => {
    if (!code || code === "N/A") return code;
    // dptMap ahora es un Record<string, string> (codigo -> nombre)
    if (dptMap && typeof dptMap === "object") {
      const name = (dptMap as Record<string, string>)[code];
      if (name) return name;
    }
    return code;
  }, [dptMap]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (!submission) return null;

  // ─── Preparar campos ─────────────────────────────────────
  const allEntries = Object.entries(submission).filter(([k]) => !isMetaField(k));

  const normalFields: [string, unknown][] = [];
  const geoFields: [string, unknown][] = [];
  const repeatGroups: [string, unknown][] = [];
  const mediaFields: [string, unknown][] = [];
  const nestedDictFields: [string, Record<string, unknown>][] = [];

  for (const [k, v] of allEntries) {
    if (isRepeatGroup(v)) repeatGroups.push([k, v]);
    else if (isGeojsonPoint(v)) geoFields.push([k, v]);
    else if (isMediaFile(v)) mediaFields.push([k, v]);
    else if (isNestedDict(v)) nestedDictFields.push([k, v]);
    else normalFields.push([k, v]);
  }

  const sysData = (submission as Record<string, unknown>).__system as Record<string, unknown> | undefined;
  const submitTime = (submission as Record<string, unknown>).submissionDate ||
    (submission as Record<string, unknown>).__created_at || sysData?.submissionDate || "";
  const submitter = (submission as Record<string, unknown>).__submitter_id ||
    (submission as Record<string, unknown>).username ||
    (submission as Record<string, unknown>).nombre_encuestador || "";

  // ─── Renderers ────────────────────────────────────────────

  const renderGeoPoint = (value: unknown): React.ReactNode => {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (v.type === "Point" && Array.isArray(v.coordinates)) {
      const [lng, lat] = v.coordinates as number[];
      return (
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
          <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
             className="text-blue-500 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/30 p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors">
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      );
    }
    return <code className="text-sm bg-muted p-1 rounded">{JSON.stringify(value).substring(0, 100)}</code>;
  };

  const renderMedia = (value: string, keyName: string): React.ReactNode => {
    if (!value || isNullOrEmpty(value)) return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/20 text-muted-foreground text-xs italic">
        <Camera className="h-4 w-4" /> Sin foto
      </div>
    );
    let mediaUrl = value;
    if (!value.startsWith("http") && !value.startsWith("data:")) {
      mediaUrl = `/api/media/${projectId}/${formId}/uuid:${submission?.__id || ""}/${value}`;
    }
    const type = getMediaType(value);
    if (type === "image") {
      return (
        <div className="relative group rounded-xl overflow-hidden border shadow-sm hover:shadow-md transition-shadow bg-muted/10">
          <img src={mediaUrl} alt={keyName}
               className="w-full h-40 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
               onClick={() => window.open(mediaUrl, "_blank")}
               onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          <button onClick={() => window.open(mediaUrl, "_blank")}
                  className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:bg-background">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }
    if (type === "audio") {
      return (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
          <audio controls className="w-full h-9" preload="none">
            <source src={mediaUrl} />
          </audio>
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
             className="text-blue-500 hover:text-blue-700 shrink-0 p-1 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded transition-colors">
            <Download className="h-4 w-4" />
          </a>
        </div>
      );
    }
    if (type === "video") {
      return (
        <div className="rounded-xl overflow-hidden border shadow-sm">
          <video controls className="w-full max-h-48" preload="none">
            <source src={mediaUrl} />
          </video>
        </div>
      );
    }
    return (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
         className="text-blue-600 hover:text-blue-800 underline text-sm flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/20 px-2 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors w-fit">
        <FileText className="h-3.5 w-3.5" />
        {value.substring(0, 40)}
      </a>
    );
  };

  /** Renderiza un campo simple con su tarjeta */
  const renderFieldCard = (key: string, value: unknown, small = false): React.ReactNode => {
    const { icon: Icon, color, bg } = getFieldIcon(key, value);
    const strValue = String(value ?? "");

    let displayValue: React.ReactNode = strValue;
    if (isDptField(key) && strValue) {
      const resolved = resolveDpt(strValue);
      displayValue = resolved !== strValue ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-amber-700 dark:text-amber-400">{resolved}</span>
          <code className="text-[11px] text-muted-foreground bg-muted/50 px-1 py-0.5 rounded">{strValue}</code>
        </span>
      ) : strValue;
    } else {
      const formatted = formatValue(value);
      if (formatted && formatted !== strValue) {
        displayValue = <span className="font-medium">{formatted}</span>;
      }
    }

    if (small) {
      return (
        <div className="flex items-start gap-2.5 py-2 px-1.5">
          <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", color)} />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground font-medium leading-tight mb-0.5">
              {getLabel(key)}
            </div>
            <div className={cn("text-sm font-medium break-words", isNullOrEmpty(value) ? "text-muted-foreground italic" : "")}>
              {isNullOrEmpty(value) ? "—" : displayValue}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={cn(
        "flex items-start gap-3 p-4 rounded-xl border bg-card shadow-sm",
        "hover:shadow-md hover:border-primary/20 transition-all duration-200",
        bg
      )}>
        <div className={cn("mt-0.5 shrink-0 p-2 rounded-lg", bg, color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground font-medium mb-1 leading-tight tracking-wide uppercase">
            {getLabel(key)}
          </div>
          <div className={cn("text-base leading-relaxed break-words",
            isNullOrEmpty(value) ? "text-muted-foreground italic" : "font-semibold"
          )}>
            {isNullOrEmpty(value) ? "—" : displayValue}
          </div>
        </div>
      </div>
    );
  };

  /** Renderiza un sub-campo dentro de un dict anidado */
  const renderSubField = (key: string, value: unknown): React.ReactNode => {
    const SubIcon = getIconForFieldName(key);
    const subColor = getColorForFieldName(key);
    const strValue = String(value ?? "");

    // Resolver códigos DPT: estado, municipio, parroquia, comunidad
    let displayValue: React.ReactNode = strValue;
    if (isDptField(key) && strValue) {
      const resolved = resolveDpt(strValue);
      displayValue = resolved !== strValue ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-amber-700 dark:text-amber-400">{resolved}</span>
          <code className="text-[11px] text-muted-foreground bg-muted/50 px-1 py-0.5 rounded">{strValue}</code>
        </span>
      ) : (
        <span className={cn(!isNullOrEmpty(value) ? "text-foreground font-semibold" : "")}>
          {formatValue(value)}
        </span>
      );
    } else {
      const formatted = formatValue(value);
      displayValue = (
        <span className={cn(!isNullOrEmpty(value) ? "text-foreground font-semibold" : "", formatted !== strValue ? "font-medium" : "")}>
          {isNullOrEmpty(value) ? "—" : formatted}
        </span>
      );
    }

    return (
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/20 transition-colors">
        <SubIcon className={cn("h-4 w-4 shrink-0", subColor)} />
        <span className="text-sm text-muted-foreground capitalize flex-1 min-w-0 truncate">
          {getLabel(key)}
        </span>
        <div className="shrink-0 text-right">
          {displayValue}
        </div>
      </div>
    );
  };

  /** Renderiza un dict anidado con comportamiento accordion (expandir/contraer) */
  const renderNestedDict = (key: string, dict: Record<string, unknown>): React.ReactNode => {
    const entries = Object.entries(dict).filter(([k]) => !isMetaField(k));
    if (entries.length === 0) return null;
    const isExpanded = expandedGroups.has(key);

    return (
      <div className="rounded-xl border shadow-sm overflow-hidden bg-card">
        <button onClick={() => toggleGroup(key)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold bg-muted/20 hover:bg-muted/40 transition-colors">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {getLabel(key)}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-[10px] rounded-full">{entries.length} campo(s)</Badge>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {isExpanded && (
          <div className="divide-y divide-muted/30">
            {entries.map(([sk, sv]) => {
              // Si es un sub-sub-dict (ej: danos_esqueleto -> nodos, columnas, vigas)
              if (typeof sv === "object" && sv !== null && !Array.isArray(sv) && !isGeojsonPoint(sv)) {
                const subEntries = Object.entries(sv as Record<string, unknown>).filter(([k]) => !isMetaField(k));
                return (
                  <div key={sk} className="p-3">
                    <h5 className="text-sm text-muted-foreground uppercase tracking-wide font-semibold mb-2">
                      {getLabel(sk)}
                    </h5>
                    <div className="space-y-0.5">
                      {subEntries.map(([ssk, ssv]) => (
                        <div key={ssk}>{renderSubField(ssk, ssv)}</div>
                      ))}
                    </div>
                  </div>
                );
              }
              return <div key={sk} className="px-3">{renderSubField(sk, sv)}</div>;
            })}
          </div>
        )}
      </div>
    );
  };

  // ─── Secciones del layout ─────────────────────────────────

  const sectionHeader = (icon: LucideIcon, label: string, count?: number, color = "text-foreground") => (
    <div className="flex items-center gap-2 mb-3">
      <div className="p-2 rounded-lg bg-muted/50">
        {React.createElement(icon, { className: cn("h-5 w-5", color) })}
      </div>
      <h3 className="text-base font-bold">{label}{count !== undefined && ` (${count})`}</h3>
    </div>
  );

  // Columna izquierda: ubicación + multimedia
  const contentLeft = (
    <div className="space-y-6">
      {geoFields.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-950/10 rounded-xl border border-emerald-200 dark:border-emerald-800 p-4">
          {sectionHeader(MapPin, "Ubicación", geoFields.length, "text-emerald-600")}
          <div className="space-y-1.5">
            {geoFields.map(([key, val]) => (
              <div key={key} className="flex items-center justify-between pl-2">
                <span className="text-muted-foreground text-sm">{getLabel(key)}</span>
                {renderGeoPoint(val)}
              </div>
            ))}
          </div>
        </div>
      )}

      {mediaFields.length > 0 && (
        <div>
          {sectionHeader(ImageIcon, "Archivos multimedia", mediaFields.length, "text-blue-600")}
          <div className="grid grid-cols-1 gap-3">
            {mediaFields.map(([key, val]) => (
              <div key={key} className="space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium truncate px-1">
                  {getLabel(key)}
                </div>
                {renderMedia(String(val), key)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Columna derecha: datos del formulario
  const contentRight = (
    <div className="space-y-6">
      {/* Datos generales / campos normales */}
      {normalFields.length > 0 && (
        <div>
          {sectionHeader(FileText, "Datos del formulario", normalFields.length)}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {normalFields.map(([key, val]) => (
              <div key={key}>{renderFieldCard(key, val)}</div>
            ))}
          </div>
        </div>
      )}

      {/* Diccionarios anidados expandidos (riesgos_vitales, fugas_tuberias, vision_exterior, etc.) */}
      {nestedDictFields.length > 0 && (
        <div>
          {sectionHeader(Layers, "Secciones del formulario", nestedDictFields.length)}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {nestedDictFields.map(([key, dict]) => (
              <div key={key}>{renderNestedDict(key, dict)}</div>
            ))}
          </div>
        </div>
      )}

      {/* Grupos repetidos */}
      {repeatGroups.length > 0 && (
        <div>
          {sectionHeader(Layers, "Grupos repetidos", repeatGroups.length)}
          <div className="space-y-2.5">
            {repeatGroups.map(([key, items]) => {
              const isExpanded = expandedGroups.has(key);
              const arr = items as Record<string, unknown>[];
              return (
                <div key={key} className="rounded-xl border shadow-sm overflow-hidden bg-card">
                  <button onClick={() => toggleGroup(key)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold bg-muted/20 hover:bg-muted/40 transition-colors">
                    <span className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      {getLabel(key)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px] rounded-full">{arr.length} registro(s)</Badge>
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="divide-y max-h-80 overflow-y-auto">
                      {arr.map((item, idx) => {
                        const clean = stripMetaFromObject(item);
                        return (
                          <div key={idx} className="p-4 space-y-2 hover:bg-muted/10 transition-colors">
                            <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5">
                              #{idx + 1}
                            </Badge>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {Object.entries(clean).map(([ik, iv]) => {
                                if (isMetaField(ik)) return null;
                                return <div key={ik}>{renderFieldCard(ik, iv, true)}</div>;
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadatos técnicos */}
      <details className="group rounded-xl border border-dashed p-4 hover:border-muted-foreground/30 transition-colors">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-2 select-none">
          <Info className="h-4 w-4" />
          Metadatos técnicos
          <ChevronRight className="h-4 w-4 ml-auto group-open:rotate-90 transition-transform" />
        </summary>
        <div className="mt-3 space-y-1 max-h-40 overflow-y-auto text-xs font-mono">
          {Object.entries(submission)
            .filter(([k]) => isMetaField(k))
            .map(([k, v]) => (
              <div key={k} className="flex gap-2 hover:bg-muted/20 rounded px-2 py-1">
                <span className="shrink-0 text-muted-foreground/70">{k}</span>
                <span className="truncate text-muted-foreground">{String(v).substring(0, 100)}</span>
              </div>
            ))}
        </div>
      </details>
    </div>
  );

  // Unificado para mobile
  const content = (
    <div className="space-y-6">
      {contentLeft}
      <Separator />
      {contentRight}
    </div>
  );

  // ─── Header compartido ─────────────────────────────────────
  const renderHeader = (TitleComp: typeof DialogTitle | typeof SheetTitle,
                        DescComp: typeof DialogDescription | typeof SheetDescription) => (
    <>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-primary/10 shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TitleComp className="text-base font-bold">Encuesta</TitleComp>
            <Badge variant="secondary" className="text-[10px] font-normal rounded-full">
              {formLabel}
            </Badge>
            {submission.__id && (
              <code className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono hidden sm:inline">
                #{String(submission.__id).substring(0, 12)}…
              </code>
            )}
          </div>
          <DescComp className="text-xs mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {submitTime && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {String(submitTime).substring(0, 19).replace("T", " ")}
              </span>
            )}
            {submitter && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3 w-3" />
                {String(submitter)}
              </span>
            )}
            {geoFields.length > 0 && (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <MapPin className="h-3 w-3" />
                Geolocalizado
              </span>
            )}
            {mediaFields.length > 0 && (
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <ImageIcon className="h-3 w-3" />
                {mediaFields.length} archivo(s)
              </span>
            )}
          </DescComp>

        </div>
      </div>
    </>
  );

  // ─── Mobile: Sheet ─────────────────────────────────────────
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[88vh] p-0 rounded-t-2xl">
          <div className="sticky top-0 z-10 bg-background border-b px-4 pt-4 pb-3 rounded-t-2xl">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3" />
            <SheetHeader className="p-0">
              {renderHeader(SheetTitle, SheetDescription)}
            </SheetHeader>
          </div>
          <ScrollArea className="h-[calc(88vh-100px)] px-4 pb-6">
            {content}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  // ─── Desktop: Dialog ───────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[95vh] !max-h-[95vh] p-0 overflow-hidden rounded-xl shadow-2xl">
        <div className="sticky top-0 z-10 bg-gradient-to-b from-background to-background/95 backdrop-blur-sm border-b px-6 pt-5 pb-3">
          <DialogHeader className="p-0">
            {renderHeader(DialogTitle, DialogDescription)}
          </DialogHeader>
        </div>
        <ScrollArea className="h-[calc(95vh-100px)] px-6 pb-6 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna izquierda: Coordenadas + Multimedia */}
            <div className="lg:col-span-1 space-y-6">
              {contentLeft}
            </div>
            {/* Columnas derecha: Datos del formulario */}
            <div className="lg:col-span-2 space-y-6">
              {contentRight}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
