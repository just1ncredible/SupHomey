import type {
  BBox,
  FilterMeta,
  Health,
  MarketSummary,
  ModelStatus,
  PredictRequest,
  PredictResponse,
  PropertyDetail,
  PropertyListResponse,
  SearchResponse,
} from '@/types/api'
import type { PropertyFilters } from '@/types/filters'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

type Params = Record<string, string | number | null | undefined>

function buildUrl(path: string, params?: Params): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value))
  }
  const qs = query.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

async function request<T>(path: string, init: RequestInit & { params?: Params } = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, init.params), {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Cannot reach the API. Is the backend running on http://localhost:8000?', null)
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = (body as { detail?: unknown; message?: string } | null)
    const message =
      detail?.message ??
      (typeof detail?.detail === 'string' ? detail.detail : `Request failed (${response.status})`)
    throw new ApiError(response.status, message, body)
  }
  return body as T
}

export function filtersToParams(f: PropertyFilters): Params {
  return {
    price_basis: f.priceBasis,
    min_price: f.minPrice,
    max_price: f.maxPrice,
    min_beds: f.minBeds,
    min_baths: f.minBaths,
    home_types: f.homeTypes.length ? f.homeTypes.join(',') : null,
    min_sqft: f.minSqft,
    max_sqft: f.maxSqft,
    zipcode: f.zipcode,
    city: f.city,
  }
}

const bboxParam = (bbox: BBox | null | undefined) => (bbox ? bbox.map((v) => v.toFixed(5)).join(',') : null)

export const api = {
  health: (signal?: AbortSignal) => request<Health>('/api/health', { signal }),

  properties: (filters: PropertyFilters, opts: { bbox?: BBox | null; limit?: number } = {}, signal?: AbortSignal) =>
    request<PropertyListResponse>('/api/properties', {
      signal,
      params: { ...filtersToParams(filters), bbox: bboxParam(opts.bbox), limit: opts.limit ?? 30000 },
    }),

  property: (id: string, signal?: AbortSignal) =>
    request<PropertyDetail>(`/api/properties/${encodeURIComponent(id)}`, { signal }),

  filterMeta: (signal?: AbortSignal) => request<FilterMeta>('/api/properties/meta', { signal }),

  search: (q: string, signal?: AbortSignal) => request<SearchResponse>('/api/search', { signal, params: { q, limit: 6 } }),

  marketSummary: (filters: PropertyFilters | null, bbox: BBox | null, signal?: AbortSignal) =>
    request<MarketSummary>('/api/market/summary', {
      signal,
      params: { ...(filters ? filtersToParams(filters) : {}), bbox: bboxParam(bbox) },
    }),

  modelStatus: (signal?: AbortSignal) => request<ModelStatus>('/api/model/metrics', { signal }),

  /** Re-read the dataset, model bundle and batch predictions from disk. */
  reloadModel: () => request<ModelStatus>('/api/model/reload', { method: 'POST' }),

  /** Real-time prediction. Resolves with the structured body even for 422/503 responses. */
  predict: async (body: PredictRequest, signal?: AbortSignal): Promise<PredictResponse> => {
    try {
      return await request<PredictResponse>('/api/predict', { method: 'POST', body: JSON.stringify(body), signal })
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'status' in err.body) {
        return err.body as PredictResponse
      }
      throw err
    }
  },
}
