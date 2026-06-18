"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved === "dark" || (!saved && true);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const navItems = [
    { href: "/", label: "Panel de Control", icon: LayoutDashboard },
    { href: "/projects", label: "Proyectos", icon: FolderKanban },
    { href: "/settings", label: "Configuración", icon: Settings },
  ];

  return (
    <div className="flex h-full w-full">
      {/* Sidebar tipo referencia */}
      <aside className="w-[240px] shrink-0 bg-card border-r border-border flex flex-col gap-6 p-4">
        {/* Logo */}
        <div className="flex items-center gap-2 font-bold text-lg">
          <span className="text-[#00B4D8]">🌐</span>
          <span>SIGERFI</span>
          <span className="text-muted-foreground font-normal">| ODK</span>
        </div>

        {/* Navegación */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-[#00B4D8] text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Theme toggle + versión */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-border"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          Modo {dark ? "Claro" : "Oscuro"}
        </button>
        <small className="text-xs text-muted-foreground px-1">
          SIGERFI v0.1.0 · Open Source
        </small>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
