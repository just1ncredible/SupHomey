// Mirrors backend/app/schemas. Keep in sync with http://localhost:8000/docs.

export type ValuationKind = 'batch' | 'realtime' | 'simulated'
export type PriceBasis = 'list' | 'predicted'
/** south, west, north, east */
export type BBox = [number, number, number, number]

export interface PropertyMarker {
  id: string
  lat: number
  lng: number
  /** Historical 2024 listing (asking) price — not a sale price. */
  list_price: number | null
  predicted_price: number | null
  valuation_kind: ValuationKind | null
  bedrooms: number | null
  bathrooms: number | null
  living_area_sqft: number | null
  home_type: string | null
  street_address: string | null
  city: string | null
  zipcode: string | null
}

export interface PropertyListResponse {
  total: number
  offset: number
  limit: number
  items: PropertyMarker[]
}

export interface Valuation {
  status: 'available' | 'simulated' | 'unavailable' | 'error'
  source: ValuationKind | null
  value: number | null
  low: number | null
  high: number | null
  interval_coverage: number | null
  price_per_sqft: number | null
  model_name: string | null
  model_version: string | null
  message: string
}

export type LotAreaSource = 'reported_sqft' | 'converted_from_acres' | 'inferred_acres' | 'inferred_sqft'

export interface PropertyDetail {
  id: string
  zpid: number | null
  street_address: string | null
  city: string | null
  state: string | null
  zipcode: string | null
  latitude: number
  longitude: number
  home_type: string | null
  bedrooms: number | null
  bathrooms: number | null
  living_area_sqft: number | null
  lot_area_sqft: number | null
  lot_area_source: LotAreaSource | null
  year_built: number | null
  list_price: number | null
  list_price_per_sqft: number | null
  days_on_market: number | null
  valuation: Valuation
  benchmarks: {
    zestimate: number | null
    rent_zestimate: number | null
    tax_assessed_value: number | null
  }
  dataset_source: DatasetSource
}

export interface ZipMatch {
  zipcode: string
  count: number
  bounds: BBox
}

export interface CityMatch {
  city: string
  count: number
  bounds: BBox
}

export interface SearchResponse {
  query: string
  properties: PropertyMarker[]
  zipcodes: ZipMatch[]
  cities: CityMatch[]
}

export interface FilterMeta {
  home_types: { value: string; count: number }[]
  list_price_range: [number | null, number | null]
  living_area_range: [number | null, number | null]
  predicted_available: boolean
  predicted_kind: ValuationKind | null
}

export type ScopeKind = 'dataset' | 'filtered' | 'viewport' | 'viewport_filtered'

export interface MarketSummary {
  scope: { kind: ScopeKind; label: string; bbox: BBox | null; filters_applied: boolean }
  count: number
  dataset_total: number
  median_list_price: number | null
  median_list_price_per_sqft: number | null
  avg_living_area_sqft: number | null
  median_predicted_price: number | null
  predicted_count: number
  predicted_kind: 'batch' | 'simulated' | null
  home_types: { label: string; count: number }[]
  list_price_distribution: { label: string; min: number | null; max: number | null; count: number }[]
  note: string
}

export interface ModelMetrics {
  mae: number | null
  rmse: number | null
  r2: number | null
  mape: number | null
  evaluation: string | null
  n_validation: number | null
}

export interface ModelInfo {
  name: string
  version: string
  framework: string
  target_transform: string
  features: string[]
  trained_at: string | null
  training_data: { source: string | null; period: string | null; rows: number | null } | null
  has_interval: boolean
  notes: string | null
}

export interface ModelStatus {
  realtime_status: 'not_installed' | 'loaded' | 'error'
  realtime_error: string | null
  model: ModelInfo | null
  metrics: ModelMetrics | null
  batch: {
    kind: 'batch' | 'simulated'
    source_file: string | null
    rows_in_file: number
    matched: number
    coverage: number
    generated_at: string | null
    warnings: string[]
  } | null
  message: string
}

export type DatasetSource = 'kaggle_houston_2024' | 'synthetic_fixture'

export interface Health {
  status: 'ok' | 'degraded'
  version: string
  dataset: {
    source: DatasetSource
    is_synthetic: boolean
    label: string
    records: number
    rows_read: number
    dropped_invalid_coordinates: number
    dropped_duplicates: number
    nulled_placeholder_values: Record<string, number>
    lot_units: Record<string, number>
    has_street_addresses: boolean
    warnings: string[]
  }
  model_status: 'not_installed' | 'loaded' | 'error'
  predictions: 'batch' | 'simulated' | 'none'
}

export interface PropertyAttributes {
  bedrooms?: number
  bathrooms?: number
  living_area_sqft?: number
  lot_area_sqft?: number
  year_built?: number
  home_type?: string
  latitude?: number
  longitude?: number
  zipcode?: string
  city?: string
  extra?: Record<string, unknown>
}

export interface PredictRequest {
  property_id?: string
  attributes?: PropertyAttributes
}

export interface PredictResponse {
  status: 'ok' | 'model_unavailable' | 'invalid_input' | 'error'
  property_id: string | null
  prediction: {
    value: number
    low: number | null
    high: number | null
    interval_coverage: number | null
    currency: 'USD'
  } | null
  model: ModelInfo | null
  inputs: Record<string, unknown>
  missing_required: string[]
  message: string
}
