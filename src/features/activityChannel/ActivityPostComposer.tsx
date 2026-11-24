import { useId, useRef, useState } from 'react'
import { FiFileText, FiImage, FiX } from 'react-icons/fi'
import ActivityComposer from './ActivityComposer'
import type { ActivityAuthor, ActivityPost } from './activityTypes'
import { selectActivityAttachmentFiles, uploadActivityAttachment } from './activityAttachmentService'
import { ActivityFileBadge, formatActivityFileSize } from './activityFilePresentation'

type Props = {
  author: ActivityAuthor
  onCreate: (content: string, requestId: string) => Promise<ActivityPost>
  onAttachmentsSaved: (postId: string) => void | Promise<void>
}

export default function ActivityPostComposer({ author, onCreate, onAttachmentsSaved }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [uploaded, setUploaded] = useState<ReadonlySet<File>>(new Set())
  const confirmed = useRef<{ requestId: string; post: ActivityPost } | null>(null)
  const fileIds = useRef(new WeakMap<File, string>())
  const succeeded = useRef(new Set<File>())
  const photoInput = useRef<HTMLInputElement>(null), documentInput = useRef<HTMLInputElement>(null)
  const photoId = useId(), documentId = useId(), helpId = useId()

  async function save(content: string, requestId: string) {
    if (!confirmed.current || confirmed.current.requestId !== requestId) {
      const post = await onCreate(content, requestId)
      confirmed.current = { requestId, post }
    }
    const postId = confirmed.current.post.id
    let failed = false
    for (const file of files) {
      if (succeeded.current.has(file)) continue
      let fileId = fileIds.current.get(file)
      if (!fileId) { fileId = crypto.randomUUID(); fileIds.current.set(file, fileId) }
      try {
        await uploadActivityAttachment(postId, file, fileId)
        succeeded.current.add(file)
        setUploaded(new Set(succeeded.current))
      } catch { failed = true }
    }
    if (failed) throw new Error('Your activity was posted, but some files could not be confirmed. Retry to check the uploads without posting another activity.')
    if (files.length) await onAttachmentsSaved(postId)
  }

  function reset() {
    setFiles([]); setErrors([]); setUploaded(new Set())
    succeeded.current.clear(); confirmed.current = null
    fileIds.current = new WeakMap()
  }

  function select(input: HTMLInputElement) {
    const selection = selectActivityAttachmentFiles(files, Array.from(input.files ?? []))
    setFiles(selection.files); setErrors(selection.errors); input.value = ''
  }

  return <ActivityComposer kind="Activity" author={author} collapsible onSave={save} onSaved={reset}
    renderActivityAttachments={locked => <>
      {errors.length > 0 && <ul role="alert" className="ac-error">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
      {files.length > 0 && <div className="ac-selected-attachments"><p className="ac-attachment-count">Attached · {files.length} {files.length === 1 ? 'file' : 'files'}</p>
        <ul className="ac-selected-files" aria-label="Selected activity files">{files.map(file => <li key={file.name.toLowerCase()}>
          <ActivityFileBadge fileName={file.name} compact /><span className="ac-file-chip-name" title={file.name}>{file.name}</span><small>{uploaded.has(file) ? 'Uploaded' : formatActivityFileSize(file.size)}</small>
          <button type="button" className="ac-file-chip-remove" aria-label={`Remove ${file.name}`} disabled={locked} onClick={() => setFiles(current => current.filter(selected => selected !== file))}><FiX aria-hidden="true" /></button>
        </li>)}</ul>
      </div>}
    </>}
    renderActivityActions={locked => <>
      <input ref={photoInput} id={photoId} className="ac-sr" tabIndex={-1} type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.avif,.bmp" aria-label="Attach photos to activity" aria-describedby={helpId} disabled={locked} onChange={event => select(event.currentTarget)} />
      <input ref={documentInput} id={documentId} className="ac-sr" tabIndex={-1} type="file" multiple aria-label="Attach files to activity" aria-describedby={helpId} disabled={locked} onChange={event => select(event.currentTarget)} />
      <button type="button" className="ac-attach-button" disabled={locked} onClick={() => photoInput.current?.click()}><FiImage aria-hidden="true" /> Photo</button>
      <button type="button" className="ac-attach-button" disabled={locked} onClick={() => documentInput.current?.click()}><FiFileText aria-hidden="true" /> Document</button>
    </>}
    activityHelp={<p id={helpId} className="ac-file-help">Images, PDFs and documents · up to 10 files, 10 MB each · Visible to the OIAC community</p>}
  />
}
