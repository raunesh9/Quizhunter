import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(path.join(tmpdir(),'quizhunter-local-'));
let POST,GET;
try{
 await build({stdin:{contents:"export {POST} from './app/api/study/route'; export {GET} from './app/api/local-ai/route';",resolveDir:process.cwd(),loader:'ts'},outfile:path.join(dir,'local.mjs'),bundle:true,platform:'node',format:'esm'});
 ({POST,GET}=await import(pathToFileURL(path.join(dir,'local.mjs'))));
}finally{await rm(dir,{recursive:true,force:true})}
const input={mode:'cards',slides:[{number:1,title:'Cells',text:'Mitochondria generate ATP.',notes:'',images:['data:image/jpeg;base64,YWJj']}],depth:'detailed',level:'college'};
const good={cards:[{front:'What do mitochondria generate?',back:'ATP.',slide:1}]};
const make=(data=input,host='localhost',extra={})=>new Request(`http://${host}/api/study`,{method:'POST',headers:{'Content-Type':'application/json','x-study-provider':'local',...extra},body:JSON.stringify(data)});

test('local generation needs no key, supplies image bytes and never contacts OpenAI',async()=>{
 const real=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,init)=>{calls.push(String(url));assert.match(String(url),/^http:\/\/127\.0\.0\.1:11434\/api\//);if(String(url).endsWith('/tags'))return Response.json({models:[{name:'gemma3:4b'}]});const body=JSON.parse(init.body);assert.equal(body.model,'gemma3:4b');assert.equal(body.stream,false);assert.ok(body.format.properties.cards);assert.equal(body.format.properties.cards.maxItems,4);assert.deepEqual(body.format.properties.cards.items.properties.slide.enum,[1]);assert.equal(body.options.num_ctx,8192);assert.deepEqual(body.messages.at(-1).images,['YWJj']);assert.equal(init.headers.Authorization,undefined);return Response.json({done:true,message:{content:JSON.stringify(good)}})};
  const response=await POST(make());assert.equal(response.status,200);assert.deepEqual(await response.json(),good);assert.equal(calls.length,2);
 }finally{globalThis.fetch=real}
});
test('local mode rejects remote hosts and cross-origin requests before contacting the model',async()=>{
 const real=globalThis.fetch;
 try{globalThis.fetch=async()=>{throw Error('Must not contact local engine')};assert.equal((await POST(make(input,'example.com'))).status,403);assert.equal((await POST(make(input,'localhost',{origin:'https://example.com'}))).status,403);assert.equal((await GET(new Request('https://example.com/api/local-ai'))).status,403)}finally{globalThis.fetch=real}
});
test('missing local model returns an actionable error without using a cloud fallback',async()=>{
 const real=globalThis.fetch;let count=0;
 try{globalThis.fetch=async()=>{count++;return Response.json({models:[]})};const response=await POST(make());assert.equal(response.status,503);assert.match((await response.json()).error,/not installed/);assert.equal(count,1)}finally{globalThis.fetch=real}
});
test('invalid local output is repaired once and only validated content is returned',async()=>{
 const real=globalThis.fetch;let attempts=0;
 try{globalThis.fetch=async url=>String(url).endsWith('/tags')?Response.json({models:[{name:'gemma3:4b'}]}):Response.json({done:true,message:{content:JSON.stringify(++attempts===1?{cards:[{...good.cards[0],slide:2}]}:good)}});assert.equal((await POST(make())).status,200);assert.equal(attempts,2);attempts=0;globalThis.fetch=async url=>String(url).endsWith('/tags')?Response.json({models:[{name:'gemma3:4b'}]}):(++attempts,Response.json({done:true,message:{content:JSON.stringify({cards:[{...good.cards[0],back:'[object Object]'}]})}}));assert.equal((await POST(make())).status,502);assert.equal(attempts,2)}finally{globalThis.fetch=real}
});

test('local quiz computes answer indices from option text and strips letter prefixes',async()=>{
 const real=globalThis.fetch;
 const question={question:'What do ATP and NADPH provide?',options:['A. Carbon dioxide','B. Waste','C. Energy for sugar synthesis','D. Light'],correctAnswer:'C. Energy for sugar synthesis',explanation:'They support the Calvin cycle.',slide:1};
 try{
  globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/tags'))return Response.json({models:[{name:'gemma3:4b'}]});const schema=JSON.parse(init.body).format.properties.quiz.items;assert.ok(schema.properties.correctAnswer);assert.equal(schema.properties.answer,undefined);assert.equal(schema.properties.options.minItems,4);assert.equal(schema.properties.options.maxItems,4);return Response.json({done:true,message:{content:JSON.stringify({quiz:[question]})}})};
  const response=await POST(make({...input,mode:'quiz'}));assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.quiz[0].answer,2);assert.equal(data.quiz[0].options[2],'Energy for sugar synthesis');assert.equal(data.quiz[0].correctAnswer,undefined);
 }finally{globalThis.fetch=real}
});

test('Quick mode reduces lesson and practice output while preserving validation and source coverage',async()=>{
 const real=globalThis.fetch;
 try{
  globalThis.fetch=async(url,init)=>{
   if(String(url).endsWith('/tags'))return Response.json({models:[{name:'gemma3:4b'}]});
   const body=JSON.parse(init.body);
   assert.equal(body.format.properties.cards.maxItems,2);
   assert.equal(body.format.properties.quiz.maxItems,1);
   assert.equal(body.format.properties.lesson.properties.explanation.maxItems,2);
   assert.match(body.messages[0].content,/250-400 words/);
   return Response.json({done:true,message:{content:JSON.stringify({lesson:{slide:1,title:'Cells',bigIdea:'Cells need energy.',explanation:['Mitochondria produce ATP to supply energy.'],terms:[],example:'A cell uses ATP for work.',connections:'Energy powers cellular processes.',misconceptions:[],check:{question:'What do mitochondria produce?',answer:'ATP.'},limitations:[]},cards:good.cards,quiz:[{question:'What do mitochondria generate?',options:['ATP','DNA','Cellulose','Starch'],correctAnswer:'ATP',explanation:'ATP provides energy for cellular processes.',slide:1}],practiceStatus:'ready',practiceNote:'Cellular energy.'})}});
  };
  const response=await POST(make({...input,mode:'agent',pace:'quick'}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.cards.length,1);assert.equal(data.quiz[0].answer,0);
 }finally{globalThis.fetch=real}
});

test('Quick batches require a separate grounded result or explicit exclusion for every page',async()=>{
 const real=globalThis.fetch;let attempts=0;
 const slides=[input.slides[0],{...input.slides[0],number:2}];
 const question={question:'What do mitochondria produce?',options:['ATP','DNA','Starch','Cellulose'],correctAnswer:'ATP',explanation:'They supply ATP for cellular work.',slide:1};
 try{
  globalThis.fetch=async(url,init)=>{
   if(String(url).endsWith('/tags'))return Response.json({models:[{name:'gemma3:4b'}]});
   const schema=JSON.parse(init.body).format.properties.pages;assert.deepEqual(schema.required,['1','2']);
   assert.deepEqual(schema.properties['2'].properties.quiz.items.properties.slide.enum,[2]);
   const pages={'1':{practiceStatus:'ready',practiceNote:'Cellular energy.',quiz:[question]}};
   if(++attempts>1)pages['2']={practiceStatus:'not_applicable',practiceNote:'A title-only page without substantive facts.',quiz:[]};
   return Response.json({done:true,message:{content:JSON.stringify({pages})}});
  };
  const response=await POST(make({...input,slides,mode:'quiz',pace:'quick'}));
  assert.equal(response.status,200);assert.equal(attempts,2);const data=await response.json();assert.equal(data.quiz.length,1);assert.equal(data.quiz[0].answer,0);
 }finally{globalThis.fetch=real}
});
