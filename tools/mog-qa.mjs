import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// post-fix validation after cache purge: strict zero-cost public-only browser audit
const BASE = 'https://www.mogcomputer.it';
const PUBLIC_PAGES = [
  ['home','/'],['shop','/shop/'],['cart','/cart/'],['checkout','/checkout/'],
  ['my-account','/my-account/'],['assistenza-informatica','/assistenza-informatica/'],
  ['contatti','/contatti/'],['spedizioni','/spedizioni/'],['pagamenti','/pagamenti/'],
  ['rma','/rma/'],['privacy-policy','/privacy-policy/'],['cookie-policy','/cookie-policy/'],
  ['termini-e-condizioni-duso','/termini-e-condizioni-duso/'],['garanzie','/garanzie/'],
  ['wishlist','/wishlist/'],['compilazione-finanziamento','/compilazione-finanziamento/'],
  ['newsletter','/newsletter/'],['richiesta-assistenza','/richiesta-assistenza/'],
  ['fydelity-manager','/fydelity-manager/'],['prenota-ritiro','/prenota-ritiro/'],
  ['head','/head/'],['footer','/footer/'],['staff-assistenza','/staff-assistenza/'],
  ['pc-configurator','/pc-configurator/'],['metodi-di-pagamento','/metodi-di-pagamento/'],
  ['compilazione','/compilazione/'],['chi-siamo','/chi-siamo/'],
  ['categoria-prodotto','/categoria-prodotto/'],['recesso-online','/recesso-online/'],
  ['pc-gaming-viewstrike-5060','/prodotto/pc-gaming-viewstrike-5060/'],
];
const SIZES = [
  ['mobile',390,844],['tablet',768,1000],['desktop',1440,1000]
];
await mkdir('mog-qa-reports/screenshots',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
const MAX_IMG=28;
let kept=0;
for(const [slug,path] of PUBLIC_PAGES){
  for(const [mode,width,height] of SIZES){
    const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,locale:'it-IT',isMobile:mode==='mobile',hasTouch:mode==='mobile'});
    const page=await ctx.newPage();
    let responseStatus=null;
    let errors=[];
    page.on('pageerror',e=>{if(errors.length<5)errors.push(String(e).slice(0,130))});
    try{
      const response=await page.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:25000});
      responseStatus=response?.status()??null;
      await page.waitForTimeout(900);
      const metrics=await page.evaluate(()=>{
        const doc=document.documentElement,body=document.body,w=window.innerWidth;
        const sw=Math.max(doc.scrollWidth,body?.scrollWidth||0);
        const overflowing=[];
        for(const e of body.querySelectorAll('*')){
          if(overflowing.length>=12)break;
          const b=e.getBoundingClientRect();
          if(b.width<20||b.height<3)continue;
          const cs=getComputedStyle(e);
          if(cs.display==='none'||cs.visibility==='hidden'||cs.position==='fixed')continue;
          if(b.right>w+6 || b.left< -6)overflowing.push({
            tag:e.tagName.toLowerCase(),cls:String(e.className||'').slice(0,90),
            left:Math.round(b.left),right:Math.round(b.right),width:Math.round(b.width)
          });
        }
        const imgs=[...document.images];
        return {
          viewport:w,scrollWidth:sw,overflow:Math.max(0,sw-w),height:doc.scrollHeight,
          title:document.title.slice(0,120),
          h1:document.querySelectorAll('h1').length,
          header:!!document.querySelector('.mog-header-futuristic,.mog-future-nav'),
          footer:!!document.querySelector('.mog-footer-ultra,.mog-footer-ultra-grid'),
          brokenImages:imgs.filter(x=>x.complete&&!x.naturalWidth&&!!x.getAttribute('src')&&x.getBoundingClientRect().width>1).length,
          errors:overflowing,location:location.pathname,forms:document.querySelectorAll('form').length,
          financeCss:!!document.getElementById('mog-finance-visual-parity'),
        };
      });
      const result={slug,path,mode,width,http:responseStatus,success:responseStatus===200 || (slug==='wishlist' && metrics.location==='/my-account/'),...metrics,jsErrors:errors};
      results.push(result);
      console.log('__MOGQA__'+JSON.stringify(result));
      const interesting=(result.overflow>5||result.http!==200||['home','shop','cart','checkout','compilazione-finanziamento','fydelity-manager','pc-gaming-viewstrike-5060'].includes(slug));
      if(interesting && kept<MAX_IMG && result.http===200){
        try{await page.screenshot({path:'mog-qa-reports/screenshots/'+slug+'-'+mode+'.jpg',type:'jpeg',quality:62});kept++;}catch{}
      }
    }catch(e){
      const err={slug,path,mode,width,http:responseStatus,success:false,error:String(e).slice(0,240),jsErrors:errors};
      results.push(err);
      console.log('__MOGQA__'+JSON.stringify(err));
    }finally{await ctx.close()}
  }
}
await browser.close();
await writeFile('mog-qa-reports/results.json',JSON.stringify({generatedAt:new Date().toISOString(),base:BASE,results},null,2));
const failed=results.filter(x=>!x.success);
const overflows=results.filter(x=>(x.overflow??0)>5);
const summary={count:results.length,success:results.length-failed.length,failed:failed.length,
  overflow:overflows.length,majorOverflow:results.filter(x=>x.overflow>20).length,
  brokenImages:results.reduce((a,x)=>a+(x.brokenImages||0),0),
  jsErrors:results.reduce((a,x)=>a+(x.jsErrors?.length||0),0),
  jsErrorSlugs:results.filter(x=>x.jsErrors?.length).map(x=>x.slug+'-'+x.mode),
  failedSlugs:failed.map(x=>x.slug+'-'+x.mode),
  overflowSlugs:overflows.map(x=>x.slug+'-'+x.mode+':'+x.overflow)};
await writeFile('mog-qa-reports/summary.json',JSON.stringify(summary,null,2));
console.log('__MOGQA_SUMMARY__'+JSON.stringify(summary));

// MOG public audit rerun requested 2026-10-30; public pages only; no authentication.
