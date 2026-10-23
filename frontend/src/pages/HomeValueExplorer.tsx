import { useCallback, useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { AlertTriangle, FlaskConical, Loader2, PanelLeftClose, PanelLeftOpen, SearchX, SlidersHorizontal } from 'lucide-react'

import { MarketStatsPanel } from '@/components/charts/MarketStatsPanel'
import { FiltersPanel } from '@/components/filters/FiltersPanel'
import { ResultsList } from '@/components/filters/ResultsList'
import { SearchBox } from '@/components/filters/SearchBox'
import { MapControls } from '@/components/map/MapControls'
import { HOUSTON_VIEW, PROPERTY_FOCUS_ZOOM } from '@/components/map/mapConfig'
import { PropertyMap, type MapView } from '@/components/map/PropertyMap'
import { PropertyDetailsPanel, type GroupNav } from '@/components/property/PropertyDetailsPanel'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAppStatus } from '@/context/AppStatus'
import { useApi } from '@/hooks/useApi'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { api, filtersToParams } from '@/services/api'
import type { BBox, PropertyMarker } from '@/types/api'
import { activeFilterCount, DEFAULT_FILTERS, type PropertyFilters } from '@/types/filters'

const DETAILS_PANEL_WIDTH = 400

interface Selection {
  marker: PropertyMarker
  groupIds: string[]
}

function inBBox(m: PropertyMarker, [s, w, n, e]: BBox) {
  return m.lat >= s && m.lat <= n && m.lng >= w && m.lng <= e
}

export default function HomeValueExplorer() {
  const isDesktop = useIsDesktop()
  const { health, dataVersion } = useAppStatus()
  const [rawFilters, setFilters] = useState<PropertyFilters>(DEFAULT_FILTERS)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [view, setView] = useState<MapView | null>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // ---- Data
  const meta = useApi(`meta:${dataVersion}`, (s) => api.filterMeta(s))
  // Fall back to listing prices if predictions are unavailable (e.g. after a model reload).
  const filters = useMemo<PropertyFilters>(
    () =>
      rawFilters.priceBasis === 'predicted' && meta.data && !meta.data.predicted_available
        ? { ...rawFilters, priceBasis: 'list' }
        : rawFilters,
    [rawFilters, meta.data],
  )
  const propertiesKey = JSON.stringify([filtersToParams(filters), dataVersion])
  const properties = useApi(propertiesKey, (s) => api.properties(filters, {}, s))
  const markers = useMemo(() => properties.data?.items ?? [], [properties.data])
  const byId = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers])
  const inView = useMemo(() => (view ? markers.filter((m) => inBBox(m, view.bbox)) : markers), [markers, view])

  const selectedId = selection?.marker.id ?? null
  const detail = useApi(selectedId ? `detail:${selectedId}:${dataVersion}` : null, (s) => api.property(selectedId!, s))
  const currentDetail = detail.data?.id === selectedId ? detail.data : null

  // ---- Map navigation helpers
  const detailsOverlayVisible = isDesktop && selection !== null
  const flyToProperty = useCallback(
    (m: PropertyMarker, minZoom = PROPERTY_FOCUS_ZOOM - 1) => {
      if (!map) return
      const zoom = Math.max(map.getZoom(), minZoom)
      // Keep the property centred in the part of the map not covered by the details panel.
      const offsetX = isDesktop ? DETAILS_PANEL_WIDTH / 2 : 0
      const point = map.project([m.lat, m.lng], zoom).add([offsetX, 0])
      map.flyTo(map.unproject(point, zoom), zoom, { duration: 0.8 })
    },
    [map, isDesktop],
  )

  const fitBBox = useCallback(
    ([s, w, n, e]: BBox) => {
      map?.flyToBounds(
        [
          [s, w],
          [n, e],
        ],
        { paddingTopLeft: [48, 48], paddingBottomRight: detailsOverlayVisible ? [DETAILS_PANEL_WIDTH, 48] : [48, 48], maxZoom: 15, duration: 0.8 },
      )
    },
    [map, detailsOverlayVisible],
  )

  const resetView = useCallback(() => {
    map?.flyToBounds(HOUSTON_VIEW, { duration: 0.8 })
  }, [map])

  // ---- Selection
  const selectFromMap = useCallback(
    (id: string, groupIds: string[]) => {
      const marker = byId.get(id)
      if (!marker) return
      setSelection({ marker, groupIds })
      if (map && isDesktop) {
        const point = map.latLngToContainerPoint([marker.lat, marker.lng])
        const visibleRight = map.getSize().x - DETAILS_PANEL_WIDTH - 40
        if (point.x > visibleRight) map.panBy([point.x - visibleRight + 60, 0], { duration: 0.4 })
      }
    },
    [byId, map, isDesktop],
  )

  const selectMarker = useCallback(
    (m: PropertyMarker) => {
      const groupIds = markers.filter((o) => o.lat === m.lat && o.lng === m.lng).map((o) => o.id)
      setSelection({ marker: m, groupIds: groupIds.length ? groupIds : [m.id] })
      setMobileFiltersOpen(false)
      flyToProperty(m)
    },
    [markers, flyToProperty],
  )

  const groupNav: GroupNav | null = useMemo(() => {
    if (!selection || selection.groupIds.length < 2) return null
    const index = selection.groupIds.indexOf(selection.marker.id)
    const go = (delta: number) => {
      const nextId = selection.groupIds[(index + delta + selection.groupIds.length) % selection.groupIds.length]
      const next = byId.get(nextId)
      if (next) setSelection({ ...selection, marker: next })
    }
    return { index, total: selection.groupIds.length, onPrev: () => go(-1), onNext: () => go(1) }
  }, [selection, byId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selection && !document.querySelector('[role="dialog"]')) setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection])

  const updateFilters = useCallback((next: PropertyFilters) => setFilters(next), [])

  // ---- Shared pieces
  const search = (
    <SearchBox
      onSelectProperty={(p) => {
        setFilters((f) => (f.zipcode || f.city ? { ...f, zipcode: null, city: null } : f))
        selectMarker(p)
      }}
      onSelectZip={(z) => {
        setFilters((f) => ({ ...f, zipcode: z.zipcode, city: null }))
        fitBBox(z.bounds)
        setMobileFiltersOpen(false)
      }}
      onSelectCity={(c) => {
        setFilters((f) => ({ ...f, city: c.city, zipcode: null }))
        fitBBox(c.bounds)
        setMobileFiltersOpen(false)
      }}
    />
  )

  const filtersAndResults = (
    <>
      <div className="border-b px-4 pt-1 pb-4">
        <FiltersPanel filters={filters} meta={meta.data} onChange={updateFilters} />
      </div>
      <ResultsList
        items={inView}
        totalMatching={properties.data?.total ?? 0}
        priceBasis={filters.priceBasis}
        selectedId={selectedId}
        loading={properties.loading}
        onSelect={selectMarker}
      />
    </>
  )

  const filterCount = activeFilterCount(filters)
  const synthetic = health?.dataset.is_synthetic
  const basisLabel =
    filters.priceBasis === 'list'
      ? 'Showing 2024 listing prices'
      : meta.data?.predicted_kind === 'simulated'
        ? 'Showing simulated estimates (UI preview)'
        : 'Showing AI estimated values'

  return (
    <div className="flex min-h-0 flex-1">
      {/* ---------- Desktop sidebar ---------- */}
      {isDesktop && sidebarOpen && (
        <aside aria-label="Search and filters" className="flex w-[372px] shrink-0 flex-col border-r bg-card">
          <div className="flex items-center gap-2 p-3">
            {search}
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar" className="shrink-0">
              <PanelLeftClose />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{filtersAndResults}</div>
        </aside>
      )}

      {/* ---------- Map ---------- */}
      <div className="relative isolate min-w-0 flex-1">
        <PropertyMap
          markers={markers}
          priceBasis={filters.priceBasis}
          selected={selection?.marker ?? null}
          onSelect={selectFromMap}
          onViewChange={setView}
          onMapReady={setMap}
        />

        {/* Overlays sit above Leaflet panes but let clicks through except on controls. */}
        <div className="pointer-events-none absolute inset-0 z-[1000]">
          <div className="absolute top-3 right-3 left-3 flex items-start gap-2">
            {isDesktop ? (
              !sidebarOpen && (
                <Button variant="outline" onClick={() => setSidebarOpen(true)} className="pointer-events-auto h-10 bg-card shadow-md">
                  <PanelLeftOpen /> Search &amp; filters{filterCount ? ` (${filterCount})` : ''}
                </Button>
              )
            ) : (
              <div className="pointer-events-auto flex flex-1 gap-2">
                <div className="flex-1 drop-shadow-md">{search}</div>
                <Button variant="outline" size="icon-lg" onClick={() => setMobileFiltersOpen(true)} aria-label="Open filters and results" className="relative size-10 bg-card shadow-md">
                  <SlidersHorizontal />
                  {filterCount > 0 && (
                    <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-brand-teal text-[10px] font-semibold text-white">
                      {filterCount}
                    </span>
                  )}
                </Button>
              </div>
            )}

            {isDesktop && (
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    filters.priceBasis === 'list' ? 'bg-brand-navy' : meta.data?.predicted_kind === 'simulated' ? 'bg-warning' : 'bg-brand-teal',
                  )}
                />
                <span className="font-medium">{basisLabel}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground tabular">
                  {properties.loading && !properties.data ? 'Loading…' : `${formatNumber(properties.data?.total ?? 0)} properties`}
                </span>
                {properties.loading && properties.data && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </div>
            )}
          </div>

          {synthetic && (
            <div className={cn('absolute left-1/2 -translate-x-1/2', isDesktop ? 'top-16' : 'top-16')}>
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-warning/40 bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-foreground shadow-sm">
                <FlaskConical className="size-3.5" />
                Synthetic development data — not real Houston listings
              </div>
            </div>
          )}

          {properties.loading && !properties.data && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm shadow-lg">
                <Loader2 className="size-4 animate-spin text-brand-teal-strong" /> Loading Houston properties…
              </div>
            </div>
          )}

          {properties.error && (
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="pointer-events-auto max-w-sm rounded-2xl border bg-card p-5 text-center shadow-xl">
                <AlertTriangle className="mx-auto size-6 text-destructive" />
                <h2 className="mt-2 font-semibold">Can't load properties</h2>
                <p className="mt-1 text-sm text-muted-foreground">{properties.error.message}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Start the API with <code className="font-mono">uvicorn app.main:app --reload</code> in{' '}
                  <code className="font-mono">backend/</code>. This page reconnects automatically.
                </p>
              </div>
            </div>
          )}

          {properties.data && properties.data.total === 0 && (
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="pointer-events-auto max-w-xs rounded-2xl border bg-card p-5 text-center shadow-xl">
                <SearchX className="mx-auto size-6 text-muted-foreground" />
                <h2 className="mt-2 font-semibold">No properties match</h2>
                <p className="mt-1 text-sm text-muted-foreground">Try widening the price range or removing a filter.</p>
                <Button className="mt-3" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Reset filters
                </Button>
              </div>
            </div>
          )}

          <MapControls
            map={map}
            onReset={resetView}
            className={cn('absolute right-3 transition-[right] duration-200', isDesktop ? 'bottom-8' : 'top-1/3', detailsOverlayVisible && 'right-[416px]')}
          />

          <MarketStatsPanel
            filters={filters}
            bbox={view?.bbox ?? null}
            dataVersion={dataVersion}
            className={cn('absolute bottom-6 left-3 max-h-[calc(100%-6rem)] overflow-y-auto', isDesktop ? 'w-[420px]' : 'right-3')}
          />

          {detailsOverlayVisible && (
            <aside
              aria-label="Property details"
              className="pointer-events-auto absolute top-3 right-3 bottom-3 animate-in overflow-hidden rounded-2xl border bg-card shadow-2xl duration-200 fade-in slide-in-from-right-4"
              style={{ width: DETAILS_PANEL_WIDTH }}
            >
              <PropertyDetailsPanel
                detail={currentDetail}
                loading={detail.loading}
                error={detail.error}
                group={groupNav}
                onClose={() => setSelection(null)}
              />
            </aside>
          )}
        </div>
      </div>

      {/* ---------- Mobile: filters drawer + details bottom sheet ---------- */}
      {!isDesktop && (
        <>
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetContent side="left" className="w-[92vw] max-w-sm gap-0 overflow-y-auto p-0">
              <SheetHeader className="border-b">
                <SheetTitle>Filters &amp; results</SheetTitle>
                <SheetDescription>{basisLabel}</SheetDescription>
              </SheetHeader>
              {filtersAndResults}
            </SheetContent>
          </Sheet>
          <Sheet open={selection !== null} onOpenChange={(open) => !open && setSelection(null)}>
            <SheetContent side="bottom" showCloseButton={false} className="gap-0 rounded-t-2xl p-0 data-[side=bottom]:h-[82dvh]">
              <SheetTitle className="sr-only">Property details</SheetTitle>
              <SheetDescription className="sr-only">Details and valuation for the selected property</SheetDescription>
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
              <div className="min-h-0 flex-1">
                <PropertyDetailsPanel
                  detail={currentDetail}
                  loading={detail.loading}
                  error={detail.error}
                  group={groupNav}
                  onClose={() => setSelection(null)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  )
}
