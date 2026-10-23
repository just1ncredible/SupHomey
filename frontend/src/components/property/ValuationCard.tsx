import { AlertTriangle, BrainCircuit, PlugZap, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPerSqft } from '@/lib/format'
import type { Valuation } from '@/types/api'

const SOURCE_LABEL: Record<string, string> = {
  batch: 'Precomputed',
  realtime: 'Real-time',
  simulated: 'Simulated',
}

export function ValuationCard({ valuation }: { valuation: Valuation }) {
  if (valuation.status === 'unavailable' || valuation.status === 'error' || valuation.value == null) {
    const isError = valuation.status === 'error'
    return (
      <div className="rounded-2xl border border-dashed bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <BrainCircuit className="size-4" /> AI estimated value
        </div>
        <div className="mt-3 flex items-start gap-2.5">
          {isError ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <PlugZap className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <p className="text-sm font-medium text-foreground/80">{valuation.message}</p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          The listing price below is the seller's 2024 asking price, not a model estimate.
        </p>
      </div>
    )
  }

  const simulated = valuation.status === 'simulated'
  return (
    <div
      className={
        simulated
          ? 'rounded-2xl border border-dashed border-warning bg-warning-soft/60 p-4'
          : 'rounded-2xl bg-brand-navy p-4 text-primary-foreground shadow-md'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 text-xs font-semibold tracking-wide uppercase ${simulated ? 'text-warning-foreground' : 'text-white/70'}`}
        >
          <Sparkles className="size-4" /> AI estimated value
        </div>
        {simulated ? (
          <Badge className="bg-warning text-white">Simulated — UI Preview</Badge>
        ) : (
          <Badge className="border-white/15 bg-white/10 text-white">{SOURCE_LABEL[valuation.source ?? ''] ?? 'Model'}</Badge>
        )}
      </div>

      <div className={`mt-2 text-[34px] leading-none font-semibold tracking-tight tabular ${simulated ? 'text-warning-foreground/80' : ''}`}>
        {formatCurrency(valuation.value)}
      </div>

      {valuation.low != null && valuation.high != null && (
        <div className="mt-2 text-sm text-white/75 tabular">
          {formatCurrency(valuation.low)} – {formatCurrency(valuation.high)}
          <span className="text-white/55">
            {' · '}
            {valuation.interval_coverage != null ? `${Math.round(valuation.interval_coverage * 100)}% interval` : 'model range'}
          </span>
        </div>
      )}

      <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${simulated ? 'text-warning-foreground' : 'text-white/65'}`}>
        {valuation.price_per_sqft != null && <span className="tabular">{formatPerSqft(valuation.price_per_sqft)} (predicted)</span>}
        {(valuation.model_name || valuation.model_version) && !simulated && (
          <span>
            {valuation.model_name}
            {valuation.model_version ? ` · v${valuation.model_version}` : ''}
          </span>
        )}
      </div>
      {simulated && <p className="mt-2 text-xs leading-relaxed text-warning-foreground">{valuation.message}</p>}
    </div>
  )
}
