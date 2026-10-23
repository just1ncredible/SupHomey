import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useMediaQuery } from '@/hooks/useMediaQuery'
import { isOneOf, PREF_KEYS, readPref, THEME_CHOICES, writePref, type ThemeChoice } from '@/lib/preferences'

export type { ThemeChoice }

/** Browser chrome colour per resolved theme (matches --brand-navy / dark --background). */
const THEME_COLOR = { light: '#0f2742', dark: '#141a24' }

interface ThemeValue {
  choice: ThemeChoice
  resolved: 'light' | 'dark'
  setChoice: (c: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(
    () => readPref(PREF_KEYS.theme, isOneOf(...THEME_CHOICES)) ?? 'light',
  )
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolved = choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.style.colorScheme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
  }, [resolved])

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c)
    writePref(PREF_KEYS.theme, c)
  }, [])

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
