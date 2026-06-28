// Cliente API para el backend FastAPI

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('sigerfi_token') : null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    // Merge con options.headers (sobrescribe si es necesario)
    const mergedHeaders = { ...headers, ...(options?.headers as Record<string, string> || {}) };
    const res = await fetch(`${API_BASE}/api${path}`, {
      ...options,
      headers: mergedHeaders,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: err.detail || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { data };
  } catch (e) {
    return { error: (e as Error).message || "Error de conexion" };
  }
}

// ===== Proyectos =====

export async function getProjects() {
  const res = await fetchApi<{ projects: import("@/types").Project[] }>("/projects");
  if (res.error) return { error: res.error };
  return { projects: res.data!.projects };
}

export async function getForms(projectId: number) {
  const res = await fetchApi<{ forms: import("@/types").FormSummary[] }>(`/projects/${projectId}/forms`);
  if (res.error) return { error: res.error };
  return { forms: res.data!.forms };
}

// ===== Formularios =====

export async function getFormSchema(projectId: number, formId: string) {
  const res = await fetchApi<import("@/types").FormSchema>(`/forms/${formId}/schema?project_id=${projectId}`);
  if (res.error) return { error: res.error };
  return { schema: res.data! };
}

export async function getSubmissions(projectId: number, formId: string, top = 100, skip = 0) {
  const res = await fetchApi<import("@/types").PaginatedSubmissions>(
    `/forms/${formId}/submissions?project_id=${projectId}&top=${top}&skip=${skip}`
  );
  if (res.error) return { error: res.error };
  return { data: res.data! };
}

export async function getAllSubmissions(projectId: number, formId: string) {
  const res = await fetchApi<{ submissions: import("@/types").Submission[]; count: number }>(
    `/forms/${formId}/all?project_id=${projectId}`
  );
  if (res.error) return { error: res.error };
  return { submissions: res.data!.submissions, count: res.data!.count };
}
