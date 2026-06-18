// Tipos para el dashboard v2

export interface Project {
  id: number;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  keyId?: number;
  forms?: FormSummary[];
}

export interface FormSummary {
  xmlFormId: string;
  name?: string;
  createdAt?: string;
  submissions?: number;
  state?: string;
}

export interface FormSchema {
  xml: string;
  odata_schema: string | null;
  sample_submissions: Record<string, unknown>[];
}

export interface Submission {
  __id: string;
  __system_submitterName?: string;
  __system_submitterId?: string;
  submissionDate?: string;
  reviewState?: string;
  [key: string]: unknown;
}

export interface PaginatedSubmissions {
  submissions: Submission[];
  count: number;
  skip: number;
  has_more: boolean;
}

export interface FormField {
  name: string;
  label: string;
  type: "string" | "number" | "date" | "select_one" | "select_multiple" | "geopoint" | "geotrace" | "geoshape" | "image" | "audio" | "video" | "file";
  options?: { label: string; value: string }[];
  required?: boolean;
  group?: string;
}

// ── Tipos para filtro espacial ──

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface RectangleFilter {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface CircleFilter {
  center: GeoPoint;
  radiusKm: number;
}

export type SpatialFilter =
  | { type: "none" }
  | { type: "rectangle"; rect: RectangleFilter }
  | { type: "circle"; circle: CircleFilter };
