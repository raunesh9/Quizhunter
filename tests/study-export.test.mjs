import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(path.join(tmpdir(),'quizhunter-export-'));
let exports;
try{
 await build({entryPoints:['lib/study/export.ts'],outfile:path.join(dir,'export.mjs'),bundle:true,platform:'node',format:'esm'});
 exports=await import(pathToFileURL(path.join(dir,'export.mjs')));
}finally{await rm(dir,{recursive:true,force:true})}
const deck={name:'Combined course',warnings:[],slides:[
 {number:1,title:'A title',text:'Private source text',notes:'Private note',images:['Private image'],source:'Biology.pdf',sourceSlide:12},
 {number:2,title:'Another title',text:'',notes:'',images:[],source:'Chemistry.pdf',sourceSlide:1},
 {number:3,title:'Divider',text:'',notes:'',images:[],source:'Lecture.pptx',sourceSlide:9},
]};
const card={front:'What is ΔG?\nExplain "G".',back:'Gibbs free energy\tΔG = ΔH − TΔS.',slide:1};
const quiz={question:'Which is correct?',options:['First','Second','Third','Fourth'],answer:0,explanation:'The first option follows from the source.',slide:2};

test('flashcard JSON preserves Unicode, original PDF pages and partial coverage',()=>{
 const text=exports.cardsToJSON([card],deck,[1,3,3]);
 const data=JSON.parse(text);
 assert.equal(data.type,'flashcards');assert.equal(data.version,1);
 assert.equal(data.cards[0].front,card.front);assert.equal(data.cards[0].back,card.back);
 assert.deepEqual(data.cards[0].source,{file:'Biology.pdf',position:12,unit:'page',title:'A title'});
 assert.deepEqual(data.coverage,{totalSources:3,processedSources:[1,3],pendingSources:[2]});
 assert.doesNotMatch(text,/Private source|Private note|Private image/);
});

test('quiz JSON identifies zero-based answers and keeps original page after merging',()=>{
 const data=JSON.parse(exports.quizToJSON([quiz],deck,[2]));
 assert.equal(data.answerIndexBase,0);assert.equal(data.quiz[0].answer,0);
 assert.deepEqual(data.quiz[0].options,quiz.options);assert.equal(data.quiz[0].source.position,1);
 assert.equal(data.quiz[0].source.file,'Chemistry.pdf');assert.equal(data.quiz[0].slide,2);
});

test('exports reject missing source references, empty cards and ambiguous options',()=>{
 assert.throws(()=>exports.cardsToJSON([{...card,slide:4}],deck),/missing source/);
 assert.throws(()=>exports.cardsToJSON([{...card,back:'   '}],deck));
 assert.throws(()=>exports.quizToJSON([{...quiz,options:['same',' Same ','third','fourth']}],deck));
 assert.throws(()=>exports.quizToJSON([{...quiz,answer:4}],deck));
 assert.throws(()=>exports.quizToJSON([{...quiz,answer:1,explanation:'The correct answer is C.'}],deck));
 assert.doesNotThrow(()=>exports.quizToJSON([{...quiz,answer:2,explanation:'The correct answer is a process that converts energy.'}],deck));
});

test('empty completed practice and sample exports remain explicitly identified',()=>{
 assert.deepEqual(JSON.parse(exports.cardsToJSON([],deck,[1,2,3])).coverage.pendingSources,[]);
 const sample=JSON.parse(exports.cardsToJSON([{...card,slide:3}],{...deck,sample:true}));
 assert.equal(sample.sample,true);assert.equal(sample.cards[0].source.unit,'slide');
});
