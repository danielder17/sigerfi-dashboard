export interface Stats {
  submissions_por_dia: { date: string; count: number }[];
  submissions_por_proyecto: { project_id: number; project_name: string; count: number }[];
  submissions_por_formulario: { project_id: number; project_name: string; form_id: string; form_name: string; count: number }[];
}
