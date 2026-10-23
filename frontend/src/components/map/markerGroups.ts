import type { PriceBasis, PropertyMarker } from '@/types/api'

/** Properties sharing exact coordinates (condo buildings, subdivided lots) become one map marker. */
export interface LocationGroup {
  lat: number
  lng: number
  items: PropertyMarker[]
}

export function groupByLocation(markers: PropertyMarker[]): LocationGroup[] {
  const groups = new Map<string, LocationGroup>()
  for (const m of markers) {
    const key = `${m.lat.toFixed(6)},${m.lng.toFixed(6)}`
    const group = groups.get(key)
    if (group) group.items.push(m)
    else groups.set(key, { lat: m.lat, lng: m.lng, items: [m] })
  }
  return [...groups.values()]
}

export interface DisplayPrice {
  value: number | null
  kind: 'list' | 'predicted' | 'simulated'
}

/** The price a marker should show for the chosen basis. Never substitutes one basis for another. */
export function displayPrice(m: PropertyMarker, basis: PriceBasis): DisplayPrice {
  if (basis === 'predicted') {
    return { value: m.predicted_price, kind: m.valuation_kind === 'simulated' ? 'simulated' : 'predicted' }
  }
  return { value: m.list_price, kind: 'list' }
}
