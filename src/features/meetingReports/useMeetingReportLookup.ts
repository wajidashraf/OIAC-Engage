import { useCallback, useEffect, useRef, useState } from 'react'

type LookupStatus = 'idle' | 'loading' | 'ready' | 'error'

export type LookupPage<T> = { readonly options: readonly T[]; readonly nextLink: string | null }
export type LookupLoader<T> = (search: string, signal?: AbortSignal, nextLink?: string | null) => Promise<readonly T[] | LookupPage<T>>
function lookupPage<T>(result: readonly T[] | LookupPage<T>): LookupPage<T> {
  return Array.isArray(result) ? { options: result as readonly T[], nextLink: null } : result as LookupPage<T>
}

export type MeetingReportLookupState<T> = {
  readonly search: string
  readonly setSearch: (value: string) => void
  readonly options: readonly T[]
  readonly status: LookupStatus
  readonly retry: () => void
  readonly hasMore: boolean
  readonly loadingMore: boolean
  readonly moreError: boolean
  readonly loadMore: () => Promise<void>
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

export function useMeetingReportLookup<T>(
  loader: LookupLoader<T>,
  debounceMs = 350,
  normalizeSearch?: (search: string) => string,
): MeetingReportLookupState<T> {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [options, setOptions] = useState<readonly T[]>([])
  const [status, setStatus] = useState<LookupStatus>('idle')
  const [retryCount, setRetryCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | null>(null)
  const nextLinkRef = useRef<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingMoreRef = useRef(false)
  const [moreError, setMoreError] = useState(false)
  const requestId = useRef(0)
  const activeController = useRef<AbortController | null>(null)
  const normalizerRef = useRef(normalizeSearch)
  normalizerRef.current = normalizeSearch
  const rawSearchRef = useRef('')
  const forceNormalizedRequest = useRef(false)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const next = normalizerRef.current ? normalizerRef.current(search) : search.trim()
      // Returning to the previously debounced term still needs a fresh request
      // when an intervening edit aborted it. Opt-in keeps other lookup behavior.
      if (normalizerRef.current && next === debouncedSearch && forceNormalizedRequest.current) setRetryCount(value => value + 1)
      setDebouncedSearch(next)
    }, debounceMs)
    return () => window.clearTimeout(timeout)
  }, [debounceMs, search])

  useEffect(() => {
    forceNormalizedRequest.current = false
    const currentRequest = ++requestId.current
    const controller = new AbortController()
    activeController.current = controller
    setStatus('loading')
    nextLinkRef.current = null
    setNextLink(null)
    loadingMoreRef.current = false
    setLoadingMore(false)
    setMoreError(false)

    loaderRef.current(debouncedSearch, controller.signal)
      .then((results) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return
        const page = lookupPage(results)
        setOptions(page.options)
        nextLinkRef.current = page.nextLink
        setNextLink(page.nextLink)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || currentRequest !== requestId.current || isAbortError(error)) return
        setStatus('error')
      })

    return () => {
      controller.abort()
      activeController.current?.abort()
      activeController.current = null
    }
  }, [debouncedSearch, retryCount])

  const retry = useCallback(() => setRetryCount((value) => value + 1), [])

  const loadMore = useCallback(async () => {
    const link = nextLinkRef.current
    if (!link || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setMoreError(false)
    const currentRequest = requestId.current
    const controller = new AbortController()
    activeController.current = controller
    try {
      const result = lookupPage(await loaderRef.current(debouncedSearch, controller.signal, link))
      if (controller.signal.aborted || currentRequest !== requestId.current) return
      setOptions(previous => [...previous, ...result.options])
      nextLinkRef.current = result.nextLink
      setNextLink(result.nextLink)
    } catch (error) {
      if (!controller.signal.aborted && currentRequest === requestId.current && !isAbortError(error)) setMoreError(true)
    } finally {
      if (currentRequest === requestId.current && !controller.signal.aborted) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [debouncedSearch])

  const updateSearch = useCallback((value: string) => {
    const normalize = normalizerRef.current
    if (normalize && normalize(value) === normalize(rawSearchRef.current)) {
      rawSearchRef.current = value
      setSearch(value)
      return
    }
    rawSearchRef.current = value
    forceNormalizedRequest.current = Boolean(normalize)
    activeController.current?.abort()
    activeController.current = null
    requestId.current += 1
    nextLinkRef.current = null
    setNextLink(null)
    loadingMoreRef.current = false
    setLoadingMore(false)
    setMoreError(false)
    setStatus('loading')
    setOptions([])
    setSearch(value)
  }, [])

  return { search, setSearch: updateSearch, options, status, retry, hasMore: nextLink !== null, loadingMore, moreError, loadMore }
}
