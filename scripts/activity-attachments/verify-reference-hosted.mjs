import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const thumbnails = process.argv.includes('--thumbnails')
const output = resolve(thumbnails ? '.superpowers/activity-post-ui/thumbnails/hosted' : '.superpowers/activity-post-ui/hosted')
await mkdir(output, { recursive: true })
const browser = await chromium.connectOverCDP('http://127.0.0.1:9337')
const page = await browser.contexts()[0].newPage()
const endpoint = '/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f'
const transfers = [], pending = [], mutations = [], faults = []
page.on('pageerror', error => faults.push(error.message))
page.on('request', request => {
  if (request.url().endsWith('/serverlogics/activity-channel')) {
    const body = request.postDataJSON()
    if (!['feed', 'comments'].includes(body.command)) mutations.push(body.command)
  }
})
page.on('response', response => {
  if (!response.url().endsWith(endpoint)) return
  pending.push((async () => {
    const input = JSON.parse(JSON.parse(response.request().postDataJSON().eventData).Input)
    if (input.operation === 'upload') mutations.push('upload')
    let envelope = await response.json()
    if (typeof envelope === 'string') envelope = JSON.parse(envelope)
    const result = typeof envelope.result === 'string' ? JSON.parse(envelope.result) : envelope.result
    transfers.push({ operation: input.operation, fileName: input.fileName, status: response.status(), ok: result.ok, returnedSize: result.attachment?.size })
  })().catch(error => { transfers.push({ operation: 'read-response', status: response.status(), parseError: error.message }) }))
})
try {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.goto(`https://oiac-engage-test.powerappsportals.com/activity/channel?attachment-layout=${Date.now()}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Create Activity', exact: true }).click()
  await page.getByRole('button', { name: 'Photo', exact: true }).waitFor({ timeout: 60000 })
  await page.getByRole('textbox', { name: 'Activity content' }).fill('Attachment layout verification — unsaved local draft.')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII=', 'base64')
  let chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Photo', exact: true }).click(); await (await chooser).setFiles({ name: 'ui-check.png', mimeType: 'image/png', buffer: png })
  chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Document', exact: true }).click(); await (await chooser).setFiles({ name: 'ui-check.txt', mimeType: 'text/plain', buffer: Buffer.from('UI verification') })
  await page.getByText('Attached · 2 files', { exact: true }).waitFor()
  const chips = await page.getByRole('list', { name: 'Selected activity files' }).boundingBox(), toolbar = await page.getByRole('button', { name: 'Photo', exact: true }).boundingBox()
  assert(chips.y + chips.height <= toolbar.y)
  await page.getByRole('form', { name: 'Create Activity' }).screenshot({ path: resolve(output, 'composer.png') })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const card = page.getByRole('article').filter({ hasText: 'OIAC-ATTACHMENT-VERIFICATION-1793189600554' })
  await card.scrollIntoViewIfNeeded()
  const photo = card.getByRole('img', { name: 'uat-image.png', exact: true })
  await photo.waitFor({ timeout: 60000 })
  assert.equal(await photo.evaluate(img => img.complete && img.naturalWidth > 0), true)
  if (thumbnails) {
    const layout = await card.evaluate(card => {
      const tile = card.querySelector('.ac-photo-tile').getBoundingClientRect(), gallery = card.querySelector('.ac-photo-gallery').getBoundingClientRect()
      return { cardBorder: getComputedStyle(card).borderLeftWidth, postBorder: getComputedStyle(card.querySelector('.ac-post-section')).borderLeftWidth, discussionBorder: getComputedStyle(card.querySelector('.ac-discussion')).borderLeftWidth, width: tile.width, height: tile.height, centerOffset: Math.abs(tile.x + tile.width / 2 - gallery.x - gallery.width / 2) }
    })
    // Chromium rounds thin borders to physical pixels at the retained browser's Windows display scale.
    assert(Number.parseFloat(layout.cardBorder) > 0 && Number.parseFloat(layout.cardBorder) <= 1)
    assert(Math.abs(Number.parseFloat(layout.postBorder) - 4) < 1)
    assert.equal(layout.discussionBorder, '0px')
    assert(layout.width <= 350 && layout.height <= 350 && layout.centerOffset <= 1)
    const comment = card.getByRole('form', { name: 'Add Comment' }), fieldBounds = await comment.getByRole('textbox').boundingBox(), buttonBounds = await comment.getByRole('button', { name: 'Post Comment' }).boundingBox()
    assert(Math.abs(fieldBounds.y - buttonBounds.y) <= 1 && fieldBounds.x + fieldBounds.width <= buttonBounds.x)
    assert(await card.locator('.ac-document .ac-file-badge').evaluateAll(items => items.length === 2 && items.every(item => Math.abs(item.getBoundingClientRect().width - 28) < .25)))
  }
  await card.getByRole('button', { name: 'Open full-size uat-image.png' }).click()
  await page.getByRole('dialog').getByRole('img', { name: 'uat-image.png', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await card.getByRole('button', { name: 'Preview uat-notes.pdf' }).click()
  const iframe = await page.getByTitle('PDF preview of uat-notes.pdf').elementHandle()
  const frame = await iframe.contentFrame()
  await frame.locator('link[href*="pdf_embedder.css"]').waitFor({ state: 'attached', timeout: 60000 })
  await page.getByRole('button', { name: 'Close preview' }).click()
  const downloadEvent = page.waitForEvent('download', { timeout: 60000 })
  await card.getByRole('button', { name: 'Download uat-notes.txt' }).click()
  const download = await downloadEvent
  assert.equal(download.suggestedFilename(), 'uat-notes.txt')
  const stream = await download.createReadStream(), chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  assert.equal(Buffer.concat(chunks).toString('utf8'), 'OIAC Test/UAT attachment verification.\n')
  assert.equal(await card.getByRole('form', { name: 'Add Comment' }).locator('input[type=file]').count(), 0)
  await card.screenshot({ path: resolve(output, 'post.png') })
  await Promise.all(pending)
  assert.deepEqual(mutations, [])
  assert.deepEqual(faults, [])
  assert(transfers.filter(t => t.operation === 'view').every(t => t.status === 200 && t.ok))
  const result = { verifiedAt: new Date().toISOString(), url: 'https://oiac-engage-test.powerappsportals.com/activity/channel', postId: '76b92c87-b389-5af2-87e6-ba695830a994', separatePickers: true, sharedChipsAboveButtons: true, persistedPhoto: true, fullSizePhoto: true, nativePdfPreview: true, exactTextDownload: true, commentFileControls: false, newRecordsOrUploads: 0, ...(thumbnails ? { postOnlyAccent: true, centered350pxThumbnails: true, compactDocumentChips: true, commentInputAndButtonOneRow: true } : {}), transfers }
  await writeFile(resolve(output, 'verified.json'), JSON.stringify(result, null, 2))
  await writeFile(resolve(thumbnails ? 'docs/alm/activity-post-thumbnails-hosted.json' : 'docs/alm/activity-post-reference-ui-hosted.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
  console.error(error)
  throw error
} finally { await Promise.allSettled(pending); await page.close(); await browser.close() }
