import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='https://www.mogcomputer.it';
const pages=[
 ['home','/'],['shop','/shop/'],['product','/prodotto/amd-am4-am5-wraith-stealth-cpu-cooling/'],
 ['categories','/categoria-prodotto/'],['about','/chi-siamo/'],['contact','/contatti/'],
 ['assistance','/assistenza-informatica/'],['shipping','/spedizioni/'],
 ['warranty','/garanzie/'],['cart','/cart/'],['account','/my-account/'],
 ['payment','/pagamenti/'],['recesso','/recesso-online/']
];
const sizes=[390,768,1440],results=[];
await mkdir('mog-header-footer-audit/shots',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const [name,path] of pages.filter(([name])=>['home','shop','product','categories','about','contact'].includes(name))) for(const width of sizes){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,locale:'it-IT'});
  const item={name,path,width,url:'',status:0};
  try {
   let resp=await page.goto(origin+path+(path.includes('?')?'&':'?')+'mog_header_footer_audit=postcss-20261031',{waitUntil:'domcontentloaded',timeout:55000});
   item.status=resp?.status()||0;item.url=page.url();
   await page.waitForTimeout(700);await page.evaluate(async()=>{try{await document.fonts.ready;}catch(e){}});
   item.m=await page.evaluate(()=>{
     function metric(sel){
       const e=document.querySelector(sel);if(!e)return null;
       const r=e.getBoundingClientRect(),s=getComputedStyle(e);
       return {x:Math.round(r.x),y:Math.round(r.y+scrollY),w:Math.round(r.width),h:Math.round(r.height),display:s.display,pad:s.padding,margin:s.margin,grid:s.gridTemplateColumns,position:s.position,overflowX:s.overflowX};
     }
     let h=document.querySelector('#hem-header-anchor');
     let f=document.querySelector('#hem-footer-anchor');
     let img=h?.querySelector('img');let ir=img?.getBoundingClientRect();
     let links=Array.from((h??document).querySelectorAll('a')).slice(0,7).map(x=>({txt:(x.textContent||'').trim().slice(0,30),x:Math.round(x.getBoundingClientRect().left)}));
     return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
      hemHeaders:document.querySelectorAll('#hem-header-anchor').length,hemFooters:document.querySelectorAll('#hem-footer-anchor').length,
      header:metric('#hem-header-anchor'),head:metric('.mog-header-futuristic'),headerContainer:metric('.mog-header-futuristic .mog-container'),nav:metric('.mog-future-nav>.mog-container'),
      footer:metric('#hem-footer-anchor'),footerRoot:metric('.mog-footer-ultra'),footerGrid:metric('.mog-footer-ultra-grid'),footerBottom:metric('.mog-footer-ultra-bottom'),footerSections:metric('.mog-footer-ultra .mog-container'),
      logo:img&&ir?{x:Math.round(ir.x),y:Math.round(ir.y+scrollY),w:Math.round(ir.width),h:Math.round(ir.height),srcPath:new URL(img.src).pathname}:null,
      links,bodyClasses:document.body.className.slice(0,180)};
   });
   if(['home','shop','product','categories','about','contact','shipping'].includes(name)){
     await page.screenshot({path:'mog-header-footer-audit/shots/'+name+'-'+width+'-top.jpg',type:'jpeg',quality:70,animations:'disabled'});
     for(let i=0;i<3;i++){ await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight)); await page.waitForTimeout(350); }
     await page.screenshot({path:'mog-header-footer-audit/shots/'+name+'-'+width+'-footer.jpg',type:'jpeg',quality:76,animations:'disabled'});
   }
  } catch(e){item.error=String(e?.message||e).slice(0,150);}
  finally {await page.close();}
  results.push(item);console.log('QA '+JSON.stringify({name,width,status:item.status,hemHeaders:item.m?.hemHeaders,hemFooters:item.m?.hemFooters,logo:item.m?.logo,footerGrid:item.m?.footerGrid,footerBottom:item.m?.footerBottom,overflow:item.m?.overflow,error:item.error}));
 }
 await writeFile('mog-header-footer-audit/report.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
}finally{await browser.close();}
