import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const source = JSON.parse(readFileSync(new URL('.superpowers/activity-post-attachments/original-flow-clientdata.json', root), 'utf8'))
const flow = structuredClone(source)
const definition = flow.properties.definition
// Power Pages management runtime ID; distinct from the Dataverse website record ID.
const site = '5fb3972a-5518-4b27-a8e2-21abd2963fdc'
const spSite = 'https://orgiac.sharepoint.com/sites/OIACEngage'
const request = "body('Parse_Request')"
const after = (name, statuses = ['Succeeded']) => name ? { [name]: statuses } : {}
const action = (type, inputs, previous, extra = {}) => ({ type, inputs, runAfter: after(previous), ...extra })
const compose = (inputs, previous) => action('Compose', inputs, previous)
const setResult = (value, previous) => action('SetVariable', { name: 'result', value }, previous)
const condition = (expression, actions, previous, otherwise = {}) => ({ type: 'If', expression, actions, else: { actions: otherwise }, runAfter: after(previous) })
const secure = { runtimeConfiguration: { secureData: { properties: ['inputs', 'outputs'] } } }
const connector = (name, operationId, parameters, previous, hide = false) => action('OpenApiConnection', {
  host: { connectionName: name, operationId, apiId: `/providers/Microsoft.PowerApps/apis/${name}` },
  parameters, retryPolicy: { type: 'none' },
}, previous, hide ? secure : {})
const sp = (operation, parameters, previous, hide = false) => connector('shared_sharepointonline', operation, { dataset: spSite, ...parameters }, previous, hide)
const dv = (entityName, recordId, select, previous) => connector('shared_commondataserviceforapps', 'GetItem', { entityName, recordId, '$select': select }, previous)
const error = code => ({ ok: false, error: code })
const folder = `@concat('/Shared Documents/Activity Channel Attachments/', toLower(${request}?['postId']))`
const storageName = idField => `concat(toLower(${request}?['${idField}']), '_', ${request}?['fileName'])`
const filePath = idField => `@concat(outputs('Folder_Path'), '/', ${storageName(idField)})`
const meta = (body, idField) => ({
  id: `@toLower(${request}?['${idField}'])`, fileName: `@${request}?['fileName']`,
  size: `@int(${body}?['Size'])`, contentType: `@coalesce(${body}?['MediaType'], 'application/octet-stream')`,
})
const guid = { type: 'string', minLength: 36, maxLength: 36 }
function validGuid(field) {
  const value = `toLower(string(${request}?['${field}']))`
  let remainder = value
  for (const char of '0123456789abcdef-') remainder = `replace(${remainder}, '${char}', '')`
  const padded = `concat(${value}, '000000000000000000000000000000000000')`
  return `and(equals(length(${value}), 36), equals(length(split(${value}, '-')), 5), equals(substring(${padded}, 8, 1), '-'), equals(substring(${padded}, 13, 1), '-'), equals(substring(${padded}, 18, 1), '-'), equals(substring(${padded}, 23, 1), '-'), equals(${remainder}, ''), not(equals(${value}, '00000000-0000-0000-0000-000000000000')))`
}
const schema = {
  type: 'object', additionalProperties: false, required: ['operation', 'postId'],
  properties: {
    operation: { type: 'string', enum: ['upload', 'list', 'view'] }, postId: guid,
    clientFileId: guid, attachmentId: guid,
    fileName: { type: 'string', minLength: 3, maxLength: 180 },
    size: { type: 'integer', minimum: 1, maximum: 10485760 },
    contentBase64: { type: 'string', minLength: 4, maxLength: 13981016 },
  },
}
const name = `coalesce(${request}?['fileName'], '')`
const blockedNameCharacters = ['2F', '5C', '25', '23', '22', '27', '3A', '2A', '3F', '3C', '3E', '7C', '0A', '0D', '09', '00']
const validFile = `@and(not(empty(${name})), equals(trim(${name}), ${name}), contains(${name}, '.'), not(startsWith(${name}, '.')), not(endsWith(${name}, '.')), not(contains(${name}, '..')), ${blockedNameCharacters.map(char => `not(contains(${name}, decodeUriComponent('%${char}')))` ).join(', ')})`
const encoded = `coalesce(${request}?['contentBase64'], '')`
// Binary values are typed objects in WDL. Derive byte length from canonical Base64
// length/padding, and separately force decoding before any SharePoint write.
const decodedSize = `sub(div(mul(length(${encoded}), 3), 4), if(endsWith(${encoded}, '=='), 2, if(endsWith(${encoded}, '='), 1, 0)))`

const upload = {
  Require_Post_Author: condition(`@equals(toLower(string(body('Get_Post')?['_mss_author_value'])), toLower(string(triggerBody()?['userId'])))`, {
    Validate_Upload: condition(`@and(${validGuid('clientFileId')}, not(empty(${encoded})), equals(mod(length(${encoded}), 4), 0), not(empty(base64ToBinary(${encoded}))), greaterOrEquals(int(coalesce(${request}?['size'], 0)), 1), lessOrEquals(int(coalesce(${request}?['size'], 0)), 10485760), equals(${decodedSize}, int(coalesce(${request}?['size'], 0))), ${validFile.slice(1)})`, {
        Create_Post_Folder: sp('CreateNewFolder', { table: 'Documents', 'parameters/path': `@concat('Activity Channel Attachments/', toLower(${request}?['postId']))` }),
        Confirm_Post_Folder: { ...sp('GetFolderMetadataByPath', { path: "@outputs('Folder_Path')" }), runAfter: after('Create_Post_Folder', ['Succeeded', 'Failed', 'TimedOut']) },
        Find_Existing_Upload: sp('GetFileMetadataByPath', { path: filePath('clientFileId') }, 'Confirm_Post_Folder'),
        Existing_Or_New: { ...condition("@equals(actions('Find_Existing_Upload')?['status'], 'Succeeded')", {
          Read_Existing_Upload: sp('GetFileContent', { id: "@body('Find_Existing_Upload')?['Id']", inferContentType: true }, undefined, true),
          Confirm_Exact_Retry: condition(`@and(equals(int(body('Find_Existing_Upload')?['Size']), int(${request}?['size'])), equals(base64(body('Read_Existing_Upload')), ${request}?['contentBase64']))`, {
            Existing_Upload_Result: setResult({ ok: true, attachment: meta("body('Find_Existing_Upload')", 'clientFileId') }),
          }, 'Read_Existing_Upload', { Upload_Content_Conflict: setResult(error('validation')) }),
        }, undefined, {
          Only_Create_When_Missing: condition("@equals(int(coalesce(outputs('Find_Existing_Upload')?['statusCode'], 0)), 404)", {
            Create_Upload: sp('CreateFile', { folderPath: "@outputs('Folder_Path')", name: `@${storageName('clientFileId')}`, body: `@base64ToBinary(${request}?['contentBase64'])` }, undefined, true),
            New_Upload_Result: setResult({ ok: true, attachment: meta("body('Create_Upload')", 'clientFileId') }, 'Create_Upload'),
          }),
        }), runAfter: after('Find_Existing_Upload', ['Succeeded', 'Failed', 'TimedOut']) },
    }, undefined, { Bad_Upload: setResult(error('validation')) }),
  }, undefined, { Upload_Access_Denied: setResult(error('forbidden')) }),
}

const listing = {
  Find_Read_Folder: sp('GetFolderMetadataByPath', { path: "@outputs('Folder_Path')" }),
  Read_Folder_Or_Empty: { ...condition("@equals(actions('Find_Read_Folder')?['status'], 'Succeeded')", {
    List_Post_Files: sp('ListFolder', { id: "@body('Find_Read_Folder')?['Id']" }),
    Filter_Post_Files: action('Query', { from: "@body('List_Post_Files')", where: "@and(equals(item()?['IsFolder'], false), greater(length(item()?['Name']), 37), greater(int(item()?['Size']), 0), lessOrEquals(int(item()?['Size']), 10485760))" }, 'List_Post_Files'),
    Select_Post_Files: action('Select', { from: "@body('Filter_Post_Files')", select: {
      id: "@toLower(substring(item()?['Name'], 0, 36))", fileName: "@substring(item()?['Name'], 37)", size: "@int(item()?['Size'])", contentType: "@coalesce(item()?['MediaType'], 'application/octet-stream')",
    } }, 'Filter_Post_Files'),
    List_Result: setResult({ ok: true, attachments: "@body('Select_Post_Files')" }, 'Select_Post_Files'),
  }, undefined, {
    Confirm_Empty_Folder: condition("@equals(int(coalesce(outputs('Find_Read_Folder')?['statusCode'], 0)), 404)", { Empty_List_Result: setResult({ ok: true, attachments: [] }) }),
  }), runAfter: after('Find_Read_Folder', ['Succeeded', 'Failed', 'TimedOut']) },
}

const viewing = {
  Validate_View_Name: condition(`@and(${validGuid('attachmentId')}, ${validFile.slice(1)})`, {
    Find_View_File: sp('GetFileMetadataByPath', { path: filePath('attachmentId') }),
    Validate_View_Size: condition("@and(greater(int(body('Find_View_File')?['Size']), 0), lessOrEquals(int(body('Find_View_File')?['Size']), 10485760))", {
      Read_View_File: sp('GetFileContent', { id: "@body('Find_View_File')?['Id']", inferContentType: true }, undefined, true),
      View_Result: setResult({ ok: true, attachment: meta("body('Find_View_File')", 'attachmentId'), contentBase64: "@base64(body('Read_View_File'))" }, 'Read_View_File'),
    }, 'Find_View_File', { Bad_View_Size: setResult(error('validation')) }),
  }, undefined, { Bad_View_Request: setResult(error('validation')) }),
}

const authorized = {
  Get_Actor: dv('contacts', "@triggerBody()?['userId']", 'contactid,statecode,adx_identity_logonenabled'),
  Get_Post: dv('mss_activityposts', `@${request}?['postId']`, 'mss_activitypostid,statecode,_mss_author_value', 'Get_Actor'),
  Require_Active_Actor_And_Post: condition("@and(equals(body('Get_Actor')?['statecode'], 0), equals(body('Get_Actor')?['adx_identity_logonenabled'], true), equals(body('Get_Post')?['statecode'], 0))", {
    Operation: { type: 'Switch', expression: `@${request}?['operation']`, runAfter: {}, cases: {
      Upload: { case: 'upload', actions: upload }, List: { case: 'list', actions: listing }, View: { case: 'view', actions: viewing },
    }, default: { actions: { Unknown_Operation: setResult(error('validation')) } } },
  }, 'Get_Post', { Inactive_Record: setResult(error('forbidden')) }),
}

definition.parameters.$connections = { defaultValue: {}, type: 'Object' }
flow.properties.connectionReferences = {
  shared_commondataserviceforapps: { runtimeSource: 'embedded', connection: { connectionReferenceLogicalName: 'mss_sharedcommondataserviceforapps_ef7bc' }, api: { name: 'shared_commondataserviceforapps' } },
  shared_sharepointonline: { runtimeSource: 'embedded', connection: { connectionReferenceLogicalName: 'mss_sharedsharepointonline_afea2' }, api: { name: 'shared_sharepointonline' } },
}
definition.actions = {
  Compose: source.properties.definition.actions.Compose,
  Initialize_Result: action('InitializeVariable', { variables: [{ name: 'result', type: 'object', value: error('unavailable') }] }, 'Compose'),
  Request: { type: 'Scope', runAfter: after('Initialize_Result'), actions: {
    Parse_Request: action('ParseJson', { content: "@json(triggerBody()?['text'])", schema }, undefined, { runtimeConfiguration: { secureData: { properties: ['inputs'] } } }),
    Folder_Path: compose(folder, 'Parse_Request'),
    Trusted_Site_And_User: condition(`@and(equals(toLower(string(triggerBody()?['siteId'])), '${site}'), not(empty(triggerBody()?['userId'])), ${validGuid('postId')})`, authorized, 'Folder_Path', { No_Portal_Access: setResult(error('forbidden')) }),
  } },
  Return_Result: action('Response', {
    statusCode: 200,
    body: { result: "@string(variables('result'))" },
    schema: { type: 'object', properties: { result: { title: 'result', type: 'string', 'x-ms-dynamically-added': true, 'x-ms-content-hint': 'TEXT' } } },
  }, undefined, { kind: 'PowerPages', runAfter: after('Request', ['Succeeded', 'Failed', 'TimedOut']), runtimeConfiguration: { secureData: { properties: ['inputs'] } } }),
}
const destination = new URL('scripts/activity-attachments/flow-clientdata.json', root)
function checkDepth(actions, level = 0) {
  for (const [name, value] of Object.entries(actions ?? {})) {
    if (level > 8) throw new Error(`${name} exceeds Power Automate's eight-level nesting limit`)
    checkDepth(value.actions, level + 1)
    checkDepth(value.else?.actions, level + 1)
    for (const branch of Object.values(value.cases ?? {})) checkDepth(branch.actions, level + 1)
    checkDepth(value.default?.actions, level + 1)
  }
}
checkDepth(definition.actions)
writeFileSync(destination, JSON.stringify(flow, null, 2) + '\n')
console.log(`Prepared ${fileURLToPath(destination)}; original Power Pages trigger preserved. No cloud changes performed.`)
