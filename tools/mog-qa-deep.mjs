import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('mog-qa-deep',{recursive:true});
const cases=[
 ['finance','/compilazione-finanziamento/',1440],
 ['fidelity','/fydelity-manager/',1440],
 ['shop','/shop/',390],
 ['checkout','/checkout/',390],
 ['product','/prodotto/pc-gaming-viewstrike-5060/',390],
 ['home','/',390],
];
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const rows=[];
for(const [slug,path,width] of cases){
 const ctx=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,locale:'it-IT',isMobile:width<500,hasTouch:width<500});
 const page=await ctx.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack?.slice(0,650)}));
 try{
 const resp=await page.goto('https://www.mogcomputer.it'+path,{waitUntil:'domcontentloaded',timeout:19000});
 await page.waitForTimeout(1500);
 let whatIf=null;
 if(['finance','fidelity'].includes(slug)){
   const before=await page.evaluate(()=>({width:innerWidth,sw:document.documentElement.scrollWidth,
      container:(()=>{let e=document.querySelector('#content-wrap');return e?{x:Math.round(e.getBoundingClientRect().x),right:Math.round(e.getBoundingClientRect().right)}:null})()}));
   await page.addStyleTag({content:`
   @media(min-width:1024px){
      body.page-id-147772 #main #content-wrap.container,
      body.page-id-286768 #main #content-wrap.container {
        box-sizing:border-box!important;width:100%!important;max-width:100%!important;
        min-width:0!important;margin-left:0!important;margin-right:0!important;
        left:auto!important;right:auto!important;transform:none!important;
      }
      body.page-id-147772 #main #primary.content-area,
      body.page-id-286768 #main #primary.content-area {
        box-sizing:border-box!important;float:none!important;width:100%!important;
        max-width:100%!important;left:0!important;right:auto!important;
        margin-left:0!important;margin-right:0!important;
        padding-left:0!important;padding-right:0!important;
      }
   }
   `});
   await page.waitForTimeout(100);
   const after=await page.evaluate(()=>({width:innerWidth,sw:document.documentElement.scrollWidth,
      container:(()=>{let e=document.querySelector('#content-wrap');return e?{x:Math.round(e.getBoundingClientRect().x),right:Math.round(e.getBoundingClientRect().right)}:null})()}));
   whatIf={before,after};
 }
 const data=await page.evaluate(()=>{
    const geom=(e)=>{
      if(!e)return null;
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      return {tag:e.tagName,cls:String(e.className||'').slice(0,120),id:e.id,
       x:Math.round(r.x),right:Math.round(r.right),w:Math.round(r.width),
       style:{boxSizing:s.boxSizing,width:s.width,maxWidth:s.maxWidth,minWidth:s.minWidth,
        marginLeft:s.marginLeft,marginRight:s.marginRight,
        paddingLeft:s.paddingLeft,paddingRight:s.paddingRight,
        left:s.left,right:s.right,display:s.display,
        position:s.position,overflowX:s.overflowX,transform:s.transform}};
    };
    let container=document.querySelector('#main .container.clr')||document.querySelector('.container.clr');
    let content=document.querySelector('.content-area.clr');
    let ancestors=[];
    for(let cur=content||container;cur&&ancestors.length<9;cur=cur.parentElement)ancestors.push(geom(cur));
    const headerEl=document.querySelector('.mog-header-futuristic,#site-header,.mog-header-futuristic-wrapper');
    const headerInfo={
       outer:geom(headerEl),
       children:headerEl?[...headerEl.children].slice(0,9).map(geom):[],
       logos:[...document.querySelectorAll('img')].filter(e=>/logo|mog computer/i.test(e.alt+' '+e.className)).slice(0,7).map(geom),
       nav:[...document.querySelectorAll('nav')].slice(0,6).map(geom)
    };
    const imgs=[...document.images].filter(x=>x.complete&&x.naturalWidth===0).map(x=>({
      src:(()=>{try{return new URL(x.currentSrc||x.src).origin+new URL(x.currentSrc||x.src).pathname}catch{return 'invalid'}})(),
      cls:String(x.className||'').slice(0,80),
      dom:geom(x)
    })).slice(0,12);
    const ss=[...document.querySelectorAll('script')].filter(e=>/elementor/i.test(e.src||'')||/elementorFrontendConfig/.test(e.textContent||'')).map(e=>({
      src:e.src?new URL(e.src).pathname:null,id:e.id,async:e.async,defer:e.defer,
      containsConfig:/elementorFrontendConfig/.test(e.textContent||''),
      contentStart:e.src?null:(e.textContent||'').slice(0,160)
    })).slice(0,25);
    return {viewport:innerWidth,sw:document.documentElement.scrollWidth,ancestors,headerInfo,
      container:geom(container),content:geom(content),
      images:imgs,scripts:ss,elementorConfigDefined:typeof window.elementorFrontendConfig!=='undefined',
      bodyClass:document.body.className.slice(0,600)};
 });
 const row={slug,path,width,http:resp?.status(),errors,data,whatIf};
 rows.push(row);
 console.log('__MOGDEEP__'+JSON.stringify(row).slice(0,25000));
 if(['finance','fidelity'].includes(slug))await page.screenshot({path:'mog-qa-deep/'+slug+'.jpg',type:'jpeg',quality:55});
 }catch(e){rows.push({slug,path,width,error:String(e).slice(0,250)});}
 await ctx.close();
}
await browser.close();
await writeFile('mog-qa-deep/deep.json',JSON.stringify(rows,null,2));
console.log('__MOGDEEP_DONE__'+rows.length);
