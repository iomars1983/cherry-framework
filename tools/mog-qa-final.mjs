import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const BASE='https://www.mogcomputer.it';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
await mkdir('mog-qa-final',{recursive:true});
const audit={createdAt:new Date().toISOString(),base:BASE,mode:'guest read-only forms, isolated carts',tests:[],checks:[]};
function record(group,name,pass,details={}){const row={group,name,pass:!!pass,...details};audit.checks.push(row);console.log('QA_CHECK '+JSON.stringify(row));}
function round(n){return Math.round(n||0);}
async function inspect(page){
  return await page.evaluate(()=>{
    const v=innerWidth,doc=document.documentElement,body=document.body;
    const sw=Math.max(doc.scrollWidth,body?.scrollWidth||0);
    const form=document.querySelector('form.checkout,.wc-block-checkout');
    const required=[...document.querySelectorAll('input[required],select[required],textarea[required]')].filter(x=>x.type!=='hidden'&&!x.disabled);
    const bad=[];
    for(const e of body.querySelectorAll('input,select,textarea,button')){
      if(bad.length>=7)break;
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      if(r.width<10||r.height<10||s.display==='none'||s.visibility==='hidden')continue;
      if(r.left< -5||r.right>v+5)bad.push({tag:e.tagName.toLowerCase(),type:e.type||'',x:Math.round(r.x),right:Math.round(r.right)});
    }
    return {
      width:v,scrollWidth:sw,overflow:Math.max(0,sw-v),
      title:document.title.slice(0,75),
      h1Count:document.querySelectorAll('h1').length,
      formCount:document.querySelectorAll('form').length,
      requiredCount:required.length,formReady:!!form,
      paymentReady:!!document.querySelector('#payment,.wc-block-components-payment-methods,.wc-block-checkout__payment-method'),
      cartItems:document.querySelectorAll('.woocommerce-cart-form__cart-item,.wc-block-cart-items__row').length,
      fields:document.querySelectorAll('input:not([type=hidden]),textarea,select').length,
      brokenImages:[...document.images].filter(x=>x.complete&&!x.naturalWidth&&x.src).length,
      badControls:bad,siteOrigin:location.origin,path:location.pathname,
      wishlistAnchors:document.querySelectorAll('a[href*="wishlist"],a[href*="lista-desideri"]').length,
      privacyLinks:document.querySelectorAll('a[href*="privacy"]').length
    };
  });
}
async function checkNavigation(ctx,group,path,mode,width,criteria){
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>{if(errors.length<4)errors.push(e.message.slice(0,100))});
  let row;
  try{
    await page.setViewportSize({width,height:950});
    const response=await page.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForTimeout(700);
    const data=await inspect(page);
    row={group,path,mode,http:response?.status()||0,errors:errors.length,...data};
    audit.tests.push(row);
    record(group,mode+' HTTP 200',row.http===200,{http:row.http});
    record(group,mode+' no horizontal overflow',row.overflow<=5,{overflow:row.overflow,width:row.width});
    record(group,mode+' no JS exceptions',errors.length===0,{count:errors.length});
    record(group,mode+' no broken images',row.brokenImages===0,{count:row.brokenImages});
    if(criteria)for(const [name,pred] of criteria)record(group,mode+' '+name,Boolean(pred(data)),{});
  }catch(e){record(group,mode+' load',false,{reason:String(e).slice(0,180)})}
  await page.close();
  return row;
}
const cart=await browser.newContext({locale:'it-IT',viewport:{width:1440,height:950}});
const shopper=await cart.newPage();let productId=null;
try{
  const productResponse=await shopper.request.get(BASE+'/wp-json/wc/store/v1/products?per_page=12&stock_status=instock',{timeout:25000});
  record('store api','products HTTP 200',productResponse.ok(),{http:productResponse.status()});
  if(productResponse.ok()){
    const products=await productResponse.json();
    const candidate=products.find(p=>p.is_purchasable===true&&(p.type==='simple'||!p.type));
    productId=candidate?.id||null;
  }
  record('cart','available purchasable simple product',!!productId);
  if(productId){
    const addResponse=await shopper.goto(BASE+'/?add-to-cart='+encodeURIComponent(productId),{waitUntil:'domcontentloaded',timeout:30000});
    record('cart','add to isolated guest cart',!!addResponse&&(addResponse.status()===200||addResponse.status()===302),{http:addResponse?.status()||0});
    for(const [mode,width] of [['mobile',390],['tablet',768],['desktop',1440]]){
      const row=await checkNavigation(cart,'cart populated','/cart/',mode,width,
        [['contains product',d=>d.cartItems>=1]]);
      if(row && mode==='mobile')record('cart','cart content accessible',row.formCount>=1||row.cartItems>=1,{items:row.cartItems});
    }
    for(const [mode,width] of [['mobile',390],['tablet',768],['desktop',1440]]){
      await checkNavigation(cart,'checkout populated','/checkout/',mode,width,
        [['form present',d=>d.formReady],['payment section present',d=>d.paymentReady],['data-entry fields present',d=>d.fields>=5]]);
    }
  }
}catch(e){record('cart','transactional setup',false,{reason:String(e).slice(0,160)})}
finally{await shopper.close();await cart.close();}
const guest=await browser.newContext({locale:'it-IT',viewport:{width:390,height:950}});
for(const [group,path,criteria] of [
  ['my account','/my-account/',[['login/registration form present',d=>d.formCount>=1]]],
  ['finance form','/compilazione-finanziamento/',[['finance form present',d=>d.formCount>=1],['fields available',d=>d.fields>=8],['privacy link',d=>d.privacyLinks>0]]],
  ['request assistance','/richiesta-assistenza/',[['request form',d=>d.formCount>=1]]],
  ['book collection','/prenota-ritiro/',[['booking form',d=>d.formCount>=1]]],
  ['online withdrawal','/recesso-online/',[['withdrawal form',d=>d.formCount>=1]]],
  ['rma','/rma/',[]]
]){
  for(const [mode,width] of [['mobile',390],['desktop',1440]])await checkNavigation(guest,group,path,mode,width,criteria);
}
const wpPaths=[
 '/wp-admin/admin.php?page=fidelity-manager',
 '/wp-admin/admin.php?page=mog-pc-configurator',
 '/wp-admin/admin.php?page=mogstyle-pages',
 '/wp-admin/admin.php?page=mogstyle-assistenza-page',
 '/wp-admin/admin.php?page=mog-social',
 '/wp-admin/admin.php?page=wpmntz-import-listino-RED',
 '/wp-admin/admin.php?page=wpmntz-import-listino-UM',
 '/wp-admin/admin.php?page=mog-checkout-diagnostics'
];
const guard=await guest.newPage();
for(const path of wpPaths){
 try{
  const response=await guard.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:24000});
  const url=new URL(guard.url());
  const loginDisplayed=await guard.locator('#loginform').count()>0;
  record('admin access protection',path.split('=')[1]||path, url.pathname.startsWith('/wp-login.php')||loginDisplayed,
    {http:response?.status()||0,loginDisplayed,redirected:url.pathname.startsWith('/wp-login.php')});
 }catch(e){record('admin access protection',path,false,{reason:String(e).slice(0,100)})}
}
await guard.close();await guest.close();
await browser.close();
const failed=audit.checks.filter(x=>!x.pass);
audit.summary={checks:audit.checks.length,passed:audit.checks.length-failed.length,failed:failed.length,
  pages:audit.tests.length,maxOverflow:Math.max(0,...audit.tests.map(x=>x.overflow||0)),
  failedTests:failed.map(x=>x.group+': '+x.name),
  noOrdersSubmitted:true,noPaymentSubmitted:true,noLoginAttempted:true,guestOnly:true};
await writeFile('mog-qa-final/transactions.json',JSON.stringify(audit,null,2));
console.log('QA_SUMMARY '+JSON.stringify(audit.summary));
if(failed.length)process.exitCode=1;
