import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAdminContacts,
  getDistrictContacts,
  getLoggedInUserDistricts,
} from './contactService'
import type { DistrictContact } from './contactTypes'
const EMPTY_DISTRICTS: readonly string[] = []

export type DistrictContactsStatus =
  | 'loading-district'
  | 'loading-contacts'
  | 'ready'
  | 'missing-session'
  | 'missing-district'
  | 'error'

export type DistrictContactsState = {
  readonly contacts: readonly DistrictContact[]
  readonly search: string
  readonly setSearch: (value: string) => void
  readonly page: number
  readonly hasNext: boolean
  readonly isLoading: boolean
  readonly status: DistrictContactsStatus
  readonly errorMessage: string | null
  readonly nextPage: () => void
  readonly previousPage: () => void
  readonly retry: () => void
  readonly reload: () => void
}

export type ContactDirectoryOptions = {
  readonly isAdmin?: boolean
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

export function useDistrictContacts(
  contactId?: string,
  options?: ContactDirectoryOptions,
): DistrictContactsState {
  const isAdmin = options?.isAdmin === true
  const [districtIds, setDistrictIds] = useState<readonly string[]>(EMPTY_DISTRICTS)
  const [contacts, setContacts] = useState<readonly DistrictContact[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [status, setStatus] = useState<DistrictContactsStatus>(
    isAdmin ? 'loading-contacts' : contactId ? 'loading-district' : 'missing-session',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [districtRetry, setDistrictRetry] = useState(0)
  const [contactsRetry, setContactsRetry] = useState(0)
  const districtRequestId = useRef(0)
  const contactsRequestId = useRef(0)
  const pageLinks = useRef<(string | null)[]>([null])
  const [nextLink, setNextLink] = useState<string | null>(null)

  useEffect(() => {
    if (search.trim() === debouncedSearch) return
    const timeout = window.setTimeout(() => {
      pageLinks.current = [null]
      setNextLink(null)
      setPage(1)
      setDebouncedSearch(search.trim())
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    const requestId = ++districtRequestId.current
    const controller = new AbortController()

    setDistrictIds(EMPTY_DISTRICTS)
    setContacts([])
    setHasNext(false)
    setNextLink(null)
    pageLinks.current = [null]
    setPage(1)
    setErrorMessage(null)

    if (isAdmin) {
      setStatus('loading-contacts')
      return () => controller.abort()
    }

    if (!contactId) {
      setStatus('missing-session')
      return () => controller.abort()
    }

    setStatus('loading-district')
    getLoggedInUserDistricts(contactId, controller.signal)
      .then((resolvedDistrictIds) => {
        if (controller.signal.aborted || requestId !== districtRequestId.current) return
        if (!resolvedDistrictIds.length) {
          setStatus('missing-district')
          return
        }
        setDistrictIds(resolvedDistrictIds)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== districtRequestId.current || isAbortError(error)) return
        console.error('[DistrictContacts] district request failed', {
          error,
          contactId,
          requestId,
          signalAborted: controller.signal.aborted,
        })
        setStatus('error')
        setErrorMessage('Your district could not be loaded. Try again.')
      })

    return () => controller.abort()
  }, [contactId, districtRetry, isAdmin])

  useEffect(() => {
    if (!isAdmin && (!contactId || !districtIds.length)) return undefined

    const requestId = ++contactsRequestId.current
    const controller = new AbortController()
    const currentNextLink = pageLinks.current[page - 1] ?? null
    setStatus('loading-contacts')
    setErrorMessage(null)

    const request = isAdmin
      ? getAdminContacts(
        { search: debouncedSearch, nextLink: currentNextLink },
        controller.signal,
      )
      : getDistrictContacts(
        { search: debouncedSearch, nextLink: currentNextLink },
        controller.signal,
      )

    request
      .then((result) => {
        if (controller.signal.aborted || requestId !== contactsRequestId.current) return
        setContacts(result.contacts)
        setHasNext(result.hasNext)
        setNextLink(result.nextLink)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== contactsRequestId.current || isAbortError(error)) return
        console.error('[DistrictContacts] Contacts request failed', {
          error,
          districtIds,
          isAdmin,
          page,
          hasContinuation: Boolean(currentNextLink),
          searchLength: debouncedSearch.length,
          requestId,
          signalAborted: controller.signal.aborted,
        })
        setStatus('error')
        setErrorMessage('Contacts could not be loaded. Try again.')
      })

    return () => controller.abort()
  }, [contactsRetry, debouncedSearch, districtIds, contactId, isAdmin, page])

  const nextPage = useCallback(() => {
    if (!nextLink) return
    pageLinks.current[page] = nextLink
    setPage((currentPage) => currentPage + 1)
  }, [nextLink, page])
  const previousPage = useCallback(() => setPage((currentPage) => Math.max(1, currentPage - 1)), [])
  const retry = useCallback(() => {
    if (isAdmin || districtIds.length) {
      setContactsRetry((value) => value + 1)
      return
    }
    setDistrictRetry((value) => value + 1)
  }, [districtIds, isAdmin])
  const reload = useCallback(() => {
    setContactsRetry((value) => value + 1)
  }, [])

  return {
    contacts,
    search,
    setSearch,
    page,
    hasNext,
    isLoading: status === 'loading-district' || status === 'loading-contacts',
    status,
    errorMessage,
    nextPage,
    previousPage,
    retry,
    reload,
  }
}
