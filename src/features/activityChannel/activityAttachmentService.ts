import { getRequestVerificationToken } from '../../shared/powerPagesApi'

export const ACTIVITY_ATTACHMENT_ENDPOINT = '/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f'
export const MAX_ACTIVITY_FILES = 10
export const MAX_ACTIVITY_FILE_SIZE = 10 * 1024 * 1024
export interface ActivityAttachment { id: string; fileName: string; size: number; contentType: string }
export interface ActivityAttachmentContent extends ActivityAttachment { blob: Blob }
const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const SAFE_NAME = /^[A-Za-z0-9_()-](?:[A-Za-z0-9 _().-]*[A-Za-z0-9_()-])?\.[A-Za-z0-9]+$/

class ActivityAttachmentRequestError extends Error {
  constructor(readonly code: 'unconfirmed' | 'forbidden' | 'validation', message: string) { super(message); this.name = 'ActivityAttachmentRequestError' }
}
function invalid(): never { throw new ActivityAttachmentRequestError('unconfirmed', 'The activity files could not be loaded. Try again.') }
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !GUID.test(value) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) return invalid()
  return value.toLowerCase()
}
function validName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 180 && SAFE_NAME.test(value) && !value.includes('..')
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function parse(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) as unknown } catch { return invalid() }
}
function attachment(value: unknown): ActivityAttachment {
  const a = record(value)
  if (!validName(a.fileName) || !Number.isSafeInteger(a.size) || Number(a.size) < 1 || Number(a.size) > MAX_ACTIVITY_FILE_SIZE
    || typeof a.contentType !== 'string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(a.contentType)) return invalid()
  return { id: identifier(a.id), fileName: a.fileName, size: Number(a.size), contentType: a.contentType.toLowerCase() }
}

export function selectActivityAttachmentFiles(current: readonly File[], incoming: readonly File[]): { files: File[]; errors: string[] } {
  const files = [...current]
  const errors: string[] = []
  for (const file of incoming) {
    let reason = ''
    if (!validName(file.name)) reason = 'Use a filename of up to 180 characters with letters, numbers, spaces, hyphens, underscores, parentheses, and a file extension.'
    else if (!file.size) reason = 'Empty files cannot be uploaded.'
    else if (file.size > MAX_ACTIVITY_FILE_SIZE) reason = 'Files must be 10 MB or smaller.'
    else if (files.some(selected => selected.name.toLowerCase() === file.name.toLowerCase())) reason = 'This filename is already selected.'
    else if (files.length >= MAX_ACTIVITY_FILES) reason = 'You can attach up to 10 files.'
    if (reason) errors.push(`${file.name}: ${reason}`)
    else files.push(file)
  }
  return { files, errors }
}

async function callFlow(payload: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const token = await getRequestVerificationToken()
  const response = await fetch(ACTIVITY_ATTACHMENT_ENDPOINT, {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token, 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ eventData: JSON.stringify({ Input: JSON.stringify(payload) }) }),
  })
  if (response.status === 401 || response.status === 403) throw new ActivityAttachmentRequestError('forbidden', 'You do not have access to these activity files.')
  if (!response.ok || response.status !== 200) return invalid()
  const envelope = record(parse(await response.json()))
  const body = record(parse(envelope.result))
  if (body.ok !== true) {
    if (body.error === 'forbidden') throw new ActivityAttachmentRequestError('forbidden', 'You do not have access to these activity files.')
    if (body.error === 'validation') throw new ActivityAttachmentRequestError('validation', 'The activity file is invalid. Check its name and size.')
    return invalid()
  }
  return body
}

export async function listActivityAttachments(postId: string, signal?: AbortSignal): Promise<ActivityAttachment[]> {
  const body = await callFlow({ operation: 'list', postId: identifier(postId) }, signal)
  if (!Array.isArray(body.attachments) || body.attachments.length > 100) return invalid()
  const files = body.attachments.map(attachment)
  if (new Set(files.map(file => file.id)).size !== files.length) return invalid()
  return files
}

function base64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.slice(reader.result.indexOf(',') + 1)) : reject(new Error('The selected file could not be read.'))
    reader.onerror = () => reject(new Error('The selected file could not be read.'))
    reader.readAsDataURL(file)
  })
}

export async function uploadActivityAttachment(postId: string, file: File, clientFileId: string): Promise<ActivityAttachment> {
  const normalizedPostId = identifier(postId), normalizedFileId = identifier(clientFileId)
  const selection = selectActivityAttachmentFiles([], [file])
  if (selection.errors.length) throw new Error(selection.errors[0])
  const encoded = await base64(file)
  try {
    const body = await callFlow({ operation: 'upload', postId: normalizedPostId, clientFileId: normalizedFileId, fileName: file.name, size: file.size, contentBase64: encoded })
    const result = attachment(body.attachment)
    if (result.id !== normalizedFileId || result.fileName !== file.name || result.size !== file.size) return invalid()
    return result
  } catch (error) {
    if (error instanceof ActivityAttachmentRequestError && error.code !== 'unconfirmed') throw error
    // A rejected acknowledgement cannot establish whether SharePoint committed the write.
    // Recover only from an exact read-back, without creating another upload or post.
    try {
      const stored = (await listActivityAttachments(normalizedPostId)).find(candidate => candidate.id === normalizedFileId && candidate.fileName === file.name && candidate.size === file.size)
      if (stored) {
        const content = await viewActivityAttachment(normalizedPostId, stored)
        if (await base64(content.blob) === encoded) return stored
      }
    } catch { /* Keep the original failure if read-back cannot confirm the exact file. */ }
    throw error
  }
}

export async function viewActivityAttachment(postId: string, file: ActivityAttachment, signal?: AbortSignal): Promise<ActivityAttachmentContent> {
  const expected = attachment(file)
  const body = await callFlow({ operation: 'view', postId: identifier(postId), attachmentId: expected.id, fileName: expected.fileName }, signal)
  const result = attachment(body.attachment)
  if (result.id !== expected.id || result.fileName !== expected.fileName || result.size !== expected.size
    || typeof body.contentBase64 !== 'string' || body.contentBase64.length > 4 * Math.ceil(MAX_ACTIVITY_FILE_SIZE / 3)
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.contentBase64)) return invalid()
  let binary: string
  try { binary = atob(body.contentBase64) } catch { return invalid() }
  if (binary.length !== result.size) return invalid()
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  const contentType = previewContentType(result)
  return { ...result, contentType, blob: new Blob([bytes], { type: contentType }) }
}

function previewContentType(file: ActivityAttachment): string {
  if (!['application/octet-stream', 'binary/octet-stream'].includes(file.contentType)) return file.contentType
  const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', pdf: 'application/pdf' }
  const extension = file.fileName.split('.').pop()?.toLowerCase() ?? ''
  return Object.prototype.hasOwnProperty.call(types, extension) ? types[extension] : file.contentType
}

export function activityAttachmentPreviewKind(file: ActivityAttachment): 'image' | 'pdf' | 'download' {
  const contentType = previewContentType(file)
  if (/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(contentType)) return 'image'
  if (contentType === 'application/pdf') return 'pdf'
  return 'download'
}
