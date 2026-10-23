import { Fragment, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ArrowUp, Loader2, MapPinned, RotateCcw, Sparkles, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useApi } from '@/hooks/useApi'
import { formatCompactCurrency, formatCurrency, formatNumber, homeTypeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import type { PropertyMarker } from '@/types/api'
import type { ApiFilters, AreaRow, AssistantAction, AssistantCard, AssistantContext, ChatMessage } from '@/types/assistant'

const SUGGESTIONS = [
  'Show me three-bedroom homes under $300k',
  'What are the cheapest homes in 77008?',
  'Where are house prices generally lower?',
  'What is the average house price in Katy?',
  'Why is this home estimated at its value?',
]

export interface Turn extends ChatMessage {
  cards?: AssistantCard[]
  actions?: AssistantAction[]
  status?: 'ok' | 'not_configured' | 'error'
}

interface AssistantPanelProps {
  /** Conversation lives in the parent so it survives the panel closing. */
  turns: Turn[]
  setTurns: Dispatch<SetStateAction<Turn[]>>
  context: AssistantContext
  /** A question handed over from the main search box; `id` makes repeats distinct. */
  pendingQuestion: { id: number; text: string } | null
  onActions: (actions: AssistantAction[]) => void
  onSelectProperty: (p: PropertyMarker) => void
  onSelectArea: (row: AreaRow) => void
  onClose: () => void
  className?: string
}

/** Minimal formatting for replies: paragraphs, bullet/numbered lists, **bold**. Text stays escaped. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  )
}

function Reply({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={blocks.length} className={cn('space-y-0.5 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}>
        {list.items.map((item, i) => (
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </Tag>,
    )
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = line.match(/^[-*•]\s+(.*)/)
    const numbered = line.match(/^\d+[.)]\s+(.*)/)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else {
      flush()
      if (line) blocks.push(<p key={blocks.length}><Inline text={line.replace(/^#+\s*/, '')} /></p>)
    }
  }
  flush()
  return <div className="space-y-2">{blocks}</div>
}

function describeFilters(f: ApiFilters): string {
  const parts: string[] = []
  if (f.zipcode) parts.push(`ZIP ${f.zipcode}`)
  if (f.city) parts.push(f.city)
  if (f.min_beds) parts.push(`${f.min_beds}+ beds`)
  if (f.min_baths) parts.push(`${f.min_baths}+ baths`)
  if (f.min_price && f.max_price) parts.push(`${formatCompactCurrency(f.min_price)}–${formatCompactCurrency(f.max_price)}`)
  else if (f.max_price) parts.push(`≤ ${formatCompactCurrency(f.max_price)}`)
  else if (f.min_price) parts.push(`≥ ${formatCompactCurrency(f.min_price)}`)
  if (f.home_types.length) parts.push(f.home_types.map(homeTypeLabel).join(', '))
  if (f.min_sqft) parts.push(`≥ ${formatNumber(f.min_sqft)} sqft`)
  if (f.max_sqft) parts.push(`≤ ${formatNumber(f.max_sqft)} sqft`)
  return parts.join(' · ') || 'all listings'
}

const SORT_TEXT: Record<string, string> = {
  price_asc: 'lowest price first',
  price_desc: 'highest price first',
  sqft_desc: 'largest first',
  price_per_sqft_asc: 'lowest $/sqft first',
}

const METRIC_LABEL: Record<string, string> = {
  median_list_price: 'Median list',
  median_price_per_sqft: 'Median $/sqft',
  median_rent_zestimate: 'Median rent (Zillow est.)',
}

function CardView({
  card,
  onSelectProperty,
  onSelectArea,
}: {
  card: AssistantCard
  onSelectProperty: (p: PropertyMarker) => void
  onSelectArea: (row: AreaRow) => void
}) {
  if (card.type === 'properties') {
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-baseline justify-between border-b px-3 py-2 text-xs">
          <span className="font-semibold">{card.title}</span>
          <span className="text-muted-foreground tabular">{formatNumber(card.total)} match</span>
        </div>
        <ul className="divide-y">
          {card.items.slice(0, 6).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelectProperty(p)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.street_address ?? 'Address unavailable'}</span>
                  <span className="block truncate text-muted-foreground">
                    {[p.city, p.zipcode].filter(Boolean).join(' ')} · {p.bedrooms ?? '—'} bd · {p.living_area_sqft ? `${formatNumber(p.living_area_sqft)} sqft` : '— sqft'}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular">{formatCompactCurrency(p.list_price)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (card.type === 'area_table') {
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-3 py-2 text-xs font-semibold">{card.title}</div>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-1.5 font-medium">{card.rows[0]?.kind === 'city' ? 'City' : 'ZIP'}</th>
              <th className="px-3 py-1.5 text-right font-medium">Listings</th>
              <th className="px-3 py-1.5 text-right font-medium">{METRIC_LABEL[card.metric]}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {card.rows.map((r) => {
              const value = r[card.metric]
              return (
                <tr key={r.area} className="cursor-pointer transition-colors hover:bg-muted" onClick={() => onSelectArea(r)}>
                  <td className="px-3 py-1.5">
                    <button type="button" className="font-medium text-brand-teal-strong hover:underline focus-visible:underline focus-visible:outline-none" onClick={(e) => { e.stopPropagation(); onSelectArea(r) }}>
                      {r.area}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular text-muted-foreground">{formatNumber(r.listings)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular">
                    {value == null ? '—' : card.metric === 'median_price_per_sqft' ? `$${Math.round(value)}` : formatCurrency(value)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }
  const s = card.stats as Record<string, number | null>
  const cells: [string, string][] = [
    ['Listings', formatNumber(s.listings)],
    ['Median list price', formatCurrency(s.median_list_price)],
    ['Mean list price', formatCurrency(s.mean_list_price)],
    ['Middle 50%', s.p25_list_price != null ? `${formatCompactCurrency(s.p25_list_price)}–${formatCompactCurrency(s.p75_list_price)}` : '—'],
    ['Median $/sqft', s.median_price_per_sqft != null ? `$${Math.round(s.median_price_per_sqft)}` : '—'],
    ['Avg living area', s.avg_living_area_sqft != null ? `${formatNumber(s.avg_living_area_sqft)} sqft` : '—'],
  ]
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 text-xs font-semibold">{card.title} · 2024 listings</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {cells.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="text-sm font-semibold tabular">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function AssistantPanel({
  turns,
  setTurns,
  context,
  pendingQuestion,
  onActions,
  onSelectProperty,
  onSelectArea,
  onClose,
  className,
}: AssistantPanelProps) {
  const status = useApi('assistant-status', (s) => api.assistantStatus(s))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const contextRef = useRef(context)
  useEffect(() => {
    contextRef.current = context
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, busy])

  async function send(question: string) {
    const text = question.trim()
    if (!text || busy) return
    const history: Turn[] = [...turns, { role: 'user', content: text }]
    setTurns(history)
    setInput('')
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await api.assistantChat(
        history.map(({ role, content }) => ({ role, content })),
        contextRef.current,
        controller.signal,
      )
      setTurns((t) => [...t, { role: 'assistant', content: res.reply, cards: res.cards, actions: res.actions, status: res.status }])
      if (res.actions.length) onActions(res.actions)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setTurns((t) => [...t, { role: 'assistant', content: (err as Error).message, status: 'error' }])
    } finally {
      setBusy(false)
    }
  }

  // Questions typed into the main search box arrive here (guarded so StrictMode can't send twice).
  const handledRef = useRef<number | null>(null)
  useEffect(() => {
    if (pendingQuestion && handledRef.current !== pendingQuestion.id) {
      handledRef.current = pendingQuestion.id
      void send(pendingQuestion.text)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const notConfigured = status.data && !status.data.configured

  return (
    <section aria-label="Ask HomeScope" className={cn('flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl', className)}>
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-navy text-brand-teal">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h2 className="text-sm font-semibold">Ask HomeScope</h2>
          <p className="truncate text-[11px] text-muted-foreground">Answers from the 2024 Houston listings data</p>
        </div>
        {turns.length > 0 && (
          <Button variant="ghost" size="icon-sm" onClick={() => { abortRef.current?.abort(); setTurns([]); setBusy(false) }} aria-label="Start a new conversation">
            <RotateCcw />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close Ask HomeScope">
          <X />
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
        {notConfigured && (
          <div className="rounded-xl bg-warning-soft p-3 text-xs leading-relaxed text-warning-foreground">
            AI search isn't configured. Add <code className="font-mono">OPENAI_API_KEY=…</code> to{' '}
            <code className="font-mono">backend/.env</code> and restart the API.
          </div>
        )}

        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try asking:</p>
            <div className="flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={busy || Boolean(notConfigured)}
                  onClick={() => void send(q)}
                  className="rounded-full border bg-card px-3 py-1.5 text-left text-xs text-foreground/80 transition-colors hover:border-brand-teal hover:bg-brand-teal-soft hover:text-brand-teal-strong focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-brand-navy px-3 py-2 text-primary-foreground">
              {t.content}
            </div>
          ) : (
            <div key={i} className="space-y-2">
              <div className={cn('leading-relaxed', t.status === 'error' && 'text-destructive', t.status === 'not_configured' && 'text-warning-foreground')}>
                <Reply text={t.content} />
              </div>
              {t.actions
                ?.filter((a) => a.type === 'set_filters')
                .map((a, j) =>
                  a.type === 'set_filters' ? (
                    <div key={j} className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal-soft px-2.5 py-1 text-[11px] font-medium text-brand-teal-strong">
                      <MapPinned className="size-3" />
                      Map updated: {describeFilters(a.filters)}
                      {a.sort ? ` · ${SORT_TEXT[a.sort]}` : ''}
                    </div>
                  ) : null,
                )}
              {t.cards?.map((card, j) => (
                <CardView key={j} card={card} onSelectProperty={onSelectProperty} onSelectArea={onSelectArea} />
              ))}
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-brand-teal-strong" /> Looking through the data…
          </div>
        )}
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border bg-background px-3 py-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={1000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            placeholder="Ask about prices, areas or a home…"
            aria-label="Ask a question about Houston homes"
            className="max-h-28 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon-sm" disabled={busy || !input.trim()} aria-label="Send question" className="shrink-0">
            <ArrowUp />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Questions are processed by OpenAI. Figures come from HomeScope's dataset; not financial advice.
        </p>
      </form>
    </section>
  )
}
