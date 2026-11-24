import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

// Local fixtures only. No calls reach Power Pages, SharePoint, or Dataverse.
const lostAck = process.argv.includes('--lost-ack')
const output = resolve(lostAck ? '.superpowers/activity-post-attachments/upload-confirmation/browser' : process.argv.includes('--thumbnails') ? '.superpowers/activity-post-ui/thumbnails/browser' : '.superpowers/activity-post-ui/browser')
await mkdir(output, { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 5193, strictPort: true, watch: { ignored: ['**/.superpowers/**'] } } })
await server.listen()
const browser = await chromium.launch({ channel: 'chromium', headless: true })
const author = { id: '11111111-1111-4111-8111-111111111111', name: 'Test User 12', jobTitle: 'Volunteer' }
const template = { author, createdOn: '2026-10-28T12:00:00Z', modifiedOn: '2026-10-28T12:00:00Z', isPinned: false, pinnedOn: null, pinnedById: null, rowVersion: '1', canDelete: true, canModerate: false }
const guid = index => `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`
const initial = [
  { ...template, id: guid(1), content: 'More photos from the meetup. Tap any photo to open it full size.' },
  { ...template, id: guid(2), content: "Photos from Saturday’s community meetup. Thank you to everyone who came out." },
  { ...template, id: guid(3), content: "Notes, schedule and budget draft from today’s call." },
  { ...template, id: guid(4), content: 'Two photos from our volunteer gathering.' },
]
const pdfText = 'BT /F1 16 Tf 24 140 Td (OIAC meeting notes) Tj ET'
const pdfObjects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`]
let pdfSource = '%PDF-1.4\n'
const offsets = [0]
for (const [index, object] of pdfObjects.entries()) { offsets.push(Buffer.byteLength(pdfSource)); pdfSource += `${index + 1} 0 obj\n${object}\nendobj\n` }
const xref = Buffer.byteLength(pdfSource)
pdfSource += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
const pdf = Buffer.from(pdfSource)
const summaries = []
try {
  const painter = await browser.newPage()
  const imageData = await painter.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 660
    const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 1000, 660)
    gradient.addColorStop(0, '#c4dfd3'); gradient.addColorStop(1, '#7baf98'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1000, 660)
    ctx.fillStyle = '#e8f0cf'; ctx.beginPath(); ctx.arc(760, 140, 65, 0, Math.PI * 2); ctx.fill()
    for (const [color, points] of [['#749d89', [[0, 460], [250, 210], [580, 510], [840, 280], [1000, 470]]], ['#315b47', [[0, 580], [340, 370], [600, 600], [870, 420], [1000, 530]]]]) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 660); for (const [x, y] of points) ctx.lineTo(x, y); ctx.lineTo(1000, 660); ctx.closePath(); ctx.fill()
    }
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await painter.close()
  const png = Buffer.from(imageData, 'base64')
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage(), faults = [], reads = []
    page.on('pageerror', error => faults.push(error.message))
    await page.addInitScript(author => { window.Microsoft = { Dynamic365: { Portal: { User: { userName: 'fixture@example.test', contactId: author.id, firstName: 'Test', lastName: 'User 12', userRoles: ['Authenticated Users'] } } } } }, author)
    let posts = [...initial], creates = 0, failedOnce = false
    const stored = new Map()
    function add(postId, name, size, type, bytes) {
      const entries = stored.get(postId) ?? []
      entries.push({ id: guid(100 + [...stored.values()].flat().length), fileName: name, size, contentType: type, contentBase64: bytes.toString('base64') }); stored.set(postId, entries)
    }
    for (let index = 1; index <= 5; index++) add(guid(1), `meetup-${index}.png`, png.length, 'image/png', png)
    add(guid(2), 'meetup-group.png', png.length, 'image/png', png)
    add(guid(3), 'oiac-meeting-notes.pdf', pdf.length, 'application/pdf', pdf)
    add(guid(3), 'volunteer-schedule.xlsx', 88064, 'application/octet-stream', Buffer.from('Spreadsheet fixture'))
    add(guid(3), 'budget-draft.docx', 319488, 'application/octet-stream', Buffer.from('Word fixture'))
    add(guid(3), 'uat-notes.txt', 11264, 'text/plain', Buffer.from('Text fixture'))
    for (let index = 1; index <= 2; index++) add(guid(4), `gathering-${index}.png`, png.length, 'image/png', png)
    await page.route('**/_layout/tokenhtml', route => route.fulfill({ contentType: 'text/html', body: '<input name="__RequestVerificationToken" value="local-test-token">' }))
    await page.route('**/_api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname
      assert.equal(new URL(req.url()).origin, 'http://127.0.0.1:5193')
      let result
      if (path.endsWith('/serverlogics/activity-channel')) {
        const { command, payload } = req.postDataJSON()
        if (command === 'feed') result = { ok: true, posts, nextLink: null, totalCount: posts.length, countUnavailable: false, currentUser: author, canModerate: false }
        else if (command === 'comments') result = { ok: true, comments: [], nextLink: null }
        else if (command === 'post') { creates++; const post = { ...template, id: payload.requestId, content: payload.content }; posts = [post, ...posts]; result = { ok: true, post } }
        else throw new Error(`Unexpected command ${command}`)
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
      }
      if (path.endsWith('/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f')) {
        assert.equal(req.headers()['__requestverificationtoken'], 'local-test-token')
        assert.equal(req.headers()['x-requested-with'], 'XMLHttpRequest')
        const input = JSON.parse(JSON.parse(req.postDataJSON().eventData).Input), current = stored.get(input.postId) ?? []
        if (input.operation === 'list') result = { ok: true, attachments: current.map(({ contentBase64, ...metadata }) => metadata) }
        let loseAcknowledgement = false
        if (input.operation === 'upload') {
          if (input.fileName === 'notes.pdf' && !failedOnce) { failedOnce = true; if (!lostAck) return route.fulfill({ status: 503 }); loseAcknowledgement = true }
          const file = { id: input.clientFileId, fileName: input.fileName, size: input.size, contentType: input.fileName.endsWith('.png') ? 'image/png' : 'application/pdf', contentBase64: input.contentBase64 }
          if (!current.some(existing => existing.id === file.id)) current.push(file)
          stored.set(input.postId, current); const { contentBase64, ...metadata } = file; result = { ok: true, attachment: metadata }
        }
        if (input.operation === 'view') { reads.push(input.fileName); const { contentBase64, ...metadata } = current.find(file => file.id === input.attachmentId); result = { ok: true, attachment: metadata, contentBase64 } }
        return route.fulfill({ status: loseAcknowledgement ? 202 : 200, contentType: 'application/json', body: JSON.stringify({ result: JSON.stringify(result) }) })
      }
      return route.fulfill({ status: 404, body: '{}' })
    })
    await page.goto('http://127.0.0.1:5193/activity/channel')
    const cards = page.getByRole('article', { name: 'Activity by Test User 12' })
    const collage = cards.filter({ hasText: initial[0].content })
    await collage.getByRole('img').first().waitFor()
    const borderWidths = await collage.evaluate(card => ({ card: getComputedStyle(card).borderLeftWidth, post: getComputedStyle(card.querySelector('.ac-post-section') ?? card.querySelector('.ac-post')).borderLeftWidth, discussion: getComputedStyle(card.querySelector('.ac-discussion')).borderLeftWidth }))
    assert.deepEqual(borderWidths, { card: '1px', post: '4px', discussion: '0px' }, 'Only the post section has the green left accent')
    const thumbnailBounds = await collage.locator('.ac-photo-tile').evaluateAll(tiles => tiles.map(tile => { const bounds = tile.getBoundingClientRect(); return { width: bounds.width, height: bounds.height } }))
    assert(thumbnailBounds.every(bounds => bounds.width <= 350 && bounds.height <= 350), 'Photo thumbnails must fit within 350 × 350 px')
    assert.equal(await collage.getByRole('img').count(), 3)
    assert.equal(reads.includes('meetup-4.png'), false)
    await collage.screenshot({ path: resolve(output, `collage-${width}.png`) })
    const allPhotos = collage.getByRole('button', { name: 'View all 5 photos' })
    await allPhotos.click()
    await page.getByRole('dialog').getByRole('img', { name: 'meetup-3.png' }).waitFor()
    await page.getByRole('button', { name: 'Next photo' }).click()
    await page.getByRole('dialog').getByRole('img', { name: 'meetup-4.png' }).waitFor()
    await page.keyboard.press('ArrowRight')
    await page.getByRole('dialog').getByRole('img', { name: 'meetup-5.png' }).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await allPhotos.evaluate(el => document.activeElement === el), true)
    const single = cards.filter({ hasText: initial[1].content })
    await single.scrollIntoViewIfNeeded(); await single.getByRole('img').waitFor()
    const alignment = await single.locator('.ac-photo-gallery').evaluate(gallery => { const tile = gallery.querySelector('.ac-photo-tile').getBoundingClientRect(), parent = gallery.getBoundingClientRect(); return { offset: Math.abs(tile.x + tile.width / 2 - parent.x - parent.width / 2), width: tile.width, height: tile.height } })
    assert(alignment.offset <= 1 && alignment.width <= 350 && alignment.height <= 350, 'A single photo thumbnail is horizontally centered and bounded')
    await single.screenshot({ path: resolve(output, `single-${width}.png`) })
    const download = page.waitForEvent('download'); await single.getByRole('button', { name: 'Download meetup-group.png' }).click(); assert.equal((await download).suggestedFilename(), 'meetup-group.png')
    const docs = cards.filter({ hasText: initial[2].content })
    await docs.scrollIntoViewIfNeeded(); await docs.getByRole('button', { name: 'Preview oiac-meeting-notes.pdf' }).waitFor()
    const badges = await docs.locator('.ac-document .ac-file-badge').evaluateAll(items => items.map(item => ({ width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height })))
    assert(badges.length === 4 && badges.every(badge => badge.width === 28 && badge.height === 28), 'Posted document chips use small type icons matching the reference')
    const commentForm = docs.getByRole('form', { name: 'Add Comment' })
    const commentField = await commentForm.getByRole('textbox', { name: 'Comment content' }).boundingBox(), commentButton = await commentForm.getByRole('button', { name: 'Post Comment' }).boundingBox()
    assert(Math.abs(commentField.y - commentButton.y) <= 1 && commentField.x + commentField.width <= commentButton.x, 'The comment field and Post Comment button share one row')
    assert.equal(reads.includes('oiac-meeting-notes.pdf'), false)
    await docs.screenshot({ path: resolve(output, `documents-${width}.png`) })
    await docs.getByRole('button', { name: 'Preview oiac-meeting-notes.pdf' }).click()
    const frame = await (await page.getByTitle('PDF preview of oiac-meeting-notes.pdf').elementHandle()).contentFrame()
    await frame.locator('link[href*="pdf_embedder.css"]').waitFor({ state: 'attached' })
    const modalAxe = await new AxeBuilder({ page }).include('.ac-file-preview').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    assert.deepEqual(modalAxe.violations.map(v => v.id), [])
    await page.getByRole('button', { name: 'Close preview' }).click()
    const docDownload = page.waitForEvent('download'); await docs.getByRole('button', { name: 'Download oiac-meeting-notes.pdf' }).click(); await docDownload
    assert.equal(reads.filter(name => name === 'oiac-meeting-notes.pdf').length, 1)
    const pair = cards.filter({ hasText: initial[3].content })
    await pair.scrollIntoViewIfNeeded(); await pair.getByRole('img').first().waitFor()
    assert.equal(await pair.getByRole('img').count(), 2)
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click()
    await page.getByRole('textbox', { name: 'Activity content' }).fill("Notes and photos from today’s volunteer call are attached below.")
    let chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Photo', exact: true }).click(); await (await chooser).setFiles([{ name: 'photo.png', mimeType: 'image/png', buffer: png }])
    chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Document', exact: true }).click(); await (await chooser).setFiles([{ name: 'notes.pdf', mimeType: 'application/pdf', buffer: pdf }])
    const chipBox = await page.getByRole('list', { name: 'Selected activity files' }).boundingBox(), buttonBox = await page.getByRole('button', { name: 'Photo', exact: true }).boundingBox()
    assert(chipBox.y + chipBox.height <= buttonBox.y)
    await page.getByRole('form', { name: 'Create Activity' }).screenshot({ path: resolve(output, `composer-${width}.png`) })
    await page.getByRole('button', { name: 'Post Activity', exact: true }).click()
    if (!lostAck) {
      await page.getByText(/Your activity was posted, but some files/).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Photo', exact: true }).isDisabled(), true)
      await page.getByRole('button', { name: 'Post Activity', exact: true }).click()
    }
    await page.getByText('Activity and files posted.', { exact: true }).waitFor()
    assert.equal(creates, 1)
    await page.reload()
    const mixed = cards.filter({ hasText: "Notes and photos from today’s volunteer call are attached below." })
    await mixed.scrollIntoViewIfNeeded()
    await mixed.getByRole('img').waitFor(); await mixed.getByRole('button', { name: 'Preview notes.pdf' }).waitFor()
    assert.equal(await mixed.getByRole('img').evaluate(el => el.complete && el.naturalWidth > 0), true)
    assert.equal(await page.getByRole('form', { name: 'Add Comment' }).first().locator('input[type=file]').count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const axe = await new AxeBuilder({ page }).include('.activity-channel').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [])
    assert.deepEqual(faults, [])
    summaries.push({ width, ...(lostAck ? { lostUploadAcknowledgementRecovered: true, falseUploadWarning: false } : {}), postOnlyAccent: true, centered350pxThumbnails: true, compactDocumentChips: true, commentInputAndButtonOneRow: true, composerChipsAboveButtons: true, photoChooser: true, documentChooser: true, photoCounts: [1, 2, 5], galleryHiddenPhotos: true, modalFocusReturn: true, nativePdfViewer: true, cachedPdfDownload: true, retryCreates: creates, reloadMixedPost: true, commentAttachments: false, overflow: false, axeViolations: 0 })
    await context.close()
  }
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(summaries, null, 2))
  console.log(JSON.stringify({ output, summaries }, null, 2))
} finally { await browser.close(); await server.close() }
