import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import Supercluster from 'supercluster'

import { formatCompactCurrency, formatCount } from '@/lib/format'
import type { PriceBasis, PropertyMarker } from '@/types/api'

import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX, PRICE_LABEL_ZOOM } from './mapConfig'
import { displayPrice, groupByLocation, type LocationGroup } from './markerGroups'

interface PointProps {
  group: number
  count: number
}
interface ClusterProps {
  count: number
}

interface ClusterLayerProps {
  markers: PropertyMarker[]
  priceBasis: PriceBasis
  selectedId: string | null
  onSelect: (id: string, groupIds: string[]) => void
}

function clusterIcon(count: number): L.DivIcon {
  const size = Math.round(28 + Math.min(Math.log10(count) * 7, 18))
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div class="hs-marker hs-cluster" style="width:${size}px;height:${size}px">${formatCount(count)}</div>`,
  })
}

function pointIcon(group: LocationGroup, basis: PriceBasis, zoom: number): L.DivIcon {
  const first = group.items[0]
  const price = displayPrice(first, basis)
  const variant = price.kind === 'list' ? '' : price.kind === 'simulated' ? 'is-simulated' : 'is-predicted'
  if (zoom < PRICE_LABEL_ZOOM) {
    return L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="hs-marker hs-dot ${price.kind !== 'list' ? 'is-predicted' : ''}"></div>` })
  }
  const label =
    group.items.length > 1
      ? `${group.items.length} homes`
      : price.value != null
        ? formatCompactCurrency(price.value)
        : 'N/A'
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div class="hs-marker hs-pill ${variant}">${label}</div>`,
  })
}

function markerTitle(group: LocationGroup, basis: PriceBasis): string {
  const first = group.items[0]
  const price = displayPrice(first, basis)
  const address = first.street_address ?? 'Address unavailable'
  if (group.items.length > 1) return `${group.items.length} homes at ${address}`
  const priceLabel = price.value != null ? formatCompactCurrency(price.value) : 'no price'
  return `${address} — ${priceLabel} (${price.kind === 'list' ? '2024 listing' : price.kind === 'simulated' ? 'simulated' : 'AI estimate'})`
}

/**
 * Clusters thousands of properties with supercluster and draws only what's visible, using plain
 * Leaflet markers in one layer group (no per-property React components).
 */
export function ClusterLayer({ markers, priceBasis, selectedId, onSelect }: ClusterLayerProps) {
  const map = useMap()
  const [viewTick, setViewTick] = useState(0)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })

  const layer = useMemo(() => L.layerGroup(), [])
  useEffect(() => {
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [layer, map])

  useMapEvents({ moveend: () => setViewTick((t) => t + 1) })

  const groups = useMemo(() => groupByLocation(markers), [markers])
  const index = useMemo(() => {
    const sc = new Supercluster<PointProps, ClusterProps>({
      // extent = Leaflet's 256px tile size, so radius is in real screen pixels.
      extent: 256,
      radius: CLUSTER_RADIUS_PX,
      maxZoom: CLUSTER_MAX_ZOOM,
      map: (p) => ({ count: p.count }),
      reduce: (acc, p) => {
        acc.count += p.count
      },
    })
    sc.load(
      groups.map((g, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [g.lng, g.lat] },
        properties: { group: i, count: g.items.length },
      })),
    )
    return sc
  }, [groups])

  useEffect(() => {
    layer.clearLayers()
    const b = map.getBounds().pad(0.15)
    const zoom = Math.round(map.getZoom())
    const features = index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom)

    for (const f of features) {
      const [lng, lat] = f.geometry.coordinates
      const props = f.properties as (PointProps | ClusterProps) & { cluster?: boolean; cluster_id?: number }
      if (props.cluster && props.cluster_id != null) {
        const clusterId = props.cluster_id
        L.marker([lat, lng], {
          icon: clusterIcon(props.count),
          title: `${props.count.toLocaleString()} properties — click to zoom in`,
          keyboard: true,
        })
          .on('click', () => {
            const target = Math.min(index.getClusterExpansionZoom(clusterId), CLUSTER_MAX_ZOOM + 1)
            map.flyTo([lat, lng], Math.max(target, map.getZoom() + 1), { duration: 0.5 })
          })
          .addTo(layer)
        continue
      }
      const group = groups[(props as PointProps).group]
      if (selectedId && group.items.some((i) => i.id === selectedId)) continue // drawn by SelectedMarker
      L.marker([lat, lng], {
        icon: pointIcon(group, priceBasis, zoom),
        title: markerTitle(group, priceBasis),
        keyboard: true,
        riseOnHover: true,
      })
        .on('click', () => onSelectRef.current(group.items[0].id, group.items.map((i) => i.id)))
        .addTo(layer)
    }
  }, [index, groups, layer, map, priceBasis, selectedId, viewTick])

  return null
}
