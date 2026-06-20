"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";

export interface SourceInfo {
  id: string;
  name: string;
  server_url: string;
  type: "odk" | "kobo";
  active: boolean;
  metadata: {
    projects?: number;
    forms?: number;
    source?: string;
    needs_auth?: boolean;
    needs_api_key?: boolean;
  };
}

interface SourceContextType {
  sources: SourceInfo[];
  activeSource: SourceInfo | null;
  loading: boolean;
  switchSource: (sourceId: string) => Promise<string | null>;
  refreshSources: () => Promise<void>;
}

const SourceContext = createContext<SourceContextType>({
  sources: [],
  activeSource: null,
  loading: true,
  switchSource: async () => "No implementado",
  refreshSources: async () => {},
});

export function SourceProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [activeSource, setActiveSource] = useState<SourceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSources = useCallback(async () => {
    try {
      const token = localStorage.getItem("sigerfi_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/source/list`, { headers });
      if (!res.ok) return;

      const data = await res.json();
      const sourceList = data.sources as SourceInfo[];
      setSources(sourceList);
      const active = sourceList.find((s) => s.active) || null;
      setActiveSource(active);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  const switchSource = async (sourceId: string): Promise<string | null> => {
    try {
      const token = localStorage.getItem("sigerfi_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const target = sources.find((s) => s.id === sourceId);
      if (!target) return "Fuente no encontrada";

      let body: Record<string, unknown>;

      if (target.type === "kobo") {
        // KoBo requiere API key — ver si está en localStorage o pedirla
        const storedKeys = JSON.parse(localStorage.getItem("sigerfi_kobo_keys") || "{}");
        const apiKey = storedKeys[target.server_url] || "";

        if (!apiKey) {
          // Si no tenemos la key, devolvemos un error especial
          return "__NEEDS_API_KEY__";
        }

        body = {
          source: target.type,
          server_url: target.server_url,
          api_key: apiKey,
        };
      } else {
        body = {
          source: target.type,
          server_url: target.server_url,
          email: "",  // se usará el de variables de entorno
          password: "",
        };
      }

      const res = await fetch(`${API_BASE}/api/source/activate`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Error al activar" }));
        return err.detail || "Error al cambiar fuente";
      }

      // Actualizar estado local
      await refreshSources();
      return null; // sin error
    } catch (e) {
      return (e as Error).message || "Error de conexión";
    }
  };

  return (
    <SourceContext.Provider value={{ sources, activeSource, loading, switchSource, refreshSources }}>
      {children}
    </SourceContext.Provider>
  );
}

export function useSource() {
  return useContext(SourceContext);
}
