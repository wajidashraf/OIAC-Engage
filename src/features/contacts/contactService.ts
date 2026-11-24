import { powerPagesFetch } from '../../shared/powerPagesApi'
import { CONTACT_PAGE_SIZE, buildContactsQuery, contactsRequest, nextContactsPage } from './contactMembershipQuery'
import type {
  AdminContactQuery,
  AdminContactUpdate,
  ContactPage,
  ContactQuery,
  ContactRecord,
  DistrictContact,
} from './contactTypes'

export { CONTACT_PAGE_SIZE, buildContactsQuery }
const MEMBERSHIP_ENDPOINT = '/_api/mss_contactdistrictmemberships'

const ADMIN_CONTACT_SELECT = [
  'contactid',
  'address1_city',
  'address1_stateorprovince',
  'address1_postalcode',
  '_mss_district_value',
  'emailaddress1',
  'firstname',
  'jobtitle',
  'lastname',
  'mobilephone',
] as const

const ADMIN_SEARCH_FIELDS = [
  'firstname',
  'lastname',
  'emailaddress1',
  'mobilephone',
  'jobtitle',
  'address1_city',
  'address1_stateorprovince',
  'address1_postalcode',
] as const

const CONTACT_PREFER = `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${CONTACT_PAGE_SIZE}`

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeGuid(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^\{(.+)\}$/, '$1').toLowerCase() ?? ''
  return GUID_PATTERN.test(normalized) ? normalized : null
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''")
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function mapContact(
  record: ContactRecord,
  districtId: string | null,
  deriveFullName = false,
): DistrictContact {
  const contactId = normalizeGuid(record.contactid)
  if (!contactId) throw new Error('Dataverse returned a Contact without a valid identifier.')

  const firstName = textOrNull(record.firstname)
  const lastName = textOrNull(record.lastname)
  const derivedFullName = [firstName, lastName].filter(Boolean).join(' ') || null

  return {
    id: contactId,
    fullName: deriveFullName ? derivedFullName : textOrNull(record.fullname),
    firstName,
    lastName,
    email: textOrNull(record.emailaddress1),
    jobTitle: textOrNull(record.jobtitle),
    mobilePhone: textOrNull(record.mobilephone),
    city: textOrNull(record.address1_city),
    stateOrProvince: textOrNull(record.address1_stateorprovince),
    postalCode: textOrNull(record.address1_postalcode),
    districtName: textOrNull(
      record['_mss_district_value@OData.Community.Display.V1.FormattedValue'],
    ),
    districtId: normalizeGuid(record._mss_district_value) ?? districtId,
  }
}

export function buildAdminContactsQuery({ search }: AdminContactQuery): string {
  const activeFilter = 'statecode eq 0'
  const normalizedSearch = search.trim()
  const filter = normalizedSearch
    ? `${activeFilter} and (${ADMIN_SEARCH_FIELDS
      .map((field) => `contains(${field},'${escapeODataString(normalizedSearch)}')`)
      .join(' or ')})`
    : activeFilter

  const params = new URLSearchParams()
  params.set('$select', ADMIN_CONTACT_SELECT.join(','))
  params.set('$filter', filter)
  params.set('$orderby', 'lastname asc,firstname asc,contactid asc')
  return `?${params.toString()}`
}

function normalizeContactsNextLink(nextLink: string): string {
  const baseOrigin = typeof window === 'undefined' ? 'https://powerpages.local' : window.location.origin
  const parsed = new URL(nextLink, baseOrigin)
  if (parsed.origin !== baseOrigin || parsed.pathname.toLowerCase() !== '/_api/contacts') {
    throw new Error('Dataverse returned an invalid Contacts continuation link.')
  }
  return `${parsed.pathname}${parsed.search}`
}

function membershipContinuation(link: string): string {
  const origin = typeof window === 'undefined' ? 'https://powerpages.local' : window.location.origin
  const url = new URL(link, origin)
  if (url.origin !== origin || url.pathname !== MEMBERSHIP_ENDPOINT || url.hash || url.username || url.password) {
    throw new Error('Dataverse returned an invalid membership continuation link.')
  }
  return `${url.pathname}${url.search}`
}

export async function getLoggedInUserDistricts(
  contactId: string,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const normalizedContactId = normalizeGuid(contactId)
  if (!normalizedContactId) {
    throw new Error('The Power Pages session did not provide a valid Contact identifier.')
  }

  const params = new URLSearchParams({
    $select: '_mss_district_value,statecode',
    $filter: `_mss_contact_value eq ${normalizedContactId} and statecode eq 0`,
    $orderby: 'mss_contactdistrictmembershipid asc',
  })
  let path: string | null = `${MEMBERSHIP_ENDPOINT}?${params}`
  const seen = new Set<string>(), districts = new Set<string>()
  while (path) {
    signal?.throwIfAborted()
    if (seen.has(path)) throw new Error('Dataverse returned a repeated membership continuation link.')
    seen.add(path)
    const response: { value: { _mss_district_value?: string | null; statecode: number }[]; '@odata.nextLink'?: string } = await powerPagesFetch(path, {
      signal, headers: { Prefer: 'odata.maxpagesize=500' },
    })
    if (!Array.isArray(response.value)) throw new Error('Dataverse returned an invalid membership response.')
    for (const row of response.value) {
      if (row.statecode !== 0 || !row._mss_district_value) continue
      const id = normalizeGuid(row._mss_district_value)
      if (!id) throw new Error('Dataverse returned an invalid district identifier.')
      districts.add(id)
    }
    path = response['@odata.nextLink'] ? membershipContinuation(response['@odata.nextLink']) : null
  }
  return [...districts]
}

function directoryObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dataverse returned an invalid Contacts response.')
  return value as Record<string, unknown>
}

function directoryJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) as unknown } catch { throw new Error('Dataverse returned an invalid Contacts response.') }
}

function directoryEnvelope(value: unknown): Record<string, unknown> {
  let body = directoryObject(directoryJson(value))
  if ('success' in body) {
    if (body.success !== true) throw new Error('Dataverse returned an invalid Contacts response.')
    body = directoryObject(directoryJson(body.data))
  }
  if (body.ok === false) throw new Error('Contacts could not be loaded. Try again.')
  if (body.ok !== true) throw new Error('Dataverse returned an invalid Contacts response.')
  return body
}

function directoryContact(value: unknown): ContactRecord {
  const row = directoryObject(value)
  if (typeof row.contactid !== 'string') throw new Error('Dataverse returned a Contact without a valid identifier.')
  for (const field of ['fullname', 'firstname', 'lastname', 'emailaddress1', 'jobtitle', 'mobilephone',
    'address1_city', 'address1_stateorprovince', 'address1_postalcode', '_mss_district_value',
    '_mss_district_value@OData.Community.Display.V1.FormattedValue']) {
    if (row[field] !== undefined && row[field] !== null && typeof row[field] !== 'string') {
      throw new Error('Dataverse returned an invalid Contacts response.')
    }
  }
  return row as ContactRecord
}

export async function getDistrictContacts(query: ContactQuery, signal?: AbortSignal): Promise<ContactPage> {
  signal?.throwIfAborted()
  const requestPath = contactsRequest(query)
  const response = directoryEnvelope(await powerPagesFetch<unknown>(requestPath, { signal }))
  if (!Array.isArray(response.contacts) || response.contacts.length > CONTACT_PAGE_SIZE
    || (response.nextLink !== null && typeof response.nextLink !== 'string')) throw new Error('Dataverse returned an invalid Contacts response.')
  const nextLink = nextContactsPage(response.nextLink as string | null, requestPath)
  return {
    contacts: [...new Map(response.contacts.map(record => { const mapped = mapContact(directoryContact(record), null); return [mapped.id, mapped] })).values()],
    hasNext: nextLink !== null,
    nextLink,
  }
}
export async function getAdminContacts(
  query: AdminContactQuery,
  signal?: AbortSignal,
): Promise<ContactPage> {
  const requestPath = query.nextLink
    ? normalizeContactsNextLink(query.nextLink)
    : `/_api/contacts${buildAdminContactsQuery(query)}`
  const response = await powerPagesFetch<{
    readonly value: readonly ContactRecord[]
    readonly '@odata.nextLink'?: string
  }>(requestPath, {
    signal,
    headers: { Prefer: CONTACT_PREFER },
  })
  if (!Array.isArray(response.value)) throw new Error('Dataverse returned an invalid Contacts response.')

  const nextLink = typeof response['@odata.nextLink'] === 'string'
    ? response['@odata.nextLink']
    : null

  return {
    contacts: response.value.map((record) => mapContact(record, null, true)),
    hasNext: Boolean(nextLink),
    nextLink,
  }
}

export async function updateAdminContact(
  contactId: string,
  values: AdminContactUpdate,
): Promise<void> {
  const normalizedContactId = normalizeGuid(contactId)
  if (!normalizedContactId) throw new Error('A valid Contact identifier is required.')

  const lastName = values.lastName.trim()
  if (!lastName) throw new Error('Last Name is required.')

  const districtId = values.districtId === null ? null : normalizeGuid(values.districtId)
  if (values.districtId !== null && !districtId) {
    throw new Error('A valid district identifier is required.')
  }

  await powerPagesFetch<void>(`/_api/contacts(${normalizedContactId})`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'If-Match': '*' },
    body: JSON.stringify({
      firstname: textOrNull(values.firstName),
      lastname: lastName,
      jobtitle: textOrNull(values.jobTitle),
      mobilephone: textOrNull(values.mobilePhone),
      address1_city: textOrNull(values.city),
      address1_stateorprovince: textOrNull(values.stateOrProvince),
      address1_postalcode: textOrNull(values.postalCode),
      'mss_District@odata.bind': districtId ? `/mss_districts(${districtId})` : null,
    }),
  })
}
