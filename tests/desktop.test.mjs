import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {startStudyServer} from '../desktop/server.mjs';

test('desktop serves the app and PDF reader without exposing private files',async t=>{
 const server=await startStudyServer(fileURLToPath(new URL('..',import.meta.url)));
 t.after(()=>server.close());
 const page=await fetch(server.origin);
 assert.equal(page.status,200);
 assert.match(await page.text(),/Upload study material/);
 const worker=await fetch(server.origin+'/pdf.worker.min.mjs');
 assert.equal(worker.status,200);
 assert.match(worker.headers.get('content-type'),/javascript/);
 const unauthorized=await fetch(server.origin+'/api/study',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(unauthorized.status,401);
 const traversal=await fetch(server.origin+'/%2e%2e%2fpackage.json');
 assert.notEqual(traversal.status,200);
});
