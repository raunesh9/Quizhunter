import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(path.join(tmpdir(),'quizhunter-collection-'));
let study;
try{
 await build({stdin:{contents:"export * from './lib/study/collection'; export * from './lib/study/performance'; export * from './lib/study/curation'; export * from './lib/study/agent'; export * from './lib/study/demo';",resolveDir:process.cwd(),loader:'ts'},outfile:path.join(dir,'collection.mjs'),bundle:true,platform:'node',format:'esm'});
 study=await import(pathToFileURL(path.join(dir,'collection.mjs')));
}finally{await rm(dir,{recursive:true,force:true})}
function pack(){return {version:1,deck:structuredClone(study.demoDeck),cards:structuredClone(study.demoCards),quiz:structuredClone(study.demoQuiz),lessons:Object.fromEntries(study.demoLessons.map(l=>[`detailed:college:${l.slide}`,l])),progress:{cards:[1,2,3],quiz:[1,2,3]},agentResults:Object.fromEntries(study.demoLessons.map(l=>[`college:${l.slide}`,{lesson:l,cards:study.demoCards.filter(c=>c.slide===l.slide),quiz:study.demoQuiz.filter(q=>q.slide===l.slide),practiceStatus:'ready',practiceNote:'Grounded concepts.'}])),hidden:study.emptyHidden(),settings:{pace:'quick',depth:'simple',level:'college'}}}

test('removing pages removes related practice, lessons, progress and checkpoints, without renumbering remaining sources',()=>{
 const original=pack();original.hidden={cards:[study.contentKey(original.cards[2])],quiz:[study.contentKey(original.quiz[1])],lessons:[2]};
 const result=study.removePages(original,[2]);
 assert.deepEqual(result.deck.slides.map(s=>s.number),[1,3]);
 for(const items of [result.cards,result.quiz,Object.values(result.lessons)])assert.ok(items.every(x=>x.slide!==2));
 assert.deepEqual(result.progress,{cards:[1,3],quiz:[1,3]});assert.equal(result.agentResults['college:2'],undefined);assert.deepEqual(result.hidden,study.emptyHidden());
 assert.equal(original.deck.slides.length,3);assert.equal(original.cards.length,6); // Undo snapshot remains intact.
 assert.equal(study.removePages(original,[1,2,3]),null);
 assert.equal(study.restoreStudyPack(JSON.parse(JSON.stringify(result))).pack.deck.slides.length,2);
});

test('removed content remains out of practice after saving and reopening, and can be restored',()=>{
 const original=pack();original.hidden={cards:[study.contentKey(original.cards[0])],quiz:[study.contentKey(original.quiz[0])],lessons:[1]};
 const restored=study.restoreStudyPack(JSON.parse(JSON.stringify(original))).pack;
 const visible=study.visiblePack(restored);
 assert.equal(visible.cards.length,5);assert.equal(visible.quiz.length,2);assert.ok(Object.values(visible.lessons).every(l=>l.slide!==1));
 assert.equal(restored.settings.pace,'quick');
 // Cached material remains filtered even if the completed agent pack is reopened.
 const reopened=study.visiblePack({...restored,cards:Object.values(restored.agentResults).flatMap(r=>r.cards)});
 assert.equal(reopened.cards.length,5);
 assert.equal(study.visiblePack({...restored,hidden:study.emptyHidden()}).cards.length,6);
});

test('adding files after a removal never reassigns existing study IDs or their original page numbers',()=>{
 const original=pack();original.deck.slides=original.deck.slides.map(s=>({...s,source:'First.pdf',sourceSlide:s.number+10}));
 const removed=study.removePages(original,[2]);
 const added={name:'New',documents:['Second.pdf'],warnings:[],slides:[{...original.deck.slides[0],number:1,source:'Second.pdf',sourceSlide:1}]};
 const result=study.appendDecks(removed.deck,[added],600);
 assert.deepEqual(result.slides.map(s=>s.number),[1,3,2]);assert.equal(result.slides[1].sourceSlide,13);assert.equal(result.slides[2].sourceSlide,1);
 assert.equal(result.slides[1].source,'First.pdf');assert.equal(result.slides[2].source,'Second.pdf');
 assert.equal(new Set(result.slides.map(s=>s.number)).size,3);
 assert.throws(()=>study.appendDecks(result,[added],3),/3 pages/);
});

test('Quick local practice batches short text and isolates visual and dense pages',()=>{
 const slides=Array.from({length:7},(_,i)=>({number:i+1,title:'Topic',text:'A source definition.',notes:'',images:[]}));
 slides[3].images=['data:image/jpeg;base64,YWJj'];slides[4].text='x'.repeat(6500);
 const quick=study.generationBatches(slides,'cards','local','quick');
 assert.deepEqual(quick.map(b=>b.map(s=>s.number)),[[1,2,3],[4],[5],[6,7]]);
 assert.equal(study.generationBatches(slides,'cards','local','thorough').length,7);
 assert.equal(study.generationBatches(slides,'explain','local','quick').length,7);
 assert.deepEqual(quick.flat(),slides);
});

test('bounded page work preserves source order, waits for active cleanup on failure, and starts no more work',async()=>{
 let active=0,peak=0;
 const result=await study.mapLimited([30,2,1,1],2,async(ms,i)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,ms));active--;return i});
 assert.deepEqual(result,[0,1,2,3]);assert.equal(peak,2);
 const started=[],finished=[];
 await assert.rejects(study.mapLimited([0,1,2,3],2,async i=>{started.push(i);if(i===0)throw Error('bad page');await new Promise(r=>setTimeout(r,10));finished.push(i)}),/bad page/);
 assert.deepEqual(started,[0,1]);assert.deepEqual(finished,[1]);
});

test('plain-text detection keeps images, drawings, scans, and multi-column layouts',()=>{
 const ops={showText:1,paintImageXObject:2,constructPath:3,stroke:4};
 const text=[{str:'Mitochondria produce ATP.',hasEOL:true,transform:[1,0,0,1,40,70]}];
 assert.equal(study.textOnlyPDF(text,[1],ops),true);
 for(const fn of [[1,2],[1,3],[1,4],[]])assert.equal(study.textOnlyPDF(text,fn,ops),false);
 assert.equal(study.textOnlyPDF([], [1],ops),false);
 assert.equal(study.textOnlyPDF([20,150,300].map(x=>({...text[0],transform:[1,0,0,1,x,70]})),[1],ops),false);
 assert.equal(study.textOnlyPDF([40,340].map(x=>({...text[0],transform:[1,0,0,1,x,70]})),[1],ops),false);
});

test('Quick agent checkpoints resume without being mistaken for Thorough explanations',async()=>{
 const original=pack(),result=original.agentResults['college:1'],saved={};
 let calls=0;
 const run=pace=>study.runStudyAgent({slides:[original.deck.slides[0]],level:'college',pace,previous:saved,signal:new AbortController().signal,request:async()=>{calls++;return result},onStart:()=>{},onComplete:(key,r)=>saved[key]=r,onError:()=>{}});
 await run('quick');assert.ok(saved['college:1:quick']);await run('quick');assert.equal(calls,1);
 await run('thorough');assert.ok(saved['college:1']);assert.equal(calls,2);
 assert.ok(study.restoreStudyPack({...original,agentResults:saved}).pack.agentResults['college:1:quick']);
});
