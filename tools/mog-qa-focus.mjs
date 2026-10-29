import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base='https://www.mogcomputer.it';
const targets=[['finance','/compilazione-finanziamento/'],['checkout','/checkout/'],['pagamenti','/pagamenti/'],['spedizioni','/spedizioni/'],['assistenza','/assistenza-informatica/'],['configuratore','/pc-configurator/'],['prodotto','/prodotto/pc-gaming-viewstrike-5060/'],['staff','/staff-assistenza/'],['fidelity','/fydelity-manager/'],['prenota','/prenota-ritiro/']];
const sizes=[['mobile',390,844],['tablet',768,980],['desktop',1440,960]];
await mkdir('mog-qa-focus',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const entries=[];
for(const [slug,path] of targets)for(const [mode,width,height] of sizes){
 const ctx=await browser.newContext({viewport:{width,height},locale:'it-IT',deviceScaleFactor:1});
 const page=await ctx.newPage();let http=0,js=[];
 page.on('pageerror',e=>{if(js.length<4)js.push(e.message.slice(0,140))});
 try{
  const res=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:28000});http=res?.status()||0;await page.waitForTimeout(550);
  const data=await page.evaluate(()=>{
   const v=innerWidth,doc=document.documentElement;
   function visible(e){let r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'}
   function box(e){if(!e)return null;let r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {tag:e.tagName,cls:String(e.className||'').slice(0,80),x:Math.round(r.x),right:Math.round(r.right),top:Math.round(r.top+scrollY),bottom:Math.round(r.bottom+scrollY),w:Math.round(r.width),h:Math.round(r.height),font:cs.fontSize}}
   const h1=[...document.querySelectorAll('h1')].map(e=>({text:(e.innerText||'').replace(/\s+/g,' ').trim().slice(0,90),...box(e),visible:visible(e)}));
   const headings=[...document.querySelectorAll('h2,h3')].filter(visible).slice(0,8).map(e=>({text:(e.innerText||'').replace(/\s+/g,' ').trim().slice(0,70),...box(e)}));
   const buttons=[...document.querySelectorAll('button,input[type=submit],a.button')].filter(visible).slice(0,14).map(e=>({text:(e.innerText||e.value||'').replace(/\s+/g,' ').trim().slice(0,60),...box(e)}));
   const tooWide=[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible).filter(e=>{let r=e.getBoundingClientRect();return r.right>v+4||r.left< -4}).slice(0,5).map(e=>({name:e.name,...box(e)}));
   return {viewport:v,scrollWidth:Math.max(doc.scrollWidth,document.body.scrollWidth),scrollHeight:doc.scrollHeight,pathname:location.pathname,h1,headings,buttons,tooWide,forms:document.querySelectorAll('form').length,finance:box(document.querySelector('.wpcf7')),checkoutPresent:!!document.querySelector('form.checkout,.wc-block-checkout'),footer:box(document.querySelector('.mog-footer-ultra,.mog-footer-ultra-grid'))};
  });
  entries.push({slug,mode,width,http,js,data});
  console.log('FOCUS '+slug+' '+mode+' HTTP='+http+' sw='+data.scrollWidth+' h1='+data.h1.map(x=>x.text).join('|'));
 }catch(e){entries.push({slug,mode,width,http,error:String(e).slice(0,200),js});console.log('FOCUS '+slug+' '+mode+' ERR '+String(e).slice(0,120))}
 await ctx.close();
}
const access=[];
for(const path of ['/wp-admin/admin.php?page=fidelity-manager','/wp-admin/admin.php?page=mog-pcc-admin','/wp-admin/admin.php?page=mog-social','/wp-admin/admin.php?page=mog-layout-interno']){
 const ctx=await browser.newContext(),p=await ctx.newPage();
 try{const r=await p.goto(base+path,{waitUntil:'domcontentloaded',timeout:20000});access.push({path,http:r?.status(),location:new URL(p.url()).pathname,loginDisplayed:await p.locator('#loginform').count()>0})}
 catch(e){access.push({path,error:String(e).slice(0,130)})}
 await ctx.close();
}
const cartTest={};
const ctx=await browser.newContext({locale:'it-IT'}),p=await ctx.newPage();
try{
 const pr=await p.request.get(base+'/wp-json/wc/store/v1/products?per_page=6&stock_status=instock',{timeout:25000});
 cartTest.productsHttp=pr.status();
 const products=pr.ok()?await pr.json():[];
 const candidate=products.find(x=>x.is_purchasable===true && (x.type==='simple'||!x.type));
 cartTest.candidate=!!candidate;
 if(candidate){
  cartTest.productId=candidate.id;
  let res=await p.goto(base+'/?add-to-cart='+encodeURIComponent(candidate.id),{waitUntil:'domcontentloaded',timeout:28000});cartTest.addHttp=res?.status();
  res=await p.goto(base+'/cart/',{waitUntil:'domcontentloaded',timeout:28000});cartTest.cartHttp=res?.status();
  cartTest.cart=await p.evaluate(()=>({items:document.querySelectorAll('.woocommerce-cart-form__cart-item,.wc-block-cart-items__row').length,empty:document.body.innerText.includes('Il tuo carrello è attualmente vuoto')}));
  res=await p.goto(base+'/checkout/',{waitUntil:'domcontentloaded',timeout:28000});cartTest.checkoutHttp=res?.status();
  cartTest.checkout=await p.evaluate(()=>({form:!!document.querySelector('form.checkout,.wc-block-checkout'),payment:!!document.querySelector('#payment,.wc-block-components-payment-methods')}));
 }
}catch(e){cartTest.error=String(e).slice(0,190)}
await ctx.close();await browser.close();
await writeFile('mog-qa-focus/results.json',JSON.stringify({at:new Date().toISOString(),entries,access,cartTest},null,2));
console.log('FOCUS_SUMMARY '+JSON.stringify({count:entries.length,errors:entries.filter(x=>x.error).length,access,cartTest}));
