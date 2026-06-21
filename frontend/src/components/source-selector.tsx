"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database, AlertCircle, Check, ChevronDown } from "lucide-react";
import { useSource, type SourceInfo } from "@/lib/source";
import { cn } from "@/lib/utils";

interface SourceSelectorProps {
  onSourceChanging?: () => void;
  onSourceChanged?: () => void;
}

export function SourceSelector({ onSourceChanging, onSourceChanged }: SourceSelectorProps) {
  const { sources, activeSource, switchSource, loading } = useSource();
  const [switching, setSwitching] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingSource, setPendingSource] = useState<SourceInfo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");

  const doSwitch = useCallback(async (target: SourceInfo, key?: string) => {
    setSwitching(target.id);
    onSourceChanging?.();

    const error = await switchSource(target.id);

    if (error === "__NEEDS_API_KEY__") {
      setPendingSource(target);
      setApiKey("");
      setApiKeyError("");
      setDialogOpen(true);
      setSwitching(null);
      return;
    }

    if (error) {
      alert(`Error al cambiar fuente: ${error}`);
    } else {
      // Recargar la página para que todos los componentes se actualicen
      setTimeout(() => window.location.reload(), 500);
    }

    setSwitching(null);
    onSourceChanged?.();
  }, [switchSource, onSourceChanging, onSourceChanged]);

  const handleSourceClick = async (target: SourceInfo) => {
    if (switching || target.id === activeSource?.id) return;

    // Si es KoBo, buscar API key guardada
    if (target.type === "kobo") {
      const storedKeys = JSON.parse(localStorage.getItem("sigerfi_kobo_keys") || "{}");
      const savedKey = storedKeys[target.server_url];

      if (!savedKey) {
        setPendingSource(target);
        setApiKey("");
        setApiKeyError("");
        setDialogOpen(true);
        return;
      }
    }

    await doSwitch(target);
  };

  const handleDialogSubmit = async () => {
    if (!pendingSource) return;
    if (!apiKey.trim()) {
      setApiKeyError("La API Key es requerida");
      return;
    }

    const key = apiKey.trim();
    const storedKeys = JSON.parse(localStorage.getItem("sigerfi_kobo_keys") || "{}");
    storedKeys[pendingSource.server_url] = key;
    localStorage.setItem("sigerfi_kobo_keys", JSON.stringify(storedKeys));
    setDialogOpen(false);

    await doSwitch(pendingSource, key);
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
      <Loader2 size={12} className="animate-spin" />
      Cargando fuentes...
    </div>
  );

  const iconForSource = (s: SourceInfo) => {
    if (s.type === "odk") return "🟢";
    return s.id.includes("eu") ? "🔵" : "🟡";
  };

  return (
    <>
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1 mb-2">
          Fuente de datos
        </p>
        {sources.map((s) => {
          const isActive = s.id === activeSource?.id;
          const isSwitching = switching === s.id;

          return (
            <button
              key={s.id}
              onClick={() => handleSourceClick(s)}
              disabled={!!switching}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left",
                isActive
                  ? "bg-[#00B4D8]/10 text-[#00B4D8] border border-[#00B4D8]/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent",
                isSwitching && "opacity-50 cursor-wait"
              )}
            >
              <span className="shrink-0">
                {isSwitching ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isActive ? (
                  <Check size={14} />
                ) : (
                  <span>{iconForSource(s)}</span>
                )}
              </span>
              <span className="flex-1 truncate">{s.name}</span>
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0">
                {s.metadata.forms ?? "?"}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Diálogo de API Key para KoBo */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingSource?.id.includes("eu") ? "🔵" : "🟡"} API Key requerida
            </DialogTitle>
            <DialogDescription>
              Ingresa la API Key de tu cuenta en{" "}
              <strong>{pendingSource?.server_url}</strong> para conectarte.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="api-key-sidebar">API Key de KoBoToolbox</Label>
              <Input
                id="api-key-sidebar"
                type="password"
                placeholder="Pega tu API Key aquí..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setApiKeyError("");
                }}
              />
              {apiKeyError && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertCircle size={12} />
                  {apiKeyError}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              La API Key se obtiene desde Settings → API Keys en tu cuenta de KoBoToolbox.
              Se guardará localmente en tu navegador.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleDialogSubmit} disabled={!apiKey.trim()}>
              Conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
