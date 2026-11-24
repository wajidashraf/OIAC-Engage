import { expect, test, vi } from 'vitest'
const vmModule = 'node:vm'
const { runInNewContext } = await import(/* @vite-ignore */ vmModule) as { runInNewContext(code: string, context: Record<string, unknown>): unknown }
const scripts = import.meta.glob('../../../.powerpages-site/server-logic/contact-directory/contact-directory.js', { eager: true, query: '?raw', import: 'default' })
const source = Object.values(scripts)[0] as string | undefined
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const contact = { contactid: actor, fullname: 'Member', emailaddress1: 'member@example.org', privateField: 'hidden' }
const envelope = (result: unknown, status = 200) => JSON.stringify({ StatusCode: status, IsSuccessStatusCode: status === 200, Body: JSON.stringify({ Result: JSON.stringify(result) }) })
function harness(query: Record<string, unknown> = {}) {
  const invoke = vi.fn((_verb: string, _api: string, _payload: string) => envelope({ ok: true, contacts: [contact], nextLink: null }))
  const server = { User: { contactid: actor } as unknown, Context: { HttpMethod: 'GET', QueryParameters: query }, Connector: { Dataverse: { InvokeCustomApi: invoke } } }
  const context: Record<string, unknown> = { Server: server }
  runInNewContext(source || '', context)
  return { server, invoke, context, call() { expect(context.get).toBeTypeOf('function'); return JSON.parse((context.get as () => string)()) } }
}
test('stamps the trusted actor and uses only the fixed read action and safe projection', () => {
  const h = harness({ q: ' Muna ' })
  expect(h.call()).toEqual({ ok: true, contacts: [{ contactid: actor, fullname: 'Member', emailaddress1: 'member@example.org' }], nextLink: null })
  expect(h.invoke.mock.calls[0].slice(0, 2)).toEqual(['post', 'mss_ContactDistrictDirectory'])
  expect(JSON.parse(h.invoke.mock.calls[0][2])).toEqual({ ActorContactId: actor, Search: 'Muna', Page: 1, Cookie: '' })
  expect(Object.keys(h.context).sort()).toEqual(['Server', 'get'])
})
test.each([null, {}, { contactid: 'invalid' }])('rejects missing trusted identity %j', user => {
  const h = harness(); h.server.User = user
  expect(h.call()).toMatchObject({ ok: false, error: { code: 'unauthenticated' } }); expect(h.invoke).not.toHaveBeenCalled()
})
test.each([{ ActorContactId: actor }, { q: 'x'.repeat(201) }, { page: '0' }, { page: '100001' }, { page: '2' }, { cookie: 'abc' }, { page: '2', cookie: '<xml>' }])('rejects malformed query %j', query => {
  const h = harness(query); expect(h.call()).toMatchObject({ ok: false, error: { code: 'validation' } }); expect(h.invoke).not.toHaveBeenCalled()
})
test('preserves an opaque cursor and validates the next page/search', () => {
  const h = harness({ q: "O'Connor", page: '2', cookie: 'opaque_2' })
  const next = '/_api/serverlogics/contact-directory?q=O%27Connor&page=3&cookie=opaque_3'
  h.invoke.mockReturnValue(envelope({ ok: true, contacts: [], nextLink: next }))
  expect(h.call()).toEqual({ ok: true, contacts: [], nextLink: next })
  expect(JSON.parse(h.invoke.mock.calls[0][2])).toMatchObject({ Page: 2, Cookie: 'opaque_2' })
})
test.each(['/evil', '/_api/serverlogics/contact-directory?q=other&page=2&cookie=abc', '/_api/serverlogics/contact-directory?q=&page=1&cookie=abc', '/_api/serverlogics/contact-directory?q=&page=2&cookie=abc&actor=forged'])('rejects invalid continuations %s', nextLink => {
  const h = harness(); h.invoke.mockReturnValue(envelope({ ok: true, contacts: [], nextLink })); expect(h.call()).toMatchObject({ ok: false, error: { code: 'unavailable' } })
})
test.each([envelope({ ok: false, error: { code: 'forbidden', message: 'private tenant' } }), envelope({ ok: true, contacts: [], nextLink: null }, 500), 'invalid', envelope({ ok: true, contacts: [{ contactid: 'bad' }], nextLink: null })])('sanitizes failed or malformed results', raw => {
  const h = harness(); h.invoke.mockReturnValue(raw); const result = h.call(); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('private tenant')
})
test('rejects writes and contains no unsupported globals or runtime Function calls', () => {
  const h = harness(); h.server.Context.HttpMethod = 'POST'; expect(h.call()).toMatchObject({ ok: false }); expect(h.invoke).not.toHaveBeenCalled()
  expect(source).not.toMatch(/Function\s*\(/i)
  expect(source).not.toMatch(/\b(fetch|window|document|require|process)\s*[.(]/)
})
