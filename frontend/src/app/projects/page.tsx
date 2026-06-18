"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { getProjects, getForms } from "@/lib/api";
import type { Project } from "@/types";
import { FolderKanban, FileText, Search, ArrowRight, MapPin } from "lucide-react";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<(Project & { formsCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const res = await getProjects();
      if (res.error) {
        console.error(res.error);
        setLoading(false);
        return;
      }
      const withForms = await Promise.all(
        res.projects!.map(async (p) => {
          const f = await getForms(p.id);
          return { ...p, formsCount: f.forms?.length || 0 };
        })
      );
      setProjects(withForms);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toString().includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proyectos</h1>
          <p className="text-muted-foreground">
            {projects.length} proyecto(s) disponibles
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar proyecto..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">
            {search
              ? "No se encontraron proyectos con ese filtro"
              : "No hay proyectos disponibles"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:bg-accent/50 hover:border-primary/50 transition-all cursor-pointer group h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FolderKanban className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">
                            [{p.id}]
                          </span>
                          {p.name}
                        </CardTitle>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <Badge variant="secondary" className="gap-1">
                      <FileText className="h-3 w-3" />
                      {p.formsCount} formulario(s)
                    </Badge>
                    {p.description && (
                      <span className="truncate text-xs">{p.description}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
