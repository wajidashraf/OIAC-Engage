import { useCallback, useEffect, useRef, useState } from 'react'
import { viewActivityAttachment, type ActivityAttachment, type ActivityAttachmentContent } from './activityAttachmentService'

type CachedRead = { promise: Promise<ActivityAttachmentContent>; signal: AbortSignal; pending: boolean }
export type ActivityFileCache = Map<string, CachedRead>
type Content = { result: ActivityAttachmentContent; url: string }
type Resource = {
  postId: string
  file: ActivityAttachment
  cache: ActivityFileCache
  controller: AbortController
  pending?: Promise<Content>
  data?: Content
}
type State = { resource: Resource | null; busy: boolean; error: boolean; data?: Content }

function release(resource: Resource) {
  resource.controller.abort()
  if (resource.data) { URL.revokeObjectURL(resource.data.url); resource.data = undefined }
}

export function downloadActivityContent(content: ActivityAttachmentContent) {
  const url = URL.createObjectURL(content.blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = content.fileName
  document.body.append(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function useActivityFileContent(postId: string, file: ActivityAttachment, cache: ActivityFileCache) {
  const current = useRef<Resource | null>(null)
  const [state, setState] = useState<State>({ resource: null, busy: false, error: false })

  const resourceForFile = useCallback(() => {
    let resource = current.current
    if (!resource || resource.postId !== postId || resource.file !== file || resource.cache !== cache || resource.controller.signal.aborted) {
      if (resource) release(resource)
      resource = { postId, file, cache, controller: new AbortController() }
      current.current = resource
      setState({ resource, busy: false, error: false })
    }
    return resource
  }, [postId, file, cache])

  useEffect(() => {
    const resource = resourceForFile()
    return () => release(resource)
  }, [resourceForFile])

  const load = useCallback((): Promise<Content> => {
    const resource = resourceForFile()
    if (resource.data) return Promise.resolve(resource.data)
    if (resource.pending) return resource.pending
    setState({ resource, busy: true, error: false })
    const key = JSON.stringify([postId, file.id, file.fileName, file.size, file.contentType])
    let entry = cache.get(key)
    if (!entry || (entry.pending && entry.signal.aborted)) {
      entry = { promise: viewActivityAttachment(postId, file, resource.controller.signal), signal: resource.controller.signal, pending: true }
      cache.set(key, entry)
      const ownedEntry = entry
      void entry.promise.then(() => { ownedEntry.pending = false }, () => { if (cache.get(key) === ownedEntry) cache.delete(key) })
    }
    resource.pending = entry.promise.then(result => {
      if (resource.controller.signal.aborted || current.current !== resource) throw new DOMException('File request cancelled', 'AbortError')
      const data = { result, url: URL.createObjectURL(result.blob) }
      resource.data = data
      setState({ resource, busy: false, error: false, data })
      return data
    }).catch((error: unknown) => {
      if (!resource.controller.signal.aborted && current.current === resource) setState({ resource, busy: false, error: true })
      throw error
    }).finally(() => { resource.pending = undefined })
    return resource.pending
  }, [postId, file, cache, resourceForFile])

  const active = state.resource === current.current && state.resource?.postId === postId && state.resource.file === file && state.resource.cache === cache && !state.resource.controller.signal.aborted
  return { load, busy: active && state.busy, error: active && state.error, data: active ? state.data : undefined }
}
