// Mirrors backend/app/schemas/assistant.py
import type { BBox, PriceBasis, PropertyMarker } from './api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Filters in API parameter form. */
export interface ApiFilters {
  price_basis: PriceBasis
  min_price: number | null
  max_price: number | null
  min_beds: number | null
  min_baths: number | null
  home_types: string[]
  min_sqft: number | null
  max_sqft: number | null
  zipcode: string | null
  city: string | null
}

export type AssistantSort = 'price_asc' | 'price_desc' | 'sqft_desc' | 'price_per_sqft_asc'

export type AssistantAction =
  | { type: 'set_filters'; filters: ApiFilters; sort: AssistantSort | null; bounds: BBox | null }
  | { type: 'select_property'; property: PropertyMarker }

export interface AreaRow {
  area: string
  kind: 'zipcode' | 'city'
  listings: number
  median_list_price: number | null
  mean_list_price: number | null
  median_price_per_sqft: number | null
  median_rent_zestimate: number | null
  bounds: BBox
}

export type AssistantCard =
  | { type: 'properties'; title: string; total: number; items: PropertyMarker[] }
  | { type: 'area_table'; title: string; metric: 'median_list_price' | 'median_price_per_sqft' | 'median_rent_zestimate'; rows: AreaRow[] }
  | { type: 'stats'; title: string; stats: Record<string, unknown> }

export interface AssistantResponse {
  status: 'ok' | 'not_configured' | 'error'
  reply: string
  actions: AssistantAction[]
  cards: AssistantCard[]
  tools_used: { name: string; arguments: Record<string, unknown> }[]
  model: string | null
}

export interface AssistantContext {
  selected_property_id: string | null
  map_bbox: BBox | null
  filters: ApiFilters | null
}

export interface AssistantStatus {
  configured: boolean
  model: string
  message: string
}
