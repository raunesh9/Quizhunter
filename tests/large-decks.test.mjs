import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(path.join(tmpdir(),'quizhunter-large-decks-'));
let schemas,batching;
try{
 await build({entryPoints:['lib/study/schemas.ts','lib/study/batches.ts'],outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
 schemas=await import(pathToFileURL(path.join(dir,'schemas.mjs')));
 batching=await import(pathToFileURL(path.join(dir,'batches.mjs')));
}finally{await rm(dir,{recursive:true,force:true})}
const slide=n=>({number:n,title:`Topic ${n}`,text:'Meaningful source',notes:'Speaker notes',images:[],source:`Lecture-${Math.ceil(n/150)}.pptx`,sourceSlide:(n-1)%150+1});

test('four 150-slide decks retain source references through save and restore',()=>{
 const pack={version:1,deck:{name:'Large collection',slides:Array.from({length:600},(_,i)=>slide(i+1)),warnings:[]},lessons:{},cards:[{front:'Last concept?',back:'An answer.',slide:600}],quiz:[],progress:{cards:[599,600],quiz:[]}};
 const restored=schemas.packSchema.parse(JSON.parse(JSON.stringify(pack)));
 assert.equal(restored.deck.slides[599].sourceSlide,150);
 assert.equal(restored.cards[0].slide,600);
 assert.deepEqual(restored.progress.cards,[599,600]);
 assert.equal(schemas.packSchema.safeParse({...pack,deck:{...pack.deck,slides:[...pack.deck.slides,slide(601)]}}).success,false);
 assert.equal(schemas.packSchema.safeParse({...pack,progress:{cards:[601],quiz:[]}}).success,false);
 assert.equal(schemas.slideSchema.safeParse({...slide(150),sourceSlide:151}).success,false);
});

test('150-slide jobs cover each slide exactly once and can resume completed batches',()=>{
 const slides=Array.from({length:150},(_,i)=>slide(i+1));
 const batches=batching.studyBatches(slides,'cards');
 assert.equal(batches.length,38);
 assert.deepEqual(batches.flat().map(s=>s.number),slides.map(s=>s.number));
 const done=batches.slice(0,2).flat().map(s=>s.number);
 const resumed=batching.studyBatches(slides.filter(s=>!done.includes(s.number)),'cards');
 assert.equal(resumed[0][0].number,9);
 assert.equal(resumed.flat().length,142);
 assert.equal(batching.studyBatches(slides,'explain').length,150);
});

test('image-heavy slides are split before a request exceeds the server body limit',()=>{
 const heavy=n=>({...slide(n),images:Array.from({length:4},()=>`data:image/jpeg;base64,${'A'.repeat(2_000_000)}`)});
 const batches=batching.studyBatches([heavy(1),heavy(2),slide(3)],'quiz');
 assert.equal(batches.length,2);
 for(const batch of batches)assert.ok(Buffer.byteLength(JSON.stringify({mode:'quiz',slides:batch,context:'x'.repeat(12000)}))<14_000_000);
});

test('API output validation accepts slide 600 and rejects a wrong source',()=>{
 const card={front:'Question',back:'Answer',slide:600};
 assert.equal(schemas.validateOutput('cards',{cards:[card]},[600]).cards[0].slide,600);
 assert.throws(()=>schemas.validateOutput('cards',{cards:[card]},[599]));
});
