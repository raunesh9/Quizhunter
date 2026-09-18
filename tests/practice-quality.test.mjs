import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(path.join(tmpdir(),'quizhunter-practice-'));
let study;
try{
 await build({stdin:{contents:"export * from './lib/study/practice-quality'; export * from './lib/study/curation'; export * from './lib/study/schemas'; export {POST} from './app/api/study/route';",resolveDir:process.cwd(),loader:'ts'},outfile:path.join(dir,'practice.mjs'),bundle:true,platform:'node',format:'esm'});
 study=await import(pathToFileURL(path.join(dir,'practice.mjs')));
}finally{await rm(dir,{recursive:true,force:true})}
const slide=(number=1,changes={})=>({number,title:'Cell biology',text:'Mitochondria produce ATP, which provides energy for cellular processes.',notes:'',images:[],...changes});
const card={front:'What do mitochondria produce?',back:'ATP, which provides energy for cellular processes.',slide:1};
const quiz={question:'What do mitochondria produce?',options:['ATP','DNA','Starch','Cellulose'],answer:0,explanation:'Mitochondria produce ATP to power cellular processes.',slide:1};
const request=(mode,slides)=>new Request('http://localhost/api/study',{method:'POST',headers:{'x-study-provider':'local','Content-Type':'application/json'},body:JSON.stringify({mode,slides,depth:'detailed',level:'college'})});

test('quiz rounds shuffle the whole collection, preserve answers, and reshuffle missed questions',()=>{
 const questions=[quiz,{...quiz,slide:2,answer:1},{...quiz,slide:3,answer:2},{...quiz,slide:4,answer:3}];
 const original=structuredClone(questions);
 const first=study.quizRound([0,1,2,3],[],()=>0);
 assert.notDeepEqual(first,[0,1,2,3]);assert.deepEqual([...first].sort(),[0,1,2,3]);
 const answers=Object.fromEntries(first.map(id=>[id,questions[id].answer]));
 assert.equal(first.filter(id=>answers[id]===questions[id].answer).length,4);
 const retake=study.quizRound([0,1,2,3],first,()=>0);
 assert.notDeepEqual(retake,first);assert.deepEqual([...retake].sort(),[0,1,2,3]);
 const missed=first.filter(id=>id===1||id===3);
 assert.deepEqual(study.quizRound(missed,missed,()=>.999).sort(),[1,3]);
 assert.deepEqual(study.quizRound([]),[]);assert.deepEqual(study.quizRound([2]),[2]);
 assert.deepEqual(questions,original);
});

test('opening pages are judged by evidence, retaining useful definitions, notes and diagrams',()=>{
 assert.match(study.practiceSkipReason(slide(1,{text:'Cell biology'})),/heading/);
 assert.match(study.practiceSkipReason(slide(9,{text:''})),/no readable/);
 assert.equal(study.practiceSkipReason(slide(1)),null);
 assert.equal(study.practiceSkipReason(slide(1,{title:'ATP is an energy carrier',text:'ATP is an energy carrier'})),null);
 assert.equal(study.practiceSkipReason(slide(1,{text:'Cell biology',notes:'Mitochondria produce ATP.'})),null);
 assert.equal(study.practiceSkipReason(slide(1,{text:'Cell biology',images:['data:image/jpeg;base64,YWJj']})),null);
});

test('flashcards reject leaked response code and repetition but keep educational code, formulas and Unicode',()=>{
 for(const back of ['{"front":"What?","back":"Answer","slide":1}','{"cards": [{"front": "What?"}]}','energy '.repeat(12),'[object Object]','x'.repeat(180),'bad\uFFFDtext']){
  assert.equal(study.cardSchema.safeParse({...card,back}).success,false,back);
 }
 for(const back of ['ΔG = ΔH − TΔS.','for (let i = 0; i < 3; i++) { print(i); } prints 0, 1, and 2.','JSON example: {"name":"Ada","age":20}.','ATP 是细胞的能量载体。']){
  assert.equal(study.cardSchema.safeParse({...card,back}).success,true,back);
 }
});

test('housekeeping and page-dependent prompts are excluded without confusing microscope slides',()=>{
 for(const question of ['What is the purpose of the first slide?','What is the main topic of this presentation?','According to slide 2, what is ATP?','What does the slide show?','What is the title of the lecture?','What is the title of this introductory cell biology course?','What is the primary focus of the course?']){
  assert.equal(study.quizSchema.safeParse({...quiz,question}).success,false,question);
  assert.equal(study.cardSchema.safeParse({...card,front:question}).success,false,question);
 }
 assert.equal(study.quizSchema.safeParse({...quiz,question:'Why is a microscope slide covered with a coverslip?'}).success,true);
 assert.equal(study.quizSchema.safeParse({...quiz,question:'What is the role of MHC in antigen presentation?'}).success,true);
 assert.equal(study.cardSchema.safeParse({...card,front:'What is the purpose of a class in Python?'}).success,true);
 assert.equal(study.validateOutput('cards',{cards:[]},[1]).cards.length,0);
 assert.equal(study.validateOutput('quiz',{quiz:[]},[1]).quiz.length,0);
});

test('curation removes corrupt and duplicate practice without throwing away good cards or sources',()=>{
 const slides=[slide(),slide(2),slide(3,{text:'Cell biology'})];
 const result=study.curatePractice([card,{...card,slide:2}, {...card,front:'Broken?',back:'[object Object]',slide:2},{...card,slide:3}], [quiz,{...quiz,question:'What is the purpose of the first slide?'}],slides);
 assert.deepEqual(result.cards.items,[card]);assert.equal(result.cards.removed,3);assert.deepEqual(result.cards.retry,[2]);
 assert.deepEqual(result.quiz.items,[quiz]);assert.deepEqual(result.quiz.retry,[1]);
 assert.equal(slides.length,3);
});

test('old packs recover good practice and invalidate broken checkpoints so rebuilding can resume',()=>{
 const lesson={slide:2,title:'Cells',bigIdea:'Cells need energy.',explanation:['ATP provides energy.'],terms:[],example:'Example',connections:'Connection',misconceptions:[],check:{question:'Why?',answer:'Energy'},limitations:[]};
 const broken={...card,back:'[object Object]',slide:2};
 const raw={version:1,deck:{name:'Cells',slides:[slide(),slide(2)],warnings:[]},lessons:{'detailed:college:2':lesson},cards:[card,broken],quiz:[quiz],progress:{cards:[1,2],quiz:[1]},agentResults:{'college:2':{lesson,cards:[broken],quiz:[{...quiz,slide:2}],practiceStatus:'ready',practiceNote:'Cell concepts.'}}};
 assert.equal(study.packSchema.safeParse(raw).success,false);
 const {pack,removed}=study.restoreStudyPack(raw);
 assert.equal(removed,1);assert.deepEqual(pack.cards,[card]);assert.deepEqual(pack.progress.cards,[1]);assert.deepEqual(pack.agentResults,{});
 assert.equal(pack.deck.slides.length,2);assert.deepEqual(pack.lessons,raw.lessons);
 assert.throws(()=>study.restoreStudyPack({...raw,progress:{cards:[400],quiz:[]}}));
});

test('certain title-only pages produce no practice without invoking a model; useful page 1 still does',async()=>{
 const real=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{throw Error('Title-only text needs no model call')};
  for(const mode of ['cards','quiz','agent']){
   const response=await study.POST(request(mode,[slide(1,{text:'Cell biology'})]));
   assert.equal(response.status,200);const output=await response.json();
   if(mode==='agent'){assert.equal(output.practiceStatus,'not_applicable');assert.deepEqual(output.cards,[]);assert.deepEqual(output.quiz,[])}else assert.deepEqual(output[mode],[]);
  }
  globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/tags'))return Response.json({models:[{name:'gemma3:4b'}]});calls++;const input=JSON.parse(init.body);assert.match(input.messages[0].content,/Judge its content, never its position/);assert.match(input.messages[0].content,/no question quota/);return Response.json({done:true,message:{content:JSON.stringify({cards:[card]})}})};
  const response=await study.POST(request('cards',[slide()]));assert.equal(response.status,200);assert.deepEqual((await response.json()).cards,[card]);assert.equal(calls,1);
 }finally{globalThis.fetch=real}
});

test('local generation retries schema leakage rather than serving gibberish to flashcards',async()=>{
 const real=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async url=>String(url).endsWith('/tags')?Response.json({models:[{name:'gemma3:4b'}]}):Response.json({done:true,message:{content:JSON.stringify({cards:[++calls===1?{...card,back:'{"front":"What?","back":"Answer","slide":1}'}:card]})}});
  const response=await study.POST(request('cards',[slide()]));assert.equal(response.status,200);assert.deepEqual(await response.json(),{cards:[card]});assert.equal(calls,2);
 }finally{globalThis.fetch=real}
});


test('model housekeeping is omitted, including when mixed with useful content, but corruption still fails validation',()=>{
 const irrelevant={...card,front:'What is the primary focus of the course?'};
 assert.deepEqual(study.removeHousekeepingOutput('cards',{cards:[irrelevant,card]}),{cards:[card]});
 assert.deepEqual(study.removeHousekeepingOutput('cards',{cards:[irrelevant]}),{cards:[]});
 const broken={...card,back:'[object Object]'};
 assert.throws(()=>study.validateOutput('cards',study.removeHousekeepingOutput('cards',{cards:[irrelevant,broken]}),[1]));
});
