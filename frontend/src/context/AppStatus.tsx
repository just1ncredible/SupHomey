import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { useApi } from '@/hooks/useApi'
import { api } from '@/services/api'
import type { Health, ModelStatus } from '@/types/api'

interface AppStatus {
  health: Health | null
  healthError: Error | null
  modelStatus: ModelStatus | null
  /** Increments after a model/data reload so pages can refetch. */
  dataVersion: number
  refresh: () => void
}

const AppStatusContext = createContext<AppStatus | null>(null)

export function AppStatusProvider({ children }: { children: ReactNode }) {
  const [nonce, setNonce] = useState(0)
  const health = useApi(`health:${nonce}`, (s) => api.health(s))
  const model = useApi(`model:${nonce}`, (s) => api.modelStatus(s))
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  // Backend still starting (or restarted)? Keep retrying; a successful retry bumps
  // dataVersion, so pages refetch without a manual reload.
  useEffect(() => {
    if (!health.error) return
    const id = window.setTimeout(refresh, 3000)
    return () => window.clearTimeout(id)
  }, [health.error, refresh])

  return (
    <AppStatusContext.Provider
      value={{ health: health.data, healthError: health.error, modelStatus: model.data, dataVersion: nonce, refresh }}
    >
      {children}
    </AppStatusContext.Provider>
  )
}

export function useAppStatus(): AppStatus {
  const ctx = useContext(AppStatusContext)
  if (!ctx) throw new Error('useAppStatus must be used inside AppStatusProvider')
  return ctx
}
