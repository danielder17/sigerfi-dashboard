"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Moon, Sun, Bell, LogOut } from "lucide-react";
import { getProjects } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SourceSelector } from "@/components/source-selector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@/types";

interface HeaderProps {
  onProjectChange?: (projectId: number | null) => void;
  selectedProjectId?: number | null;
}

export function Header({ onProjectChange, selectedProjectId }: HeaderProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [dark, setDark] = useState(false);
  const { user, logout } = useAuth();

  useEffect(() => {
    getProjects().then((res) => {
      if (res.projects) setProjects(res.projects);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header className="h-14 border-b flex items-center px-6 gap-4">
      {/* Selector de fuente de datos */}
      <SourceSelector />

      {/* Selector de proyecto */}
      <div className="flex-1 max-w-xs">
        <Select
          value={selectedProjectId?.toString() || ""}
          onValueChange={(v) =>
            onProjectChange?.(v ? parseInt(v) : null)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar proyecto" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                [{p.id}] {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Tema oscuro */}
        <Button variant="ghost" size="icon" onClick={() => setDark(!dark)}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </Button>

        {/* Notificaciones */}
        <Button variant="ghost" size="icon">
          <Bell size={18} />
        </Button>

        {/* Perfil con logout */}
        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none">
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarFallback className="text-xs">
                {user?.displayName?.charAt(0)?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.displayName}</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
                {user?.is_admin && (
                  <span className="text-[10px] text-amber-500 font-medium mt-0.5">🛡️ Admin</span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer">
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
