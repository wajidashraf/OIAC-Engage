import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

// Uses the existing MSAL-backed helper, pinned to this Test/UAT organization.
// Tokens never enter this process, payloads or output files.
const project=resolve(fileURLToPath(new URL('../..',import.meta.url)))
const schema=JSON.parse(readFileSync(join(project,'scripts/contact-districts/schema.json'),'utf8'))
const root=join(project,'.superpowers/multi-district-2026-11-13'),helper=resolve(project,'../.superpowers/press-coverage/sdk-helper/DataverseReadOnly.exe')
mkdirSync(join(root,'requests'),{recursive:true})
const mode=process.argv[2],apply=process.argv.includes('--apply')
assert.ok(['schema','migration','dry-run'].includes(mode),'Use schema --apply, migration --apply, or dry-run')
if(mode!=='dry-run')assert.ok(apply,'Mutations require --apply')
const label=text=>({LocalizedLabels:[{Label:text,LanguageCode:1033}]})
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')
const save=(name,value)=>writeFileSync(join(root,name),JSON.stringify(value,null,2)+'\n')
let sequence=0
function api(method,path,body,missing=false){
  assert.ok(path.startsWith('/api/data/v9.2/')&&!path.includes('://'))
  if(method!=='GET')assert.ok(apply,'Read-only run cannot mutate')
  const stem=String(++sequence).padStart(3,'0')+'-'+mode+'-'+method+'-'+randomUUID().slice(0,8)
  const output=join(root,'requests',stem+'.response.json'),args=['request',method,path,output]
  if(body!==undefined){const input=join(root,'requests',stem+'.request.json');writeFileSync(input,JSON.stringify(body));args.push(input)}
  if(method!=='GET')args.push('allow-mutation')
  try{execFileSync(helper,args,{windowsHide:true,stdio:'pipe',timeout:180000,maxBuffer:2*1024*1024})}
  catch(error){const detail=String(error.stderr??'')+String(error.stdout??'');if(missing&&detail.includes('404'))return null;throw new Error(detail.slice(-7000)||error.message)}
  const text=readFileSync(output,'utf8').replace(/^\uFEFF/,'');return text.trim()?JSON.parse(text):null
}
function all(path){
 const rows=[],seen=new Set();
 while(path){assert.ok(!seen.has(path),'Repeated Dataverse continuation');seen.add(path);const data=api('GET',path);assert.ok(Array.isArray(data.value));rows.push(...data.value);path=data['@odata.nextLink']??null;if(path){const url=new URL(path,'https://org97063a46.crm.dynamics.com');assert.equal(url.origin,'https://org97063a46.crm.dynamics.com');path=url.pathname+url.search}}
 return rows
}
const assignmentHash=rows=>hash(rows.map(row=>({contactid:row.contactid,districtId:row._mss_district_value??null,statecode:row.statecode})).sort((a,b)=>a.contactid.localeCompare(b.contactid)))
function publish(){api('POST','/api/data/v9.2/PublishXml',{ParameterXml:`<importexportxml><entities><entity>${schema.table}</entity><entity>contact</entity></entities><nodes/><securityroles/><settings/><workflows/></importexportxml>`})}
function addToSolution(id,type){api('POST','/api/data/v9.2/AddSolutionComponent',{ComponentId:id,ComponentType:type,SolutionUniqueName:schema.solution,AddRequiredComponents:false})}
function tableMetadata(){return api('GET',`/api/data/v9.2/EntityDefinitions(LogicalName='${schema.table}')?$select=LogicalName,SchemaName,EntitySetName,MetadataId,ObjectTypeCode&$expand=ManyToOneRelationships($select=SchemaName,ReferencedEntity,ReferencingAttribute,ReferencedEntityNavigationPropertyName,ReferencingEntityNavigationPropertyName),Keys($select=SchemaName,KeyAttributes,EntityKeyIndexStatus)`,undefined,true)}
const identity=api('GET','/api/data/v9.2/WhoAmI');assert.equal(identity.OrganizationId,schema.organizationId)

if(mode==='schema'){
 let metadata=tableMetadata();save('membership-schema-before.json',metadata)
 if(!metadata){
  const existing=all('/api/data/v9.2/EntityDefinitions?$select=LogicalName&$filter=IsCustomEntity eq true')
  assert.ok(!existing.some(entity=>entity.LogicalName===schema.table),'Table exists but metadata could not be read')
  api('POST','/api/data/v9.2/EntityDefinitions',{
   '@odata.type':'Microsoft.Dynamics.CRM.EntityMetadata',SchemaName:schema.schemaName,OwnershipType:'OrganizationOwned',
   DisplayName:label(schema.displayName),DisplayCollectionName:label('Contact District Memberships'),
   Description:label('CRM-managed district memberships; the existing Contact district lookup remains unchanged.'),
   HasActivities:false,HasNotes:false,IsActivity:false,PrimaryNameAttribute:'mss_name',
   Attributes:[{'@odata.type':'Microsoft.Dynamics.CRM.StringAttributeMetadata',SchemaName:'mss_Name',DisplayName:label('Membership Number'),IsPrimaryName:true,MaxLength:100,AutoNumberFormat:'CDM-{SEQNUM:6}',RequiredLevel:{Value:'None'}}]
  });console.log('Created the new membership table. Existing Contact/District tables are unchanged.')
  metadata=tableMetadata();assert.ok(metadata)
 }
 assert.equal(metadata.EntitySetName,schema.entitySet)
 for(const [lookup,target,relationship,collection,navigation]of [
  [schema.contactLookup,'contact',schema.contactRelationship,schema.contactCollection,schema.contactNavigation],
  [schema.districtLookup,'mss_district',schema.districtRelationship,schema.districtCollection,schema.districtNavigation],
 ]){
  const existing=metadata.ManyToOneRelationships.find(item=>item.ReferencingAttribute===lookup)
  if(existing){assert.equal(existing.ReferencedEntity,target);assert.equal(existing.SchemaName,relationship);assert.equal(existing.ReferencedEntityNavigationPropertyName,collection);continue}
  api('POST','/api/data/v9.2/RelationshipDefinitions',{
   '@odata.type':'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',SchemaName:relationship,
   ReferencedEntity:target,ReferencedAttribute:target==='contact'?'contactid':'mss_districtid',ReferencingEntity:schema.table,
   ReferencedEntityNavigationPropertyName:collection,ReferencingEntityNavigationPropertyName:navigation,
   AssociatedMenuConfiguration:{Behavior:'UseCollectionName',Group:'Details',Order:10000},
   CascadeConfiguration:{Assign:'NoCascade',Delete:'Restrict',Merge:'NoCascade',Reparent:'NoCascade',Share:'NoCascade',Unshare:'NoCascade'},
   Lookup:{'@odata.type':'Microsoft.Dynamics.CRM.LookupAttributeMetadata',SchemaName:navigation,DisplayName:label(target==='contact'?'Contact':'District'),RequiredLevel:{Value:'ApplicationRequired'}}
  });console.log('Created required '+target+' lookup and relationship.')
 }
 metadata=tableMetadata()
 if(!metadata.Keys.some(key=>key.SchemaName===schema.key))api('POST',`/api/data/v9.2/EntityDefinitions(LogicalName='${schema.table}')/Keys`,{'@odata.type':'Microsoft.Dynamics.CRM.EntityKeyMetadata',SchemaName:schema.key,DisplayName:label('Unique Contact and District'),KeyAttributes:[schema.contactLookup,schema.districtLookup]})
 const deadline=Date.now()+180000
 while(true){metadata=tableMetadata();const key=metadata.Keys.find(item=>item.SchemaName===schema.key);assert.deepEqual([...key.KeyAttributes].sort(),[schema.contactLookup,schema.districtLookup].sort());if(key.EntityKeyIndexStatus==='Active'||key.EntityKeyIndexStatus===2)break;if(key.EntityKeyIndexStatus==='Failed'||key.EntityKeyIndexStatus===3)throw new Error('Membership alternate-key index failed');assert.ok(Date.now()<deadline,'Alternate-key index is still pending; rerun to resume');await new Promise(resolve=>setTimeout(resolve,2000))}
 console.log('Unique Contact/District key is Active.')
 addToSolution(metadata.MetadataId,1);publish()

 const viewFetch=`<fetch><entity name="${schema.table}"><attribute name="${schema.primaryId}"/><attribute name="mss_name"/><attribute name="mss_contact"/><attribute name="mss_district"/><attribute name="statecode"/><order attribute="mss_name"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>`
 const viewLayout=`<grid name="resultset" object="${metadata.ObjectTypeCode}" jump="mss_name" select="1" icon="1" preview="1"><row name="result" id="${schema.primaryId}"><cell name="mss_name" width="130"/><cell name="mss_district" width="180"/><cell name="mss_contact" width="180"/><cell name="statecode" width="90"/></row></grid>`
 const views=all(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,isdefault&$filter=returnedtypecode eq '${schema.table}' and querytype eq 0`)
 let view=views.find(item=>item.name==='Active District Memberships')??views.find(item=>item.isdefault)
 if(view){save('membership-view-before.json',api('GET',`/api/data/v9.2/savedqueries(${view.savedqueryid})`));api('PATCH',`/api/data/v9.2/savedqueries(${view.savedqueryid})`,{name:'Active District Memberships',fetchxml:viewFetch,layoutxml:viewLayout})}
 else{const id=randomUUID();api('POST','/api/data/v9.2/savedqueries',{savedqueryid:id,name:'Active District Memberships',querytype:0,returnedtypecode:schema.table,isdefault:true,fetchxml:viewFetch,layoutxml:viewLayout});view={savedqueryid:id}}
 addToSolution(view.savedqueryid,26)
 const guid=()=>'{'+randomUUID()+'}'
 const cell=(name,text,classid)=>`<row><cell id="${guid()}" showlabel="true"><labels><label description="${text}" languagecode="1033"/></labels><control id="${name}" classid="${classid}" datafieldname="${name}" disabled="false"/></cell></row>`
 const membershipForm=`<form><tabs><tab id="${guid()}" name="membership" expanded="true"><labels><label description="District Membership" languagecode="1033"/></labels><columns><column width="100%"><sections><section id="${guid()}" name="membership_fields" showlabel="false" showbar="false" columns="1"><labels><label description="Membership" languagecode="1033"/></labels><rows>${cell('mss_contact','Contact','{270BD3DB-D9AF-4782-9025-509E298DEC0A}')}${cell('mss_district','District','{270BD3DB-D9AF-4782-9025-509E298DEC0A}')}</rows></section></sections></column></columns></tab></tabs></form>`
 const forms=all(`/api/data/v9.2/systemforms?$select=formid,name&$filter=objecttypecode eq '${schema.table}' and type eq 2`)
 let form=forms.find(item=>item.name==='District Membership')??forms.find(item=>item.name==='Information')??forms[0]
 if(form){save('membership-form-before.json',api('GET',`/api/data/v9.2/systemforms(${form.formid})`));api('PATCH',`/api/data/v9.2/systemforms(${form.formid})`,{name:'District Membership',formxml:membershipForm})}
 else{const id=randomUUID();api('POST','/api/data/v9.2/systemforms',{formid:id,name:'District Membership',objecttypecode:schema.table,type:2,formxml:membershipForm});form={formid:id}}
 addToSolution(form.formid,60)
 const contactForm=api('GET',`/api/data/v9.2/systemforms(${schema.contactFormId})?$select=formid,name,formxml`)
 if(!existsSync(join(root,'contact-form-before.json')))save('contact-form-before.json',contactForm)
 const marker='oiac_district_memberships'
 if(!contactForm.formxml.includes(`name="${marker}"`)){
  const grid=`<tab id="${guid()}" name="${marker}" expanded="true"><labels><label description="District Memberships" languagecode="1033"/></labels><columns><column width="100%"><sections><section id="${guid()}" name="${marker}_section" showlabel="false" showbar="false" columns="1"><labels><label description="District Memberships" languagecode="1033"/></labels><rows><row><cell id="${guid()}" showlabel="false"><labels><label description="District Memberships" languagecode="1033"/></labels><control id="${marker}_grid" classid="{E7A81278-8635-4d9e-8D4D-59480B391C5B}" disabled="false"><parameters><TargetEntityType>${schema.table}</TargetEntityType><RelationshipName>${schema.contactRelationship}</RelationshipName><ViewId>{${view.savedqueryid}}</ViewId><ViewIds>{${view.savedqueryid}}</ViewIds><IsUserView>false</IsUserView><EnableViewPicker>false</EnableViewPicker><EnableJumpBar>false</EnableJumpBar><RecordsPerPage>10</RecordsPerPage></parameters></control></cell></row></rows></section></sections></column></columns></tab>`
  const index=contactForm.formxml.lastIndexOf('</tabs>');assert.ok(index>0,'Contact form has no tabs element')
  const updated=contactForm.formxml.slice(0,index)+grid+contactForm.formxml.slice(index)
  assert.equal(updated.replace(grid,''),contactForm.formxml,'Existing Contact form must be preserved exactly')
  api('PATCH',`/api/data/v9.2/systemforms(${schema.contactFormId})`,{formxml:updated});console.log('Added one related membership subgrid; original Contact form XML preserved.')
 }
 addToSolution(schema.contactFormId,60);publish()
 const after=api('GET',`/api/data/v9.2/systemforms(${schema.contactFormId})?$select=formid,name,formxml`);assert.ok(after.formxml.includes(marker))
 save('contact-form-after.json',after);save('membership-schema-after.json',metadata)
 save('schema-applied.json',{tableId:metadata.MetadataId,entitySet:metadata.EntitySetName,key:schema.key,keyActive:true,viewId:view.savedqueryid,formId:form.formid,contactFormId:schema.contactFormId,solution:schema.solution,legacyLookupPreserved:true})
 console.log('Membership schema, CRM administration and solution registration verified.')
}

if(mode==='migration'||mode==='dry-run'){
 const contacts=all('/api/data/v9.2/contacts?$select=contactid,_mss_district_value,statecode&$orderby=contactid asc')
 const metadata=tableMetadata(),memberships=metadata?all(`/api/data/v9.2/${schema.entitySet}?$select=${schema.primaryId},_mss_contact_value,_mss_district_value,statecode`):[]
 const pairs=new Map(memberships.map(row=>[row._mss_contact_value+'/'+row._mss_district_value,row]))
 const required=contacts.filter(contact=>contact._mss_district_value).map(contact=>({contactId:contact.contactid,districtId:contact._mss_district_value}))
 const missing=required.filter(pair=>!pairs.has(pair.contactId+'/'+pair.districtId))
 const reactivate=required.map(pair=>pairs.get(pair.contactId+'/'+pair.districtId)).filter(row=>row&&row.statecode!==0)
 save('migration-'+(apply?'before':'dry-run')+'.json',{sourceHash:assignmentHash(contacts),contacts:contacts.length,requiredPairs:required.length,existingPairs:memberships.length,missingPairs:missing,inactivePairsToReactivate:reactivate})
 if(mode==='migration'){
  assert.ok(metadata,'Apply schema before migration');const created=[],reactivated=[]
  const previousCreated=existsSync(join(root,'migration-created.json'))?JSON.parse(readFileSync(join(root,'migration-created.json'),'utf8')):[]
  for(const row of reactivate){const id=row[schema.primaryId];api('PATCH',`/api/data/v9.2/${schema.entitySet}(${id})`,{statecode:0,statuscode:1});reactivated.push({id,previousStatecode:row.statecode});save('migration-reactivated.json',reactivated)}
  for(const pair of missing){const id=randomUUID();api('POST',`/api/data/v9.2/${schema.entitySet}`,{[schema.primaryId]:id,[schema.contactNavigation+'@odata.bind']:`/contacts(${pair.contactId})`,[schema.districtNavigation+'@odata.bind']:`/mss_districts(${pair.districtId})`});created.push({...pair,id});save('migration-created.json',[...previousCreated,...created]);console.log('Added legacy membership '+created.length+'/'+missing.length)}
  const verified=all(`/api/data/v9.2/${schema.entitySet}?$select=${schema.primaryId},_mss_contact_value,_mss_district_value,statecode`)
  assert.equal(new Set(verified.map(row=>row._mss_contact_value+'/'+row._mss_district_value)).size,verified.length,'Duplicate memberships')
  assert.ok(required.every(pair=>verified.some(row=>row._mss_contact_value===pair.contactId&&row._mss_district_value===pair.districtId&&row.statecode===0)),'Missing active legacy membership')
  const after=all('/api/data/v9.2/contacts?$select=contactid,_mss_district_value,statecode&$orderby=contactid asc');assert.equal(assignmentHash(after),assignmentHash(contacts),'Existing Contact values changed')
  save('migration-verified.json',{contacts:contacts.length,requiredPairs:required.length,created:previousCreated.length+created.length,createdThisRun:created.length,reactivated:reactivated.length,memberships:verified.length,duplicates:0,legacyContactValuesUnchanged:true,sourceHash:assignmentHash(contacts)})
 }
 console.log(JSON.stringify({mode,contacts:contacts.length,requiredPairs:required.length,existingPairs:memberships.length,missingPairs:missing.length,inactivePairsToReactivate:reactivate.length}))
}
