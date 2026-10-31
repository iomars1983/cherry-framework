import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const origin = 'https://www.mogcomputer.it';
const branch = 'mog-qa-public-20261029';
const destination = 'mog-qa-admin/visual-expanded';
const panels = [
  ['fidelity','Fidelity Manager','fidelity-manager'],
  ['red','Importatore RED','wpmntz-import-listino-RED'],
  ['um','Importatore UM','wpmntz-import-listino-UM']
];
const widths = [390,768,1440];
function git(args) { return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
function saveToBranch(files,message) {
  git(['config','user.name','MOG QA Bot']);
  git(['config','user.email','mog-qa-bot@users.noreply.github.com']);
  for (const file of files) git(['add','-f',file]);
  const status = git(['status','--porcelain']);
  if (!status) return;
  git(['commit','-m',message]);
  git(['push','origin','HEAD:'+branch]);
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve,ms)); }
async function run() {
  await mkdir(destination,{recursive:true});
  const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context = await browser.newContext({locale:'it-IT',viewport:{width:1440,height:950},deviceScaleFactor:1});
    const pair = await context.newPage();
    const pairResponse = await pair.goto(origin+'/wp-login.php?action=mog_qa_pair',{waitUntil:'domcontentloaded',timeout:45000});
    const id = (await pair.locator('#qa-request').textContent({timeout:15000})).trim();
    if (pairResponse.status()!==200 || !/^[a-f0-9]{32}$/.test(id)) throw Error('QA pairing page unavailable');
    const requestPath = 'mog-qa-admin/qa-request.json';
    await writeFile(requestPath,JSON.stringify({request_id:id,at:new Date().toISOString(),scope:'qa-view-only'},null,2));
    saveToBranch([requestPath],'Record temporary MOG visual QA pairing request');
    console.log('MOG_QA_PAIRING_READY '+id);
    let authorized = false;
    const enter = origin+'/wp-login.php?action=mog_qa_enter&request='+id;
    for (let attempt=0;attempt<125;attempt++) {
      await sleep(3000);
      try {
        const response = await pair.goto(enter,{waitUntil:'domcontentloaded',timeout:12000});
        if (response && response.status()===200 && pair.url().includes('action=mog_qa_view')) {authorized=true;break;}
      } catch (e) {
        if (attempt%10===0) console.log('MOG_QA_WAITING '+attempt);
      }
    }
    if (!authorized) throw Error('MOG QA pairing authorization not completed');
    console.log('MOG_QA_SESSION_READY');
    const results = [];
    for (const [short,label,slug] of panels) {
      for (const width of widths) {
        const page = await context.newPage({viewport:{width,height:950}});
        await page.setViewportSize({width,height:950});
        const row={panel:short,label,width,http:0,ok:false};
        const ajaxCodes=[];
        page.on('response',res=>{if(res.url().includes('/wp-admin/admin-ajax.php'))ajaxCodes.push(res.status());});
        try {
          const response=await page.goto(origin+'/wp-admin/admin.php?page='+encodeURIComponent(slug),{waitUntil:'domcontentloaded',timeout:45000});
          row.http=response?.status()||0;
          await page.waitForTimeout(short==='fidelity'?7000:1300);
          if(short!=='fidelity') {
            const toggles=page.locator('.mntz-page-panel-toggle');
            row.toggles=await toggles.count();
            row.opened=0;
            for(let i=0;i<row.toggles;i++) {
              try {if(await toggles.nth(i).isVisible()){await toggles.nth(i).click({timeout:3500});row.opened++;}}catch(e){}
            }
            await page.waitForTimeout(650);
          }
          row.ajax_statuses=ajaxCodes;
          if(short==='fidelity')row.tableLoaded=(await page.locator('#fm-table-container table').count())>0;
          await page.evaluate(async()=>{if(document.fonts && document.fonts.ready)await document.fonts.ready;});
          row.geometry=await page.evaluate(()=>{
            const doc=document.documentElement;
            const content=document.querySelector('#wpbody-content');
            const w=window.innerWidth;
            const sw=Math.max(doc.scrollWidth,document.body?.scrollWidth||0);
            const bad=[];
            if(content) for(const el of content.querySelectorAll('*')){
              if(bad.length>=20)break;
              const rect=el.getBoundingClientRect();
              if(rect.width<20||rect.height<5)continue;
              const st=getComputedStyle(el);
              if(st.display==='none'||st.visibility==='hidden'||st.position==='fixed')continue;
              if(rect.right<=w+6&&rect.left>=-6)continue;
              let insideScroll=false;
              for(let p=el.parentElement;p&&p!==content;p=p.parentElement){
                const s=getComputedStyle(p);
                if(['auto','scroll'].includes(s.overflowX)){insideScroll=true;break;}
              }
              if(!insideScroll)bad.push({tag:el.tagName.toLowerCase(),right:Math.round(rect.right),left:Math.round(rect.left),class:String(el.className||'').slice(0,60)});
            }
            const buttons=[...document.querySelectorAll('#wpbody-content button,#wpbody-content .button')];
            const tooSmall=buttons.filter(e=>{
              const r=e.getBoundingClientRect(),s=getComputedStyle(e);
              return s.display!=='none'&&s.visibility!=='hidden'&&r.width>8&&r.height>0&&r.height<24;
            }).length;
            return {viewport:w,scroll_width:sw,overflow:Math.max(0,sw-w),content:!!content,forms:content?.querySelectorAll('form').length||0,fields:content?.querySelectorAll('input,select,textarea').length||0,tables:content?.querySelectorAll('table').length||0,buttons:buttons.length,short_buttons:tooSmall,offscreen:bad,document_height:doc.scrollHeight};
          });
          row.ok=row.http===200&&page.url().includes('/wp-admin/admin.php?')&&row.geometry.content&&row.geometry.overflow<=5&&row.geometry.offscreen.length===0;
          await page.evaluate(()=>{
            // No actual customer or operational content is written to the public QA branch.
            const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
            const items=[];
            while(walker.nextNode()) items.push(walker.currentNode);
            for(const n of items) {
              const p=n.parentElement;
              if(!p || ['SCRIPT','STYLE','NOSCRIPT','TEMPLATE'].includes(p.tagName))continue;
              n.nodeValue=n.nodeValue.replace(/[^\s]/gu,(c)=>/[0-9]/.test(c)?'8':/[A-Z]/.test(c)?'M':'e');
            }
            document.querySelectorAll('input,textarea').forEach(el=>{
              el.value='';el.setAttribute('value','');el.setAttribute('placeholder','');
            });
            document.querySelectorAll('img,video,canvas').forEach(el=>{el.style.visibility='hidden';});
            document.querySelectorAll('[contenteditable]').forEach(el=>{el.textContent='';});
          });
          row.image=destination+'/'+short+'-'+width+'.jpg';
          await page.screenshot({path:row.image,fullPage:true,type:'jpeg',quality:62,animations:'disabled'});
        } catch(e){row.error=String(e?.message||e).slice(0,180);}
        finally {await page.close();}
        console.log('MOG_QA_GEOMETRY '+JSON.stringify({panel:row.panel,width:row.width,http:row.http,ok:row.ok,geometry:row.geometry,error:row.error}));
        results.push(row);
      }
    }
    const summary={date:new Date().toISOString(),tested:results.length,pass:results.filter(r=>r.ok).length,fail:results.filter(r=>!r.ok).length,method:'MOG QA expanded accordions and delayed Fidelity load; screenshots anonymized before export',results};
    const reportPath='mog-qa-admin/report.json';
    await writeFile(reportPath,JSON.stringify({summary,results},null,2));
    saveToBranch([reportPath,...results.map(r=>r.image).filter(Boolean)],'Store sanitized MOG expanded-layout visual QA checks');
    console.log('MOG_QA_VISUAL_SUMMARY '+JSON.stringify({tested:summary.tested,pass:summary.pass,fail:summary.fail}));
    if(summary.fail>0)process.exitCode=1;
  } finally {await browser.close();}
}
run().catch(e=>{console.log('MOG_QA_ERROR '+String(e?.message||e).slice(0,180));process.exitCode=1;});
