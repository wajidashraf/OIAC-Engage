import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('binds the Power Pages trigger to the management runtime site ID, distinct from its Dataverse record ID', () => {
  // Verified through the Power Pages management API for the exact UAT URL/environment.
  const flow = JSON.parse(readFileSync(new URL('./flow-clientdata.json', import.meta.url)))
  const guard = flow.properties.definition.actions.Request.actions.Trusted_Site_And_User.expression
  assert(guard.includes("'5fb3972a-5518-4b27-a8e2-21abd2963fdc'"), 'Trigger siteId must match the Power Pages runtime site identity')
  assert(!guard.includes("'e7f400bd-1e04-4efa-b8b3-7a7a3b168662'"), 'The Dataverse website record ID is not the trigger runtime identity')
})

test('does not pass a binary object to the string/array-only length function', () => {
  const flow = JSON.parse(readFileSync(new URL('./flow-clientdata.json', import.meta.url)))
  assert(!JSON.stringify(flow.properties.definition).includes('length(base64ToBinary('), 'Power Automate base64ToBinary returns an Object; length must operate on the encoded string')
})
