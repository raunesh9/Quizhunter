import type {z} from 'zod';
import {requestSchema,outputSchemas,validateOutput} from './schemas';
import {INSTRUCTIONS,jobs,QUICK_INSTRUCTIONS} from './prompts';
import {removeHousekeepingOutput} from './practice-quality';

export const LOCAL_MODEL='gemma3:4b';
const OLLAMA='http://127.0.0.1:11434';
export function isLocalRequest(request:Request){return ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname)}

export async function localAIStatus(signal?:AbortSignal){
 const response=await fetch(OLLAMA+'/api/tags',{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(3000)]):AbortSignal.timeout(3000)});
 if(!response.ok)throw Error('Local AI is not responding.');
 const data=await response.json() as {models?:{name:string}[]};
 return {running:true,ready:!!data.models?.some(m=>m.name===LOCAL_MODEL),model:LOCAL_MODEL};
}

export class LocalAIError extends Error{constructor(message:string,public status=503){super(message)}}
type LocalSchema={type?:string;properties?:Record<string,LocalSchema>;items?:LocalSchema;[key:string]:unknown};
function localSchema(mode:keyof typeof outputSchemas,refs:number[],quick=false):LocalSchema{
 if(quick&&refs.length>1&&(mode==='cards'||mode==='quiz')){
  const pages=Object.fromEntries(refs.map(ref=>{
   const practice=localSchema(mode,[ref],quick) as LocalSchema;
   const properties={practiceStatus:{type:'string',enum:['ready','not_applicable']},practiceNote:{type:'string',maxLength:250},...practice.properties};
   return [String(ref),{type:'object',properties,required:Object.keys(properties),additionalProperties:false}];
  }));
  return {type:'object',properties:{pages:{type:'object',properties:pages,required:Object.keys(pages),additionalProperties:false}},required:['pages'],additionalProperties:false};
 }
 const schema=structuredClone(outputSchemas[mode]) as LocalSchema;
 const constrain=(s:LocalSchema,name='')=>{
  if(s.type==='string')s.maxLength=1500;
  if(name==='slide')s.enum=refs;
  if(name==='answer'&&s.type==='integer'){s.minimum=0;s.maximum=3}
  if(s.type==='array'){
   s.maxItems=({options:4,cards:refs.length*(quick?2:4),quiz:refs.length*(quick?1:2),explanation:quick?2:5,terms:quick?3:8,misconceptions:quick?1:3,limitations:4} as Record<string,number>)[name]??15;
   if(name==='options')s.minItems=4;
   if(s.items)constrain(s.items);
  }
  if(s.properties?.question&&s.properties?.options&&s.properties?.answer){
   delete s.properties.answer;
   s.properties.correctAnswer={type:'string',description:'Copy the exact text of the correct option. Do not use a numeric index.'};
   s.required=(s.required as string[]).map(key=>key==='answer'?'correctAnswer':key);
  }
  for(const [key,value] of Object.entries(s.properties??{}))constrain(value,key);
 };
 constrain(schema);
 return schema;
}
// Small models can confuse one-based and zero-based indices. Ask for the
// correct option's text and derive the numeric index in code instead.
function mapLocalAnswers(value:unknown,mode:string){
 if(mode!=='quiz'&&mode!=='agent')return value;
 if(!value||typeof value!=='object')throw Error('Missing study output.');
 const root=value as Record<string,unknown>;
 if(!Array.isArray(root.quiz))throw Error('Missing quiz questions.');
 root.quiz=root.quiz.map(item=>{
  const q=item as Record<string,unknown>;
  if(!q||typeof q.correctAnswer!=='string'||!Array.isArray(q.options)||!q.options.every(o=>typeof o==='string'))throw Error('Each quiz needs correctAnswer copied exactly from its options.');
  const clean=(s:string)=>s.trim().replace(/^[A-D][.)]\s+/,'');
  const options=(q.options as string[]).map(clean),correct=normalizedAnswer(clean(q.correctAnswer));
  const matches=options.flatMap((option,index)=>normalizedAnswer(option)===correct?[index]:[]);
  if(matches.length!==1)throw Error('correctAnswer must exactly match one distinct quiz option.');
  const {correctAnswer,...rest}=q;void correctAnswer;
  return {...rest,options,answer:matches[0]};
 });
 return root;
}
const normalizedAnswer=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase();
function validateLocalOutput(body:z.infer<typeof requestSchema>,value:unknown){
 const refs=body.slides.map(s=>s.number);
 if(body.pace==='quick'&&refs.length>1&&(body.mode==='cards'||body.mode==='quiz')){
  const pages=value&&typeof value==='object'&&'pages' in value?value.pages:undefined;
  if(!pages||typeof pages!=='object'||Array.isArray(pages)||Object.keys(pages).length!==refs.length)throw Error('Every source page needs its own result in pages.');
  const items:unknown[]=[];
  for(const ref of refs){
   const page=(pages as Record<string,Record<string,unknown>>)[String(ref)];
   if(!page||!['ready','not_applicable'].includes(String(page.practiceStatus))||typeof page.practiceNote!=='string'||!Array.isArray(page[body.mode]))throw Error(`Missing a valid practice decision for page ${ref}.`);
   const original=page[body.mode] as unknown[];
   const result=validateOutput(body.mode,mapLocalAnswers(removeHousekeepingOutput(body.mode,page),body.mode),[ref]) as Record<string,unknown>;
   const practice=result[body.mode] as unknown[];
   if(page.practiceStatus==='ready'&&!original.length)throw Error(`Ready page ${ref} needs a useful question. Otherwise mark not_applicable with a specific reason.`);
   if(page.practiceStatus==='not_applicable'&&(original.length||page.practiceNote.trim().length<10))throw Error(`Excluded page ${ref} needs empty practice and a specific reason.`);
   items.push(...practice);
  }
  return validateOutput(body.mode,{[body.mode]:items},refs);
 }
 return validateOutput(body.mode,mapLocalAnswers(removeHousekeepingOutput(body.mode,value),body.mode),refs);
}
export async function generateLocal(body:z.infer<typeof requestSchema>,signal:AbortSignal){
 let ready=false;
 try{ready=(await localAIStatus(signal)).ready}catch{throw new LocalAIError('Local AI is not running. Open the Quizhunter desktop app, or start Ollama, then try again.')}
 if(!ready)throw new LocalAIError('The local study model is not installed yet. Finish downloading Gemma 3 in Ollama, then try again.');
 const sourceLength=body.slides.reduce((n,s)=>n+s.text.length+s.notes.length,0);
 if(sourceLength>30000)throw new LocalAIError('This page has too much text for the local model. Split it into smaller pages and try again.',400);
 const task=body.mode==='agent'?`Create one complete study bundle for this source page. Explain its main ideas in 3-5 concise paragraphs, define key terms, give one labeled teaching example, and note source limitations. Select at most 4 distinct flashcards and at most 2 multiple-choice questions; do not force a quota. A ready bundle needs at least one substantive card and one quiz. Each quiz has four distinct options; correctAnswer is the exact text of its correct option. Use the exact supplied study slide number on the lesson and every question. For blank, title-only, references-only or unreadable pages, set practiceStatus to not_applicable, return empty cards and quiz, and explain the precise limitation in practiceNote. Otherwise set practiceStatus to ready. Keep the full response under 900 words.`:jobs[body.mode];
 const quick=body.pace==='quick';
 const batched=quick&&body.slides.length>1&&(body.mode==='cards'||body.mode==='quiz');
 const schema=localSchema(body.mode,body.slides.map(s=>s.number),quick);
 const emptyPractice="Topic names alone are not knowledge to test. A cover saying 'Introduction to Biology / Course Overview / September 2026' has NO study content. Do not ask about the course focus, subject, title, or dates. "+(body.mode==='cards'?'For a page with no substantive facts or concepts, return exactly {"cards":[]}.':body.mode==='quiz'?'For a page with no substantive facts or concepts, return exactly {"quiz":[]}.':'For agent mode, a page with no substantive facts or concepts needs practiceStatus not_applicable, empty cards and quiz, and a specific practiceNote.');
 const practiceRule=batched?`Return a pages object with these exact keys: ${body.slides.map(s=>s.number).join(', ')}. Decide separately for EVERY source page. Under each key, provide practiceStatus, practiceNote, and ${body.mode}. Substantive facts need ready and at least one useful item. A title-only, administrative, or unreadable page needs not_applicable, a specific reason in practiceNote, and empty ${body.mode}. Keep each item grounded in its own page. Never omit a page.`:emptyPractice;
 const messages:{role:string;content:string;images?:string[]}[]=[
  {role:'system',content:INSTRUCTIONS+'\n'+task+(quick?'\n'+QUICK_INSTRUCTIONS:'')+'\nReturn only a JSON object matching the supplied schema. Use plain ASCII punctuation, with straight double quotes for JSON delimiters. Never use curly quotation marks. Never leave a question or answer blank. Write concise strings, without repeating punctuation or embedding JSON fields inside text. Quiz options contain only answer text, without A/B/C/D prefixes. For every quiz item, supply correctAnswer by copying the exact correct option text. Do not generate an answer index. The app computes that index. Explain the correct option by its text, not by its letter or number.'},
  {role:'user',content:JSON.stringify({task:body.mode,level:body.level,depth:body.depth,outline:body.context.slice(0,1500),studentQuestion:body.question,practiceRule})},
  ...body.slides.map(s=>({role:'user',content:JSON.stringify({slide:s.number,sourceDocument:s.source,originalPosition:s.sourceSlide,title:s.title,text:s.text,speakerNotes:s.notes}),...(s.images.length?{images:s.images.map(image=>image.slice(image.indexOf(',')+1))}:{})})),
 ];
 const timeout=AbortSignal.any([signal,AbortSignal.timeout(600000)]);
 for(let attempt=0;attempt<2;attempt++){
  const response=await fetch(OLLAMA+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:LOCAL_MODEL,messages,stream:false,format:schema,options:{temperature:0,num_ctx:sourceLength>12000?16384:8192,num_predict:3072},keep_alive:'10m'}),signal:timeout});
  if(!response.ok)throw new LocalAIError('The local model stopped before completing its answer. Your completed work is kept. Try generating flashcards or a quiz separately.');
  const data=await response.json() as {message?:{content?:string};done?:boolean;done_reason?:string};
  const text=data.message?.content??'';
  try{
   if(!data.done||data.done_reason==='length')throw Error('The response was cut short.');
   return validateLocalOutput(body,JSON.parse(text));
  }catch(error){
   if(attempt===1)throw new LocalAIError('The local model returned unreadable or incomplete study material twice. Your completed work is kept. Try this page again or generate flashcards separately.',502);
   messages.push({role:'user',content:'Try again with a fresh, concise JSON object. The previous answer failed these checks: '+(error instanceof Error?error.message.slice(0,800):'Invalid output')+'. Use straight ASCII double quotes and no curly quotes. '+practiceRule+' For agent mode only, ready pages need at least 1 card and 1 quiz. Do not copy the previous response.'});
  }
 }
 throw new LocalAIError('Local generation did not complete.',502);
}
