import type L from 'leaflet'
import { LocateFixed, Minus, Plus } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        onClick={onClick}
        aria-label={label}
        className="grid size-9 place-items-center text-foreground/80 transition-colors outline-none first:rounded-t-xl last:rounded-b-xl hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

export function MapControls({ map, onReset, className }: { map: L.Map | null; onReset: () => void; className?: string }) {
  return (
    <div className={cn('pointer-events-auto flex flex-col gap-2', className)}>
      <div className="flex flex-col divide-y rounded-xl border bg-card shadow-md">
        <ControlButton label="Zoom in" onClick={() => map?.zoomIn()}>
          <Plus className="size-4" />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={() => map?.zoomOut()}>
          <Minus className="size-4" />
        </ControlButton>
      </div>
      <div className="rounded-xl border bg-card shadow-md">
        <ControlButton label="Reset to Houston" onClick={onReset}>
          <LocateFixed className="size-4" />
        </ControlButton>
      </div>
    </div>
  )
}
