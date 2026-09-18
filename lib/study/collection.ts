import type {Card,Quiz,StudyPack,HiddenContent,Deck} from './types';
import {normalizePractice} from './practice-quality';

export const emptyHidden=():HiddenContent=>({cards:[],quiz:[],lessons:[]});
export const contentKey=(item:Card|Quiz)=>`${item.slide}:${normalizePractice('front' in item?item.front:item.question)}`;

export function visiblePack(pack:StudyPack):StudyPack {
 const hidden=pack.hidden??emptyHidden();
 const cards=new Set(hidden.cards),quiz=new Set(hidden.quiz),lessons=new Set(hidden.lessons);
 return {...pack,cards:pack.cards.filter(c=>!cards.has(contentKey(c))),quiz:pack.quiz.filter(q=>!quiz.has(contentKey(q))),lessons:Object.fromEntries(Object.entries(pack.lessons).filter(([,l])=>!lessons.has(l.slide)))};
}

export function removePages(pack:StudyPack,numbers:number[]):StudyPack|null {
 const removed=new Set(numbers),slides=pack.deck.slides.filter(s=>!removed.has(s.number));
 if(!slides.length)return null;
 const hidden=pack.hidden??emptyHidden();
 const keepKey=(key:string)=>!removed.has(Number(key.split(':')[0]));
 return {...pack,deck:{...pack.deck,slides,documents:[...new Set(slides.flatMap(s=>s.source?[s.source]:[]))]},
  cards:pack.cards.filter(c=>!removed.has(c.slide)),quiz:pack.quiz.filter(q=>!removed.has(q.slide)),
  lessons:Object.fromEntries(Object.entries(pack.lessons).filter(([,l])=>!removed.has(l.slide))),
  agentResults:Object.fromEntries(Object.entries(pack.agentResults??{}).filter(([,r])=>!removed.has(r.lesson.slide))),
  progress:{cards:(pack.progress?.cards??[]).filter(n=>!removed.has(n)),quiz:(pack.progress?.quiz??[]).filter(n=>!removed.has(n))},
  hidden:{cards:hidden.cards.filter(keepKey),quiz:hidden.quiz.filter(keepKey),lessons:hidden.lessons.filter(n=>!removed.has(n))}};
}

// Keep existing study IDs stable after removals. New documents fill free IDs;
// their original PDF/PowerPoint page numbers never change.
export function appendDecks(existing:Deck|null,added:Deck[],limit:number):Deck{
 const used=new Set(existing?.slides.map(s=>s.number)??[]);let next=1;
 const slides=[...(existing?.slides??[])];
 for(const deck of added)for(const slide of deck.slides){
  while(used.has(next))next++;
  if(next>limit)throw Error(`Your collection can contain up to ${limit} pages.`);
  slides.push({...slide,number:next});used.add(next);
 }
 const documents=[...new Set([...(existing?.documents??[]),...added.flatMap(d=>d.documents??[])])];
 return {name:existing?.name??(documents.length===1?added[0].name:`Study collection (${documents.length} decks)`),documents,slides,warnings:[...new Set([...(existing?.warnings??[]),...added.flatMap(d=>d.warnings)])]};
}
