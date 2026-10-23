import { useState } from 'react'
import { BarChart3, ChevronDown, Info, Loader2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Segmented } from '@/components/filters/Segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatCompactCurrency, formatCurrency, formatNumber, homeTypeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { api, filtersToParams } from '@/services/api'
import type { BBox, MarketSummary } from '@/types/api'
import type { PropertyFilters } from '@/types/filters'

export type StatsScopeChoice = 'view' | 'matching' | 'dataset'

interface MarketStatsPanelProps {
  filters: PropertyFilters
  bbox: BBox | null
  dataVersion: number
  className?: string
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('truncate text-base font-semibold tracking-tight tabular', accent && 'text-brand-teal-strong')}>{value}</div>
      {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { value: number; payload: { label: string } }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{payload[0].payload.label}</div>
      <div className="text-muted-foreground tabular">{formatNumber(payload[0].value)} properties</div>
    </div>
  )
}

export function MarketStatsPanel({ filters, bbox, dataVersion, className }: MarketStatsPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [scope, setScope] = useState<StatsScopeChoice>('view')
  const debouncedBbox = useDebouncedValue(bbox, 300)

  const useFilters = scope !== 'dataset'
  const useBbox = scope === 'view' ? debouncedBbox : null
  const key = JSON.stringify([scope, useFilters ? filtersToParams(filters) : null, useBbox?.map((v) => v.toFixed(4)), dataVersion])
  const { data, loading, error } = useApi<MarketSummary>(key, (s) =>
    api.marketSummary(useFilters ? filters : null, useBbox, s),
  )

  const predictedLabel = data?.predicted_kind === 'simulated' ? 'Median AI est. (simulated)' : 'Median AI estimate'

  return (
    <section
      aria-label="Market statistics"
      className={cn('pointer-events-auto rounded-2xl border bg-card/95 shadow-lg backdrop-blur', className)}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <BarChart3 className="size-4 shrink-0 text-brand-teal-strong" />
        {error ? (
          <span className="text-sm text-destructive">Statistics unavailable — {error.message}</span>
        ) : !data ? (
          <Skeleton className="h-8 flex-1" />
        ) : (
          <div className="grid flex-1 grid-cols-3 gap-4">
            <Stat label={scope === 'view' ? 'In view' : 'Properties'} value={formatNumber(data.count)} />
            <Stat label="Median list" value={formatCompactCurrency(data.median_list_price)} />
            <Stat label="Listed $/sqft" value={data.median_list_price_per_sqft != null ? `$${Math.round(data.median_list_price_per_sqft)}` : '—'} />
          </div>
        )}
        {loading && data ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="space-y-4 border-t px-4 pt-3 pb-4">
          <Segmented
            label="Statistics scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'view', label: 'Map view' },
              { value: 'matching', label: 'All matching' },
              { value: 'dataset', label: 'Entire dataset' },
            ]}
          />
          {data && (
            <>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{data.scope.label}</span> · {formatNumber(data.count)} of{' '}
                {formatNumber(data.dataset_total)} records
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Stat label="Median 2024 listing price" value={formatCurrency(data.median_list_price)} />
                {data.predicted_count > 0 ? (
                  <Stat
                    label={predictedLabel}
                    value={formatCurrency(data.median_predicted_price)}
                    sub={`${formatNumber(data.predicted_count)} with estimates`}
                    accent={data.predicted_kind === 'batch'}
                  />
                ) : (
                  <Stat label="Median AI estimate" value="—" sub="Model not connected" />
                )}
                <Stat label="Median $/sqft (listed)" value={data.median_list_price_per_sqft != null ? formatCurrency(data.median_list_price_per_sqft) : '—'} sub="Excludes vacant land" />
                <Stat label="Avg living area" value={data.avg_living_area_sqft != null ? `${formatNumber(data.avg_living_area_sqft)} sqft` : '—'} />
              </div>

              {data.count > 0 && (
                <>
                  <figure>
                    <figcaption className="mb-1 text-xs font-medium">Listing price distribution</figcaption>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.list_price_distribution.map((b) => ({ ...b, tick: b.min == null ? '<200K' : formatCompactCurrency(b.min).replace('$', '') + (b.max == null ? '+' : '') }))} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
                          <CartesianGrid vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="tick" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                          <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => formatNumber(v)} />
                          <Tooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltip />} />
                          <Bar dataKey="count" fill="var(--brand-teal)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </figure>

                  <figure>
                    <figcaption className="mb-1.5 text-xs font-medium">Property types</figcaption>
                    <ul className="space-y-1.5">
                      {data.home_types.map((t) => (
                        <li key={t.label} className="grid grid-cols-[96px_1fr_44px] items-center gap-2 text-xs">
                          <span className="truncate text-muted-foreground">{homeTypeLabel(t.label)}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-brand-navy/80"
                              style={{ width: `${(t.count / data.count) * 100}%` }}
                            />
                          </span>
                          <span className="text-right tabular">{((t.count / data.count) * 100).toFixed(0)}%</span>
                        </li>
                      ))}
                    </ul>
                  </figure>
                </>
              )}

              <p className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-px size-3 shrink-0" />
                {data.note}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
