import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(path.join(tmpdir(),'quizhunter-pdf-'));
let parseDeck;
try{
 await build({entryPoints:['lib/study/parser.ts'],outfile:path.join(dir,'parser.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'pdf-test-double',setup(build){
  build.onResolve({filter:/^pdfjs-dist$/},()=>({path:'pdfjs',namespace:'test'}));
  build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const OPS={showText:1,paintImageXObject:2,constructPath:3}; export const GlobalWorkerOptions={}; export const getDocument=options=>globalThis.pdfMock(options);',loader:'js'}));
 }}]});
 ({parseDeck}=await import(pathToFileURL(path.join(dir,'parser.mjs'))));
}finally{await rm(dir,{recursive:true,force:true})}
const file=()=>new File(['%PDF-1.7'],'Course.pdf',{type:'application/pdf'});
function fixture({pages=1,text='Cells contain organelles.',textFails=false,renderFails=false,loadingError,operators,delays=[]}={}){
 const state={destroyed:0,cleaned:0,options:null,canvases:[],rendered:0,active:0,peak:0};
 globalThis.document={createElement:()=>{const canvas={width:0,height:0,getContext:()=>({}),toDataURL:()=> 'data:image/jpeg;base64,YWJj'};state.canvases.push(canvas);return canvas}};
 globalThis.pdfMock=options=>{state.options=options;return {
  promise:loadingError?Promise.reject(loadingError):Promise.resolve({numPages:pages,getPage:async n=>({
   getTextContent:async()=>{state.active++;state.peak=Math.max(state.peak,state.active);if(delays[n-1])await new Promise(r=>setTimeout(r,delays[n-1]));if(textFails)throw Error('bad text');return {items:[{str:text,hasEOL:true,transform:[1,0,0,1,50,750]}]}},
   getOperatorList:async()=>{if(!operators)throw Error('operator detection unavailable');return {fnArray:operators}},
   getViewport:()=>({width:600,height:800}),render:()=>(state.rendered++,{promise:renderFails?Promise.reject(Error('bad render')):Promise.resolve()}),cleanup:()=>{state.cleaned++;state.active--},
  })}),destroy:async()=>{state.destroyed++},
 }};
 return state;
}

test('PDF parser maps pages and uses bundled worker support assets',async()=>{
 const state=fixture({pages:2}),progress=[];
 const deck=await parseDeck(file(),s=>progress.push(s));
 assert.equal(deck.slides.length,2);assert.equal(deck.slides[1].sourceSlide,2);assert.equal(deck.slides[1].source,'Course.pdf');
 assert.match(deck.slides[0].text,/organelles/);assert.equal(deck.slides[0].images.length,1);
 assert.equal(state.options.cMapUrl,'/pdfjs/cmaps/');assert.equal(state.options.wasmUrl,'/pdfjs/wasm/');
 assert.equal(state.cleaned,2);assert.equal(state.destroyed,1);
 assert.ok(state.canvases.every(c=>c.width===0&&c.height===0));assert.match(progress.at(-1),/page 2 of 2/);
});
test('scans retain images and disclose missing selectable text',async()=>{
 fixture({text:''});const deck=await parseDeck(file(),()=>{});
 assert.equal(deck.slides[0].images.length,1);assert.equal(deck.slides[0].title,'Page 1');
 assert.match(deck.warnings.join(' '),/no selectable text/);
});
test('render or text failures retain the readable representation with a limitation',async()=>{
 fixture({renderFails:true});const text=await parseDeck(file(),()=>{});
 assert.equal(text.slides[0].images.length,0);assert.match(text.warnings.join(' '),/diagrams and layout cannot be checked/);
 fixture({textFails:true});const image=await parseDeck(file(),()=>{});
 assert.equal(image.slides[0].images.length,1);assert.match(image.warnings.join(' '),/text extraction failed/);
 const state=fixture({text:'',renderFails:true});await assert.rejects(parseDeck(file(),()=>{}),/could not be read or rendered/);
 assert.equal(state.cleaned,1);assert.equal(state.destroyed,1);
});
test('failed loading and page limits clean up the PDF task and show actionable errors',async()=>{
 for(const [name,message] of [['PasswordException',/password-protected/],['InvalidPDFException',/damaged/]]){
  const state=fixture({loadingError:Object.assign(new Error('pdf error'),{name})});
  await assert.rejects(parseDeck(file(),()=>{}),message);assert.equal(state.destroyed,1);
 }
 const state=fixture({pages:151});await assert.rejects(parseDeck(file(),()=>{}),/150 pages/);assert.equal(state.destroyed,1);
});
test('installed PDF parser and served worker are identical versions',async()=>{
 const [installed,served]=await Promise.all([readFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),readFile('public/pdf.worker.min.mjs')]);
 assert.deepEqual(served,installed);
 const installedVersion=JSON.parse(await readFile('node_modules/pdfjs-dist/package.json','utf8')).version;
 assert.equal(JSON.parse(await readFile('public/pdfjs/version.json','utf8')).version,installedVersion);
});


test('Quick PDF reading avoids rendering simple text pages and preserves order with two active pages',async()=>{
 const state=fixture({pages:4,operators:[1],delays:[30,1,2,1]});
 const deck=await parseDeck(file(),()=>{},{pace:'quick'});
 assert.equal(state.peak,2);assert.equal(state.rendered,0);assert.equal(state.cleaned,4);assert.equal(state.destroyed,1);
 assert.deepEqual(deck.slides.map(s=>s.number),[1,2,3,4]);assert.ok(deck.slides.every(s=>s.images.length===0));
 assert.match(deck.warnings.join(' '),/4 text-only pages/);
});
test('Quick reading keeps diagrams and scans; Thorough keeps a page image even for plain text',async()=>{
 for(const change of [{operators:[1,2]},{operators:[1,3]},{text:'',operators:[1]}]){
  const state=fixture(change),deck=await parseDeck(file(),()=>{},{pace:'quick'});
  assert.equal(state.rendered,1);assert.equal(deck.slides[0].images.length,1);
 }
 const state=fixture({operators:[1]});await parseDeck(file(),()=>{},{pace:'thorough'});assert.equal(state.rendered,1);
});
