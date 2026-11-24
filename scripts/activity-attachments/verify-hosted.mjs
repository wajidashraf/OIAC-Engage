import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('.superpowers/activity-post-attachments/hosted')
await mkdir(output, { recursive: true })
const statePath = resolve(output, 'fixture-state.json')
const browser = await chromium.connectOverCDP('http://127.0.0.1:9337')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII=', 'base64')
const stream = 'BT /F1 16 Tf 24 140 Td (OIAC UAT attachment check) Tj ET'
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
let source = '%PDF-1.4\n'
const offsets = []
for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n` }
const xref = Buffer.byteLength(source)
source += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
const fixtures = [
  { name: 'uat-image.png', mimeType: 'image/png', buffer: png },
  { name: 'uat-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(source) },
  { name: 'uat-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('OIAC Test/UAT attachment verification.\n') },
]
const expected = new Map(fixtures.map(file => [file.name, file.buffer]))
const endpoint = '/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f'
let state = { marker: `OIAC-ATTACHMENT-VERIFICATION-${Date.now()}`, postId: null }
const retry = process.argv.includes('--retry')
try {
  const context = browser.contexts()[0]
  if (retry) state = JSON.parse(await readFile(statePath, 'utf8'))
  let page
  if (retry) {
    for (const candidate of context.pages()) if (await candidate.evaluate(() => window.__oiacAttachmentTestMarker).catch(() => null) === state.marker) { page = candidate; break }
    assert(page, 'The retained test draft is unavailable; no new activity was created')
  } else {
    page = await context.newPage()
    await page.goto('https://oiac-engage-test.powerappsportals.com/activity/channel', { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Activity Channel', exact: true }).waitFor()
    await page.evaluate(marker => { window.__oiacAttachmentTestMarker = marker }, state.marker)
    await writeFile(statePath, JSON.stringify(state, null, 2))
  }
  const transfers = [], pending = []
  page.on('response', response => {
    if (!response.url().endsWith(endpoint)) return
    pending.push((async () => {
      let request, result
      try {
        request = JSON.parse(JSON.parse(response.request().postDataJSON().eventData).Input)
        let envelope = JSON.parse(await response.text())
        if (typeof envelope === 'string') envelope = JSON.parse(envelope)
        result = typeof envelope.result === 'string' ? JSON.parse(envelope.result) : envelope.result
      } catch { transfers.push({ status: response.status(), parseError: true }); return }
      if (request.operation === 'upload') { state.postId = request.postId; await writeFile(statePath, JSON.stringify(state, null, 2)) }
      const entry = { operation: request.operation, fileName: request.fileName, status: response.status(), ok: result?.ok, error: result?.error, attachment: result?.attachment, diagnostic: result?.diagnostic }
      if (result?.contentBase64 && result?.attachment && expected.has(result.attachment.fileName)) entry.exactBytes = expected.get(result.attachment.fileName).equals(Buffer.from(result.contentBase64, 'base64'))
      transfers.push(entry)
    })())
  })
  if (!retry) {
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click()
    await page.getByRole('textbox', { name: 'Activity content' }).fill(`${state.marker}\nAttachment upload verification in Test/UAT: image, PDF, and text document.`)
    await page.getByLabel('Attach files to activity').setInputFiles(fixtures)
  }
  await page.getByRole('button', { name: 'Post Activity', exact: true }).click()
  const outcome = await Promise.race([
    page.getByText('Activity and files posted.', { exact: true }).waitFor({ timeout: 120000 }).then(() => 'posted'),
    page.getByText(/Your activity was posted, but some files/).waitFor({ timeout: 120000 }).then(() => 'upload-failed'),
  ])
  await Promise.allSettled(pending)
  await writeFile(resolve(output, 'transfer-results.json'), JSON.stringify({ outcome, state, transfers }, null, 2))
  console.log(JSON.stringify({ outcome, state, transfers }, null, 2))
  assert.equal(outcome, 'posted', 'Test files did not finish uploading; the existing test draft is retained')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const card = page.getByRole('article').filter({ hasText: state.marker })
  await card.getByRole('img', { name: 'uat-image.png', exact: true }).waitFor({ timeout: 60000 })
  await card.getByRole('button', { name: 'Preview uat-notes.pdf' }).click()
  await card.getByTitle('PDF preview of uat-notes.pdf').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Close preview', exact: true }).click()
  assert.equal(await card.getByRole('img', { name: 'uat-image.png', exact: true }).evaluate(image => image.complete && image.naturalWidth > 0), true)
  const download = page.waitForEvent('download', { timeout: 60000 })
  await card.getByRole('button', { name: 'Download uat-notes.txt' }).click()
  assert.equal((await download).suggestedFilename(), 'uat-notes.txt')
  await Promise.allSettled(pending)
  const reads = transfers.filter(transfer => transfer.operation === 'view' && transfer.exactBytes === true)
  assert.deepEqual([...new Set(reads.map(read => read.attachment.fileName))].sort(), fixtures.map(file => file.name).sort())
  const proof = { verifiedAt: new Date().toISOString(), marker: state.marker, postId: state.postId, realUpload: 'passed', reloadRetrieval: 'passed', exactFileBytes: 'passed-for-image-pdf-text', files: fixtures.map(file => ({ name: file.name, size: file.buffer.length })), transfers }
  await writeFile(resolve(output, 'verified.json'), JSON.stringify(proof, null, 2))
  console.log(JSON.stringify(proof, null, 2))
} finally { await browser.close() }
