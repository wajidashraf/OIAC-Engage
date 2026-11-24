import { beforeEach, expect, test, vi } from 'vitest'
import { getRequestVerificationToken } from '../../shared/powerPagesApi'
import {
  ACTIVITY_ATTACHMENT_ENDPOINT,
  activityAttachmentPreviewKind,
  listActivityAttachments,
  selectActivityAttachmentFiles,
  uploadActivityAttachment,
  viewActivityAttachment,
} from './activityAttachmentService'

vi.mock('../../shared/powerPagesApi', () => ({ getRequestVerificationToken: vi.fn() }))
const postId = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const attachment = { id, fileName: 'photo.png', contentType: 'image/png', size: 3 }
const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getRequestVerificationToken).mockResolvedValue('session-token')
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: JSON.stringify({ ok: true, attachments: [attachment] }) }) })
})

test('calls the supplied portal flow with the existing Input parameter and session headers', async () => {
  expect(await listActivityAttachments(postId)).toEqual([attachment])
  const [path, options] = fetchMock.mock.calls[0]
  expect(path).toBe(ACTIVITY_ATTACHMENT_ENDPOINT)
  expect(path).toBe('/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f')
  expect(options).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { __RequestVerificationToken: 'session-token', 'X-Requested-With': 'XMLHttpRequest' } })
  const event = JSON.parse(JSON.parse(options.body).eventData)
  expect(event).toEqual({ Input: JSON.stringify({ operation: 'list', postId }) })
})

test('uploads raw base64 using the supplied stable file identifier', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: JSON.stringify({ ok: true, attachment }) }) })
  const file = new File(['abc'], 'photo.png', { type: 'image/png' })
  expect(await uploadActivityAttachment(postId, file, id)).toEqual(attachment)
  expect(JSON.parse(JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).eventData).Input)).toEqual({ operation: 'upload', postId, clientFileId: id, fileName: 'photo.png', size: 3, contentBase64: 'YWJj' })
})

function response(body: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => ({ result: JSON.stringify(body) }) } }

test.each(['lost-response', 'accepted', 'invalid-ack'] as const)('confirms an already saved file after an uncertain %s acknowledgement without uploading again', async failure => {
  if (failure === 'lost-response') fetchMock.mockRejectedValueOnce(new TypeError('Network response lost'))
  else if (failure === 'accepted') fetchMock.mockResolvedValueOnce(response({}, 202))
  else fetchMock.mockResolvedValueOnce(response({ ok: true, attachment: { ...attachment, size: 0 } }))
  fetchMock.mockResolvedValueOnce(response({ ok: true, attachments: [attachment] }))
  fetchMock.mockResolvedValueOnce(response({ ok: true, attachment, contentBase64: 'YWJj' }))
  expect(await uploadActivityAttachment(postId, new File(['abc'], 'photo.png', { type: 'image/png' }), id)).toEqual(attachment)
  expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(JSON.parse(JSON.parse(options.body).eventData).Input).operation)).toEqual(['upload', 'list', 'view'])
})

test.each(['forbidden', 'validation'])('preserves explicit %s rejection without trying to reinterpret it as success', async error => {
  fetchMock.mockResolvedValueOnce(response({ ok: false, error }))
  await expect(uploadActivityAttachment(postId, new File(['abc'], 'photo.png'), id)).rejects.toThrow()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each([401, 403])('preserves HTTP %s access rejection without reconciliation', async status => {
  fetchMock.mockResolvedValueOnce(response({}, status))
  await expect(uploadActivityAttachment(postId, new File(['abc'], 'photo.png'), id)).rejects.toThrow(/access/)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each(['missing', 'different-name', 'different-size', 'different-bytes', 'read-error'])('does not confirm a saved upload when verification reports %s', async kind => {
  fetchMock.mockResolvedValueOnce(response({}, 202))
  const stored = kind === 'different-name' ? { ...attachment, fileName: 'other.png' } : kind === 'different-size' ? { ...attachment, size: 4 } : attachment
  fetchMock.mockResolvedValueOnce(response({ ok: true, attachments: kind === 'missing' ? [] : [stored] }))
  if (kind === 'read-error') fetchMock.mockRejectedValueOnce(new TypeError('offline'))
  else fetchMock.mockResolvedValueOnce(response({ ok: true, attachment, contentBase64: kind === 'different-bytes' ? 'eHl6' : 'YWJj' }))
  await expect(uploadActivityAttachment(postId, new File(['abc'], 'photo.png'), id)).rejects.toThrow()
  const operations = fetchMock.mock.calls.map(([, options]) => JSON.parse(JSON.parse(JSON.parse(options.body).eventData).Input).operation)
  expect(operations.filter(operation => operation === 'upload')).toHaveLength(1)
})

test('retrieves file bytes through the flow and rejects content that exceeds the stated size', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => JSON.stringify({ result: JSON.stringify({ ok: true, attachment, contentBase64: 'YWJj' }) }) })
  const result = await viewActivityAttachment(postId, attachment)
  expect(result.blob.size).toBe(3)
  expect(result.contentType).toBe('image/png')
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: JSON.stringify({ ok: true, attachment, contentBase64: 'YWJjZA==' }) }) })
  await expect(viewActivityAttachment(postId, attachment)).rejects.toThrow()
})

test.each([
  { ok: true, attachments: [{ ...attachment, id: '../other' }] },
  { ok: true, attachments: [{ ...attachment, fileName: '../private.pdf' }] },
  { ok: true, attachments: [{ ...attachment, size: 10485761 }] },
  { ok: true, attachments: [attachment, attachment] },
  { ok: false, error: 'forbidden' },
])('rejects invalid or unauthorized attachment responses without exposing server detail', async body => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: JSON.stringify(body) }) })
  await expect(listActivityAttachments(postId)).rejects.toThrow()
})

test('validates post and file IDs before retrieving a session token', async () => {
  await expect(listActivityAttachments('invalid')).rejects.toThrow()
  await expect(uploadActivityAttachment(postId, new File(['abc'], 'photo.png'), 'bad')).rejects.toThrow()
  expect(getRequestVerificationToken).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('rejects invalid selections while retaining valid files and supports ten files maximum', () => {
  const first = new File(['a'], 'notes.pdf')
  const selected = selectActivityAttachmentFiles([first], [new File(['b'], 'NOTES.pdf'), new File([], 'empty.pdf'), new File(['x'], '../bad.pdf'), new File(['y'], 'photo.png')])
  expect(selected.files.map(file => file.name)).toEqual(['notes.pdf', 'photo.png'])
  expect(selected.errors).toHaveLength(3)
  const many = selectActivityAttachmentFiles([], Array.from({ length: 11 }, (_, i) => new File(['a'], `${i}.pdf`)))
  expect(many.files).toHaveLength(10)
  expect(many.errors).toHaveLength(1)
})

test('rejects a mismatched upload result and an accepted-but-unconfirmed flow response', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: JSON.stringify({ ok: true, attachment: { ...attachment, id: postId } }) }) })
  await expect(uploadActivityAttachment(postId, new File(['abc'], 'photo.png'), id)).rejects.toThrow()
  fetchMock.mockResolvedValue({ ok: true, status: 202 })
  await expect(listActivityAttachments(postId)).rejects.toThrow()
})

test('previews known image/PDF extensions when SharePoint returns a generic type, keeping explicit other types as downloads', async () => {
  expect(activityAttachmentPreviewKind({ ...attachment, contentType: 'application/octet-stream' })).toBe('image')
  expect(activityAttachmentPreviewKind({ ...attachment, fileName: 'notes.pdf', contentType: 'application/octet-stream' })).toBe('pdf')
  expect(activityAttachmentPreviewKind({ ...attachment, fileName: 'notes.pdf', contentType: 'text/html' })).toBe('download')
  const generic = { ...attachment, contentType: 'application/octet-stream' }
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: JSON.stringify({ ok: true, attachment: generic, contentBase64: 'YWJj' }) }) })
  expect((await viewActivityAttachment(postId, generic)).blob.type).toBe('image/png')
})
