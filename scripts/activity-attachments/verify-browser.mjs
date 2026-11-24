import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

// Local-only identities and records; this harness never calls a cloud endpoint.
const output = resolve('.superpowers/activity-post-attachments/browser')
await mkdir(output, { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 5192, strictPort: true, watch: { ignored: ['**/.superpowers/**'] } } })
await server.listen()
const browser = await chromium.launch({ channel: 'chromium', headless: true })
const author = { id: '11111111-1111-4111-8111-111111111111', name: 'Sara Rahimi', jobTitle: 'Volunteer' }
const original = { id: '22222222-2222-4222-8222-222222222222', content: 'Community outreach update with attached documents.', author, createdOn: '2026-10-28T10:00:00Z', modifiedOn: '2026-10-28T10:00:00Z', isPinned: false, pinnedOn: null, pinnedById: null, rowVersion: '1', canDelete: true, canModerate: true }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII=', 'base64')
const pdfText = 'BT /F1 16 Tf 24 140 Td (Activity attachment verification) Tj ET'
const pdfObjects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`]
let pdfSource = '%PDF-1.4\n'
const offsets = [0]
for (const [index, object] of pdfObjects.entries()) { offsets.push(Buffer.byteLength(pdfSource)); pdfSource += `${index + 1} 0 obj\n${object}\nendobj\n` }
const xref = Buffer.byteLength(pdfSource)
pdfSource += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
const pdf = Buffer.from(pdfSource)
const summaries = []
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    const faults = []
    page.on('pageerror', error => faults.push(error.message))
    await page.addInitScript(author => { window.Microsoft = { Dynamic365: { Portal: { User: { userName: 'local-fixture@example.test', contactId: author.id, firstName: 'Sara', lastName: 'Rahimi', userRoles: ['Authenticated Users', 'Administrators'] } } } } }, author)
    let posts = [original], creates = 0, failedOnce = false
    const attachments = new Map()
    await page.route('**/_layout/tokenhtml', route => route.fulfill({ contentType: 'text/html', body: '<input name="__RequestVerificationToken" value="local-test-token">' }))
    await page.route('**/_api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname
      assert.equal(new URL(req.url()).origin, 'http://127.0.0.1:5192')
      let result
      if (path.endsWith('/serverlogics/activity-channel')) {
        const { command, payload } = req.postDataJSON()
        if (command === 'feed') result = { ok: true, posts, nextLink: null, totalCount: posts.length, countUnavailable: false, currentUser: author, canModerate: true }
        else if (command === 'comments') result = { ok: true, comments: [], nextLink: null }
        else if (command === 'post') { creates++; const post = { ...original, id: payload.requestId, content: payload.content }; posts = [post, ...posts]; result = { ok: true, post } }
        else throw new Error(`Unexpected native command ${command}`)
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
      }
      if (path.endsWith('/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f')) {
        assert.equal(req.headers()['__requestverificationtoken'], 'local-test-token')
        assert.equal(req.headers()['x-requested-with'], 'XMLHttpRequest')
        const input = JSON.parse(JSON.parse(req.postDataJSON().eventData).Input)
        const current = attachments.get(input.postId) ?? []
        if (input.operation === 'list') result = { ok: true, attachments: current.map(({ contentBase64, ...metadata }) => metadata) }
        if (input.operation === 'upload') {
          if (input.fileName === 'notes.pdf' && !failedOnce) { failedOnce = true; return route.fulfill({ status: 503 }) }
          const file = { id: input.clientFileId, fileName: input.fileName, size: input.size, contentType: input.fileName.endsWith('.png') ? 'image/png' : 'application/pdf', contentBase64: input.contentBase64 }
          if (!current.some(existing => existing.id === file.id)) current.push(file)
          attachments.set(input.postId, current)
          const { contentBase64, ...metadata } = file
          result = { ok: true, attachment: metadata }
        }
        if (input.operation === 'view') { const file = current.find(file => file.id === input.attachmentId); const { contentBase64, ...metadata } = file; result = { ok: true, attachment: metadata, contentBase64 } }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: JSON.stringify(result) }) })
      }
      return route.fulfill({ status: 404, body: '{}' })
    })
    await page.goto('http://127.0.0.1:5192/activity/channel')
    await page.getByText(original.content, { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click()
    await page.getByRole('textbox', { name: 'Activity content' }).fill('A new update with an image and meeting notes.')
    await page.getByLabel('Attach files to activity').setInputFiles([{ name: 'photo.png', mimeType: 'image/png', buffer: png }, { name: 'notes.pdf', mimeType: 'application/pdf', buffer: pdf }])
    await page.screenshot({ path: resolve(output, `composer-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Post Activity', exact: true }).click()
    await page.getByText(/Your activity was posted, but some files/).waitFor()
    await page.getByRole('button', { name: 'Post Activity', exact: true }).click()
    await page.getByText('Activity and files posted.', { exact: true }).waitFor()
    assert.equal(creates, 1)
    await page.getByRole('img', { name: 'photo.png', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Preview notes.pdf', exact: true }).click()
    await page.getByTitle('PDF preview of notes.pdf').waitFor()
    const pdfElement = await page.getByTitle('PDF preview of notes.pdf').elementHandle()
    const pdfFrame = await pdfElement.contentFrame()
    await pdfFrame.locator('link[href*="pdf_embedder.css"]').waitFor({ state: 'attached' })
    await writeFile(resolve(output, `pdf-frame-${width}.txt`), await pdfFrame.content())
    await page.getByRole('button', { name: 'Close preview', exact: true }).click()
    await page.reload()
    await page.getByRole('img', { name: 'photo.png', exact: true }).waitFor()
    assert.equal(await page.getByRole('img', { name: 'photo.png', exact: true }).evaluate(img => img.complete && img.naturalWidth > 0), true)
    assert.equal(await page.getByRole('form', { name: 'Add Comment' }).first().locator('input[type=file]').count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const axe = await new AxeBuilder({ page }).include('.activity-channel').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    assert.deepEqual(axe.violations.map(violation => violation.id), [])
    assert.deepEqual(faults, [])
    await page.screenshot({ path: resolve(output, `posts-${width}.png`), fullPage: true })
    summaries.push({ width, creates, persistedFiles: [...attachments.values()].flat().length, reloadImage: 'passed', pdfViewer: 'loaded', commentAttachments: false, overflow: false, axeViolations: 0 })
    await context.close()
  }
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(summaries, null, 2))
  console.log(JSON.stringify({ output, summaries }, null, 2))
} finally { await browser.close(); await server.close() }
