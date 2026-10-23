const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const NA = '—'

export function formatCurrency(value: number | null | undefined): string {
  return value == null ? NA : usd.format(value)
}

/** $450K, $1.25M — for map pills and compact stats. */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null) return NA
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, '')}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

export function formatNumber(value: number | null | undefined, suffix = ''): string {
  return value == null ? NA : `${num.format(value)}${suffix}`
}

export function formatCount(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`
  if (value >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

export function formatPerSqft(value: number | null | undefined): string {
  return value == null ? NA : `${usd.format(value)}/sqft`
}

export function formatLot(sqft: number | null | undefined): string {
  if (sqft == null) return NA
  if (sqft >= 21_780) return `${(sqft / 43_560).toFixed(2).replace(/\.?0+$/, '')} acres`
  return `${num.format(sqft)} sqft`
}

export function formatBaths(value: number | null | undefined): string {
  return value == null ? NA : String(Number.isInteger(value) ? value : value.toFixed(1))
}

const HOME_TYPE_LABELS: Record<string, string> = {
  SINGLE_FAMILY: 'Single family',
  TOWNHOUSE: 'Townhouse',
  CONDO: 'Condo',
  MULTI_FAMILY: 'Multi-family',
  MANUFACTURED: 'Manufactured',
  LOT: 'Lot / land',
  APARTMENT: 'Apartment',
}

export function homeTypeLabel(value: string | null | undefined): string {
  if (!value) return 'Unknown type'
  return HOME_TYPE_LABELS[value] ?? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function percentDiff(a: number, b: number): number {
  return ((a - b) / b) * 100
}
