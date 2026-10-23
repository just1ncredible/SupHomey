import { useMemo, useState } from 'react'
import { ArrowDownWideNarrow, Home } from 'lucide-react'

import { displayPrice } from '@/components/map/markerGroups'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBaths, formatCurrency, formatNumber, homeTypeLabel, NA } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PriceBasis, PropertyMarker } from '@/types/api'
import type { SortKey } from '@/types/filters'

export type { SortKey }

const SORT_LABELS: Record<SortKey, string> = {
  price_desc: 'Price: high to low',
  price_asc: 'Price: low to high',
  sqft_desc: 'Largest first',
  price_per_sqft_asc: 'Lowest $/sqft',
}
const PAGE = 40

interface ResultsListProps {
  items: PropertyMarker[]
  totalMatching: number
  priceBasis: PriceBasis
  selectedId: string | null
  loading: boolean
  sort: SortKey
  onSortChange: (sort: SortKey) => void
  onSelect: (p: PropertyMarker) => void
}

export function ResultsList({ items, totalMatching, priceBasis, selectedId, loading, sort, onSortChange, onSelect }: ResultsListProps) {
  const [shown, setShown] = useState(PAGE)

  const sorted = useMemo(() => {
    const price = (p: PropertyMarker) => displayPrice(p, priceBasis).value
    const copy = [...items]
    const ppsf = (p: PropertyMarker) =>
      p.list_price != null && p.living_area_sqft && p.home_type !== 'LOT' ? p.list_price / p.living_area_sqft : Infinity
    if (sort === 'sqft_desc') copy.sort((a, b) => (b.living_area_sqft ?? -1) - (a.living_area_sqft ?? -1))
    else if (sort === 'price_per_sqft_asc') copy.sort((a, b) => ppsf(a) - ppsf(b))
    else copy.sort((a, b) => ((price(a) ?? -1) - (price(b) ?? -1)) * (sort === 'price_asc' ? 1 : -1))
    if (sort === 'price_asc') copy.sort((a, b) => Number(price(a) == null) - Number(price(b) == null))
    return copy
  }, [items, sort, priceBasis])

  return (
    <section aria-label="Properties in view" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          <span className="font-semibold text-foreground tabular">{formatNumber(items.length)}</span> in view
          <span className="mx-1">·</span>
          {formatNumber(totalMatching)} match
        </p>
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowDownWideNarrow className="size-3.5" />
          <span className="sr-only">Sort results</span>
          <select
            value={sort}
            onChange={(e) => {
              onSortChange(e.target.value as SortKey)
              setShown(PAGE)
            }}
            className="cursor-pointer rounded-md bg-transparent py-0.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="space-y-1.5 px-3 pb-3">
        {loading && items.length === 0 &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-[74px] w-full rounded-xl" />
            </li>
          ))}
        {!loading && items.length === 0 && (
          <li className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            <Home className="size-5" />
            No properties in this part of the map. Zoom out or adjust filters.
          </li>
        )}
        {sorted.slice(0, shown).map((p) => {
          const price = displayPrice(p, priceBasis)
          const selected = p.id === selectedId
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                aria-current={selected || undefined}
                className={cn(
                  'w-full rounded-xl border bg-card px-3 py-2.5 text-left transition-all outline-none hover:border-foreground/15 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/40',
                  selected && 'border-brand-teal ring-2 ring-brand-teal/25',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold tracking-tight tabular">
                    {price.value != null ? formatCurrency(price.value) : NA}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-medium tracking-wide uppercase',
                      price.kind === 'list' ? 'text-muted-foreground' : price.kind === 'simulated' ? 'text-warning-foreground' : 'text-brand-teal-strong',
                    )}
                  >
                    {price.kind === 'list' ? '2024 list' : price.kind === 'simulated' ? 'Simulated' : 'AI est.'}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-foreground/80 tabular">
                  {p.bedrooms != null ? `${p.bedrooms} bd` : '— bd'} · {formatBaths(p.bathrooms)} ba ·{' '}
                  {p.living_area_sqft != null ? `${formatNumber(p.living_area_sqft)} sqft` : '— sqft'}
                  <span className="text-muted-foreground"> · {homeTypeLabel(p.home_type)}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {p.street_address ?? 'Address unavailable'}
                  {p.city ? `, ${p.city}` : ''} {p.zipcode ?? ''}
                </div>
              </button>
            </li>
          )
        })}
        {sorted.length > shown && (
          <li>
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE)}
              className="w-full rounded-xl py-2 text-xs font-medium text-brand-teal-strong hover:bg-brand-teal-soft focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              Show {Math.min(PAGE, sorted.length - shown)} more of {formatNumber(sorted.length - shown)}
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}
