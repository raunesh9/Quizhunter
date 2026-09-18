import {cp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {packager} from '@electron/packager';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stage=path.join(root,'.desktop-stage');
await rm(stage,{recursive:true,force:true});
await mkdir(path.join(stage,'desktop'),{recursive:true});
await cp(path.join(root,'dist'),path.join(stage,'dist'),{recursive:true});
await cp(path.join(root,'desktop'),path.join(stage,'desktop'),{recursive:true});
try{await stat(path.join(root,'.local-ai/engine/ollama'));await cp(path.join(root,'.local-ai/engine'),path.join(stage,'local-ai'),{recursive:true})}catch(error){if(error.code!=='ENOENT')throw error;console.log('Local engine is not bundled. The app will use an installed Ollama application.');}
await writeFile(path.join(stage,'package.json'),JSON.stringify({name:'quizhunter',productName:'Quizhunter',version:'1.0.0',description:'Your personal PowerPoint study tutor',main:'desktop/main.cjs',type:'module',author:'Quizhunter'},null,2));
const electronVersion=JSON.parse(await readFile(path.join(root,'node_modules/electron/package.json'),'utf8')).version;
const paths=await packager({dir:stage,out:path.join(root,'release'),name:'Quizhunter',platform:'darwin',arch:process.arch,electronVersion,overwrite:true,asar:false,prune:false,appBundleId:'com.quizhunter.study',appCategoryType:'public.app-category.education',icon:path.join(root,'desktop/icon.icns'),osxSign:false});
for(const output of paths){const bundle=path.join(output,'Quizhunter.app');if(process.platform==='darwin'){const signed=spawnSync('/usr/bin/codesign',['--force','--deep','--sign','-',bundle],{stdio:'inherit'});if(signed.status!==0)throw Error('Could not sign the local application bundle.')}console.log(bundle);}
