import type {Slide,StudySettings} from './types';
import {studyBatches} from './batches';

// Wait for active work to finish before propagating a failure, so a PDF worker
// is never destroyed while another page is still rendering.
export async function mapLimited<T,R>(items:T[],limit:number,work:(item:T,index:number)=>Promise<R>):Promise<R[]>{
 const result:R[]=new Array(items.length);let next=0,failed=false,error:unknown;
 await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},async()=>{
  while(!failed&&next<items.length){const index=next++;try{result[index]=await work(items[index],index)}catch(e){failed=true;error=e}}
 }));
 if(failed)throw error;return result;
}

export function generationBatches(slides:Slide[],mode:'explain'|'cards'|'quiz',provider:'local'|'openai',pace:StudySettings['pace']='thorough'){
 if(provider!=='local')return studyBatches(slides,mode);
 if(mode==='explain'||pace!=='quick')return studyBatches(slides,'explain');
 // Small text-only batches amortize model/prompt work. Visual and dense pages
// stay separate to avoid overwhelming a local model or losing context.
 const batches:Slide[][]=[];let batch:Slide[]=[],characters=0;
 for(const slide of slides){
  const size=slide.text.length+slide.notes.length;
  if(batch.length&&(slide.images.length||batch.length===3||characters+size>6000)){batches.push(batch);batch=[];characters=0}
  if(slide.images.length||size>6000){batches.push([slide]);continue}
  batch.push(slide);characters+=size;
 }
 if(batch.length)batches.push(batch);
 return batches.flatMap(batch=>studyBatches(batch,mode));
}

export function textOnlyPDF(items:{str?:string;hasEOL?:boolean;transform?:number[]}[],operators:number[],ops:Record<string,number>):boolean{
 if(!items.some(i=>i.str?.trim())||!operators.length)return false;
 const visual=new Set(Object.entries(ops).filter(([name])=>/paint|path|stroke|fill|shading|form|group|annotation/i.test(name)&&!/^set/.test(name)).map(([,value])=>value));
 if(operators.some(op=>visual.has(op)))return false;
 // Layout-heavy text can encode relationships. Keep its image too.
 const starts=items.filter((_,i)=>i===0||items[i-1]?.hasEOL).flatMap(i=>i.transform?[Math.round(i.transform[4]/30)]:[]);
 return starts.length>0&&new Set(starts).size<=2&&Math.max(...starts)-Math.min(...starts)<=2;
}
