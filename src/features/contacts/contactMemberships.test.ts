import { beforeEach, expect, test, vi } from 'vitest'
import { powerPagesFetch } from '../../shared/powerPagesApi'
import { buildContactsQuery, getLoggedInUserDistricts } from './contactService'

vi.mock('../../shared/powerPagesApi', () => ({ powerPagesFetch: vi.fn() }))
const fetchMock = vi.mocked(powerPagesFetch)
const actor = '11111111-1111-4111-8111-111111111111'
const districtA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const districtB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

beforeEach(() => fetchMock.mockReset())

test('leaves membership matching to the trusted server endpoint without sending actor or district IDs', () => {
  expect(buildContactsQuery({ search: ' Muna ' })).toBe('?q=Muna')
  expect(buildContactsQuery({ search: '' })).toBe('?q=')
})

test('retrieves all membership pages and deduplicates active non-null District IDs', async () => {
  const next = '/_api/mss_contactdistrictmemberships?$skiptoken=second-page'
  fetchMock.mockResolvedValueOnce({ value: [{ _mss_district_value: districtA, statecode: 0 }], '@odata.nextLink': next })
    .mockResolvedValueOnce({ value: [
      { _mss_district_value: districtA.toUpperCase(), statecode: 0 },
      { _mss_district_value: districtB, statecode: 0 },
      { _mss_district_value: actor, statecode: 1 },
      { _mss_district_value: null, statecode: 0 },
    ] })
  await expect(getLoggedInUserDistricts(actor)).resolves.toEqual([districtA, districtB])
  expect(fetchMock).toHaveBeenNthCalledWith(2, next, expect.any(Object))
})

test('rejects off-origin, wrong-table and repeated membership continuation links', async () => {
  for (const next of ['https://outside.example/_api/mss_contactdistrictmemberships', '/_api/contacts', '/_api/mss_contactdistrictmemberships?$skiptoken=loop']) {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ value: [], '@odata.nextLink': next })
    await expect(getLoggedInUserDistricts(actor)).rejects.toThrow(/continuation/i)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2)
  }
})

test('supports memberships beyond an initial 500-record page without downloading Contacts', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ _mss_district_value: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, statecode: 0 }))
  fetchMock.mockResolvedValueOnce({ value: rows.slice(0, 500), '@odata.nextLink': '/_api/mss_contactdistrictmemberships?$skiptoken=501' })
    .mockResolvedValueOnce({ value: rows.slice(500) })
  const districts = await getLoggedInUserDistricts(actor)
  expect(districts).toHaveLength(501)
  expect(fetchMock.mock.calls.every(([path]) => path.startsWith('/_api/mss_contactdistrictmemberships?'))).toBe(true)
  const query = buildContactsQuery({ search: '' })
  expect(query).toBe('?q=')
  expect(query).not.toContain(rows[500]._mss_district_value)
})
