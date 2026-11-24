import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiDownload } from 'react-icons/fi'
import { activityAttachmentPreviewKind, listActivityAttachments, type ActivityAttachment } from './activityAttachmentService'
import { ActivityFileBadge, formatActivityFileSize } from './activityFilePresentation'
import { downloadActivityContent, useActivityFileContent, type ActivityFileCache } from './useActivityFileContent'
import ActivityFilePreview from './ActivityFilePreview'
import ActivityPhotoGallery from './ActivityPhotoGallery'

function DocumentRow({ postId, file }: { postId: string; file: ActivityAttachment }) {
  const cache = useMemo<ActivityFileCache>(() => new Map(), [postId, file])
  const { load, busy, error } = useActivityFileContent(postId, file, cache)
  const [trigger, setTrigger] = useState<HTMLElement | null>(null)
  const close = useCallback(() => setTrigger(null), [])
  const downloading = useRef<Promise<unknown> | null>(null)
  const isPdf = activityAttachmentPreviewKind(file) === 'pdf'
  async function download() {
    const request = load()
    if (downloading.current === request) return
    downloading.current = request
    try { const content = await request; downloadActivityContent(content.result) } catch { /* The active resource displays its error. */ }
    finally { if (downloading.current === request) downloading.current = null }
  }
  return <li className="ac-document">
    <button className="ac-document-open" type="button" disabled={!isPdf && busy} aria-label={`${isPdf ? 'Preview' : 'Download'} ${file.fileName}`} title={`${isPdf ? 'Preview' : 'Download'} ${file.fileName}`} onClick={event => isPdf ? setTrigger(event.currentTarget) : void download()}>
      <ActivityFileBadge fileName={file.fileName} compact /><span className="ac-document-name">{file.fileName}</span><small>{busy ? 'Loading…' : formatActivityFileSize(file.size)}</small>
    </button>
    {isPdf && <button className="ac-document-download" type="button" disabled={busy} title={`Download ${file.fileName}`} aria-label={`Download ${file.fileName}`} onClick={() => void download()}><FiDownload aria-hidden="true" /></button>}
    {error && <div className="ac-error" role="alert">This file could not be loaded. <button type="button" disabled={busy} onClick={() => void download()}>Retry {file.fileName}</button></div>}
    {trigger && <ActivityFilePreview postId={postId} files={[file]} cache={cache} onClose={close} returnFocusTo={trigger} />}
  </li>
}

export default function ActivityAttachments({ postId, revision = 0 }: { postId: string; revision?: number }) {
  const [files, setFiles] = useState<ActivityAttachment[]>([])
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (visible || !root.current) return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [visible])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController(); setError(false)
    void listActivityAttachments(postId, controller.signal).then(result => { if (!controller.signal.aborted) setFiles(result) }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [postId, revision, attempt, visible])
  const photos = useMemo(() => files.filter(file => activityAttachmentPreviewKind(file) === 'image'), [files])
  const documents = useMemo(() => files.filter(file => activityAttachmentPreviewKind(file) !== 'image'), [files])
  return <div className="ac-attachments" ref={root}>
    {error && <div className="ac-error" role="alert">Activity files could not be loaded. <button type="button" className="button button--quiet" onClick={() => setAttempt(value => value + 1)}>Retry activity files</button></div>}
    {photos.length > 0 && <ActivityPhotoGallery postId={postId} photos={photos} />}
    {documents.length > 0 && <ul className="ac-documents" aria-label="Activity documents">{documents.map(file => <DocumentRow key={file.id} postId={postId} file={file} />)}</ul>}
  </div>
}
