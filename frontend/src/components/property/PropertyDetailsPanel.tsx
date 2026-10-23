import { AlertCircle, Bath, BedDouble, Calendar, ChevronLeft, ChevronRight, Home, Info, LandPlot, Lightbulb, Ruler, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatBaths,
  formatCurrency,
  formatLot,
  formatNumber,
  formatPerSqft,
  homeTypeLabel,
  NA,
} from '@/lib/format'
import type { LotAreaSource, PropertyDetail } from '@/types/api'

import { PriceComparison } from './PriceComparison'
import { ValuationCard } from './ValuationCard'

const LOT_NOTES: Partial<Record<LotAreaSource, string>> = {
  converted_from_acres: 'Converted from acres',
  inferred_acres: 'Unit inferred (acres)',
  inferred_sqft: 'Unit inferred (sqft)',
}

export interface GroupNav {
  index: number
  total: number
  onPrev: () => void
  onNext: () => void
}

interface PropertyDetailsPanelProps {
  detail: PropertyDetail | null
  loading: boolean
  error: Error | null
  group: GroupNav | null
  onClose: () => void
}

function Fact({ icon: Icon, label, value, note }: { icon: typeof Home; label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 px-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand-teal-strong" />
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold tabular">{value}</div>
        {note && <div className="text-[10px] text-muted-foreground">{note}</div>}
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading property">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export function PropertyDetailsPanel({ detail, loading, error, group, onClose }: PropertyDetailsPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        {group && group.total > 1 ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Button variant="ghost" size="icon-sm" onClick={group.onPrev} aria-label="Previous home at this location">
              <ChevronLeft />
            </Button>
            <span className="tabular">
              {group.index + 1} of {group.total} at this location
            </span>
            <Button variant="ghost" size="icon-sm" onClick={group.onNext} aria-label="Next home at this location">
              <ChevronRight />
            </Button>
          </div>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Property details</span>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close property details">
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="m-5 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            Could not load this property. {error.message}
          </div>
        ) : !detail || (loading && !detail) ? (
          <DetailSkeleton />
        ) : (
          <PropertyBody detail={detail} stale={loading} />
        )}
      </div>
    </div>
  )
}

function PropertyBody({ detail, stale }: { detail: PropertyDetail; stale: boolean }) {
  const v = detail.valuation
  const showComparison = v.status === 'available' && v.value != null && detail.list_price != null
  const isLot = detail.home_type === 'LOT'

  return (
    <article className={`space-y-4 p-5 transition-opacity ${stale ? 'opacity-60' : ''}`}>
      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{homeTypeLabel(detail.home_type)}</Badge>
          {detail.dataset_source === 'synthetic_fixture' && (
            <Badge className="bg-warning-soft text-warning-foreground">Synthetic record</Badge>
          )}
        </div>
        <h2 className="mt-2 text-xl leading-snug font-semibold tracking-tight">
          {detail.street_address ?? 'Street address unavailable'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {[detail.city, [detail.state, detail.zipcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
        </p>
      </header>

      <ValuationCard valuation={v} />

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">2024 listing price</h3>
          {detail.days_on_market != null && (
            <span className="text-[11px] text-muted-foreground">{formatNumber(detail.days_on_market)} days on Zillow at snapshot</span>
          )}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tracking-tight tabular">{formatCurrency(detail.list_price)}</span>
          {detail.list_price_per_sqft != null && (
            <span className="text-sm text-muted-foreground tabular">{formatPerSqft(detail.list_price_per_sqft)} (listed)</span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Asking price from a 2024 listing snapshot — not a sale price, and the home may no longer be for sale.
        </p>
      </section>

      {showComparison && <PriceComparison listPrice={detail.list_price!} predicted={v.value!} />}

      <section aria-label="Property characteristics" className="grid grid-cols-2 gap-2">
        {!isLot && <Fact icon={BedDouble} label="Bedrooms" value={detail.bedrooms != null ? String(detail.bedrooms) : NA} />}
        {!isLot && <Fact icon={Bath} label="Bathrooms" value={formatBaths(detail.bathrooms)} />}
        {!isLot && (
          <Fact icon={Ruler} label="Living area" value={detail.living_area_sqft != null ? `${formatNumber(detail.living_area_sqft)} sqft` : NA} />
        )}
        <Fact
          icon={LandPlot}
          label="Lot size"
          value={formatLot(detail.lot_area_sqft)}
          note={detail.lot_area_source ? LOT_NOTES[detail.lot_area_source] : undefined}
        />
        {!isLot && <Fact icon={Calendar} label="Year built" value={detail.year_built != null ? String(detail.year_built) : NA} />}
        <Fact icon={Home} label="ZIP code" value={detail.zipcode ?? NA} />
      </section>

      <section className="rounded-2xl border border-dashed p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-brand-teal-strong" /> Why this value?
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Feature-level explanations (e.g. SHAP contributions for size, location and age) will appear here once the
          team's model bundle provides them.
        </p>
      </section>

      {(detail.benchmarks.zestimate ?? detail.benchmarks.rent_zestimate ?? detail.benchmarks.tax_assessed_value) != null && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Third-party benchmarks
          </h3>
          <dl className="divide-y rounded-2xl border bg-card text-sm">
            {detail.benchmarks.zestimate != null && (
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-muted-foreground">Zillow Zestimate</dt>
                <dd className="font-medium tabular">{formatCurrency(detail.benchmarks.zestimate)}</dd>
              </div>
            )}
            {detail.benchmarks.rent_zestimate != null && (
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-muted-foreground">Rent Zestimate</dt>
                <dd className="font-medium tabular">{formatCurrency(detail.benchmarks.rent_zestimate)}/mo</dd>
              </div>
            )}
            {detail.benchmarks.tax_assessed_value != null && (
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-muted-foreground">Tax assessed value</dt>
                <dd className="font-medium tabular">{formatCurrency(detail.benchmarks.tax_assessed_value)}</dd>
              </div>
            )}
          </dl>
          <p className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-px size-3 shrink-0" />
            From the 2024 Zillow listing record (assessment year not stated). Shown for context only — these are not
            our model's estimates and are never used as model inputs.
          </p>
        </section>
      )}

      <footer className="border-t pt-3 text-[11px] text-muted-foreground tabular">
        Property ID {detail.id} · {detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}
      </footer>
    </article>
  )
}
