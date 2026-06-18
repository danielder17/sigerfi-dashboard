export interface FormField {
  path: string;
  name: string;
  label: string;
  type: string;
  is_repeat: boolean;
  repeat_parent: string | null;
  options: string[];
  children?: string[];
}

export interface FormSchema {
  xml: string;
  fields: FormField[];
  total_fields: number;
}

export interface ReportKPI {
  count: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  median?: number;
  std?: number;
  q1?: number;
  q3?: number;
  categories?: Record<string, number>;
  type?: "categorical" | "numeric";
}

export interface WordCloudStats {
  total_words: number;
  unique_words: number;
  total_documents: number;
  avg_words_per_doc: number;
  top_words: [string, number][];
}

export interface WordCloudItem {
  word: string;
  count: number;
  frequency: number;
  pct: number;
  rank: number;
  documents: number;
}

export interface WordCloudData {
  label: string;
  items: WordCloudItem[];
  stats: WordCloudStats;
}

export interface ContingencyRow {
  label: string;
  [col: string]: string | number;
  _row_total: number;
}

export interface ContingencyTable {
  type: "gender_cross" | "select_cross";
  row_field: string;
  row_label: string;
  col_field: string;
  col_label: string;
  rows: ContingencyRow[];
  col_labels: string[];
  col_totals: Record<string, number>;
  total: number;
  chi_square: number;
}

export interface PopulationPyramid {
  total_population: number;
  age_field: string;
  age_label: string;
  gender_field: string | null;
  gender_label: string | null;
  ranges: string[];
  data: {
    hombres: number[];
    mujeres: number[];
    sin_dato: number[];
    totals: number[];
  };
  stats: {
    total_hombres: number;
    total_mujeres: number;
    total_sin_dato: number;
    edad_minima: number;
    edad_maxima: number;
    edad_promedio: number;
  };
}

export interface LogicalGroup {
  name: string;
  icon: string;
  analysis: string;
  fields: FormField[];
  field_count: number;
}

// ─── Módulos de Análisis ───────────────────────

export interface AnalysisQueryField {
  name: string;
  label?: string;
  type?: string;
}

export interface AnalysisQuery {
  query_id: string;
  question: string;
  justification?: string;
  type: string;
  chart: string;
  chart_options?: Record<string, any>;
  resolved_fields?: string[];
  available_fields?: string[];
  field_schemas?: AnalysisQueryField[];
  matched_pairs?: { pattern: string; fields: string[] }[];
  data?: any;
  error?: string;
}

export interface AnalysisModule {
  module_id: string;
  name: string;
  icon: string;
  description?: string;
  status: "full" | "partial";
  order?: number;
  total_queries: number;
  active_queries_count: number;
  queries: AnalysisQuery[];
  fields_available?: number;
  fields_required?: number;
  auto_detect?: boolean;
}

export interface ModuleReportResponse {
  form_id: string;
  form_name: string;
  project_id: number;
  total_submissions: number;
  modules: ({
    module_id: string;
    name: string;
    icon?: string;
    description?: string;
    status?: string;
    queries: {
      query_id: string;
      question: string;
      justification?: string;
      type: string;
      chart: string;
      chart_options?: Record<string, any>;
      data?: any;
      error?: string;
    }[];
    error?: string;
  })[];
}

export interface AnalysisModulesResponse {
  form_id: string;
  project_id: number;
  modules: AnalysisModule[];
  legacy_modules: any[];
  all_templates: any[];
}

export interface ReportResponse {
  report: {
    total_submissions: number;
    kpis: Record<string, ReportKPI>;
    grouped_data: Record<string, Record<string, Record<string, ReportKPI>>>;
    temporal_data: {
      field: string;
      grouping: string;
      data: Record<string, number>;
    } | null;
    charts: Record<string, any>;
    geo_points: Array<{
      lat: number;
      lon: number;
      address: string;
      city: string;
      state: string;
    }>;
    word_cloud: Record<string, WordCloudData>;
    contingency_tables: ContingencyTable[];
    population_pyramid: PopulationPyramid | null;
    raw_data: Record<string, any>[];
  };
}
