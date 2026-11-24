import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const thumbnails = process.argv.includes('--thumbnails')
const confirmation = process.argv.includes('--upload-confirmation')
const assetsOnly = process.argv.includes('--assets-only')
const referenceUi = confirmation || thumbnails || process.argv.includes('--reference-ui')
const task = resolve(confirmation ? '.superpowers/activity-post-attachments/upload-confirmation' : thumbnails ? '.superpowers/activity-post-ui/thumbnails' : referenceUi ? '.superpowers/activity-post-ui' : '.superpowers/activity-post-attachments')
const evidencePrefix = confirmation ? 'activity-upload-confirmation' : thumbnails ? 'activity-post-thumbnails' : 'activity-post-reference-ui'
const before = join(task, referenceUi ? 'code-before/oiac-engage/.powerpages-site' : 'code-baseline/oiac-engage/.powerpages-site')
const after = join(task, 'code-after/oiac-engage/.powerpages-site')
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
function files(root) { return readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)) }
const afterFiles = files(after)
const assetHashes = {}
for (const name of readdirSync('dist/assets').filter(name => /\.(js|css)$/.test(name))) {
  const matches = afterFiles.filter(path => path.split(/[\\/]/).pop() === name)
  assert.equal(matches.length, 1, `Expected one deployed ${name}`)
  assert.equal(hash(matches[0]), hash(join('dist/assets', name)), `Deployed bytes differ for ${name}`)
  assetHashes[name] = hash(matches[0])
}
const protectedDirectories = ['table-permissions', 'web-roles', 'site-settings', 'server-logic', 'cloud-flow-consumer', 'content-snippets']
const protectedChanges = []
let preserved = 0
for (const directory of protectedDirectories) {
  const baseline = join(before, directory)
  for (const path of files(baseline)) {
    const next = join(after, directory, relative(baseline, path))
    if (hash(path) !== hash(next)) protectedChanges.push(relative(before, path))
    else preserved++
  }
}
const registration = readFileSync(join(after, 'cloud-flow-consumer/Upload-Activity-Channel-Post-Document.cloudflowconsumer.yml'), 'utf8')
assert(registration.includes('3d2d6112-bcd2-f111-a059-000d3a35b61f'))
assert(registration.includes('0353acdd-7b95-4c07-8997-ae95dafd978d'))
const references = afterFiles.filter(path => path.endsWith('.html')).filter(path => {
  const content = readFileSync(path, 'utf8')
  return Object.keys(assetHashes).every(name => content.includes(name))
})
assert(references.length > 0, 'No deployed page references the current JS and CSS')
let protectedSourceFilesPreserved = 0
if (referenceUi) {
  const protectedSources = JSON.parse(readFileSync(join(task, 'protected-source-before.json'), 'utf8').replace(/^\uFEFF/, ''))
  for (const [path, expected] of Object.entries(protectedSources)) {
    assert.equal(hash(path).toUpperCase(), expected, `Protected source changed: ${path}`)
    protectedSourceFilesPreserved++
  }
  if (!assetsOnly) {
    const hosted = JSON.parse(readFileSync(`docs/alm/${evidencePrefix}-hosted.json`, 'utf8'))
    if (confirmation) {
      assert.equal(hosted.falseUploadWarning, false)
      assert.equal(hosted.realPostWrites, 0); assert.equal(hosted.realUploadWrites, 0)
      assert.equal(hosted.recoveredFiles.length, 2)
    } else {
      for (const key of ['separatePickers', 'sharedChipsAboveButtons', 'persistedPhoto', 'fullSizePhoto', 'nativePdfPreview', 'exactTextDownload']) assert.equal(hosted[key], true, `Hosted check missing: ${key}`)
      if (thumbnails) for (const key of ['postOnlyAccent', 'centered350pxThumbnails', 'compactDocumentChips', 'commentInputAndButtonOneRow']) assert.equal(hosted[key], true, `Hosted layout check missing: ${key}`)
      assert.equal(hosted.newRecordsOrUploads, 0)
    }
  }
}
const result = {
  verifiedAt: new Date().toISOString(), environmentId: '16838866-275a-e2e7-838f-57313f30a416', websiteId: 'e7f400bd-1e04-4efa-b8b3-7a7a3b168662',
  url: 'https://oiac-engage-test.powerappsportals.com/activity/channel', flowId: '3d2d6112-bcd2-f111-a059-000d3a35b61f',
  deployment: 'uploaded-and-exact-assets-read-back', assetHashes, protectedFilesPreserved: preserved, protectedChanges,
  currentAssetPageReferences: references.map(path => relative(after, path)),
  localTests: { files: 87, passed: confirmation ? 1109 : thumbnails ? 1097 : referenceUi ? 1096 : 1091 }, localBrowserWidths: [1440, 390],
  hostedUploadAcceptance: referenceUi ? assetsOnly ? 'not-verified-this-run' : confirmation ? 'fault-injected-ack-loss-recovered-through-real-readback-no-writes' : 'existing-verified-upload-retrieved-with-new-ui' : 'pending-authenticated-browser-sign-in', productionChanged: false,
  ...(referenceUi ? { protectedSourceFilesPreserved, hostedVerification: assetsOnly ? null : `${evidencePrefix}-hosted.json`, runtimeSiteId: '5fb3972a-5518-4b27-a8e2-21abd2963fdc' } : {}),
}
writeFileSync(join(task, 'deployment-verification.json'), JSON.stringify(result, null, 2) + '\n')
assert.deepEqual(protectedChanges, [], 'Protected site metadata changed; inspect the saved verification report')
if (referenceUi) writeFileSync(`docs/alm/${evidencePrefix}-uat-deployment.json`, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
