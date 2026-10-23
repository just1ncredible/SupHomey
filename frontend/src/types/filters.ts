import type { PriceBasis } from './api'

export interface PropertyFilters {
  priceBasis: PriceBasis
  minPrice: number | null
  maxPrice: number | null
  minBeds: number | null
  minBaths: number | null
  homeTypes: string[]
  minSqft: number | null
  maxSqft: number | null
  zipcode: string | null
  city: string | null
}

export const DEFAULT_FILTERS: PropertyFilters = {
  priceBasis: 'list',
  minPrice: null,
  maxPrice: null,
  minBeds: null,
  minBaths: null,
  homeTypes: [],
  minSqft: null,
  maxSqft: null,
  zipcode: null,
  city: null,
}

export function activeFilterCount(f: PropertyFilters): number {
  return [
    f.minPrice,
    f.maxPrice,
    f.minBeds,
    f.minBaths,
    f.minSqft,
    f.maxSqft,
    f.zipcode,
    f.city,
    f.homeTypes.length ? f.homeTypes : null,
  ].filter((v) => v !== null).length
}
