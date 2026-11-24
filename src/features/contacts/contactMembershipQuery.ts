import type { ContactQuery } from './contactTypes'

export const CONTACT_PAGE_SIZE = 15
const endpoint = '/_api/serverlogics/contact-directory'
const continuationError = () => new Error('Dataverse returned an invalid Contacts continuation link.')
const origin = () => typeof window === 'undefined' ? 'https://powerpages.local' : window.location.origin

export function buildContactsQuery({ search }: Pick<ContactQuery, 'search'>): string {
  const encoded = encodeURIComponent(search.trim()).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase())
  return '?q=' + encoded
}

function continuation(link: string, search: string, currentPage: number): string {
  let url: URL
  try { url = new URL(link, origin()) } catch { throw continuationError() }
  const page = url.searchParams.get('page') ?? ''
  const cookie = url.searchParams.get('cookie') ?? ''
  if (url.origin !== origin() || url.pathname !== endpoint || url.hash || url.username || url.password
    || url.searchParams.size !== 3 || ['q', 'page', 'cookie'].some(key => url.searchParams.getAll(key).length !== 1)
    || url.searchParams.get('q') !== search || !/^[1-9]\d*$/.test(page)
    || Number(page) < 2 || Number(page) > 100000 || Number(page) <= currentPage
    || !/^[A-Za-z0-9_-]+$/.test(cookie) || cookie.length > 16384) throw continuationError()
  return url.pathname + url.search
}

export function contactsRequest(query: ContactQuery): string {
  return query.nextLink ? continuation(query.nextLink, query.search.trim(), 1) : endpoint + buildContactsQuery(query)
}

export function nextContactsPage(nextLink: string | null, requestPath: string): string | null {
  if (nextLink === null) return null
  const current = new URL(requestPath, origin())
  return continuation(nextLink, current.searchParams.get('q') ?? '', Number(current.searchParams.get('page') ?? 1))
}
