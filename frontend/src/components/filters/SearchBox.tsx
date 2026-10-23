import { useId, useMemo, useRef, useState } from 'react'
import { Building2, Loader2, MapPin, Search, Sparkles, X } from 'lucide-react'

import { useApi } from '@/hooks/useApi'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatCompactCurrency, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import type { CityMatch, PropertyMarker, ZipMatch } from '@/types/api'

type Option =
  | { kind: 'ask'; key: string; item: string }
  | { kind: 'property'; key: string; item: PropertyMarker }
  | { kind: 'zip'; key: string; item: ZipMatch }
  | { kind: 'city'; key: string; item: CityMatch }

interface SearchBoxProps {
  onSelectProperty: (p: PropertyMarker) => void
  onSelectZip: (z: ZipMatch) => void
  onSelectCity: (c: CityMatch) => void
  /** Send free-text questions to the AI assistant. */
  onAsk?: (question: string) => void
  className?: string
}

const QUESTION_START = /^(what|where|which|who|why|how|show|find|list|is|are|can|should|if|compare|cheapest|average)\b/i

/** Heuristic: does this look like a natural-language question rather than an address or ZIP? */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim()
  if (/^\d+\s+\S+/.test(t) && !t.endsWith('?')) return false // "13234 Vallentine…" is an address
  return t.endsWith('?') || QUESTION_START.test(t) || t.split(/\s+/).length >= 4
}

export function SearchBox({ onSelectProperty, onSelectZip, onSelectCity, onAsk, className }: SearchBoxProps) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const query = useDebouncedValue(text.trim(), 180)
  const { data, loading, error } = useApi(query.length >= 1 ? `search:${query}` : null, (s) => api.search(query, s))

  const options = useMemo<Option[]>(() => {
    const ask: Option[] = onAsk && looksLikeQuestion(text) ? [{ kind: 'ask', key: 'ask', item: text.trim() }] : []
    if (!data || !query) return ask
    const matches: Option[] = [
      ...data.zipcodes.map((z) => ({ kind: 'zip' as const, key: `z${z.zipcode}`, item: z })),
      ...data.cities.map((c) => ({ kind: 'city' as const, key: `c${c.city}`, item: c })),
      ...data.properties.map((p) => ({ kind: 'property' as const, key: `p${p.id}`, item: p })),
    ]
    // Dataset matches win the Enter key; the AI option leads only when nothing matches.
    return matches.length ? [...matches, ...ask] : ask
  }, [data, query, text, onAsk])

  function choose(option: Option) {
    if (option.kind === 'ask') {
      onAsk?.(option.item)
      setText('')
    } else if (option.kind === 'property') {
      onSelectProperty(option.item)
      setText(option.item.street_address ?? '')
    } else if (option.kind === 'zip') {
      onSelectZip(option.item)
      setText(option.item.zipcode)
    } else {
      onSelectCity(option.item)
      setText(option.item.city)
    }
    setOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault()
      choose(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && text.trim().length >= 1 && (query.length >= 1 || options.length > 0)
  const activeOption = options[active]

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && activeOption ? `${listId}-${activeOption.key}` : undefined}
          aria-label="Search by street address, ZIP code, or city, or ask a question"
          placeholder={onAsk ? 'Address, ZIP, city — or ask a question' : 'Address, ZIP code, or city'}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-xl border bg-card pr-9 pl-9 text-sm shadow-xs outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
        />
        {loading ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          text && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText('')
                inputRef.current?.focus()
              }}
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          )
        )}
      </div>

      {showList && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-[1200] mt-1.5 max-h-80 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
        >
          {error && <p className="px-3 py-2 text-sm text-destructive">{error.message}</p>}
          {!error && !loading && options.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              No matching properties in the 2024 dataset. Search covers dataset addresses only.
            </p>
          )}
          {options.map((o, i) => (
            <div
              key={o.key}
              id={`${listId}-${o.key}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm',
                i === active && 'bg-muted',
              )}
            >
              {o.kind === 'ask' ? (
                <>
                  <Sparkles className="size-4 shrink-0 text-brand-teal-strong" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-brand-teal-strong">Ask HomeScope AI</div>
                    <div className="truncate text-xs text-muted-foreground">“{o.item}”</div>
                  </div>
                </>
              ) : o.kind === 'property' ? (
                <>
                  <MapPin className="size-4 shrink-0 text-brand-teal-strong" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{o.item.street_address ?? 'Address unavailable'}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[o.item.city, o.item.zipcode].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground tabular">
                    {formatCompactCurrency(o.item.list_price)}
                  </span>
                </>
              ) : (
                <>
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{o.kind === 'zip' ? `ZIP ${o.item.zipcode}` : o.item.city}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(o.item.count)} properties · filter &amp; zoom
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
