import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(path.join(tmpdir(),'quizhunter-agent-'));
let agent;
try{
 await build({stdin:{contents:"export * from './lib/study/agent'; export * from './lib/study/schemas'; export {POST} from './app/api/study/route';",resolveDir:process.cwd(),loader:'ts'},outfile:path.join(dir,'agent.mjs'),bundle:true,platform:'node',format:'esm'});
 agent=await import(pathToFileURL(path.join(dir,'agent.mjs')));
}finally{await rm(dir,{recursive:true,force:true})}
const slide=n=>({number:n,title:`Topic ${n}`,text:'A substantive source concept.',notes:'',images:[],source:'Lecture.pptx',sourceSlide:(n-1)%150+1});
const result=n=>({lesson:{slide:n,title:`Topic ${n}`,bigIdea:'The main idea.',explanation:['An explanation.'],terms:[],example:'Teaching example.',connections:'A connection.',misconceptions:[],check:{question:'Why?',answer:'An answer.'},limitations:[]},cards:[{front:'What is the idea?',back:'The answer.',slide:n},{front:'Why does it happen?',back:'The mechanism.',slide:n}],quiz:[{question:'Which applies?',options:['A','B','C','D'],answer:2,explanation:'C applies; the others do not.',slide:n}],practiceStatus:'ready',practiceNote:'Definitions and mechanisms.'});
const options=(count,changes={})=>({slides:Array.from({length:count},(_,i)=>slide(i+1)),level:'college',previous:{},signal:new AbortController().signal,request:async s=>result(s.number),onStart:()=>{},onComplete:()=>{},onError:()=>{},...changes});

test('agent covers all 150 slides and commits each complete study bundle',async()=>{
 const saved={},visited=[];
 const outcome=await agent.runStudyAgent(options(150,{onStart:s=>visited.push(s.number),onComplete:(key,r)=>saved[key]=r}));
 assert.equal(outcome.completed,150);
 assert.deepEqual(visited,Array.from({length:150},(_,i)=>i+1));
 assert.equal(Object.values(saved).flatMap(r=>r.cards).length,300);
 assert.equal(Object.values(saved).flatMap(r=>r.quiz).length,150);
 assert.equal(saved['college:150'].lesson.slide,150);
 const resumed=[];
 await agent.runStudyAgent(options(150,{previous:saved,request:async s=>{resumed.push(s.number);return result(s.number)}}));
 assert.deepEqual(resumed,[]);
});

test('one malformed slide stays unfinished; resume requests only that slide',async()=>{
 const saved={},failures=[];
 const outcome=await agent.runStudyAgent(options(4,{request:async s=>s.number===2?{...result(2),cards:[]}:result(s.number),onComplete:(k,r)=>saved[k]=r,onError:s=>failures.push(s.number)}));
 assert.equal(outcome.completed,3);assert.deepEqual(failures,[2]);
 const resumed=[];
 await agent.runStudyAgent(options(4,{previous:saved,request:async s=>{resumed.push(s.number);return result(s.number)},onComplete:(k,r)=>saved[k]=r}));
 assert.deepEqual(resumed,[2]);assert.equal(Object.keys(saved).length,4);
});

test('pause retains finished slides and does not start later requests',async()=>{
 const controller=new AbortController(),saved={};let calls=0;
 await assert.rejects(agent.runStudyAgent(options(150,{signal:controller.signal,request:async s=>{calls++;return result(s.number)},onComplete:(k,r)=>{saved[k]=r;if(calls===3)controller.abort()}})),{name:'AbortError'});
 assert.equal(calls,3);assert.equal(Object.keys(saved).length,3);
});

test('billing errors halt immediately and repeated source failures halt after three',async()=>{
 let calls=0;
 await assert.rejects(agent.runStudyAgent(options(150,{request:async()=>{calls++;throw new agent.StudyRequestError('Billing limit',429)}})),/Billing limit/);
 assert.equal(calls,1);calls=0;
 await assert.rejects(agent.runStudyAgent(options(150,{request:async()=>{calls++;throw Error('Invalid output')}})),/three consecutive errors/);
 assert.equal(calls,3);
});

test('blank slides need an explicit practice limitation; wrong references and duplicates fail',()=>{
 const blank={...result(1),cards:[],quiz:[],practiceStatus:'not_applicable',practiceNote:'This is a title-only divider with no substantive content.'};
 assert.equal(agent.validateAgentResult(blank,1).practiceStatus,'not_applicable');
 assert.throws(()=>agent.validateAgentResult({...blank,practiceNote:''},1));
 assert.throws(()=>agent.validateAgentResult(result(2),1));
 const duplicate=result(1);duplicate.cards[1].front=duplicate.cards[0].front;
 assert.throws(()=>agent.validateAgentResult(duplicate,1));
 const wrongSource=result(1);wrongSource.quiz[0].slide=2;
 assert.throws(()=>agent.validateAgentResult(wrongSource,1));
});

test('context includes the last slide and nearby titles in a 600-slide collection',()=>{
 const context=agent.agentContext(Array.from({length:600},(_,i)=>slide(i+1)),600);
 assert.match(context,/Study slide 600: Topic 600/);
 assert.match(context,/Study slide 599: Topic 599/);
 assert.ok(context.length<=12000);
});

test('saved agent checkpoints survive restore and cannot refer to missing source slides',()=>{
 const pack={version:1,deck:{name:'Lesson',slides:[slide(1)],warnings:[]},lessons:{'detailed:college:1':result(1).lesson},cards:result(1).cards,quiz:result(1).quiz,agentResults:{'college:1':result(1)}};
 assert.ok(agent.packSchema.parse(JSON.parse(JSON.stringify(pack))).agentResults['college:1']);
 assert.equal(agent.packSchema.safeParse({...pack,agentResults:{'college:2':result(2)}}).success,false);
 assert.equal(agent.packSchema.safeParse({...pack,agentResults:{'college:2':result(1)}}).success,false);
});

test('agent API sends one structured request and validates its complete bundle',async()=>{
 const realFetch=globalThis.fetch;let body;
 try{
  globalThis.fetch=async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');body=JSON.parse(init.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result(150))}]}]})};
  const input={mode:'agent',slides:[slide(150)],depth:'detailed',level:'college'};
  const make=data=>new Request('http://localhost/api/study',{method:'POST',headers:{'x-openai-key':'sk-test-not-a-real-credential','Content-Type':'application/json'},body:JSON.stringify(data)});
  const response=await agent.POST(make(input));
  assert.equal(response.status,200);assert.equal((await response.json()).lesson.slide,150);
  assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.name,'study_agent');
  assert.match(body.instructions,/Explain every substantive bullet/);
  assert.equal((await agent.POST(make({...input,slides:[slide(1),slide(2)]}))).status,400);
  globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result(1))}]}]});
  assert.equal((await agent.POST(make(input))).status,502);
 }finally{globalThis.fetch=realFetch}
});
