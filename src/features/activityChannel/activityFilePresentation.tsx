import { FiImage } from 'react-icons/fi'

const fileTypes: Record<string, { label: string; tone: string }> = {
  pdf: { label: 'PDF', tone: 'pdf' },
  xls: { label: 'Spreadsheet', tone: 'sheet' },
  xlsx: { label: 'Spreadsheet', tone: 'sheet' },
  csv: { label: 'Spreadsheet', tone: 'sheet' },
  doc: { label: 'Word document', tone: 'word' },
  docx: { label: 'Word document', tone: 'word' },
  txt: { label: 'Text file', tone: 'text' },
  rtf: { label: 'Text document', tone: 'text' },
}
const photoExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'])

export function formatActivityFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.ceil(size / 1024))} KB`
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(size / (1024 * 1024))} MB`
}

export function describeActivityFile(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (photoExtensions.has(extension)) return { badge: '', label: 'Image', tone: 'image' }
  const type = Object.prototype.hasOwnProperty.call(fileTypes, extension) ? fileTypes[extension] : { label: 'Document', tone: 'file' }
  return { ...type, badge: extension.length > 0 && extension.length <= 5 ? extension.toUpperCase() : 'FILE' }
}

export function ActivityFileBadge({ fileName, compact = false }: { fileName: string; compact?: boolean }) {
  const type = describeActivityFile(fileName)
  return <span aria-hidden="true" className={`ac-file-badge ac-file-badge--${type.tone}${compact ? ' ac-file-badge--compact' : ''}`}>
    {type.tone === 'image' ? <FiImage /> : type.badge}
  </span>
}
