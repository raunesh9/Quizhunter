import {restoreStudyPack} from './curation';
import {visiblePack} from './collection';
import type {StudyPack} from './types';

export type LibrarySummary={id:string;name:string;updatedAt:string;slides:number;lessons:number;cards:number;quiz:number;diagrams:number};
export type LibraryRecord={summary:LibrarySummary;pack:StudyPack};
type LibraryBridge={list:()=>Promise<LibrarySummary[]>;read:(id:string)=>Promise<LibraryRecord>;write:(record:LibraryRecord)=>Promise<void>;remove:(id:string)=>Promise<void>;onClosing?:(callback:()=>Promise<void>)=>()=>void};
declare global {interface Window {quizhunterLibrary?:LibraryBridge}}

export function libraryRecord(id:string,pack:StudyPack):LibraryRecord{
 const visible=visiblePack(pack);
 return {summary:{id,name:pack.deck.name,updatedAt:new Date().toISOString(),slides:pack.deck.slides.length,lessons:new Set(Object.values(visible.lessons).map(l=>l.slide)).size,cards:visible.cards.length,quiz:visible.quiz.length,diagrams:Object.keys(pack.diagrams??{}).length},pack};
}
let database:Promise<IDBDatabase>|undefined;
function db(){
 return database??=(new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('quizhunter-library',1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('packs',{keyPath:'summary.id'});request.result.createObjectStore('summaries',{keyPath:'id'})};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(request.error)};
  request.onblocked=()=>{database=undefined;reject(Error('Close other Quizhunter tabs and retry saving.'))};
 }));
}
async function browserTransaction<T>(mode:IDBTransactionMode,work:(tx:IDBTransaction)=>IDBRequest<T>){
 const database=await db();
 return new Promise<T>((resolve,reject)=>{
  const tx=database.transaction(['packs','summaries'],mode);const request=work(tx);
  tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error??request.error);tx.onabort=()=>reject(tx.error??Error('Library save was interrupted.'));
 });
}
export async function listLibrary(){
 const entries=window.quizhunterLibrary?await window.quizhunterLibrary.list():await browserTransaction('readonly',tx=>tx.objectStore('summaries').getAll()) as LibrarySummary[];
 return entries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export async function readLibrary(id:string):Promise<LibraryRecord>{
 const record=window.quizhunterLibrary?await window.quizhunterLibrary.read(id):await browserTransaction('readonly',tx=>tx.objectStore('packs').get(id)) as LibraryRecord|undefined;
 if(!record)throw Error('This collection is no longer in your library.');
 return {...record,pack:restoreStudyPack(record.pack).pack};
}
let writes=Promise.resolve();
const enqueue=(operation:()=>Promise<unknown>)=>{const next=writes.then(operation).then(()=>{});writes=next.catch(()=>{});return next};
export function writeLibrary(record:LibraryRecord){return enqueue(async()=>{
 if(window.quizhunterLibrary)return window.quizhunterLibrary.write(record);
 await browserTransaction('readwrite',tx=>{tx.objectStore('summaries').put(record.summary);return tx.objectStore('packs').put(record)});
})}
export function removeLibrary(id:string){return enqueue(async()=>{
 if(window.quizhunterLibrary)return window.quizhunterLibrary.remove(id);
 await browserTransaction('readwrite',tx=>{tx.objectStore('summaries').delete(id);return tx.objectStore('packs').delete(id)});
})}
