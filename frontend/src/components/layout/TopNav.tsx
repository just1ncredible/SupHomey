import { useRef } from 'react'
import { Database, FlaskConical } from 'lucide-react'
import { NavLink } from 'react-router'

import { ModelStatusPanel, modelBadgeState, type ModelBadgeState } from '@/components/model/ModelStatusPanel'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStatus } from '@/context/AppStatus'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MODULES } from '@/modules/registry'

import { Logo } from './Logo'
import { SettingsMenu } from './SettingsMenu'

const MODEL_BADGE: Record<ModelBadgeState, { label: string; dot: string }> = {
  none: { label: 'Model not connected', dot: 'bg-muted-foreground/50' },
  batch: { label: 'AI predictions loaded', dot: 'bg-brand-teal' },
  realtime: { label: 'AI model live', dot: 'bg-brand-teal' },
  simulated: { label: 'Simulated preview', dot: 'bg-warning' },
  error: { label: 'Model error', dot: 'bg-destructive' },
}

function DatasetChip() {
  const { health, healthError } = useAppStatus()
  if (healthError) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
        API offline
      </span>
    )
  }
  if (!health) return <span className="h-6 w-36 animate-pulse rounded-full bg-muted" />
  const synthetic = health.dataset.is_synthetic
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'inline-flex cursor-default items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              synthetic ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground',
            )}
          />
        }
      >
        {synthetic ? <FlaskConical className="size-3.5" /> : <Database className="size-3.5" />}
        {synthetic ? 'Synthetic data' : `2024 listings · ${formatNumber(health.dataset.records)}`}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72">
        {synthetic
          ? 'Development fixture with fabricated properties. Run scripts/fetch_dataset.py to load the real dataset.'
          : 'Houston Housing Market 2024 (Kaggle). Zillow listing snapshot: prices are 2024 asking prices, not current listings or sales.'}
      </TooltipContent>
    </Tooltip>
  )
}

function ModelChip() {
  const { modelStatus } = useAppStatus()
  const badge = MODEL_BADGE[modelBadgeState(modelStatus)]
  // Focus the heading on open so the panel starts at the top, not at its last button.
  const headerRef = useRef<HTMLDivElement>(null)
  return (
    <Sheet>
      <SheetTrigger
        className="inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs font-medium whitespace-nowrap shadow-xs transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`Model status: ${badge.label}. Open details`}
      >
        <span className={cn('size-2 rounded-full', badge.dot)} />
        <span className="hidden sm:inline">{badge.label}</span>
        <span className="sm:hidden">{badge.label.split(' ').slice(0, 2).join(' ')}</span>
      </SheetTrigger>
      <SheetContent side="right" initialFocus={headerRef} className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader ref={headerRef} tabIndex={-1} className="outline-none">
          <SheetTitle>AI valuation model</SheetTitle>
          <SheetDescription>Status of the team's price-prediction model and its validation results.</SheetDescription>
        </SheetHeader>
        <ModelStatusPanel />
      </SheetContent>
    </Sheet>
  )
}

export function TopNav() {
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b bg-card/95 px-3 backdrop-blur sm:px-4">
      <NavLink to="/" className="rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <Logo showTagline />
      </NavLink>

      <nav aria-label="Modules" className="ml-4 hidden items-center gap-1 lg:flex">
        {MODULES.map((m) =>
          m.status === 'active' ? (
            <NavLink
              key={m.id}
              to={m.path}
              end
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-teal-soft text-brand-teal-strong' : 'text-muted-foreground hover:bg-muted',
                )
              }
            >
              <m.icon className="size-4" />
              {m.name}
            </NavLink>
          ) : (
            <Tooltip key={m.id}>
              <TooltipTrigger
                render={<span tabIndex={0} aria-disabled="true" />}
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground/70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <m.icon className="size-4" />
                {m.name}
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-medium">
                  Soon
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom">{m.description}</TooltipContent>
            </Tooltip>
          ),
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden sm:block">
          <DatasetChip />
        </div>
        <ModelChip />
        <SettingsMenu />
      </div>
    </header>
  )
}
