import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const origin='https://www.mogcomputer.it';
const screens=[
 ['Autotag Global','/wp-admin/tools.php?page=wpmntz-autotag-global'],
 ['Fidelity Manager','/wp-admin/admin.php?page=fidelity-manager'],
 ['MOG PC Configurator','/wp-admin/admin.php?page=mog-pcc-admin'],
 ['MOG Social','/wp-admin/admin.php?page=mog-social'],
 ['MOG Photo Engine','/wp-admin/admin.php?page=mog-photo-engine'],
 ['Importatori RED UM','/wp-admin/admin.php?page=mntz-red-um-importer'],
];
const modes=[['mobile',390,900],['tablet',768,980],['desktop',1440,950]];
async function getJwt(){
 const base=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
 const auth=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(!base||!auth)throw Error('GitHub OIDC not available');
 const url=new URL(base);url.searchParams.set('audience','mog-qa-live-readonly');
 const r=await fetch(url,{headers:{Authorization:'Bearer '+auth}});
 if(!r.ok)throw Error('OIDC HTTP '+r.status);
 return (await r.json()).value;
}
const token=await getJwt();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
for (const [name,path] of screens){
 for (const [mode,width,height] of modes){
  const ctx=await browser.newContext({viewport:{width,height},javaScriptEnabled:false,locale:'it-IT',deviceScaleFactor:1});
  const page=await ctx.newPage();
  await page.route('**/wp-admin/**',route=>{
   const req=route.request();
   if(req.isNavigationRequest() && req.url().startsWith(origin+path)){
     route.continue({headers:{...req.headers(),'X-MOG-QA-JWT':token}});
   }else route.continue();
  });
  let stat=0,found='',err='';
  try{
   const res=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:40000});
   stat=res?.status()||0;
   await page.waitForTimeout(650);
   found=new URL(page.url()).pathname;
   const data=await page.evaluate(()=>{
     const w=window.innerWidth;
     const root=document.documentElement;
     const body=document.body;
     const sw=Math.max(root.scrollWidth,body?.scrollWidth||0);
     const bad=[];
     for(const el of document.querySelectorAll('#wpbody-content *')){
       if(bad.length>=12)break;
       const r=el.getBoundingClientRect();
       if(r.width<20||r.height<4)continue;
       const c=getComputedStyle(el);
       if(c.display==='none'||c.visibility==='hidden'||c.position==='fixed')continue;
       if(r.right>w+6||r.left< -6)bad.push({tag:el.tagName.toLowerCase(),cls:String(el.className||'').slice(0,70),right:Math.round(r.right)});
     }
     const bodyText=body?.innerText||'';
     return {viewport:w,scrollWidth:sw,overflow:Math.max(0,sw-w),
       height:root.scrollHeight,bodyTextLength:bodyText.length,forms:document.querySelectorAll('#wpbody-content form').length,
       tables:document.querySelectorAll('#wpbody-content table').length,
       stylesheetCount:[...document.styleSheets].length,
       adminBody:!!document.querySelector('#wpbody-content'),
       scrubbed:!/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(bodyText)&&!/\+39\s*\d{8,}/.test(bodyText),
       unavailable:/QA (?:rendering|parser) unavailable/.test(bodyText),bad};
   });
   const good=(stat===200 && found.startsWith('/wp-admin/')&&data.adminBody&&!data.unavailable&&data.scrubbed);
   const row={screen:name,mode,width,http:stat,found,ok:good,...data};
   results.push(row);console.log('MOG_ADMIN_QA',JSON.stringify(row));
  }catch(e){
   err=String(e).slice(0,210);
   const row={screen:name,mode,width,http:stat,found,ok:false,error:err};
   results.push(row);console.log('MOG_ADMIN_QA',JSON.stringify(row));
  }finally{await ctx.close();}
 }
}
await browser.close();
await mkdir('mog-qa-admin',{recursive:true});
const summary={at:new Date().toISOString(),total:results.length,
 passed:results.filter(x=>x.ok&&x.overflow<=5).length,
 failed:results.filter(x=>!x.ok).length,
 overflows:results.filter(x=>(x.overflow||0)>5).map(x=>({screen:x.screen,mode:x.mode,overflow:x.overflow,bad:x.bad})),
 redirects:results.filter(x=>x.found&&!x.found.startsWith('/wp-admin/')).map(x=>({screen:x.screen,mode:x.mode,found:x.found}))};
await writeFile('mog-qa-admin/report.json',JSON.stringify({summary,results},null,2));
console.log('MOG_ADMIN_QA_SUMMARY',JSON.stringify(summary));
