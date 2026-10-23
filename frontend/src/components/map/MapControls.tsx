import type L from 'leaflet'
import { Eye, EyeOff, LocateFixed, Minus, Plus } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function ControlButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        className="grid size-9 place-items-center text-foreground/80 transition-colors outline-none first:rounded-t-xl last:rounded-b-xl hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset aria-pressed:bg-brand-teal-soft aria-pressed:text-brand-teal-strong"
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

interface MapControlsProps {
  map: L.Map | null
  onReset: () => void
  homesHidden: boolean
  onToggleHomes: () => void
  className?: string
}

export function MapControls({ map, onReset, homesHidden, onToggleHomes, className }: MapControlsProps) {
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
      <div className="rounded-xl border bg-card shadow-md">
        <ControlButton label={homesHidden ? 'Show homes on map' : 'Hide homes (map only)'} onClick={onToggleHomes} pressed={homesHidden}>
          {homesHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </ControlButton>
      </div>
    </div>
  )
}
