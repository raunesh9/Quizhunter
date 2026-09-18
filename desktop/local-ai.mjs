import {access} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';

export async function ensureLocalAI(root){
 const ready=async()=>{try{return (await fetch('http://127.0.0.1:11434/api/version',{signal:AbortSignal.timeout(1000)})).ok}catch{return false}};
 if(await ready())return true;
 const candidates=[path.join(root,'local-ai/ollama'),path.join(root,'.local-ai/engine/ollama'),'/Applications/Ollama.app/Contents/Resources/ollama'];
 for(const file of candidates){
  try{await access(file)}catch{continue}
  const child=spawn(file,['serve'],{env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'},detached:true,stdio:'ignore'});
  let failed=false;child.on('error',()=>{failed=true});child.unref();
  for(let i=0;i<20&&!failed;i++){if(await ready())return true;await setTimeout(250)}
 }
 return false;
}
