import { MapPin, RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCompactCurrency, formatNumber, homeTypeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FilterMeta } from '@/types/api'
import { activeFilterCount, DEFAULT_FILTERS, type PropertyFilters } from '@/types/filters'

import { Segmented } from './Segmented'

const PRICE_STEPS = [100_000, 150_000, 200_000, 250_000, 300_000, 400_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000]
const SQFT_STEPS = [500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 7500]
const COUNT_OPTIONS = [null, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: v === null ? 'Any' : `${v}+` }))

interface RangeSelectProps {
  label: string
  value: number | null
  steps: number[]
  anyLabel: string
  format: (v: number) => string
  onChange: (v: number | null) => void
}

function RangeSelect({ label, value, steps, anyLabel, format, onChange }: RangeSelectProps) {
  const items = [{ value: 'any', label: anyLabel }, ...steps.map((s) => ({ value: String(s), label: format(s) }))]
  return (
    <Select
      items={items}
      value={value === null ? 'any' : String(value)}
      onValueChange={(v) => onChange(!v || v === 'any' ? null : Number(v))}
    >
      <SelectTrigger aria-label={label} className="h-9 w-full bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-foreground/80 uppercase">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

interface FiltersPanelProps {
  filters: PropertyFilters
  meta: FilterMeta | null
  onChange: (next: PropertyFilters) => void
}

export function FiltersPanel({ filters, meta, onChange }: FiltersPanelProps) {
  const set = <K extends keyof PropertyFilters>(key: K, value: PropertyFilters[K]) => onChange({ ...filters, [key]: value })
  const predictedAvailable = meta?.predicted_available ?? false
  const simulated = meta?.predicted_kind === 'simulated'
  const count = activeFilterCount(filters)

  return (
    <div className="space-y-4">
      {(filters.zipcode || filters.city) && (
        <div className="flex flex-wrap gap-1.5">
          {filters.zipcode && (
            <LocationChip label={`ZIP ${filters.zipcode}`} onClear={() => set('zipcode', null)} />
          )}
          {filters.city && <LocationChip label={filters.city} onClear={() => set('city', null)} />}
        </div>
      )}

      <Field label="Price" hint={filters.priceBasis === 'list' ? '2024 listing price' : simulated ? 'Simulated values' : 'AI estimate'}>
        <Segmented
          label="Price basis"
          value={filters.priceBasis}
          onChange={(v) => set('priceBasis', v)}
          options={[
            { value: 'list', label: 'Listing price' },
            {
              value: 'predicted',
              label: simulated ? 'AI estimate (sim.)' : 'AI estimate',
              disabled: !predictedAvailable,
              title: predictedAvailable ? undefined : 'No model predictions loaded — filter by listing price instead',
            },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <RangeSelect label="Minimum price" value={filters.minPrice} steps={PRICE_STEPS} anyLabel="No min" format={formatCompactCurrency} onChange={(v) => set('minPrice', v)} />
          <RangeSelect label="Maximum price" value={filters.maxPrice} steps={PRICE_STEPS} anyLabel="No max" format={formatCompactCurrency} onChange={(v) => set('maxPrice', v)} />
        </div>
      </Field>

      <Field label="Bedrooms">
        <Segmented label="Minimum bedrooms" value={filters.minBeds} options={COUNT_OPTIONS} onChange={(v) => set('minBeds', v)} />
      </Field>

      <Field label="Bathrooms">
        <Segmented label="Minimum bathrooms" value={filters.minBaths} options={COUNT_OPTIONS.slice(0, 5)} onChange={(v) => set('minBaths', v)} />
      </Field>

      <Field label="Home type">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Home types">
          {(meta?.home_types ?? []).map((t) => {
            const on = filters.homeTypes.includes(t.value)
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set('homeTypes', on ? filters.homeTypes.filter((h) => h !== t.value) : [...filters.homeTypes, t.value])
                }
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  on
                    ? 'border-brand-teal bg-brand-teal-soft text-brand-teal-strong'
                    : 'bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                )}
              >
                {homeTypeLabel(t.value)}
                <span className="text-[10px] opacity-70 tabular">{formatNumber(t.count)}</span>
              </button>
            )
          })}
          {!meta && <div className="h-7 w-full animate-pulse rounded-full bg-muted" />}
        </div>
      </Field>

      <Field label="Living area" hint="sq ft">
        <div className="grid grid-cols-2 gap-2">
          <RangeSelect label="Minimum living area" value={filters.minSqft} steps={SQFT_STEPS} anyLabel="No min" format={(v) => formatNumber(v)} onChange={(v) => set('minSqft', v)} />
          <RangeSelect label="Maximum living area" value={filters.maxSqft} steps={SQFT_STEPS} anyLabel="No max" format={(v) => formatNumber(v)} onChange={(v) => set('maxSqft', v)} />
        </div>
      </Field>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        disabled={count === 0 && filters.priceBasis === 'list'}
        onClick={() => onChange(DEFAULT_FILTERS)}
      >
        <RotateCcw />
        Reset filters{count ? ` (${count})` : ''}
      </Button>
    </div>
  )
}

function LocationChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-navy pr-1 pl-2.5 text-xs font-medium text-primary-foreground">
      <MapPin className="size-3" />
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="grid size-5 place-items-center rounded-full hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}
