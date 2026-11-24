import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Fault injection is restricted to this isolated tab. All post/upload writes are intercepted.
// Read-back uses the real authenticated flow and the two already-saved, user-authorized files.
const root = '.superpowers/activity-post-attachments/upload-confirmation'
const snapshot = JSON.parse(await readFile(`${root}/persisted-files.json`, 'utf8'))
const saved = snapshot.posts.find(post => post.id === 'd745090c-c8cf-5359-a88a-c5a5b4f8eca2')
assert(saved?.ownPost && saved.files.result.attachments.length === 2)
const files = await Promise.all(saved.files.result.attachments.map(async attachment => ({ ...attachment, bytes: await readFile(`${root}/${attachment.fileName}`) })))
for (const file of files) assert.equal(file.bytes.length, file.size)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9337')
const page = await browser.contexts()[0].newPage()
const simulated = [], reads = [], deniedWrites = []
let sourcePost, interceptedPost = 0
try {
  await page.route('**/_api/serverlogics/activity-channel', async route => {
    const body = route.request().postDataJSON()
    if (body.command === 'post') {
      assert(sourcePost, 'The real source post must be read before the intercepted submit')
      interceptedPost++
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, post: { ...sourcePost, content: body.payload.content } }) })
    }
    if (!['feed', 'comments'].includes(body.command)) { deniedWrites.push(body.command); return route.abort() }
    return route.continue()
  })
  await page.route('**/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f', async route => {
    const input = JSON.parse(JSON.parse(route.request().postDataJSON().eventData).Input)
    if (input.operation === 'upload') {
      assert.equal(input.postId, saved.id)
      const expected = files.find(file => file.fileName === input.fileName)
      assert(expected && input.clientFileId === expected.id && input.size === expected.size)
      assert.equal(input.contentBase64, expected.bytes.toString('base64'))
      simulated.push({ id: input.clientFileId, fileName: input.fileName, status: 202 })
      return route.fulfill({ status: 202, contentType: 'application/json', body: '{}' })
    }
    if (!['list', 'view'].includes(input.operation)) { deniedWrites.push(input.operation); return route.abort() }
    if (input.postId === saved.id) reads.push({ operation: input.operation, fileName: input.fileName })
    return route.continue()
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); await cdp.send('Network.setBypassServiceWorker', { bypass: true })
  await page.goto(`https://oiac-engage-test.powerappsportals.com/activity/channel?confirmation-check=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByRole('heading', { name: 'Activity Channel', exact: true }).waitFor()
  const currentBuild = (await readFile('dist/index.html', 'utf8')).match(/src="(\/assets\/index-[^"]+\.js)"/)[1]
  assert(await page.locator(`script[src$="${currentBuild}"]`).count(), 'The published page must load the verified build')
  const state = await page.evaluate(async postId => {
    const tokenHtml = await (await fetch('/_layout/tokenhtml', { credentials: 'same-origin' })).text()
    const token = new DOMParser().parseFromString(tokenHtml, 'text/html').querySelector('input[name="__RequestVerificationToken"]')?.value
    const response = await fetch('/_api/serverlogics/activity-channel', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': token }, body: JSON.stringify({ command: 'feed', payload: { phase: 'pinned', page: 1 } }) })
    let body = await response.json(); if (typeof body === 'string') body = JSON.parse(body)
    if (body.success === true) body = typeof body.data === 'string' ? JSON.parse(body.data) : body.data
    const post = body.posts.find(post => post.id === postId)
    if (!post || post.author.id !== body.currentUser.id) throw new Error('Expected the authenticated author and existing post')
    return { post, count: body.totalCount }
  }, saved.id)
  sourcePost = state.post
  await page.getByRole('button', { name: 'Create Activity', exact: true }).click()
  await page.getByRole('textbox', { name: 'Activity content' }).fill('OIAC upload-confirmation check — intercepted submit, no new post.')
  await page.getByLabel('Attach files to activity').setInputFiles(files.map(file => ({ name: file.fileName, mimeType: file.contentType, buffer: file.bytes })))
  await page.evaluate(ids => {
    const original = crypto.randomUUID.bind(crypto), queue = ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', ...ids]
    crypto.randomUUID = () => queue.shift() ?? original()
  }, files.map(file => file.id))
  await page.getByRole('button', { name: 'Post Activity', exact: true }).click()
  await page.getByText('Activity and files posted.', { exact: true }).waitFor({ timeout: 120000 })
  assert.equal(await page.getByText(/Your activity was posted, but some files/).count(), 0)
  assert.equal(interceptedPost, 1)
  assert.equal(simulated.length, 2)
  assert.deepEqual(deniedWrites, [])
  for (const file of files) assert(reads.some(read => read.operation === 'view' && read.fileName === file.fileName))
  const proof = { verifiedAt: new Date().toISOString(), postId: saved.id, build: currentBuild, test: 'lost-acknowledgement-fault-injection-with-real-private-readback', recoveredFiles: files.map(file => ({ fileName: file.fileName, size: file.size, sha256: createHash('sha256').update(file.bytes).digest('hex') })), simulatedUploadResponses: simulated, realPostWrites: 0, realUploadWrites: 0, falseUploadWarning: false, outcome: 'Activity and files posted.', reads }
  await writeFile(`${root}/hosted-recovery.json`, JSON.stringify(proof, null, 2))
  await writeFile('docs/alm/activity-upload-confirmation-hosted.json', JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify(proof, null, 2))
} catch (error) {
  await page.screenshot({ path: `${root}/hosted-recovery-failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally { await page.close(); await browser.close() }
