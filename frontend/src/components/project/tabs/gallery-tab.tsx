"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getForms, getAllSubmissions } from "@/lib/api";
import type { Submission, FormSummary } from "@/types";
import {
  Download,
  Image,
  FileAudio,
  Video,
  File,
  ExternalLink,
  Archive,
  Eye,
  EyeOff,
} from "lucide-react";

interface GalleryTabProps {
  projectId: number;
}

const MEDIA_EXTENSIONS = {
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"],
  audio: [".mp3", ".wav", ".ogg", ".m4a", ".aac"],
  video: [".mp4", ".webm", ".mov", ".avi", ".mkv"],
};

export function GalleryTab({ projectId }: GalleryTabProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<string>("all");

  useEffect(() => {
    getForms(projectId).then((res) => {
      if (res.forms) setForms(res.forms);
    });
  }, [projectId]);

  useEffect(() => {
    if (!selectedForm) return;
    setLoading(true);
    getAllSubmissions(projectId, selectedForm).then((res) => {
      if (res.submissions) setSubmissions(res.submissions);
      setLoading(false);
    });
  }, [projectId, selectedForm]);

  const mediaFields = submissions.length > 0
    ? Object.keys(submissions[0]).filter(
        (k) => {
          if (k.startsWith("@") || k === "meta" || k === "__id" || k === "__media_urls") return false;
          const val = submissions[0][k as keyof Submission];
          if (typeof val !== "string") return false;
          const lower = val.toLowerCase();
          return (
            MEDIA_EXTENSIONS.image.some((e) => lower.endsWith(e)) ||
            MEDIA_EXTENSIONS.audio.some((e) => lower.endsWith(e)) ||
            MEDIA_EXTENSIONS.video.some((e) => lower.endsWith(e))
          );
        }
      )
    : [];

  const mediaItems: {
    field: string;
    filename: string;
    type: "image" | "audio" | "video" | "file";
    submission: Submission;
  }[] = [];

  submissions.forEach((s) => {
    mediaFields.forEach((field) => {
      const filename = s[field as keyof Submission] as string;
      if (!filename) return;

      const ext = filename.toLowerCase();
      let type: "image" | "audio" | "video" | "file" = "file";
      if (MEDIA_EXTENSIONS.image.some((e) => ext.endsWith(e))) type = "image";
      else if (MEDIA_EXTENSIONS.audio.some((e) => ext.endsWith(e))) type = "audio";
      else if (MEDIA_EXTENSIONS.video.some((e) => ext.endsWith(e))) type = "video";

      mediaItems.push({ field, filename, type, submission: s });
    });
  });

  const filteredMedia =
    mediaFilter === "all"
      ? mediaItems
      : mediaItems.filter((m) => m.type === mediaFilter);

  return (
    <div className="space-y-4">
      {/* Toggle colapsar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Galería multimedia</h3>
          <Badge variant="outline" className="text-xs font-normal">{mediaItems.length} archivos</Badge>
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
        <Select value={selectedForm} onValueChange={(v) => setSelectedForm(v||"")}>
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

        {loading ? (
          <Skeleton className="h-64" />
        ) : selectedForm && mediaItems.length > 0 ? (
          <>
            {/* Filtros de tipo */}
            <div className="flex gap-2 flex-wrap">
              <Button variant={mediaFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setMediaFilter("all")}>
                Todos ({mediaItems.length})
              </Button>
              <Button variant={mediaFilter === "image" ? "default" : "outline"} size="sm" onClick={() => setMediaFilter("image")}>
                <Image className="mr-1 h-4 w-4" /> Imagenes
              </Button>
              <Button variant={mediaFilter === "audio" ? "default" : "outline"} size="sm" onClick={() => setMediaFilter("audio")}>
                <FileAudio className="mr-1 h-4 w-4" /> Audio
              </Button>
              <Button variant={mediaFilter === "video" ? "default" : "outline"} size="sm" onClick={() => setMediaFilter("video")}>
                <Video className="mr-1 h-4 w-4" /> Video
              </Button>
            </div>

            {/* Grid multimedia */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredMedia.map((item, i) => (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-3">
                    {/* Previsualización según tipo */}
                    {item.type === "image" ? (
                      <div className="aspect-square bg-muted rounded-md flex items-center justify-center mb-2 overflow-hidden">
                        {(() => {
                          const mediaUrl = (item.submission as any).__media_urls?.[item.field];
                          if (mediaUrl) {
                            return <img src={mediaUrl} alt={item.filename} className="w-full h-full object-cover rounded-md" />;
                          }
                          return <Image className="h-8 w-8 mb-1" />;
                        })()}
                      </div>
                    ) : item.type === "audio" ? (
                      <div className="bg-muted rounded-md flex items-center justify-center mb-2 p-2">
                        {(() => {
                          const mediaUrl = (item.submission as any).__media_urls?.[item.field];
                          if (mediaUrl) {
                            return (
                              <audio controls className="w-full h-10" preload="metadata">
                                <source src={mediaUrl} />
                                Tu navegador no soporta audio.
                              </audio>
                            );
                          }
                          return <FileAudio className="h-8 w-8" />;
                        })()}
                      </div>
                    ) : item.type === "video" ? (
                      <div className="aspect-video bg-muted rounded-md flex items-center justify-center mb-2 overflow-hidden">
                        {(() => {
                          const mediaUrl = (item.submission as any).__media_urls?.[item.field];
                          if (mediaUrl) {
                            return (
                              <video controls className="w-full h-full rounded-md" preload="metadata">
                                <source src={mediaUrl} />
                                Tu navegador no soporta video.
                              </video>
                            );
                          }
                          return <Video className="h-8 w-8" />;
                        })()}
                      </div>
                    ) : (
                      <div className="aspect-square bg-muted rounded-md flex items-center justify-center mb-2">
                        <File className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="truncate text-xs text-muted-foreground flex-1">
                        {item.field}: {item.filename}
                      </div>
                      <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">{item.type}</Badge>
                    </div>
                    {/* Fila de botones */}
                    <div className="flex gap-1 mt-2">
                      {(() => {
                        const mediaUrl = (item.submission as any).__media_urls?.[item.field];
                        if (item.type === "image" && mediaUrl) {
                          return (
                            <>
                              <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                                <Button variant="outline" size="sm" className="w-full gap-1 h-7 text-xs">
                                  <ExternalLink className="h-3 w-3" /> Ver
                                </Button>
                              </a>
                              <a href={mediaUrl} download={item.filename} className="flex-1">
                                <Button variant="outline" size="sm" className="w-full gap-1 h-7 text-xs">
                                  <Download className="h-3 w-3" /> Descargar
                                </Button>
                              </a>
                            </>
                          );
                        }
                        if (mediaUrl) {
                          return (
                            <a href={mediaUrl} download={item.filename} target="_blank" rel="noopener noreferrer" className="w-full">
                              <Button variant="outline" size="sm" className="w-full gap-1 h-7 text-xs">
                                <Download className="h-3 w-3" /> Descargar
                              </Button>
                            </a>
                          );
                        }
                        return (
                          <Button variant="outline" size="sm" className="w-full gap-1 h-7 text-xs" disabled>
                            <Download className="h-3 w-3" /> Sin URL
                          </Button>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : selectedForm ? (
          <div className="text-center py-12 text-muted-foreground">
            No se encontraron archivos multimedia en este formulario
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Selecciona un formulario para ver la galeria
          </div>
        )}
      </div>
    </div>
  );
}
