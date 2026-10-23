import { useRef, useState } from 'react'
import { NavLink } from 'react-router'

import { ModelStatusPanel } from '@/components/model/ModelStatusPanel'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { MODULES } from '@/modules/registry'

import { Logo } from './Logo'
import { SettingsMenu } from './SettingsMenu'

/** Model status lives behind Settings → Model status rather than a header chip. */
function ModelStatusSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Focus the heading on open so the panel starts at the top, not at its last button.
  const headerRef = useRef<HTMLDivElement>(null)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
  const [modelOpen, setModelOpen] = useState(false)
  // Only modules that are live get a nav link; planned ones stay out of the header.
  const activeModules = MODULES.filter((m) => m.status === 'active')

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b bg-card/95 px-3 backdrop-blur sm:px-4">
      <NavLink to="/" className="rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <Logo showTagline />
      </NavLink>

      {activeModules.length > 0 && (
        <nav aria-label="Modules" className="ml-4 hidden items-center gap-1 lg:flex">
          {activeModules.map((m) => (
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
          ))}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2">
        <SettingsMenu onOpenModelStatus={() => setModelOpen(true)} />
      </div>
      <ModelStatusSheet open={modelOpen} onOpenChange={setModelOpen} />
    </header>
  )
}
