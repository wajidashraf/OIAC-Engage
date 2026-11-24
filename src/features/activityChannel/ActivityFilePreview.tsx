import { useEffect, useId, useRef, useState } from 'react'
import { FiChevronLeft, FiChevronRight, FiDownload, FiX } from 'react-icons/fi'
import type { ActivityAttachment } from './activityAttachmentService'
import { activityAttachmentPreviewKind } from './activityAttachmentService'
import { downloadActivityContent, useActivityFileContent, type ActivityFileCache } from './useActivityFileContent'

export default function ActivityFilePreview({ postId, files, initialIndex = 0, cache, onClose, returnFocusTo }: {
  postId: string; files: readonly ActivityAttachment[]; initialIndex?: number; cache: ActivityFileCache; onClose: () => void; returnFocusTo: HTMLElement | null
}) {
  const [index, setIndex] = useState(initialIndex)
  const file = files[index]
  const { load, busy, error, data } = useActivityFileContent(postId, file, cache)
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const image = activityAttachmentPreviewKind(file) === 'image'
  const gallery = image && files.length > 1
  useEffect(() => { void load().catch(() => {}) }, [load])
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (typeof element.showModal === 'function') element.showModal()
    else element.setAttribute('open', '')
    close.current?.focus()
    return () => {
      if (typeof element.close === 'function') element.close()
      document.body.style.overflow = overflow
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
    }
  }, [returnFocusTo])
  function move(delta: number) { setIndex(value => (value + delta + files.length) % files.length) }
  return <dialog ref={dialog} className="ac-file-preview" aria-modal="true" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (gallery && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],iframe,[tabindex="0"]') ?? [])
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <header className="ac-file-preview-header"><h2 id={titleId}>Preview {file.fileName}</h2><button ref={close} type="button" className="ac-preview-close" aria-label="Close preview" onClick={onClose}><FiX aria-hidden="true" /></button></header>
    <div className="ac-file-preview-toolbar">
      {gallery && <div className="ac-gallery-navigation"><button type="button" aria-label="Previous photo" onClick={() => move(-1)}><FiChevronLeft aria-hidden="true" /></button><span aria-live="polite">Photo {index + 1} of {files.length}</span><button type="button" aria-label="Next photo" onClick={() => move(1)}><FiChevronRight aria-hidden="true" /></button></div>}
      <button type="button" className="ac-file-download" disabled={!data} aria-label={`Download ${file.fileName}`} onClick={() => { if (data) downloadActivityContent(data.result) }}><FiDownload aria-hidden="true" /> Download</button>
    </div>
    <div className="ac-file-preview-body">
      {busy && <p role="status">Loading {file.fileName}…</p>}
      {error && <div className="ac-error" role="alert">This file could not be loaded. <button type="button" onClick={() => void load().catch(() => {})}>Retry preview</button></div>}
      {data && (image ? <img src={data.url} alt={file.fileName} /> : <iframe src={data.url} title={`PDF preview of ${file.fileName}`} />)}
    </div>
  </dialog>
}
