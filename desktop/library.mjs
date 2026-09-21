import {mkdir,readFile,writeFile,rename,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Independent of the desktop server's randomly assigned port and session.
export function createLibrary(directory){
 const idPattern=/^[a-zA-Z0-9-]{1,80}$/;
 const file=(id)=>{if(typeof id!=='string'||!idPattern.test(id))throw Error('Invalid collection ID.');return path.join(directory,id+'.json')};
 let queue=Promise.resolve();
 const mutate=operation=>{const next=queue.then(operation);queue=next.catch(()=>{});return next};
 return {
  async list(){await queue;await mkdir(directory,{recursive:true});const entries=await readdir(directory);const summaries=[];for(const entry of entries.filter(n=>n.endsWith('.json')&&!n.endsWith('.meta.json'))){try{let summary;try{summary=JSON.parse(await readFile(path.join(directory,entry+'.meta.json'),'utf8'))}catch{summary=JSON.parse(await readFile(path.join(directory,entry),'utf8'))?.summary}if(summary?.id)summaries.push(summary)}catch{/* A damaged file must not hide the rest of the library. */}}return summaries},
  async read(id){await queue;return JSON.parse(await readFile(file(id),'utf8'))},
  write(record){return mutate(async()=>{
   const destination=file(record?.summary?.id);
   if(record?.pack?.version!==1||!Array.isArray(record.pack.deck?.slides)||typeof record.summary.name!=='string')throw Error('Invalid study collection.');
   const text=JSON.stringify(record);if(Buffer.byteLength(text)>256*1024*1024)throw Error('This collection is too large to save. Export a smaller collection.');
   await mkdir(directory,{recursive:true});const temporary=destination+'.'+randomUUID()+'.tmp';
   try{await writeFile(temporary,text,{mode:0o600});await rename(temporary,destination);await writeFile(temporary,JSON.stringify(record.summary),{mode:0o600});await rename(temporary,destination+'.meta.json')}finally{await rm(temporary,{force:true})}
  })},
  remove(id){return mutate(async()=>{const destination=file(id);await rm(destination,{force:true});await rm(destination+'.meta.json',{force:true})})},
 };
}
