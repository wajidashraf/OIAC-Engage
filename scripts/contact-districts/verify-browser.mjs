import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {chromium} from 'playwright'

const root=resolve('.superpowers/multi-district-2026-11-13'),origin='http://127.0.0.1:5196'
await mkdir(root,{recursive:true})
await writeFile(resolve(root,'preview.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/.superpowers/multi-district-2026-11-13/preview.jsx"></script></body></html>')
await writeFile(resolve(root,'preview.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Contact from '/src/pages/Contact';import '/src/styles/theme.css';const params=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<MemoryRouter><Contact user={{userName:'local-fixture@example.test',contactId:params.has('none')?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111',userRoles:[]}} isAdmin={params.has('admin')}/></MemoryRouter>);`)
const server=await createServer({server:{host:'127.0.0.1',port:5196,strictPort:true,watch:{ignored:['**/.superpowers/**']}}});await server.listen()
const browser=await chromium.launch({channel:'chromium',headless:true})
const districtA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',districtB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',districtC='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const records=Array.from({length:601},(_,i)=>({contactid:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,fullname:`Contact ${String(i+1).padStart(4,'0')}`,firstname:'Contact',lastname:String(i+1).padStart(4,'0'),emailaddress1:`contact${i+1}@example.test`,mobilephone:null,address1_city:'Test City',jobtitle:['Volunteer','Staff','Representative'][i%3],_mss_district_value:i%2?districtB:districtA,statecode:0,memberships:i%7===0?[districtA,districtB]:[i%2?districtB:districtA]}))
records.push({contactid:'33333333-3333-4333-8333-333333333333',fullname:'Remote Muna',firstname:'Remote',lastname:'Muna',emailaddress1:'muna@example.test',jobtitle:'Volunteer',statecode:0,memberships:[districtC]},
 {contactid:'44444444-4444-4444-8444-444444444444',fullname:'Inactive Contact',firstname:'Inactive',lastname:'Contact',statecode:1,memberships:[districtA]},
 {contactid:'55555555-5555-4555-8555-555555555555',fullname:'Global Staff Without District',firstname:'Global Staff',lastname:'Without District',jobtitle:'Staff',statecode:0,memberships:[]})
const summaries=[]
const endpoint='/_api/serverlogics/contact-directory',verificationToken='local-contact-directory-csrf'
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),faults=[],reads=[];let writes=0
  page.on('pageerror',error=>faults.push(error.message))
  await page.route('**/_layout/tokenhtml',route=>route.fulfill({contentType:'text/html',body:'<input type="hidden" name="__RequestVerificationToken" value="'+verificationToken+'" />'}))
  await page.route('**/_api/**',async route=>{
   const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin)
   if(request.method()!=='GET'){writes++;return route.abort()}
   reads.push(url.pathname)
   if(url.pathname==='/_api/mss_contactdistrictmemberships'){
    assert.ok(url.searchParams.get('$filter').includes('statecode eq 0'))
    const empty=url.searchParams.get('$filter').includes('22222222-2222-4222-8222-222222222222')
    return route.fulfill({contentType:'application/json',body:JSON.stringify({value:empty?[]:[{_mss_district_value:districtA,statecode:0},{_mss_district_value:districtB,statecode:0}]})})
   }
   if(url.pathname==='/_api/mss_districts')return route.fulfill({contentType:'application/json',body:JSON.stringify({value:[{mss_districtid:districtA,mss_number:'District A'},{mss_districtid:districtB,mss_number:'District B'}]})})
   const member=url.pathname===endpoint
   assert.ok(member||url.pathname==='/_api/contacts')
   if(member){
    assert.equal(request.headers()['__requestverificationtoken'],verificationToken)
    assert.ok([...url.searchParams.keys()].every(key=>['q','page','cookie'].includes(key)))
    assert.equal(url.searchParams.getAll('q').length,1)
    assert.equal(url.searchParams.has('actor'),false)
    assert.equal(url.searchParams.has('contactId'),false)
    assert.equal(url.searchParams.has('fetchXml'),false)
   }
   const filter=url.searchParams.get('$filter')??''
   if(!member)assert.ok(filter.startsWith('statecode eq 0'))
   const term=member?url.searchParams.get('q'):filter.match(/contains\(firstname,'([^']*)'\)/)?.[1]??''
   if(member&&term==='Endpoint failure')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:JSON.stringify({ok:false,error:{code:'forbidden',message:'Contacts could not be loaded. Try again.'}})})})
   const rows=records.filter(record=>record.statecode===0&&(!member||record.memberships.some(id=>[districtA,districtB].includes(id)))&&(!term||Object.values(record).some(value=>typeof value==='string'&&value.toLowerCase().includes(term.toLowerCase())))).sort((a,b)=>member?a.fullname.localeCompare(b.fullname):a.lastname.localeCompare(b.lastname)||a.firstname.localeCompare(b.firstname))
   const pageNumber=Number(url.searchParams.get('page')??1)
   const offset=member?(pageNumber-1)*15:Number(url.searchParams.get('$skiptoken')??0)
   if(member&&pageNumber>1){
    assert.equal(url.searchParams.size,3)
    assert.equal(url.searchParams.get('cookie'),Buffer.from('directory-offset-'+offset).toString('base64url'))
   }
   const next=new URL(url)
   if(member){next.searchParams.set('page',String(pageNumber+1));next.searchParams.set('cookie',Buffer.from('directory-offset-'+(offset+15)).toString('base64url'))}
   else next.searchParams.set('$skiptoken',String(offset+15))
   const value=rows.slice(offset,offset+15).map(({memberships,...record})=>record)
   const nextLink=rows.length>offset+15?next.pathname+next.search:null
   const body=member?{success:true,data:JSON.stringify({ok:true,contacts:value,nextLink})}:{value,...(nextLink?{'@odata.nextLink':nextLink}:{})}
   return route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
  })
  const path=origin+'/.superpowers/multi-district-2026-11-13/preview.html'
  await page.goto(path);await page.getByRole('rowheader',{name:'Contact 0001',exact:true}).waitFor()
  const seen=new Set()
  for(let index=0;index<41;index++){
   await page.getByRole('rowheader',{name:`Contact ${String(index*15+1).padStart(4,'0')}`,exact:true}).waitFor()
   for(const name of await page.getByRole('rowheader').allTextContents())assert.ok(!seen.has(name)&&seen.add(name),'Duplicate Contact across pages')
   if(index<40)await page.getByRole('button',{name:'Next page',exact:true}).click()
  }
  assert.equal(seen.size,601);assert.equal(await page.getByRole('button',{name:'Next page'}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:/Edit /}).count(),0)
  await page.getByRole('searchbox',{name:'Search contacts'}).fill('CONTACT600@EXAMPLE.TEST')
  await page.getByRole('rowheader',{name:'Contact 0600',exact:true}).waitFor();assert.equal(await page.getByRole('rowheader').count(),1)
  assert.equal(await page.getByText('Page 1',{exact:true}).count(),1)
  await page.getByRole('searchbox',{name:'Search contacts'}).fill('Muna');await page.getByText('No contacts match “Muna”.',{exact:true}).waitFor()
  await page.getByRole('searchbox',{name:'Search contacts'}).fill('Endpoint failure')
  await page.getByRole('alert').getByText('Contacts could not be loaded. Try again.',{exact:true}).waitFor()
  await page.getByRole('searchbox',{name:'Search contacts'}).fill('Contact 0001')
  await page.getByRole('rowheader',{name:'Contact 0001',exact:true}).waitFor()
  const beforeEmpty=reads.filter(path=>path===endpoint).length
  await page.goto(path+'?none');await page.getByText('No district is assigned to your profile. Contact an administrator to update your district.',{exact:true}).waitFor()
  assert.equal(reads.filter(path=>path===endpoint).length,beforeEmpty)
  await page.goto(path+'?admin');await page.getByText('All active contacts across all districts.',{exact:true}).waitFor()
  await page.getByRole('searchbox',{name:'Search contacts'}).fill('Global Staff')
  await page.getByRole('button',{name:'Edit Global Staff Without District'}).waitFor()
  await page.getByRole('button',{name:'Edit Global Staff Without District'}).click();await page.getByRole('dialog',{name:'Edit contact'}).waitFor()
  await page.getByRole('button',{name:'Close edit contact'}).click()
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  assert.equal(overflow,false);assert.deepEqual(faults,[]);assert.equal(writes,0)
  await page.screenshot({path:resolve(root,`contacts-local-${width}.png`),fullPage:true})
  summaries.push({width,matchingContactsVisited:seen.size,pages:41,partialEmailSearch:true,searchRestrictedToMatchingDistricts:true,noDistrictSkipsContactQuery:true,adminIncludesStaffWithoutDistrict:true,adminEditPreserved:true,serverLogicCsrfHeader:true,endpointErrorAndRecovery:true,runtimeErrors:0,pageOverflow:false,apiWrites:0})
  await context.close()
 }
 await writeFile(resolve(root,'local-browser-verified.json'),JSON.stringify(summaries,null,2));console.log(JSON.stringify(summaries,null,2))
}finally{await browser.close();await server.close()}
