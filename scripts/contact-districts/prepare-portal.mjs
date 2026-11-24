import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
const schema=JSON.parse(readFileSync('scripts/contact-districts/schema.json','utf8'))
const applied=JSON.parse(readFileSync('.superpowers/multi-district-2026-11-13/schema-applied.json','utf8'))
assert.equal(applied.entitySet,schema.entitySet);assert.equal(applied.keyActive,true)
const files={}
function create(path,content){if(existsSync(path)){assert.equal(readFileSync(path,'utf8'),content,'Do not replace existing metadata: '+path);return}writeFileSync(path,content)}
const registryPath='scripts/contact-districts/schema-manifest.json'
const registry=existsSync(registryPath)?JSON.parse(readFileSync(registryPath,'utf8')):{...applied,membershipPermissionId:randomUUID(),enabledSettingId:randomUUID(),fieldsSettingId:randomUUID()}
writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n')
const permission='.powerpages-site/table-permissions/Authenticated-Contact-District-Membership-Read.tablepermission.yml'
create(permission,`adx_entitypermission_webrole:\n- ${schema.authenticatedRoleId}\nappend: false\nappendto: false\ncreate: false\ndelete: false\nentitylogicalname: ${schema.table}\nentityname: Authenticated Contact District Membership Read\nid: ${registry.membershipPermissionId}\nread: true\nscope: 756150000\nwrite: false\n`)
files[permission]=true
for(const [suffix,id,name,value]of [
 ['enabled',registry.enabledSettingId,'Enable read-only Contact district membership retrieval','true'],
 ['fields',registry.fieldsSettingId,'Allow the membership identity, related IDs and active state','"mss_contactdistrictmembershipid,mss_name,mss_Contact,mss_District,mss_contact,mss_district,_mss_contact_value,_mss_district_value,statecode"'],
]){
 const path=`.powerpages-site/site-settings/Webapi-${schema.table}-${suffix}.sitesetting.yml`
 create(path,`description: ${name}\nid: ${id}\nname: Webapi/${schema.table}/${suffix}\nvalue: ${value}\n`);files[path]=true
}
// Preserve the original Contact Web API field allowlist. The directory adapter
// executes its compact shared-district query inside Dataverse.
const contactFields='.powerpages-site/site-settings/Webapi-contact-fields.sitesetting.yml'
files[contactFields]=true
files['.powerpages-site/server-logic/contact-directory/contact-directory.js']=true
files['.powerpages-site/server-logic/contact-directory/contact-directory.serverlogic.yml']=true
writeFileSync('.superpowers/multi-district-2026-11-13/portal-metadata-files.json',JSON.stringify(Object.keys(files),null,2))
console.log(JSON.stringify({newMembershipReadPermission:1,newMembershipApiSettings:2,contactDirectoryReadAdapter:true,existingContactPermissionsChanged:false}))
