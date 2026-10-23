import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { AlertTriangle, FlaskConical, Loader2, PanelLeftClose, SearchX, SlidersHorizontal, Sparkles } from 'lucide-react'

import { AssistantPanel, type Turn } from '@/components/assistant/AssistantPanel'

import { MarketStatsPanel } from '@/components/charts/MarketStatsPanel'
import { FiltersPanel } from '@/components/filters/FiltersPanel'
import { ResultsList, type SortKey } from '@/components/filters/ResultsList'
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
import { isBoolean, isOneOf, PREF_KEYS, readPref, writePref } from '@/lib/preferences'
import { parseUrlState, serializeUrlState } from '@/lib/urlState'
import { cn } from '@/lib/utils'
import { api, filtersToParams, fromApiFilters, toApiFilters } from '@/services/api'
import type { BBox, PropertyMarker } from '@/types/api'
import type { AreaRow, AssistantAction } from '@/types/assistant'
import { activeFilterCount, DEFAULT_FILTERS, DEFAULT_SORT, SORT_KEYS, type PropertyFilters } from '@/types/filters'

const DETAILS_PANEL_WIDTH = 400
/** Buttons floating over the map need a solid surface; the outline variant goes translucent in dark mode. */
const FLOATING_BUTTON = 'bg-card shadow-md dark:border-white/15 dark:bg-card dark:text-foreground dark:hover:bg-muted dark:shadow-black/40'

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
  // Precedence: shared link (URL) > saved preference > default.
  const [initialUrl] = useState(() => parseUrlState(window.location.search))
  const [rawFilters, setFilters] = useState<PropertyFilters>(
    () => initialUrl.filters ?? { ...DEFAULT_FILTERS, priceBasis: readPref(PREF_KEYS.priceBasis, isOneOf('list', 'predicted')) ?? 'list' },
  )
  const [selection, setSelection] = useState<Selection | null>(null)
  const [view, setView] = useState<MapView | null>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  // Filters start collapsed on desktop (the floating search bar stays visible) unless the user left them open.
  const [sidebarOpen, setSidebarOpenState] = useState(() => readPref(PREF_KEYS.sidebarOpen, isBoolean) ?? false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [sort, setSort] = useState<SortKey>(() => initialUrl.sort ?? readPref(PREF_KEYS.sort, isOneOf(...SORT_KEYS)) ?? DEFAULT_SORT)
  const [assistantOpen, setAssistantOpen] = useState(false)
  // Plain-map mode: hide home markers for this visit.
  const [homesHidden, setHomesHidden] = useState(false)
  const [assistantTurns, setAssistantTurns] = useState<Turn[]>([])
  const [pendingQuestion, setPendingQuestion] = useState<{ id: number; text: string } | null>(null)

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

  // ---- Remembered preferences (only user choices are saved, not values from a shared link)
  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open)
    writePref(PREF_KEYS.sidebarOpen, open)
  }, [])
  const changeSort = useCallback((next: SortKey) => {
    setSort(next)
    writePref(PREF_KEYS.sort, next)
  }, [])
  const updateFilters = useCallback((next: PropertyFilters) => {
    setFilters((prev) => {
      if (next.priceBasis !== prev.priceBasis) writePref(PREF_KEYS.priceBasis, next.priceBasis)
      return next
    })
  }, [])

  // ---- Shareable URL: filters, sort, map position and selected home
  const pendingHome = useRef(initialUrl.home ?? null)
  // Record the map position only after a real move (drag, zoom, fly-to), not the map's own start-up fit.
  const [moved, setMoved] = useState(Boolean(initialUrl.position))
  useEffect(() => {
    if (!map || moved) return
    const mark = () => setMoved(true)
    map.once('dragstart zoomstart', mark)
    return () => {
      map.off('dragstart zoomstart', mark)
    }
  }, [map, moved])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const center = map?.getCenter()
      const qs = serializeUrlState({
        filters,
        sort,
        position: moved && center && view ? { lat: center.lat, lng: center.lng, zoom: view.zoom } : null,
        home: selectedId ?? pendingHome.current,
      })
      const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`
      // replaceState (not navigate) so panning doesn't add history entries or re-render the router.
      if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', next)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [filters, sort, view, map, selectedId, moved])

  // Restore a home selected in a shared link once its marker has loaded.
  useEffect(() => {
    const id = pendingHome.current
    if (!id || !properties.data || properties.loading) return
    pendingHome.current = null
    const marker = byId.get(id)
    if (!marker) return
    const groupIds = markers.filter((o) => o.lat === marker.lat && o.lng === marker.lng).map((o) => o.id)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from the URL
    setSelection({ marker, groupIds })
    if (!initialUrl.position) flyToProperty(marker)
  }, [properties.data, properties.loading, byId, markers, flyToProperty, initialUrl.position])

  // ---- AI assistant
  const askAssistant = useCallback((question: string) => {
    setAssistantOpen(true)
    setMobileFiltersOpen(false)
    setPendingQuestion({ id: Date.now(), text: question })
  }, [])

  /** Select a home the assistant mentioned; if current filters hide it, clear them so it shows. */
  const selectAssistantProperty = useCallback(
    (p: PropertyMarker) => {
      if (!byId.has(p.id)) setFilters((f) => ({ ...DEFAULT_FILTERS, priceBasis: f.priceBasis }))
      if (!isDesktop) setAssistantOpen(false) // reveal the details sheet on phones
      selectMarker(p)
    },
    [byId, isDesktop, selectMarker],
  )

  const applyAssistantActions = useCallback(
    (actions: AssistantAction[]) => {
      for (const action of actions) {
        if (action.type === 'set_filters') {
          setFilters(fromApiFilters(action.filters))
          if (action.sort) setSort(action.sort)
          if (action.bounds && !actions.some((a) => a.type === 'select_property')) fitBBox(action.bounds)
        } else if (!actions.some((a) => a.type === 'set_filters')) {
          selectAssistantProperty(action.property)
        } else {
          if (!isDesktop) setAssistantOpen(false)
          selectMarker(action.property)
        }
      }
    },
    [fitBBox, selectMarker, selectAssistantProperty, isDesktop],
  )

  const selectArea = useCallback(
    (row: AreaRow) => {
      setFilters((f) => ({ ...f, zipcode: row.kind === 'zipcode' ? row.area : null, city: row.kind === 'city' ? row.area : null }))
      if (!isDesktop) setAssistantOpen(false)
      fitBBox(row.bounds)
    },
    [fitBBox, isDesktop],
  )

  const assistant = (
    <AssistantPanel
      turns={assistantTurns}
      setTurns={setAssistantTurns}
      context={{ selected_property_id: selectedId, map_bbox: view?.bbox ?? null, filters: toApiFilters(filters) }}
      pendingQuestion={pendingQuestion}
      onActions={applyAssistantActions}
      onSelectProperty={selectAssistantProperty}
      onSelectArea={selectArea}
      onClose={() => setAssistantOpen(false)}
      className={isDesktop ? undefined : 'h-full rounded-none border-0 shadow-none'}
    />
  )

  const askButton = (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={() => setAssistantOpen((o) => !o)}
      aria-label="Ask SupHomey AI"
      aria-pressed={assistantOpen}
      className={cn(
        'size-10 shrink-0',
        FLOATING_BUTTON,
        assistantOpen && 'border-brand-teal bg-brand-teal-soft text-brand-teal-strong dark:border-brand-teal dark:bg-brand-teal-soft dark:text-brand-teal-strong',
      )}
    >
      <Sparkles />
    </Button>
  )

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
      onAsk={askAssistant}
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
        sort={sort}
        onSortChange={changeSort}
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
            {askButton}
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
          initialPosition={initialUrl.position}
          showMarkers={!homesHidden}
        />

        {/* Overlays sit above Leaflet panes but let clicks through except on controls. */}
        <div className="pointer-events-none absolute inset-0 z-[1000]">
          <div className="absolute top-3 right-3 left-3 z-10 flex items-center gap-2">
            {(!isDesktop || !sidebarOpen) && (
              <div className={cn('pointer-events-auto flex gap-2', isDesktop ? 'w-[468px] shrink-0' : 'flex-1')}>
                <div className="flex-1 drop-shadow-md">{search}</div>
                {askButton}
                <Button
                  variant="outline"
                  size="icon-lg"
                  onClick={() => (isDesktop ? setSidebarOpen(true) : setMobileFiltersOpen(true))}
                  aria-label="Open filters and results"
                  className={cn('relative size-10', FLOATING_BUTTON)}
                >
                  <SlidersHorizontal />
                  {filterCount > 0 && (
                    <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-brand-teal text-[10px] font-semibold text-white">
                      {filterCount}
                    </span>
                  )}
                </Button>
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
            homesHidden={homesHidden}
            onToggleHomes={() => setHomesHidden((h) => !h)}
            className={cn('absolute right-3 transition-[right] duration-200', isDesktop ? 'bottom-8' : 'top-1/3', detailsOverlayVisible && 'right-[416px]')}
          />

          <MarketStatsPanel
            filters={filters}
            bbox={view?.bbox ?? null}
            dataVersion={dataVersion}
            className={cn('absolute bottom-6 left-3 max-h-[calc(100%-6rem)] overflow-y-auto', isDesktop ? 'w-[420px]' : 'right-3')}
          />

          {isDesktop && assistantOpen && (
            <div className="pointer-events-auto absolute top-16 bottom-[104px] left-3 flex w-[468px] animate-in duration-200 fade-in slide-in-from-top-2">
              {assistant}
            </div>
          )}

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

      {/* ---------- Mobile: filters drawer, assistant and details bottom sheets ---------- */}
      {!isDesktop && (
        <>
          <Sheet open={assistantOpen} onOpenChange={setAssistantOpen}>
            <SheetContent side="bottom" showCloseButton={false} className="gap-0 overflow-hidden rounded-t-2xl p-0 data-[side=bottom]:h-[85dvh]">
              <SheetTitle className="sr-only">Ask SupHomey</SheetTitle>
              <SheetDescription className="sr-only">Ask questions about Houston homes</SheetDescription>
              {assistant}
            </SheetContent>
          </Sheet>
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
