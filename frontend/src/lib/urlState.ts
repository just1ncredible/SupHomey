/**
 * Shareable view state in the page address: filters, sort, map position and selected home.
 * Only non-default values are written, so a fresh visit keeps a clean URL.
 */
import { DEFAULT_FILTERS, DEFAULT_SORT, SORT_KEYS, type PropertyFilters, type SortKey } from '@/types/filters'

export interface MapPosition {
  lat: number
  lng: number
  zoom: number
}

export interface UrlState {
  /** Present only if the URL carried at least one filter param. */
  filters?: PropertyFilters
  sort?: SortKey
  position?: MapPosition
  home?: string
}

const FILTER_PARAMS = ['basis', 'min', 'max', 'beds', 'baths', 'types', 'sqmin', 'sqmax', 'zip', 'city'] as const

function num(v: string | null, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (v === null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

function text(v: string | null, maxLen = 80): string | null {
  const t = v?.trim()
  return t ? t.slice(0, maxLen) : null
}

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search)
  const state: UrlState = {}

  if (FILTER_PARAMS.some((k) => p.has(k))) {
    state.filters = {
      priceBasis: p.get('basis') === 'predicted' ? 'predicted' : 'list',
      minPrice: num(p.get('min')),
      maxPrice: num(p.get('max')),
      minBeds: num(p.get('beds'), 0, 20),
      minBaths: num(p.get('baths'), 0, 20),
      homeTypes: (p.get('types') ?? '').split(',').map((s) => s.trim()).filter((s) => /^[A-Z_]{2,30}$/.test(s)),
      minSqft: num(p.get('sqmin')),
      maxSqft: num(p.get('sqmax')),
      zipcode: /^\d{5}$/.test(p.get('zip') ?? '') ? p.get('zip') : null,
      city: text(p.get('city')),
    }
  }

  const sort = p.get('sort')
  if (sort && (SORT_KEYS as readonly string[]).includes(sort)) state.sort = sort as SortKey

  const at = (p.get('at') ?? '').split(',').map(Number)
  if (at.length === 3 && at.every(Number.isFinite)) {
    const [lat, lng, zoom] = at
    // Loose Greater-Houston box; the map's own max bounds do the rest.
    if (lat > 28 && lat < 31.5 && lng > -97.5 && lng < -93.5 && zoom >= 8 && zoom <= 19) state.position = { lat, lng, zoom }
  }

  const home = text(p.get('home'), 40)
  if (home && /^[\w-]+$/.test(home)) state.home = home

  return state
}

export function serializeUrlState(state: { filters: PropertyFilters; sort: SortKey; position: MapPosition | null; home: string | null }): string {
  const p = new URLSearchParams()
  const f = state.filters
  const d = DEFAULT_FILTERS
  if (f.priceBasis !== d.priceBasis) p.set('basis', f.priceBasis)
  if (f.minPrice !== null) p.set('min', String(f.minPrice))
  if (f.maxPrice !== null) p.set('max', String(f.maxPrice))
  if (f.minBeds !== null) p.set('beds', String(f.minBeds))
  if (f.minBaths !== null) p.set('baths', String(f.minBaths))
  if (f.homeTypes.length) p.set('types', f.homeTypes.join(','))
  if (f.minSqft !== null) p.set('sqmin', String(f.minSqft))
  if (f.maxSqft !== null) p.set('sqmax', String(f.maxSqft))
  if (f.zipcode) p.set('zip', f.zipcode)
  if (f.city) p.set('city', f.city)
  if (state.sort !== DEFAULT_SORT) p.set('sort', state.sort)
  if (state.position) {
    const { lat, lng, zoom } = state.position
    p.set('at', `${lat.toFixed(5)},${lng.toFixed(5)},${Math.round(zoom * 2) / 2}`)
  }
  if (state.home) p.set('home', state.home)
  return p.toString().replace(/%2C/g, ',')
}
