import { beforeEach, describe, expect, test, vi } from 'vitest'
import { powerPagesFetch } from '../../shared/powerPagesApi'
import {
  CONTACT_PAGE_SIZE,
  buildAdminContactsQuery,
  buildContactsQuery,
  getAdminContacts,
  getDistrictContacts,
  getLoggedInUserDistricts,
  updateAdminContact,
} from './contactService'
import type { AdminContactUpdate, ContactRecord } from './contactTypes'

vi.mock('../../shared/powerPagesApi', () => ({
  powerPagesFetch: vi.fn(),
}))

const powerPagesFetchMock = vi.mocked(powerPagesFetch)
const DISTRICT_ID = '367d7420-d8a2-f111-b8da-7ced8d70f293'
const CONTACT_ID = '20f9c936-6740-451e-9470-28a3c83c9909'

function makeContact(index: number): ContactRecord {
  return {
    contactid: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
    fullname: `Contact ${index}`,
    emailaddress1: `contact${index}@example.org`,
    mobilephone: `202-555-${String(index).padStart(4, '0')}`,
    address1_city: 'Washington',
    _mss_district_value: DISTRICT_ID,
    '_mss_district_value@OData.Community.Display.V1.FormattedValue': 'District 1',
  }
}

const ADMIN_CONTACT: ContactRecord = {
  contactid: CONTACT_ID.toUpperCase(),
  firstname: ' Sara ',
  lastname: ' Rahimi ',
  emailaddress1: ' sara@example.org ',
  jobtitle: ' Volunteer Coordinator ',
  mobilephone: ' 202-555-0100 ',
  address1_city: ' Washington ',
  address1_stateorprovince: ' DC ',
  address1_postalcode: ' 20001 ',
  _mss_district_value: DISTRICT_ID.toUpperCase(),
  '_mss_district_value@OData.Community.Display.V1.FormattedValue': ' District 1 ',
}

const ADMIN_UPDATE: AdminContactUpdate = {
  firstName: ' Sara ',
  lastName: ' Rahimi ',
  jobTitle: ' Volunteer Coordinator ',
  mobilePhone: '   ',
  city: ' Washington ',
  stateOrProvince: ' DC ',
  postalCode: ' 20001 ',
  districtId: DISTRICT_ID.toUpperCase(),
}

const endpoint = '/_api/serverlogics/contact-directory'
const wrapped = (body: unknown) => ({ success: true, data: JSON.stringify(body) })
const pageBody = (contacts: unknown[] = [], nextLink: unknown = null) => wrapped({ ok: true, contacts, nextLink })

describe('Contact Web API service', () => {
  beforeEach(() => powerPagesFetchMock.mockReset())

  test('encodes trimmed literal search using RFC3986 without client actor, district or XML inputs', () => {
    expect(buildContactsQuery({ search: " O'Connor & Sons%_!()* " })).toBe('?q=O%27Connor%20%26%20Sons%25_%21%28%29%2A')
    expect(buildContactsQuery({ search: '' })).toBe('?q=')
  })

  test('retrieves active memberships without reading the legacy lookup', async () => {
    const signal = new AbortController().signal
    powerPagesFetchMock.mockResolvedValue({ value: [{ _mss_district_value: DISTRICT_ID.toUpperCase(), statecode: 0 }] })
    await expect(getLoggedInUserDistricts(CONTACT_ID, signal)).resolves.toEqual([DISTRICT_ID])
    const [path, options] = powerPagesFetchMock.mock.calls[0]
    const url = new URL(path, 'https://powerpages.local')
    expect(url.pathname).toBe('/_api/mss_contactdistrictmemberships')
    expect(url.searchParams.get('$filter')).toBe(`_mss_contact_value eq ${CONTACT_ID} and statecode eq 0`)
    expect(options?.signal).toBe(signal)
  })

  test('returns an empty membership list for an unassigned Contact', async () => {
    powerPagesFetchMock.mockResolvedValue({ value: [] })
    await expect(getLoggedInUserDistricts(CONTACT_ID)).resolves.toEqual([])
  })

  test('rejects invalid session identifiers before fetching memberships', async () => {
    await expect(getLoggedInUserDistricts('contact-001')).rejects.toThrow(/Contact identifier/)
    expect(powerPagesFetchMock).not.toHaveBeenCalled()
  })

  test('reads the native serverlogic envelope and forwards its opaque cursor with the search context', async () => {
    const signal = new AbortController().signal
    const nextLink = endpoint + '?q=Muna&page=2&cookie=Y29va2llLTE'
    powerPagesFetchMock.mockResolvedValueOnce(pageBody(Array.from({ length: 15 }, (_, i) => makeContact(i + 1)), nextLink))
      .mockResolvedValueOnce(pageBody([makeContact(16)]))
    const first = await getDistrictContacts({ search: ' Muna ' }, signal)
    expect(first.contacts).toHaveLength(15)
    expect(first).toMatchObject({ hasNext: true, nextLink })
    expect(first.contacts[0]).toMatchObject({ fullName: 'Contact 1', districtName: 'District 1' })
    expect(powerPagesFetchMock).toHaveBeenNthCalledWith(1, endpoint + '?q=Muna', { signal })
    const second = await getDistrictContacts({ search: 'Muna', nextLink: first.nextLink }, signal)
    expect(second.contacts[0].fullName).toBe('Contact 16')
    expect(second).toMatchObject({ hasNext: false, nextLink: null })
    expect(powerPagesFetchMock).toHaveBeenNthCalledWith(2, nextLink, { signal })
  })

  test('normalizes a same-origin absolute continuation and accepts the largest bounded cursor', async () => {
    const nextLink = endpoint + '?q=&page=100000&cookie=' + 'a'.repeat(16384)
    powerPagesFetchMock.mockResolvedValue(pageBody())
    await getDistrictContacts({ search: '', nextLink: window.location.origin + nextLink })
    expect(powerPagesFetchMock).toHaveBeenCalledWith(nextLink, { signal: undefined })
  })

  test.each([
    'https://outside.example/_api/serverlogics/contact-directory?q=&page=2&cookie=abc',
    'https://name:secret@localhost:3000/_api/serverlogics/contact-directory?q=&page=2&cookie=abc',
    '/_api/contacts?q=&page=2&cookie=abc',
    endpoint + '?q=changed&page=2&cookie=abc',
    endpoint + '?q=&page=2&cookie=abc#extra',
    endpoint + '?q=&page=2&cookie=abc&actor=someone',
    endpoint + '?q=&q=&page=2&cookie=abc',
    endpoint + '?q=&page=2&page=3&cookie=abc',
    endpoint + '?q=&page=2&cookie=abc&cookie=def',
    endpoint + '?q=&page=1&cookie=abc',
    endpoint + '?q=&page=02&cookie=abc',
    endpoint + '?q=&page=100001&cookie=abc',
    endpoint + '?q=&page=2',
    endpoint + '?q=&page=2&cookie=',
    endpoint + '?q=&page=2&cookie=abc%2Bdef',
    endpoint + '?q=&page=2&cookie=abc%3D',
    endpoint + '?q=&page=2&cookie=' + 'a'.repeat(16385),
  ])('rejects an unsafe continuation before requesting Contacts (%#)', async nextLink => {
    await expect(getDistrictContacts({ search: '', nextLink })).rejects.toThrow(/continuation/i)
    expect(powerPagesFetchMock).not.toHaveBeenCalled()
  })

  test('rejects returned cursors which change search or fail to advance the current page', async () => {
    for (const nextLink of [endpoint + '?q=other&page=3&cookie=abc', endpoint + '?q=&page=2&cookie=abc', endpoint + '?q=&page=1&cookie=abc']) {
      powerPagesFetchMock.mockResolvedValueOnce(pageBody([], nextLink))
      await expect(getDistrictContacts({ search: '', nextLink: endpoint + '?q=&page=2&cookie=previous' })).rejects.toThrow(/continuation/i)
    }
  })

  test.each([
    null, {}, { success: false, data: '{}' }, { success: true, data: 'not JSON' },
    wrapped({ ok: true, contacts: null, nextLink: null }),
    wrapped({ ok: true, contacts: Array.from({ length: 16 }, (_, i) => makeContact(i + 1)), nextLink: null }),
    wrapped({ ok: true, contacts: [], nextLink: 2 }),
    wrapped({ ok: true, contacts: [] }),
    pageBody([null]), pageBody(['invalid']), pageBody([{ contactid: 42 }]),
    pageBody([{ contactid: 'invalid' }]), pageBody([{ ...makeContact(1), emailaddress1: {} }]),
  ])('rejects malformed endpoint responses and contact rows (%#)', async response => {
    powerPagesFetchMock.mockResolvedValueOnce(response)
    await expect(getDistrictContacts({ search: '' })).rejects.toThrow()
  })

  test('does not expose server error details to callers', async () => {
    powerPagesFetchMock.mockResolvedValueOnce(wrapped({ ok: false, error: { code: 'forbidden', message: 'Sensitive upstream exception' } }))
    await expect(getDistrictContacts({ search: '' })).rejects.toThrow('Contacts could not be loaded. Try again.')
  })

  test('disables Next on a full final page and maps optional display values safely', async () => {
    powerPagesFetchMock.mockResolvedValueOnce(pageBody(Array.from({ length: 15 }, (_, i) => makeContact(i + 1))))
      .mockResolvedValueOnce(pageBody([{ contactid: CONTACT_ID, _mss_district_value: DISTRICT_ID }]))
    const first = await getDistrictContacts({ search: '' })
    expect(first.contacts).toHaveLength(15)
    expect(first).toMatchObject({ hasNext: false, nextLink: null })
    const second = await getDistrictContacts({ search: '' })
    expect(second.contacts[0]).toMatchObject({ id: CONTACT_ID, fullName: null, email: null, districtId: DISTRICT_ID })
  })

  test('deduplicates a repeated Contact within a returned page', async () => {
    powerPagesFetchMock.mockResolvedValueOnce(pageBody([makeContact(1), makeContact(1)]))
    expect((await getDistrictContacts({ search: '' })).contacts).toHaveLength(1)
  })

  test('passes transport failures and aborts through without issuing another request', async () => {
    const failure = new DOMException('Aborted', 'AbortError')
    powerPagesFetchMock.mockRejectedValueOnce(failure)
    await expect(getDistrictContacts({ search: '' })).rejects.toBe(failure)
    expect(powerPagesFetchMock).toHaveBeenCalledTimes(1)
  })

  test('builds a paged all-active-contact query for administrators', () => {
    const query = buildAdminContactsQuery({ search: '' })
    const params = new URLSearchParams(query.slice(1))

    expect(params.get('$select')).toBe(
      'contactid,address1_city,address1_stateorprovince,address1_postalcode,'
      + '_mss_district_value,emailaddress1,firstname,jobtitle,lastname,mobilephone',
    )
    expect(params.get('$filter')).toBe('statecode eq 0')
    expect(params.get('$filter')).not.toContain("contains(jobtitle,'volunteer')")
    expect(params.get('$orderby')).toBe('lastname asc,firstname asc,contactid asc')
    expect(params.has('$skip')).toBe(false)
    expect(params.has('$top')).toBe(false)
  })

  test('keeps administrator search inside active Contacts and escapes apostrophes', () => {
    const query = buildAdminContactsQuery({ search: " O'Connor " })
    const filter = new URLSearchParams(query.slice(1)).get('$filter')

    expect(filter).toBe(
      "statecode eq 0 and ("
      + "contains(firstname,'O''Connor') or "
      + "contains(lastname,'O''Connor') or "
      + "contains(emailaddress1,'O''Connor') or "
      + "contains(mobilephone,'O''Connor') or "
      + "contains(jobtitle,'O''Connor') or "
      + "contains(address1_city,'O''Connor') or "
      + "contains(address1_stateorprovince,'O''Connor') or "
      + "contains(address1_postalcode,'O''Connor'))",
    )
    expect(filter).not.toContain("contains(jobtitle,'volunteer')")
  })

  test('loads and maps an administrator Contact page with the existing page preference', async () => {
    const signal = new AbortController().signal
    const nextLink = '/_api/contacts?%24skiptoken=admin-page-2'
    powerPagesFetchMock.mockResolvedValue({ value: [ADMIN_CONTACT], '@odata.nextLink': nextLink })

    const result = await getAdminContacts({ search: '' }, signal)

    expect(result.contacts[0]).toEqual({
      id: CONTACT_ID,
      fullName: 'Sara Rahimi',
      firstName: 'Sara',
      lastName: 'Rahimi',
      email: 'sara@example.org',
      jobTitle: 'Volunteer Coordinator',
      mobilePhone: '202-555-0100',
      city: 'Washington',
      stateOrProvince: 'DC',
      postalCode: '20001',
      districtName: 'District 1',
      districtId: DISTRICT_ID,
    })
    expect(result).toMatchObject({ hasNext: true, nextLink })
    expect(powerPagesFetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/_api\/contacts\?/), {
      signal,
      headers: {
        Prefer: `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${CONTACT_PAGE_SIZE}`,
      },
    })
  })

  test('uses only safe Contacts continuation links for administrator pages', async () => {
    const nextLink = '/_api/contacts?%24skiptoken=admin-page-2'
    powerPagesFetchMock.mockResolvedValue({ value: [] })

    await getAdminContacts({ search: '', nextLink })
    expect(powerPagesFetchMock).toHaveBeenCalledWith(nextLink, expect.any(Object))

    await expect(getAdminContacts({
      search: '',
      nextLink: 'https://attacker.example/_api/contacts?$skiptoken=stolen',
    })).rejects.toThrow('Dataverse returned an invalid Contacts continuation link.')
    await expect(getAdminContacts({
      search: '',
      nextLink: '/_api/accounts?$skiptoken=wrong-table',
    })).rejects.toThrow('Dataverse returned an invalid Contacts continuation link.')
    expect(powerPagesFetchMock).toHaveBeenCalledTimes(1)
  })

  test('rejects malformed administrator collection data and invalid Contact identifiers', async () => {
    powerPagesFetchMock.mockResolvedValueOnce({ value: null })
    await expect(getAdminContacts({ search: '' })).rejects.toThrow(
      'Dataverse returned an invalid Contacts response.',
    )

    powerPagesFetchMock.mockResolvedValueOnce({ value: [{ ...ADMIN_CONTACT, contactid: 'bad-id' }] })
    await expect(getAdminContacts({ search: '' })).rejects.toThrow(
      'Dataverse returned a Contact without a valid identifier.',
    )
  })

  test('updates only approved administrator fields with normalized values', async () => {
    powerPagesFetchMock.mockResolvedValue(undefined)

    await updateAdminContact(CONTACT_ID.toUpperCase(), ADMIN_UPDATE)

    expect(powerPagesFetchMock).toHaveBeenCalledWith(`/_api/contacts(${CONTACT_ID})`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': '*' },
      body: JSON.stringify({
        firstname: 'Sara',
        lastname: 'Rahimi',
        jobtitle: 'Volunteer Coordinator',
        mobilephone: null,
        address1_city: 'Washington',
        address1_stateorprovince: 'DC',
        address1_postalcode: '20001',
        'mss_District@odata.bind': `/mss_districts(${DISTRICT_ID})`,
      }),
    })
    const request = powerPagesFetchMock.mock.calls[0]?.[1]
    expect(request?.body).not.toContain('emailaddress1')
    expect(request?.body).not.toContain('contactid')
    expect(request?.body).not.toContain('fullname')
  })

  test('clears optional values and District with explicit nulls', async () => {
    powerPagesFetchMock.mockResolvedValue(undefined)

    await updateAdminContact(CONTACT_ID, {
      ...ADMIN_UPDATE,
      firstName: ' ',
      jobTitle: '',
      city: '',
      stateOrProvince: '',
      postalCode: '',
      districtId: null,
    })

    expect(JSON.parse(String(powerPagesFetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      firstname: null,
      lastname: 'Rahimi',
      jobtitle: null,
      mobilephone: null,
      address1_city: null,
      address1_stateorprovince: null,
      address1_postalcode: null,
      'mss_District@odata.bind': null,
    })
  })

  test('rejects invalid update identifiers and a blank Last Name before requesting Dataverse', async () => {
    await expect(updateAdminContact('bad-id', ADMIN_UPDATE)).rejects.toThrow(
      'A valid Contact identifier is required.',
    )
    await expect(updateAdminContact(CONTACT_ID, { ...ADMIN_UPDATE, districtId: 'bad-id' })).rejects.toThrow(
      'A valid district identifier is required.',
    )
    await expect(updateAdminContact(CONTACT_ID, { ...ADMIN_UPDATE, lastName: '   ' })).rejects.toThrow(
      'Last Name is required.',
    )
    expect(powerPagesFetchMock).not.toHaveBeenCalled()
  })
})
