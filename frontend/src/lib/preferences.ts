/**
 * Per-browser preferences (theme, sidebar, sort, price basis).
 * Storage can be unavailable (private mode, blocked site data), so every access is guarded
 * and the app falls back to defaults.
 */

const PREFIX = 'homescope:'

export const PREF_KEYS = {
  theme: 'theme',
  sidebarOpen: 'sidebarOpen',
  sort: 'sort',
  priceBasis: 'priceBasis',
} as const

export const THEME_CHOICES = ['light', 'dark', 'system'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]

export function readPref<T>(key: string, isValid: (v: unknown) => v is T): T | undefined {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    return isValid(value) ? value : undefined
  } catch {
    return undefined
  }
}

export function writePref(key: string, value: unknown) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Not persisted; the in-memory value still applies for this visit.
  }
}

export function clearPrefs() {
  try {
    for (const key of Object.values(PREF_KEYS)) window.localStorage.removeItem(PREFIX + key)
  } catch {
    // Nothing stored or storage blocked.
  }
}

export const isOneOf =
  <T extends string>(...options: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (options as readonly string[]).includes(v)

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'
