import { useState } from 'react'
import { AlertTriangle, BrainCircuit, CheckCircle2, CircleDashed, FileSpreadsheet, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStatus } from '@/context/AppStatus'
import { formatCurrency, formatNumber } from '@/lib/format'
import { api } from '@/services/api'
import type { ModelStatus } from '@/types/api'

export type ModelBadgeState = 'none' | 'batch' | 'realtime' | 'simulated' | 'error'

export function modelBadgeState(status: ModelStatus | null): ModelBadgeState {
  if (!status) return 'none'
  if (status.realtime_status === 'error') return 'error'
  if (status.realtime_status === 'loaded') return 'realtime'
  if (status.batch?.kind === 'batch') return 'batch'
  if (status.batch?.kind === 'simulated') return 'simulated'
  return 'none'
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground" title={hint}>
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular">{value}</div>
    </div>
  )
}

export function ModelStatusPanel() {
  const { modelStatus, refresh } = useAppStatus()
  const [reloading, setReloading] = useState(false)
  const [reloadError, setReloadError] = useState<string | null>(null)
  const state = modelBadgeState(modelStatus)

  async function reload() {
    setReloading(true)
    setReloadError(null)
    try {
      await api.reloadModel()
      refresh()
    } catch (err) {
      setReloadError((err as Error).message)
    } finally {
      setReloading(false)
    }
  }

  if (!modelStatus) {
    return <p className="p-4 text-sm text-muted-foreground">Loading model status…</p>
  }
  const { model, metrics, batch } = modelStatus

  return (
    <div className="space-y-5 px-4 pb-6 text-sm">
      <div className="flex gap-3 rounded-xl border bg-muted/50 p-3">
        {state === 'error' ? (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        ) : state === 'none' ? (
          <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        ) : state === 'simulated' ? (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-teal-strong" />
        )}
        <p className="leading-relaxed">{modelStatus.message}</p>
      </div>

      {model && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <BrainCircuit className="size-4 text-brand-teal-strong" /> Real-time model
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-muted-foreground">
            <dt>Name</dt>
            <dd className="text-foreground">{model.name}</dd>
            <dt>Version</dt>
            <dd className="text-foreground">{model.version}</dd>
            <dt>Framework</dt>
            <dd className="text-foreground">{model.framework}</dd>
            {model.trained_at && (
              <>
                <dt>Trained</dt>
                <dd className="text-foreground">{model.trained_at}</dd>
              </>
            )}
            {model.training_data?.period && (
              <>
                <dt>Training data</dt>
                <dd className="text-foreground">
                  {model.training_data.period}
                  {model.training_data.rows ? ` · ${formatNumber(model.training_data.rows)} rows` : ''}
                </dd>
              </>
            )}
          </dl>
          <div className="flex flex-wrap gap-1 pt-1">
            {model.features.map((f) => (
              <Badge key={f} variant="secondary" className="font-mono text-[11px]">
                {f}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-semibold">Validation metrics</h3>
        {metrics && (metrics.mae ?? metrics.rmse ?? metrics.r2 ?? metrics.mape) != null ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {metrics.mae != null && <Metric label="MAE" value={formatCurrency(metrics.mae)} hint="Mean absolute error" />}
              {metrics.rmse != null && <Metric label="RMSE" value={formatCurrency(metrics.rmse)} hint="Root mean squared error" />}
              {metrics.r2 != null && <Metric label="R²" value={metrics.r2.toFixed(3)} hint="Coefficient of determination" />}
              {metrics.mape != null && <Metric label="MAPE" value={`${(metrics.mape * 100).toFixed(1)}%`} hint="Mean absolute percentage error" />}
            </div>
            <p className="text-xs text-muted-foreground">
              As reported by the training team in the model card
              {metrics.evaluation ? ` (${metrics.evaluation}` : ''}
              {metrics.n_validation ? `, n = ${formatNumber(metrics.n_validation)}` : ''}
              {metrics.evaluation ? ')' : ''}.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            No validated metrics have been supplied. Metrics appear here once a model card includes them.
          </p>
        )}
      </section>

      {batch && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <FileSpreadsheet className="size-4 text-brand-teal-strong" />
            {batch.kind === 'simulated' ? 'Simulated preview values' : 'Precomputed predictions'}
          </h3>
          {batch.kind === 'simulated' ? (
            <p className="rounded-lg bg-warning-soft p-3 text-warning-foreground">
              HOMESCOPE_SIMULATED_PREDICTIONS is on. Values are generated for UI testing and are not model output.
            </p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-muted-foreground">
              <dt>Coverage</dt>
              <dd className="text-foreground">
                {formatNumber(batch.matched)} properties ({(batch.coverage * 100).toFixed(1)}%)
              </dd>
              {batch.generated_at && (
                <>
                  <dt>Generated</dt>
                  <dd className="text-foreground">{batch.generated_at}</dd>
                </>
              )}
              <dt>File</dt>
              <dd className="truncate font-mono text-xs text-foreground" title={batch.source_file ?? ''}>
                {batch.source_file?.split('/').slice(-2).join('/')}
              </dd>
            </dl>
          )}
          {batch.warnings.map((w) => (
            <p key={w} className="text-xs text-warning-foreground">
              {w}
            </p>
          ))}
        </section>
      )}

      <Separator />

      <section className="space-y-2 text-muted-foreground">
        <h3 className="font-semibold text-foreground">Connecting a model</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Batch: save <code className="font-mono text-xs">models/predictions/predictions.csv</code> with{' '}
            <code className="font-mono text-xs">property_id, predicted_price</code>.
          </li>
          <li>
            Real-time: put a model bundle with <code className="font-mono text-xs">model_card.json</code> in{' '}
            <code className="font-mono text-xs">models/current/</code>.
          </li>
          <li>Reload below (no server restart needed). The README has the details.</li>
        </ol>
        <Button variant="outline" size="sm" onClick={reload} disabled={reloading} className="mt-1">
          <RefreshCw className={reloading ? 'animate-spin' : ''} />
          Reload model &amp; predictions
        </Button>
        {reloadError && <p className="text-xs text-destructive">{reloadError}</p>}
      </section>
    </div>
  )
}
