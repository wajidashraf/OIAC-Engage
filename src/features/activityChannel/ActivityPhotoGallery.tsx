import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiDownload, FiImage } from 'react-icons/fi'
import type { ActivityAttachment } from './activityAttachmentService'
import ActivityFilePreview from './ActivityFilePreview'
import { formatActivityFileSize } from './activityFilePresentation'
import { downloadActivityContent, useActivityFileContent, type ActivityFileCache } from './useActivityFileContent'

function PhotoTile({ postId, file, cache, extra, total, single, onOpen }: {
  postId: string; file: ActivityAttachment; cache: ActivityFileCache; extra: number; total: number; single: boolean; onOpen: (trigger: HTMLElement) => void
}) {
  const { load, data, busy, error } = useActivityFileContent(postId, file, cache)
  useEffect(() => { void load().catch(() => {}) }, [load])
  return <div className="ac-photo-tile">
    <button type="button" className="ac-photo-open" aria-label={extra ? `View all ${total} photos` : `Open full-size ${file.fileName}`} onClick={event => onOpen(event.currentTarget)}>
      {data ? <img src={data.url} alt={file.fileName} /> : <span className="ac-photo-placeholder"><FiImage aria-hidden="true" /><span>{error ? 'Photo unavailable — open to retry' : busy ? 'Loading photo…' : file.fileName}</span></span>}
      {extra > 0 && <span className="ac-photo-more" aria-hidden="true">+{extra}</span>}
    </button>
    {single && <><button className="ac-photo-download" type="button" disabled={busy} aria-label={`Download ${file.fileName}`} onClick={() => void load().then(content => downloadActivityContent(content.result)).catch(() => {})}><FiDownload aria-hidden="true" /></button><span className="ac-photo-caption">{file.fileName} · {formatActivityFileSize(file.size)}</span></>}
  </div>
}

export default function ActivityPhotoGallery({ postId, photos }: { postId: string; photos: ActivityAttachment[] }) {
  const cache = useMemo<ActivityFileCache>(() => new Map(), [photos])
  const [preview, setPreview] = useState<{ index: number; trigger: HTMLElement } | null>(null)
  const close = useCallback(() => setPreview(null), [])
  return <div className="ac-photo-gallery">
    <div className={`ac-photo-grid ac-photo-grid--${Math.min(photos.length, 3)}`}>
      {photos.slice(0, 3).map((file, index) => <PhotoTile key={file.id} postId={postId} file={file} cache={cache} single={photos.length === 1} total={photos.length} extra={index === 2 ? photos.length - 3 : 0} onOpen={trigger => setPreview({ index, trigger })} />)}
    </div>
    {photos.length > 1 && <p className="ac-photo-summary">{photos.length} photos · {formatActivityFileSize(photos.reduce((sum, file) => sum + file.size, 0))}</p>}
    {preview && <ActivityFilePreview postId={postId} files={photos} initialIndex={preview.index} cache={cache} onClose={close} returnFocusTo={preview.trigger} />}
  </div>
}
