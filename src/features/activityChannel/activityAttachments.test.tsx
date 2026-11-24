import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import ActivityComposer from './ActivityComposer'
import ActivityPostComposer from './ActivityPostComposer'
import ActivityAttachments from './ActivityAttachments'
import * as files from './activityAttachmentService'
import type { ActivityPost } from './activityTypes'
import { StrictMode } from 'react'

vi.mock('./activityAttachmentService', async original => ({ ...await original<typeof files>(), listActivityAttachments: vi.fn(), uploadActivityAttachment: vi.fn(), viewActivityAttachment: vi.fn() }))
const author = { id: '11111111-1111-4111-8111-111111111111', name: 'Community member', jobTitle: null }
const post = { id: '22222222-2222-4222-8222-222222222222' } as ActivityPost
const image = { id: '33333333-3333-4333-8333-333333333333', fileName: 'photo.png', size: 3, contentType: 'image/png' }
let urlSequence = 0
test('replaces cancelled cached reads when StrictMode replays the mount lifecycle', async () => {
  vi.mocked(files.listActivityAttachments).mockResolvedValue([image])
  vi.mocked(files.viewActivityAttachment).mockImplementation(async (_id, file, signal) => {
    await Promise.resolve()
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    return { ...file, blob: new Blob(['abc'], { type: 'image/png' }) }
  })
  render(<StrictMode><ActivityAttachments postId={post.id} /></StrictMode>)
  expect(await screen.findByRole('img', { name: 'photo.png' })).toBeInTheDocument()
  expect(screen.queryByText('Photo unavailable — open to retry')).not.toBeInTheDocument()
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(files.listActivityAttachments).mockResolvedValue([])
  vi.mocked(files.uploadActivityAttachment).mockResolvedValue(image)
  vi.mocked(files.viewActivityAttachment).mockResolvedValue({ ...image, blob: new Blob(['abc'], { type: 'image/png' }) })
  urlSequence = 0
  URL.createObjectURL = vi.fn(() => urlSequence++ === 0 ? 'blob:activity-file' : `blob:activity-file-${urlSequence}`)
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

test('offers files only in the activity composer and retains its selection when cancelled', async () => {
  render(<><ActivityPostComposer author={author} onCreate={vi.fn()} onAttachmentsSaved={vi.fn()} /><ActivityComposer kind="Comment" author={author} onSave={vi.fn()} /><ActivityComposer kind="Reply" author={author} onSave={vi.fn()} /></>)
  await userEvent.click(screen.getByRole('button', { name: 'Create Activity' }))
  const picker = screen.getByLabelText('Attach files to activity')
  await userEvent.upload(picker, new File(['abc'], 'notes.pdf', { type: 'application/pdf' }))
  expect(screen.getByText('notes.pdf')).toBeInTheDocument()
  expect(within(screen.getByRole('form', { name: 'Add Comment' })).queryByLabelText('Attach files to activity')).not.toBeInTheDocument()
  expect(within(screen.getByRole('form', { name: 'Add Reply' })).queryByLabelText('Attach files to activity')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Create Activity' }))
  expect(screen.getByText('notes.pdf')).toBeInTheDocument()
})

test('saves the post first and retries only unconfirmed uploads against the same post', async () => {
  const create = vi.fn().mockResolvedValue(post), refreshed = vi.fn().mockResolvedValue(undefined)
  vi.mocked(files.uploadActivityAttachment).mockResolvedValueOnce(image).mockRejectedValueOnce(new Error('network')).mockResolvedValue(image)
  render(<ActivityPostComposer author={author} onCreate={create} onAttachmentsSaved={refreshed} />)
  await userEvent.click(screen.getByRole('button', { name: 'Create Activity' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Activity content' }), 'Meeting update')
  const first = new File(['abc'], 'photo.png'), second = new File(['abc'], 'notes.pdf')
  await userEvent.upload(screen.getByLabelText('Attach files to activity'), [first, second])
  await userEvent.click(screen.getByRole('button', { name: 'Post Activity' }))
  await screen.findByText(/activity was posted, but some files/i)
  expect(create).toHaveBeenCalledTimes(1)
  expect(create.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(files.uploadActivityAttachment).mock.invocationCallOrder[0])
  expect(screen.getByLabelText('Attach files to activity')).toBeDisabled()
  const failedId = vi.mocked(files.uploadActivityAttachment).mock.calls[1][2]
  await userEvent.click(screen.getByRole('button', { name: 'Post Activity' }))
  await waitFor(() => expect(refreshed).toHaveBeenCalledWith(post.id))
  expect(create).toHaveBeenCalledTimes(1)
  expect(files.uploadActivityAttachment).toHaveBeenCalledTimes(3)
  expect(vi.mocked(files.uploadActivityAttachment).mock.calls[2]).toEqual([post.id, second, failedId])
  expect(screen.queryByText('photo.png')).not.toBeInTheDocument()
})

test('retrieves persisted images before displaying them and releases the Blob URL on unmount', async () => {
  vi.mocked(files.listActivityAttachments).mockResolvedValue([image])
  const view = render(<ActivityAttachments postId={post.id} />)
  expect(await screen.findByRole('img', { name: 'photo.png' })).toHaveAttribute('src', 'blob:activity-file')
  expect(files.viewActivityAttachment).toHaveBeenCalledWith(post.id, image, expect.any(AbortSignal))
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:activity-file')
})

test('shows a compact PDF row and loads its preview only when requested', async () => {
  const pdf = { ...image, fileName: 'notes.pdf', contentType: 'application/pdf' }
  const doc = { ...image, id: '44444444-4444-4444-8444-444444444444', fileName: 'report.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  vi.mocked(files.listActivityAttachments).mockResolvedValue([pdf, doc])
  vi.mocked(files.viewActivityAttachment).mockImplementation(async (_id, file) => ({ ...file, blob: new Blob(['abc'], { type: file.contentType }) }))
  render(<ActivityAttachments postId={post.id} />)
  const preview = await screen.findByRole('button', { name: 'Preview notes.pdf' })
  expect(screen.queryByTitle('PDF preview of notes.pdf')).not.toBeInTheDocument()
  expect(files.viewActivityAttachment).not.toHaveBeenCalled()
  await userEvent.click(preview)
  const dialog = await screen.findByRole('dialog', { name: 'Preview notes.pdf' })
  expect(await within(dialog).findByTitle('PDF preview of notes.pdf')).not.toHaveAttribute('sandbox')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(preview).toHaveFocus()
  expect(files.viewActivityAttachment).not.toHaveBeenCalledWith(post.id, doc, expect.anything())
  await userEvent.click(screen.getByRole('button', { name: 'Download report.docx' }))
  await waitFor(() => expect(files.viewActivityAttachment).toHaveBeenCalledWith(post.id, doc, expect.any(AbortSignal)))
})

test('provides Photo and Document buttons with a shared queue of chips above the toolbar', async () => {
  render(<ActivityPostComposer author={author} onCreate={vi.fn()} onAttachmentsSaved={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Create Activity' }))
  const photoButton = screen.getByRole('button', { name: 'Photo' })
  const documentButton = screen.getByRole('button', { name: 'Document' })
  expect(photoButton).toHaveAttribute('type', 'button')
  expect(documentButton).toHaveAttribute('type', 'button')
  await userEvent.upload(screen.getByLabelText('Attach photos to activity'), new File(['abc'], 'photo.png', { type: 'image/png' }))
  await userEvent.upload(screen.getByLabelText('Attach files to activity'), new File(['abc'], 'notes.pdf', { type: 'application/pdf' }))
  expect(screen.getByText('Attached · 2 files')).toBeInTheDocument()
  const chips = screen.getByRole('list', { name: 'Selected activity files' })
  expect(chips.compareDocumentPosition(photoButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(chips).getByText('photo.png')).toBeInTheDocument()
  expect(within(chips).getByText('notes.pdf')).toBeInTheDocument()
  await userEvent.click(within(chips).getByRole('button', { name: 'Remove photo.png' }))
  expect(screen.getByText('Attached · 1 file')).toBeInTheDocument()
  expect(files.uploadActivityAttachment).not.toHaveBeenCalled()
})

test('uses a three-tile collage with overflow and navigates through every photo', async () => {
  const images = Array.from({ length: 5 }, (_, index) => ({ ...image, id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`, fileName: `photo${index + 1}.png` }))
  vi.mocked(files.listActivityAttachments).mockResolvedValue(images)
  vi.mocked(files.viewActivityAttachment).mockImplementation(async (_postId, file) => ({ ...file, blob: new Blob(['abc'], { type: 'image/png' }) }))
  render(<ActivityAttachments postId={post.id} />)
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3))
  expect(files.viewActivityAttachment).toHaveBeenCalledTimes(3)
  expect(screen.getByText('+2')).toBeInTheDocument()
  expect(screen.getByText('5 photos · 1 KB')).toBeInTheDocument()
  const allPhotos = screen.getByRole('button', { name: 'View all 5 photos' })
  await userEvent.click(allPhotos)
  const dialog = screen.getByRole('dialog', { name: 'Preview photo3.png' })
  await within(dialog).findByRole('img', { name: 'photo3.png' })
  expect(files.viewActivityAttachment).toHaveBeenCalledTimes(3)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Next photo' }))
  await screen.findByRole('img', { name: 'photo4.png' })
  await userEvent.keyboard('{ArrowRight}')
  await screen.findByRole('img', { name: 'photo5.png' })
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(allPhotos).toHaveFocus()
  expect(files.viewActivityAttachment).toHaveBeenCalledTimes(5)
})

test('closing a full-size image releases its preview URL while keeping the tile usable', async () => {
  vi.mocked(files.listActivityAttachments).mockResolvedValue([image])
  const view = render(<ActivityAttachments postId={post.id} />)
  const tile = await screen.findByRole('img', { name: 'photo.png' })
  const tileUrl = tile.getAttribute('src')
  await userEvent.click(screen.getByRole('button', { name: 'Open full-size photo.png' }))
  const dialog = screen.getByRole('dialog', { name: 'Preview photo.png' })
  const preview = await within(dialog).findByRole('img', { name: 'photo.png' })
  const previewUrl = preview.getAttribute('src')
  expect(files.viewActivityAttachment).toHaveBeenCalledTimes(1)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close preview' }))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(previewUrl)
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(tileUrl)
  expect(tile).toHaveAttribute('src', tileUrl)
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(tileUrl)
})

test('reuses fetched PDF bytes for downloading and contains modal keyboard focus', async () => {
  const pdf = { ...image, fileName: 'notes.pdf', contentType: 'application/pdf' }
  vi.mocked(files.listActivityAttachments).mockResolvedValue([pdf])
  vi.mocked(files.viewActivityAttachment).mockResolvedValue({ ...pdf, blob: new Blob(['abc'], { type: 'application/pdf' }) })
  render(<ActivityAttachments postId={post.id} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Preview notes.pdf' }))
  const dialog = screen.getByRole('dialog', { name: 'Preview notes.pdf' })
  await within(dialog).findByTitle('PDF preview of notes.pdf')
  const close = within(dialog).getByRole('button', { name: 'Close preview' })
  const download = within(dialog).getByRole('button', { name: 'Download notes.pdf' })
  expect(download).toBeEnabled()
  within(dialog).getByTitle('PDF preview of notes.pdf').focus()
  await userEvent.keyboard('{Tab}')
  expect(close).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('button', { name: 'Download notes.pdf' }))
  expect(files.viewActivityAttachment).toHaveBeenCalledTimes(1)
})

test('retries metadata errors independently and ignores aborted reads', async () => {
  vi.mocked(files.listActivityAttachments).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([image])
  const view = render(<ActivityAttachments postId={post.id} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Retry activity files' }))
  await screen.findByRole('img', { name: 'photo.png' })
  const signal = vi.mocked(files.listActivityAttachments).mock.calls[1][1]
  view.unmount()
  expect(signal?.aborted).toBe(true)
})

test('does not duplicate a file read on repeated download clicks and revokes download URLs', async () => {
  const doc = { ...image, fileName: 'notes.docx', contentType: 'application/octet-stream' }
  vi.mocked(files.listActivityAttachments).mockResolvedValue([doc])
  let finish!: (value: files.ActivityAttachmentContent) => void
  vi.mocked(files.viewActivityAttachment).mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(<ActivityAttachments postId={post.id} />)
  const download = await screen.findByRole('button', { name: 'Download notes.docx' })
  fireEvent.click(download); fireEvent.click(download)
  expect(files.viewActivityAttachment).toHaveBeenCalledTimes(1)
  await act(async () => finish({ ...doc, blob: new Blob(['abc']) }))
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled())
})

test('an aborted download cannot publish errors or unlock a newer download after a file refresh', async () => {
  const doc = { ...image, fileName: 'notes.docx', contentType: 'application/octet-stream' }
  vi.mocked(files.listActivityAttachments).mockResolvedValueOnce([doc]).mockResolvedValueOnce([{ ...doc }])
  let rejectOld!: (reason: unknown) => void, finishNew!: (value: files.ActivityAttachmentContent) => void
  vi.mocked(files.viewActivityAttachment).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject })).mockReturnValueOnce(new Promise(resolve => { finishNew = resolve }))
  const view = render(<ActivityAttachments postId={post.id} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Download notes.docx' }))
  view.rerender(<ActivityAttachments postId={post.id} revision={1} />)
  await waitFor(() => expect(files.listActivityAttachments).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download notes.docx' })).not.toBeDisabled())
  await userEvent.click(screen.getByRole('button', { name: 'Download notes.docx' }))
  await act(async () => rejectOld(new Error('aborted')))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Download notes.docx' })).toBeDisabled()
  await act(async () => finishNew({ ...doc, blob: new Blob(['abc']) }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download notes.docx' })).not.toBeDisabled())
})
