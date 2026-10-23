import { useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Check, Link2, Monitor, Moon, RotateCcw, Settings, Sun } from 'lucide-react'

import { useTheme } from '@/context/Theme'
import { clearPrefs, THEME_CHOICES, type ThemeChoice } from '@/lib/preferences'
import { cn } from '@/lib/utils'

const THEME_OPTIONS: Record<ThemeChoice, { label: string; icon: typeof Sun }> = {
  light: { label: 'Light', icon: Sun },
  dark: { label: 'Dark', icon: Moon },
  system: { label: 'Match device', icon: Monitor },
}

const itemClass =
  'flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:shrink-0'

export function SettingsMenu() {
  const { choice, setChoice } = useTheme()
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this link:', window.location.href)
    }
  }

  function resetDefaults() {
    clearPrefs()
    // Reload without view state so every setting starts fresh.
    window.location.assign(window.location.pathname)
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Settings"
        className="grid size-8 place-items-center rounded-full border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted data-popup-open:text-foreground"
      >
        <Settings className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
          <Menu.Popup className="w-56 origin-(--transform-origin) rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 transition-[transform,opacity] duration-150">
            <Menu.Group>
              <Menu.GroupLabel className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Appearance</Menu.GroupLabel>
              <Menu.RadioGroup value={choice} onValueChange={(v: ThemeChoice) => setChoice(v)}>
                {THEME_CHOICES.map((value) => {
                  const { label, icon: Icon } = THEME_OPTIONS[value]
                  return (
                    <Menu.RadioItem key={value} value={value} closeOnClick={false} className={itemClass}>
                      <Icon className="text-muted-foreground" />
                      <span className="flex-1">{label}</span>
                      <Menu.RadioItemIndicator keepMounted className="text-brand-teal-strong data-unchecked:invisible">
                        <Check />
                      </Menu.RadioItemIndicator>
                    </Menu.RadioItem>
                  )
                })}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item closeOnClick={false} onClick={copyLink} className={itemClass}>
              {copied ? <Check className="text-brand-teal-strong" /> : <Link2 className="text-muted-foreground" />}
              <span className={cn(copied && 'text-brand-teal-strong')}>{copied ? 'Link copied' : 'Copy link to this view'}</span>
            </Menu.Item>
            <Menu.Item onClick={resetDefaults} className={itemClass}>
              <RotateCcw className="text-muted-foreground" />
              Reset to defaults
            </Menu.Item>
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] leading-snug text-muted-foreground">
              Theme, sort order and panel layout are remembered on this device.
            </p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
