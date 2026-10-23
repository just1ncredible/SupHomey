import type { LatLngBoundsExpression } from 'leaflet'

export const HOUSTON_CENTER: [number, number] = [29.7604, -95.3698]
/** Initial view: Greater Houston core (Katy → Baytown, Pearland → Spring). */
export const HOUSTON_VIEW: LatLngBoundsExpression = [
  [29.5, -95.82],
  [30.1, -95.08],
]
/** Users can't pan far outside the metro. */
export const MAX_BOUNDS: LatLngBoundsExpression = [
  [28.3, -97.3],
  [31.3, -93.7],
]

/** Standard OpenStreetMap tiles (no API key). Follow https://operations.osmfoundation.org/policies/tiles/. */
export const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** Zoom at which unclustered points switch from dots to price labels. */
export const PRICE_LABEL_ZOOM = 14
/** Above this zoom nothing is clustered. */
export const CLUSTER_MAX_ZOOM = 16
/** Cluster radius in screen pixels. */
export const CLUSTER_RADIUS_PX = 64
export const PROPERTY_FOCUS_ZOOM = 17
