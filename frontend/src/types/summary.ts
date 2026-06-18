export interface ProjectSummary {
  project: {
    id: number;
    name: string;
    description: string;
    estado: string;
    num_preguntas: number;
    propietario: string;
    created_at: string;
    updated_at: string;
    last_implementation: string;
    last_submission: string;
    total_submissions: number;
  };
  ubicacion: {
    estado: string;
    municipio: string;
    parroquia: string;
    sector_comunidad: string;
  };
  envios_rangos: {
    ultimos_7_dias: number;
    ultimos_31_dias: number;
    ultimos_3_meses: number;
    ultimos_12_meses: number;
  };
}
