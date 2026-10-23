import { useEffect, useRef, useState } from 'react'

export interface ApiState<T> {
  data: T | null
  error: Error | null
  /** True while a request is in flight (previous data stays available to avoid flashing). */
  loading: boolean
}

/**
 * Run `fetcher` whenever `key` changes, aborting stale requests.
 * Pass key = null to skip fetching (and clear data).
 */
export function useApi<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: key !== null })
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    if (key === null) {
      setState({ data: null, error: null, loading: false })
      return
    }
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false })
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') setState((s) => ({ ...s, error, loading: false }))
      })
    return () => controller.abort()
  }, [key])

  return state
}
