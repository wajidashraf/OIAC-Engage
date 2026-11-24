import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('.superpowers/activity-post-attachments/hosted')
const proof = JSON.parse(await readFile(resolve(output, 'verified.json'), 'utf8'))
const original = proof.transfers.find(transfer => transfer.operation === 'upload' && transfer.fileName === 'uat-image.png').attachment
const browser = await chromium.connectOverCDP('http://127.0.0.1:9337')
try {
  const page = browser.contexts()[0].pages().find(page => page.url().startsWith('https://oiac-engage-test.powerappsportals.com/'))
  assert(page, 'An authenticated Test/UAT page is required')
  const result = await page.evaluate(async ({ postId, attachment }) => {
    const html = await (await fetch('/_layout/tokenhtml', { credentials: 'same-origin' })).text()
    const token = new DOMParser().parseFromString(html, 'text/html').querySelector('input[name="__RequestVerificationToken"]')?.value
    if (!token) throw new Error('Authenticated verification token unavailable')
    async function call(payload) {
      const response = await fetch('/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ eventData: JSON.stringify({ Input: JSON.stringify(payload) }) }),
      })
      if (response.status !== 200) throw new Error(`Flow returned ${response.status}`)
      let envelope = await response.json()
      if (typeof envelope === 'string') envelope = JSON.parse(envelope)
      const result = typeof envelope.result === 'string' ? JSON.parse(envelope.result) : envelope.result
      if (result.ok !== true) throw new Error(`Flow rejected verification: ${result.error}`)
      if ('diagnostic' in result) throw new Error('Temporary diagnostics have not been removed')
      return result
    }
    const before = await call({ operation: 'list', postId })
    const retry = await call({ operation: 'upload', postId, clientFileId: attachment.id, fileName: attachment.fileName, size: 68, contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII=' })
    const after = await call({ operation: 'list', postId })
    return { beforeIds: before.attachments.map(file => file.id).sort(), afterIds: after.attachments.map(file => file.id).sort(), retriedId: retry.attachment.id }
  }, { postId: proof.postId, attachment: original })
  assert.equal(result.retriedId, original.id)
  assert.deepEqual(result.beforeIds, result.afterIds)
  assert.equal(result.afterIds.length, 3)
  const summary = { verifiedAt: new Date().toISOString(), postId: proof.postId, sameFileIdRetry: 'passed', duplicateAttachments: 0, attachmentCountBefore: 3, attachmentCountAfter: 3, diagnosticsRemoved: true }
  await writeFile(resolve(output, 'retry-verified.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} finally { await browser.close() }
