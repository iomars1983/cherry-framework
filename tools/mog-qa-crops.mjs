import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const root='mog-qa-admin/visual-expanded';
const out='mog-qa-admin/crops';
await mkdir(out,{recursive:true});
const files=[
 'fidelity-390.jpg','fidelity-768.jpg','fidelity-1440.jpg',
 'red-390.jpg','red-768.jpg','red-1440.jpg',
 'um-390.jpg','um-768.jpg','um-1440.jpg'
];
let count=0;
for(const f of files){
 const path=root+'/'+f;
 if(!existsSync(path)){console.log('SKIP_MISSING '+f);continue;}
 const meta=await sharp(path).metadata();
 const width=meta.width,height=meta.height;
 const tall=width<=768?1000:1200;
 let ys=[0,950,2300,4500,7500,11000,16000,20000];
 for(const y of ys){
   if(y>=height)continue;
   const h=Math.min(tall,height-y);
   const target=out+'/'+f.replace(/\.jpg$/,'')+'-y'+String(y).padStart(5,'0')+'.jpg';
   await sharp(path).extract({left:0,top:y,width,height:h}).jpeg({quality:72}).toFile(target);
   count++;
 }
 console.log('MOG_QA_CROPS '+JSON.stringify({f,width,height,crops:ys.filter(y=>y<height).length}));
}
console.log('MOG_QA_CROP_DONE '+count);
