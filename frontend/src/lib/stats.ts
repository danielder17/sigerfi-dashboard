import { Stats } from "@/types/stats";
import { fetchApi } from "./api";

export async function getStats(): Promise<{ stats?: Stats; error?: string }> {
  const res = await fetchApi<Stats>("/stats");
  if (res.error) return { error: res.error };
  return { stats: res.data };
}
