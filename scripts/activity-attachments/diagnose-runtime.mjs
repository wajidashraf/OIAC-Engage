import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('.superpowers/activity-post-attachments/runtime-diagnosis')
await mkdir(output, { recursive: true })
const browser = await chromium.connectOverCDP('http://127.0.0.1:9337')
try {
  const context = browser.contexts()[0]
  const page = await context.newPage()
  const requests = [], pending = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    if (!response.url().includes('/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f')) return
    pending.push((async () => {
      const body = await response.text().catch(() => '')
      let safeBody = '[unrecognized response]'
      try {
        let envelope = JSON.parse(body)
        if (typeof envelope === 'string') envelope = JSON.parse(envelope)
        if (typeof envelope.result === 'string') envelope.result = JSON.parse(envelope.result)
        safeBody = JSON.stringify(envelope, (key, value) => key === 'contentBase64' ? '[file content omitted]' : value)
      } catch { safeBody = body.slice(0, 500) }
      requests.push({ status: response.status(), contentType: response.headers()['content-type'], body: safeBody.slice(0, 5000) })
    })())
  })
  const firstResponse = page.waitForResponse(response => response.url().includes('/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f'), { timeout: 30000 }).catch(() => null)
  await page.goto('https://oiac-engage-test.powerappsportals.com/activity/channel', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Activity Channel', exact: true }).waitFor({ timeout: 30000 })
  await firstResponse
  await Promise.allSettled(pending)
  const state = await page.evaluate(() => ({
    title: document.title,
    signedIn: Boolean(window.Microsoft?.Dynamic365?.Portal?.User?.contactId),
    fileErrors: [...document.querySelectorAll('.ac-attachments [role=alert]')].length,
    posts: document.querySelectorAll('.ac-card').length,
    scripts: [...document.scripts].map(script => script.src).filter(src => /index-.*\.js/.test(src)),
  }))
  const report = { capturedAt: new Date().toISOString(), state, responses: requests, errors }
  await writeFile(resolve(output, 'portal-flow-responses.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close() }
