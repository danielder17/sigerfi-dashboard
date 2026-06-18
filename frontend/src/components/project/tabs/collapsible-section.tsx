"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  /** Badge opcional a la derecha del título */
  badge?: React.ReactNode;
  className?: string;
}

/**
 * Sección colapsable con toggle Eye/EyeOff.
 * Diseño tipo "leyenda del mapa" pero para cualquier contenido.
 */
export function CollapsibleSection({
  title,
  children,
  defaultCollapsed = false,
  badge,
  className = "",
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{title}</h3>
          {badge}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          {collapsed ? (
            <>
              <Eye className="h-3.5 w-3.5" /> Mostrar
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" /> Ocultar
            </>
          )}
        </Button>
      </div>
      {!collapsed && children}
    </div>
  );
}
