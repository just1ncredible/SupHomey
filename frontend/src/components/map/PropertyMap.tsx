import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import { formatCompactCurrency } from '@/lib/format'
import type { MapPosition } from '@/lib/urlState'
import type { BBox, PriceBasis, PropertyMarker } from '@/types/api'

import { ClusterLayer } from './ClusterLayer'
import { HOUSTON_VIEW, MAX_BOUNDS, TILE_ATTRIBUTION, TILE_URL } from './mapConfig'
import { displayPrice } from './markerGroups'

export interface MapView {
  bbox: BBox
  zoom: number
}

interface PropertyMapProps {
  markers: PropertyMarker[]
  priceBasis: PriceBasis
  selected: PropertyMarker | null
  onSelect: (id: string, groupIds: string[]) => void
  onViewChange: (view: MapView) => void
  onMapReady: (map: L.Map) => void
  /** Start here instead of the Houston overview (e.g. from a shared link). Read once on mount. */
  initialPosition?: MapPosition | null
  /** Hide the home markers (clusters, dots, price labels) to see the plain map. The selected home stays. */
  showMarkers?: boolean
}

function toView(map: L.Map): MapView {
  const b = map.getBounds()
  return { bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], zoom: map.getZoom() }
}

/** Reports the visible bounds and keeps Leaflet sized correctly when panels open/close. */
function ViewWatcher({ onViewChange, onMapReady }: Pick<PropertyMapProps, 'onViewChange' | 'onMapReady'>) {
  const map = useMap()
  useMapEvents({ moveend: () => onViewChange(toView(map)) })

  useEffect(() => {
    onMapReady(map)
    onViewChange(toView(map))
    const observer = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per map instance
  }, [map])
  return null
}

function SelectedMarker({ marker, priceBasis }: { marker: PropertyMarker; priceBasis: PriceBasis }) {
  const price = displayPrice(marker, priceBasis)
  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div class="hs-marker hs-selected">${price.value != null ? formatCompactCurrency(price.value) : 'Selected'}</div>`,
      }),
    [price.value],
  )
  return (
    <Marker
      position={[marker.lat, marker.lng]}
      icon={icon}
      zIndexOffset={2000}
      keyboard={false}
      title={`Selected: ${marker.street_address ?? 'property'}`}
    />
  )
}

export function PropertyMap({ markers, priceBasis, selected, onSelect, onViewChange, onMapReady, initialPosition, showMarkers = true }: PropertyMapProps) {
  const start = initialPosition
    ? { center: [initialPosition.lat, initialPosition.lng] as [number, number], zoom: initialPosition.zoom }
    : { bounds: HOUSTON_VIEW }
  return (
    <MapContainer
      {...start}
      maxBounds={MAX_BOUNDS}
      maxBoundsViscosity={0.8}
      minZoom={8}
      maxZoom={19}
      zoomControl={false}
      zoomSnap={0.5}
      wheelPxPerZoomLevel={90}
      preferCanvas
      className="size-full"
      attributionControl
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} className="hs-tiles" />
      {showMarkers && (
        <ClusterLayer markers={markers} priceBasis={priceBasis} selectedId={selected?.id ?? null} onSelect={onSelect} />
      )}
      {selected && <SelectedMarker marker={selected} priceBasis={priceBasis} />}
      <ViewWatcher onViewChange={onViewChange} onMapReady={onMapReady} />
    </MapContainer>
  )
}
