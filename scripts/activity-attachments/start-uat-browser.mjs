import { chromium } from 'playwright'
import { resolve } from 'node:path'

// Dedicated interactive Test/UAT browser; credentials stay in its ignored local profile.
const context = await chromium.launchPersistentContext(resolve('.superpowers/activity-post-attachments/uat-browser-profile'), {
  channel: 'chromium', headless: false, viewport: null,
  args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9337', '--window-size=1440,1000'],
})
const page = context.pages()[0] ?? await context.newPage()
await page.goto('https://oiac-engage-test.powerappsportals.com/', { waitUntil: 'domcontentloaded' })
console.log('Interactive OIAC Test/UAT browser ready. Local automation endpoint: http://127.0.0.1:9337. Sign in within the browser; do not share credentials in chat.')
process.once('SIGINT', () => void context.close())
process.once('SIGTERM', () => void context.close())
await new Promise(resolve => context.once('close', resolve))
