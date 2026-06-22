"use client";

import { useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DPT_API = `${API_BASE}/api/v2/labels/dpt`;

// Columnas DPT que conocemos (en minusculas)
const COLUMNAS_DPT = new Set(["estado", "municipio", "parroquia", "comunidad"]);

// Cache en memoria para labels ya resueltos
const labelCache = new Map<string, string>();

function detectarColumnasDpt(columns: string[]): string[] {
  return columns.filter((col) => {
    const lower = col.toLowerCase().replace(/[_\-\s]/g, "");
    return COLUMNAS_DPT.has(lower);
  });
}

function normalizarColumna(col: string): string {
  const lower = col.toLowerCase().replace(/[_\-\s]/g, "");
  for (const nivel of COLUMNAS_DPT) {
    if (lower === nivel || lower.includes(nivel)) return nivel;
  }
  return col;
}

function codigosUnicos(submissions: Record<string, unknown>[], columnasDpt: string[]): Map<string, Set<string>> {
  const codigos: Map<string, Set<string>> = new Map();
  for (const col of columnasDpt) {
    codigos.set(col, new Set());
  }
  for (const sub of submissions) {
    for (const col of columnasDpt) {
      const val = sub[col];
      if (val !== null && val !== undefined && val !== "") {
        codigos.get(col)?.add(String(val));
      }
    }
  }
  return codigos;
}

export function useDptLabels() {
  const [loading, setLoading] = useState(false);

  const resolve = useCallback(async (
    submissions: Record<string, unknown>[],
    columns: string[]
  ) => {
    const columnasDpt = detectarColumnasDpt(columns);
    if (columnasDpt.length === 0) return;

    const codigos = codigosUnicos(submissions, columnasDpt);
    if (codigos.size === 0) return;

    setLoading(true);
    const nuevosLabels: Record<string, string> = {};

    try {
      const niveles = ["estado", "municipio", "parroquia", "comunidad"];

      for (const nivel of niveles) {
        const col = columnasDpt.find((c) => normalizarColumna(c) === nivel);
        if (!col) continue;

        const cods = Array.from(codigos.get(col) || []);
        for (const cod of cods) {
          const cacheKey = `${nivel}:${cod}`;
          const cached = labelCache.get(cacheKey);

          if (cached) {
            nuevosLabels[cacheKey] = cached;
          } else {
            try {
              const res = await fetch(`${DPT_API}/resolve?${nivel}=${encodeURIComponent(cod)}`);
              const data = await res.json();
              const label = data[nivel] || cod;
              nuevosLabels[cacheKey] = label;
              labelCache.set(cacheKey, label);
            } catch {
              nuevosLabels[cacheKey] = cod;
            }
          }
        }
      }

      return nuevosLabels;
    } finally {
      setLoading(false);
    }
  }, []);

  // Obtener label para un codigo especifico (usa el cache global)
  const getLabel = useCallback(
    (col: string, codigo: string | unknown): string => {
      if (!codigo || codigo === "") return "";
      const nivel = normalizarColumna(col);
      const key = `${nivel}:${String(codigo)}`;
      return labelCache.get(key) || String(codigo);
    },
    []
  );

  return { resolve, getLabel, loading };
}
