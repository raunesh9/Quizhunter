import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLibrary} from '../desktop/library.mjs';
const temp=await mkdtemp(path.join(tmpdir(),'quizhunter-library-tests-'));
let study;
try{await build({stdin:{contents:"export * from './lib/study/navigation';export * from './lib/study/agent';export * from './lib/study/curation';export * from './lib/study/collection';export * from './lib/study/schemas';export * from './lib/study/library';export * from './lib/study/demo';export {POST} from './app/api/study/route';",resolveDir:process.cwd(),loader:'ts'},outfile:path.join(temp,'study.mjs'),bundle:true,platform:'node',format:'esm'});study=await import(pathToFileURL(path.join(temp,'study.mjs')))}finally{await rm(temp,{recursive:true,force:true})}
const pack=()=>({version:1,deck:structuredClone(study.demoDeck),lessons:Object.fromEntries(study.demoLessons.map(l=>[`detailed:college:${l.slide}`,l])),cards:study.demoCards,quiz:study.demoQuiz,settings:{depth:'simple',level:'college',pace:'quick'},diagrams:{'2':{slide:2,title:'A diagram',summary:'A visible relationship.',observations:['An arrow joins two boxes.'],relationships:['One step follows another.'],limitations:[]}}});
const bundle=number=>({lesson:study.demoLessons.find(l=>l.slide===number),cards:study.demoCards.filter(c=>c.slide===number),quiz:study.demoQuiz.filter(q=>q.slide===number),practiceStatus:'ready',practiceNote:'Source concepts.'});

test('saved explanations survive setting changes and never cross source boundaries',()=>{
 const p=pack();const found=study.findLesson(p.lessons,3,p.settings);assert.equal(found.lesson.slide,3);assert.equal(found.exact,false);
 assert.equal(study.findLesson(p.lessons,2,{depth:'exam',level:'advanced'}).lesson.slide,2);
 assert.equal(study.findLesson(p.lessons,3,{depth:'detailed',level:'college'}).exact,true);
 assert.equal(study.findLesson(p.lessons,8,p.settings),undefined);
});
test('current, selected and all scope use stable source IDs after deletion',()=>{
 const slides=[pack().deck.slides[0],{...pack().deck.slides[1],number:9},{...pack().deck.slides[2],number:4}];
 assert.deepEqual(study.scopedSlides(slides,9,[4],'current').map(s=>s.number),[9]);
 assert.deepEqual(study.scopedSlides(slides,9,[4,99,1],'selected').map(s=>s.number),[1,4]);
 assert.equal(study.scopedSlides(slides,9,[],'selected').length,0);
 assert.deepEqual(study.scopedSlides(slides,9,[],'all'),slides);
});
test('deleting a slide removes its diagrams and preserves an intact Undo snapshot',()=>{
 const before=pack(),after=study.removePages(before,[2]);assert.deepEqual(after.diagrams,{});assert.equal(before.diagrams['2'].slide,2);
 assert.throws(()=>study.packSchema.parse({...after,diagrams:before.diagrams}),/invalid slide references/);
});
test('corrupt explanation text is rejected during generation and salvaged on old-pack restore',()=>{
 const before=pack();before.lessons['detailed:college:1']={...before.lessons['detailed:college:1'],explanation:['{"type":"object","properties":{"answer":{"type":"string"}}}']};
 assert.equal(study.lessonSchema.safeParse(before.lessons['detailed:college:1']).success,false);
 const restored=study.restoreStudyPack(before);assert.equal(restored.removed,1);assert.equal(Object.keys(restored.pack.lessons).length,2);assert.equal(restored.pack.cards.length,6);
});
test('a saved Thorough bundle satisfies Quick mode without invoking the model again',async()=>{
 let calls=0;
 const result=await study.runStudyAgent({slides:[pack().deck.slides[1]],level:'college',pace:'quick',previous:{'college:2':bundle(2)},signal:new AbortController().signal,request:async()=>{calls++;return bundle(2)},onStart:()=>{},onComplete:()=>{},onError:()=>{}});
 assert.equal(calls,0);assert.equal(result.completed,1);
});
test('cancellation during a response prevents deleted slide material from being committed',async()=>{
 const ctrl=new AbortController();let committed=false;
 await assert.rejects(study.runStudyAgent({slides:[pack().deck.slides[0]],level:'college',previous:{},signal:ctrl.signal,request:async()=>{ctrl.abort();return bundle(1)},onStart:()=>{},onComplete:()=>{committed=true},onError:()=>{}}));
 assert.equal(committed,false);
});
test('desktop library survives a new app session, keeps the newest write, deletes and restores',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'quizhunter-persistence-'));
 try{
  const first=createLibrary(directory),p=pack(),record=study.libraryRecord('test-pack',p);
  const secondRecord=study.libraryRecord('test-pack',{...p,deck:{...p.deck,name:'Updated collection'}});
  await Promise.all([first.write(record),first.write(secondRecord)]);
  const restarted=createLibrary(directory);assert.equal((await restarted.list()).length,1);assert.equal((await restarted.read('test-pack')).summary.name,'Updated collection');assert.equal((await restarted.read('test-pack')).pack.diagrams['2'].slide,2);
  await writeFile(path.join(directory,'broken.json'),'not JSON');assert.equal((await restarted.list()).length,1);
  await restarted.remove('test-pack');assert.equal((await restarted.list()).length,0);await restarted.write(secondRecord);assert.equal((await createLibrary(directory).list()).length,1);
  await assert.rejects(restarted.read('../outside'),/Invalid collection ID/);
  await assert.rejects(restarted.write({...record,summary:{...record.summary,id:'../outside'}}),/Invalid collection ID/);
 }finally{await rm(directory,{recursive:true,force:true})}
});
test('library counts exclude removed material and saved diagram payloads round-trip',()=>{
 const p=pack();p.hidden={cards:[study.contentKey(p.cards[0])],quiz:[study.contentKey(p.quiz[0])],lessons:[1]};
 const record=study.libraryRecord('summary-test',p);assert.equal(record.summary.cards,5);assert.equal(record.summary.quiz,2);assert.equal(record.summary.lessons,2);assert.equal(record.summary.diagrams,1);
 assert.deepEqual(study.restoreStudyPack(JSON.parse(JSON.stringify(record.pack))).pack.diagrams,p.diagrams);
});
test('diagram API requires a source image and validates references',async()=>{
 const make=slides=>new Request('http://localhost/api/study',{method:'POST',headers:{'x-study-provider':'local','Content-Type':'application/json'},body:JSON.stringify({mode:'diagram',slides,depth:'simple',pace:'quick',level:'college'})});
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{throw Error('No image must not invoke the model')};assert.equal((await study.POST(make([pack().deck.slides[0]]))).status,400);
  globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/tags'))return Response.json({models:[{name:'gemma3:4b'}]});const request=JSON.parse(init.body);assert.deepEqual(request.messages.at(-1).images,['YWJj']);assert.ok(request.format.properties.observations);return Response.json({done:true,message:{content:JSON.stringify(pack().diagrams['2'])}})};
  const result=await study.POST(make([{...pack().deck.slides[1],images:['data:image/png;base64,YWJj']}]));assert.equal(result.status,200);assert.equal((await result.json()).slide,2);
  assert.throws(()=>study.validateOutput('diagram',pack().diagrams['2'],[1]),/Invalid diagram source/);
 }finally{globalThis.fetch=original}
});

test('separately saved lessons, cards and quizzes are reused without requiring old agent checkpoints',()=>{
 const p=pack();const ready=study.reuseStudyMaterial({},p.deck.slides,p.lessons,p.cards,p.quiz,p.settings);
 assert.equal(Object.keys(ready).length,3);assert.ok(study.cachedAgentResult(ready,'college',2,'quick'));
 assert.equal(Object.keys(study.reuseStudyMaterial({},p.deck.slides,p.lessons,p.cards,[],p.settings)).length,0);
 assert.equal(Object.keys(study.reuseStudyMaterial({},p.deck.slides,p.lessons,p.cards,p.quiz,{...p.settings,level:'advanced'})).length,0);
 const quickOnly={'simple:college:1':p.lessons['detailed:college:1']};
 assert.equal(Object.keys(study.reuseStudyMaterial({},p.deck.slides,quickOnly,p.cards,p.quiz,{...p.settings,pace:'thorough'})).length,0);
});
