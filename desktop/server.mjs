import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.wasm':'application/wasm','.ico':'image/x-icon'};
export async function startStudyServer(root,port=0){
 process.env.NODE_ENV='production';
 const assets=path.join(root,'dist/client');
 const worker=(await import(pathToFileURL(path.join(root,'dist/server/index.js')).href)).default;
 if(typeof worker?.fetch!=='function')throw Error('Quizhunter application build is missing.');
 let origin;
 const assetResponse=async(request)=>{let pathname;try{pathname=decodeURIComponent(new URL(request.url).pathname)}catch{return new Response('Invalid path',{status:400})}const file=path.resolve(assets,'.'+pathname);const relative=path.relative(assets,file);if(relative.startsWith('..')||path.isAbsolute(relative))return new Response('Not found',{status:404});try{if(!(await stat(file)).isFile())return new Response('Not found',{status:404});return new Response(await readFile(file),{headers:{'Content-Type':mime[path.extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff'}})}catch{return new Response('Not found',{status:404})}};
 const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end('Invalid host');return}
 const url=new URL(req.url??'/',origin);
 if(url.origin!==origin){res.writeHead(403);res.end('Invalid origin');return}
 if(url.pathname==='/__quizhunter_health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({app:'Quizhunter',status:'ready'}));return}
 const headers=new Headers();for(const [key,value] of Object.entries(req.headers)){if(Array.isArray(value))value.forEach(v=>headers.append(key,v));else if(value!==undefined)headers.set(key,value)}
 const abort=new AbortController();req.on('aborted',()=>abort.abort());
 let body;if(!['GET','HEAD'].includes(req.method??'GET')){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>14000000){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'This request is too large.'}));return}chunks.push(chunk)}body=Buffer.concat(chunks)}
 const request=new Request(url,{method:req.method,headers,body,signal:abort.signal});
 let response;
 if(['GET','HEAD'].includes(request.method)){const asset=await assetResponse(request);if(asset.status===200)response=asset;}
 response??=await worker.fetch(request,{ASSETS:{fetch:assetResponse}},{waitUntil:p=>p.catch(()=>{})});
 res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));
 if(req.method==='HEAD'||!response.body){res.end();return}Readable.fromWeb(response.body).on('error',()=>res.destroy()).pipe(res);
 }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Quizhunter could not complete the request. Please try again.'}))}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{origin=`http://127.0.0.1:${server.address().port}`;resolve()})});
 return {origin,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})};
}
