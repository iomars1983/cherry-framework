import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('mog-qa-deep',{recursive:true});
const cases=[
 ['finance','/compilazione-finanziamento/',1440],
 ['fidelity','/fydelity-manager/',1440],
 ['shop','/shop/',390],
 ['checkout','/checkout/',390],
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
    return {viewport:innerWidth,sw:document.documentElement.scrollWidth,ancestors,
      container:geom(container),content:geom(content),
      images:imgs,scripts:ss,elementorConfigDefined:typeof window.elementorFrontendConfig!=='undefined',
      bodyClass:document.body.className.slice(0,600)};
 });
 const row={slug,path,width,http:resp?.status(),errors,data};
 rows.push(row);
 console.log('__MOGDEEP__'+JSON.stringify(row).slice(0,25000));
 if(['finance','fidelity'].includes(slug))await page.screenshot({path:'mog-qa-deep/'+slug+'.jpg',type:'jpeg',quality:55});
 }catch(e){rows.push({slug,path,width,error:String(e).slice(0,250)});}
 await ctx.close();
}
await browser.close();
await writeFile('mog-qa-deep/deep.json',JSON.stringify(rows,null,2));
console.log('__MOGDEEP_DONE__'+rows.length);
