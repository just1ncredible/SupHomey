import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import { formatCompactCurrency, percentDiff } from '@/lib/format'

interface PriceComparisonProps {
  listPrice: number
  predicted: number
}

/** Listing price vs. AI estimate. Only rendered when both are authentic (never for simulated values). */
export function PriceComparison({ listPrice, predicted }: PriceComparisonProps) {
  const diff = percentDiff(predicted, listPrice)
  const data = [
    { name: '2024 listing', value: listPrice, fill: 'var(--chart-3)' },
    { name: 'AI estimate', value: predicted, fill: 'var(--brand-teal)' },
  ]
  return (
    <figure className="rounded-2xl border bg-card p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">Listing vs. AI estimate</span>
        <span className="text-xs text-muted-foreground tabular">
          Estimate is{' '}
          <span className="font-semibold text-foreground">
            {Math.abs(diff) < 0.5 ? 'within 0.5%' : `${Math.abs(diff).toFixed(1)}% ${diff > 0 ? 'above' : 'below'}`}
          </span>{' '}
          the listing
        </span>
      </figcaption>
      <div className="mt-2 h-[92px]" role="img" aria-label={`2024 listing ${formatCompactCurrency(listPrice)}, AI estimate ${formatCompactCurrency(predicted)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={10}>
            <XAxis type="number" hide domain={[0, Math.max(listPrice, predicted) * 1.02]} />
            <YAxis type="category" dataKey="name" width={84} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
            <Bar dataKey="value" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
              <LabelList dataKey="value" position="right" formatter={(v) => formatCompactCurrency(Number(v))} style={{ fontSize: 12, fontWeight: 600, fill: 'var(--foreground)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
