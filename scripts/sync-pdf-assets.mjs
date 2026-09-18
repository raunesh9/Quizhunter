import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Always use the worker, fonts, character maps, and image decoders from the
// installed parser version. These assets also ship in the offline desktop app.
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=path.join(root,'node_modules/pdfjs-dist');
const target=path.join(root,'public/pdfjs');
const {version}=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
await mkdir(target,{recursive:true});
await cp(path.join(source,'build/pdf.worker.min.mjs'),path.join(root,'public/pdf.worker.min.mjs'));
for(const folder of ['cmaps','standard_fonts','wasm','iccs']){
 await cp(path.join(source,folder),path.join(target,folder),{recursive:true});
}
await cp(path.join(source,'LICENSE'),path.join(target,'LICENSE'));
await writeFile(path.join(target,'version.json'),JSON.stringify({parser:'pdfjs-dist',version})+'\n');
console.log(`PDF.js ${version}: local parser assets ready.`);
