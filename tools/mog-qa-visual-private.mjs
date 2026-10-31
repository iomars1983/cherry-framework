import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes, createCipheriv, publicEncrypt, constants } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const origin='https://www.mogcomputer.it';
const branch='mog-qa-public-20261029';
const publicKey=`-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA08Zwz7ZN+I4tWMA8ugy5
dwOb94NSdh9CAJPqAN9oA7MOkL+lG/PYaZBkNf+TVu5F2yXklMgOvRLK6mbBD7as
thNeG06QZgZHFEywsYo2+qp26qNwIkHQ43nKwVO6bB2UHZzPuWoDCoanX/3JKZ50
hmPW9OmyMrNozGnBxAiKr8N0c71eFiYA5wd2eOOt+XczMkmagVaMeG0nH+H95Azo
cb5pk5dAf2MCDiOuanc2Y4lYT9wzEC/u9TSGYjV/R743YX2ild6M6c3wX4tcmq66
h4eFtJZV+fQ8i25Ju26CR58RCNzYwychMMPWnL9jSwHm7sjwS3mTH+w9r6Ja0lhd
Et5u59XkIg3yR7mIpDzSFeM4nYDI9pFswnUMZOUu6UbyTlDv7c74HcpEdufAkUkd
GzfCXeYWjK3WChVfFGwQYgh/AV/lvh53eX3wqxsopPbNetd2eDWjp9ukIJNJw1Rc
BSeM+YfOqeKZX/kmYRnN66zzIYISrQj8mTfE1goV6SR5AgMBAAE=
-----END PUBLIC KEY-----`;
const panels=[['fidelity','fidelity-manager'],['red','wpmntz-import-listino-RED'],['um','wpmntz-import-listino-UM']];
const widths=[390,768,1440];
const files=[];
const results=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function publishRequest(file){
 git(['config','user.name','MOG QA Bot']);git(['config','user.email','mog-qa-bot@users.noreply.github.com']);
 git(['add','-f',file]);git(['commit','-m','Record scoped visual QA request identifier']);git(['push','origin','HEAD:'+branch]);
}
async function capture(page,name,locator=null){
 const data=locator?await locator.screenshot({type:'jpeg',quality:85,animations:'disabled'}):await page.screenshot({type:'jpeg',quality:85,fullPage:true,animations:'disabled'});
 files.push({name:name+'.jpg',data:data.toString('base64')});
}
async function geometry(page){return page.evaluate(()=>{
 const content=document.querySelector('#wpbody-content');
 const viewport=innerWidth,scrollWidth=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth);
 const bad=[];
 if(content)for(const e of content.querySelectorAll('*')){
  const r=e.getBoundingClientRect(),s=getComputedStyle(e);
  if(r.width<20||r.height<5||s.display==='none'||s.visibility==='hidden'||s.position==='fixed')continue;
  if(r.right<=viewport+5&&r.left>=-5)continue;
  let inside=false;
  for(let p=e.parentElement;p&&p!==content;p=p.parentElement){if(['auto','scroll'].includes(getComputedStyle(p).overflowX)){inside=true;break;}}
  if(!inside&&bad.length<30)bad.push({tag:e.tagName,id:e.id,cls:String(e.className).slice(0,90),left:Math.round(r.left),right:Math.round(r.right)});
 }
 return {viewport,scrollWidth,overflow:Math.max(0,scrollWidth-viewport),content:!!content,height:document.documentElement.scrollHeight,fields:content?.querySelectorAll('input,select,textarea').length||0,tables:content?.querySelectorAll('table').length||0,bad};
});}
async function run(){
 await mkdir('mog-qa-admin',{recursive:true});await mkdir('mog-qa-encrypted',{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({locale:'it-IT',viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const pair=await context.newPage();
  const res=await pair.goto(origin+'/wp-login.php?action=mog_qa_pair',{waitUntil:'domcontentloaded',timeout:45000});
  const id=(await pair.locator('#qa-request').textContent({timeout:15000})).trim();
  if(res.status()!==200||!/^[a-f0-9]{32}$/.test(id))throw Error('PAIR_UNAVAILABLE');
  const requestFile='mog-qa-admin/private-visual-request.json';
  await writeFile(requestFile,JSON.stringify({request_id:id,date:new Date().toISOString(),scope:'qa-view-only'},null,2));
  publishRequest(requestFile);
  console.log('MOG_VISUAL_PAIR_READY '+id);
  let authorized=false;
  for(let i=0;i<150;i++){
   await sleep(3000);
   try{const r=await pair.goto(origin+'/wp-login.php?action=mog_qa_enter&request='+id,{waitUntil:'domcontentloaded',timeout:12000});
    if(r?.status()===200&&pair.url().includes('action=mog_qa_view')){authorized=true;break;}
   }catch{}
  }
  if(!authorized)throw Error('PAIR_NOT_APPROVED');
  console.log('MOG_VISUAL_AUTHORIZED');
  for(const [name,slug] of panels){for(const width of widths){
   const page=await context.newPage();await page.setViewportSize({width,height:1000});
   const row={panel:name,width,status:'pending',sections:[]};
   const ajax=[];
   page.on('response',r=>{if(r.url().includes('/admin-ajax.php'))ajax.push({status:r.status()});});
   try{
    const r=await page.goto(origin+'/wp-admin/admin.php?page='+encodeURIComponent(slug),{waitUntil:'domcontentloaded',timeout:45000});
    row.http=r?.status()||0;
    if(row.http!==200||!page.url().includes('/wp-admin/admin.php?'))throw Error('PANEL_NOT_LOADED');
    await page.waitForTimeout(1800);
    await page.evaluate(async()=>{if(document.fonts?.ready)await document.fonts.ready;});
    if(name==='fidelity'){
     try{await page.waitForFunction(()=>{
      const e=document.querySelector('#fm-table-container');
      if(!e)return false;
      const text=e.innerText.trim();
      return text.length>20&&!/caricamento|loading/i.test(text)&&!e.querySelector('.spinner.is-active');
     },null,{timeout:35000});row.tableReady=true;}catch{row.tableReady=false;}
     await page.waitForTimeout(500);
    }
    row.initial=await geometry(page);
    await capture(page,name+'-'+width+'-initial');
    if(name!=='fidelity'){
     const toggles=page.locator('.mntz-page-panel-toggle');
     const count=await toggles.count();row.accordionCount=count;
     for(let i=0;i<count;i++){
      const toggle=toggles.nth(i);
      const panel=toggle.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," mntz-page-panel ")][1]');
      if(!(await panel.count()))continue;
      const body=panel.locator('.mntz-page-panel-body').first();
      const before=await body.isVisible().catch(()=>false);
      if(!before)await toggle.click({timeout:5000});
      await page.waitForTimeout(350);
      const opened=await body.isVisible().catch(()=>false);
      if(opened){await capture(page,name+'-'+width+'-section-'+(i+1),panel);}
      row.sections.push({index:i+1,title:(await toggle.innerText()).slice(0,180),opened});
     }
     row.expanded=await geometry(page);
     await page.evaluate(()=>scrollTo(0,0));
     await capture(page,name+'-'+width+'-expanded');
    }else{
     row.tableInfo=await page.locator('#fm-table-container').evaluate(e=>({text:e.innerText.slice(0,1500),classes:[...e.querySelectorAll('[class]')].slice(0,80).map(n=>n.className),html:e.innerHTML.slice(0,1200)})).catch(()=>null);
     const table=page.locator('#fm-table-container');
     if(await table.count()){
      const canScroll=await table.evaluate(e=>e.scrollWidth>e.clientWidth+5);
      if(canScroll){await table.evaluate(e=>e.scrollLeft=e.scrollWidth);await capture(page,name+'-'+width+'-table-right',table);}
     }
    }
    row.final=await geometry(page);row.ajax=ajax;
    row.status=row.final.content&&row.final.overflow<=5&&row.final.bad.length===0&&(name!=='fidelity'||row.tableReady)?'pass':'review';
   }catch{row.status='error';}
   results.push(row);await page.close();
   console.log('MOG_VISUAL_CAPTURE '+JSON.stringify({panel:name,width,status:row.status,tableReady:row.tableReady,sections:row.sections.length}));
  }}
  const payload=gzipSync(Buffer.from(JSON.stringify({date:new Date().toISOString(),results,files})));
  const key=randomBytes(32),iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
  const envelope={algorithm:'RSA-OAEP-SHA256/AES-256-GCM/gzip',key:publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
  await writeFile('mog-qa-encrypted/visual.enc',JSON.stringify(envelope));
  await writeFile('mog-qa-encrypted/summary.json',JSON.stringify({date:new Date().toISOString(),tested:results.length,captures:files.length,results:results.map(r=>({panel:r.panel,width:r.width,status:r.status,tableReady:r.tableReady,sections:r.sections.length}))},null,2));
  console.log('MOG_VISUAL_COMPLETE '+results.length+' views; '+files.length+' encrypted screenshots');
 }finally{await browser.close();}
}
run().catch(()=>{console.log('MOG_VISUAL_CAPTURE_FAILED');process.exitCode=1;});
