import { useRef } from 'react'

import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string | number | null> {
  value: T
  label: string
  disabled?: boolean
  title?: string
}

interface SegmentedProps<T extends string | number | null> {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
}

/** Single-choice segmented control with radio-group keyboard behaviour (arrow keys). */
export function Segmented<T extends string | number | null>({ label, value, options, onChange, className }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function move(from: number, step: number) {
    for (let i = 1; i <= options.length; i++) {
      const next = (from + step * i + options.length) % options.length
      if (!options[next].disabled) {
        onChange(options[next].value)
        refs.current[next]?.focus()
        return
      }
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-lg bg-muted p-0.5', className)}>
      {options.map((o, i) => {
        const checked = o.value === value
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={o.disabled}
            title={o.title}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(i, 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(i, -1)
              }
            }}
            className={cn(
              'h-7 flex-1 rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-45',
              checked && 'bg-card text-foreground shadow-sm',
              !checked && !o.disabled && 'hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
