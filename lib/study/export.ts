import type {Card,Deck,Quiz,StudyPack} from './types';
import {cardSchema,quizSchema} from './schemas';

// Export only practice material and provenance, never source images or credentials.
function exportContext(deck:Deck,processed:number[]){
 const sources=new Map(deck.slides.map(slide=>[slide.number,slide]));
 const sourceFor=(number:number)=>{
  const slide=sources.get(number);
  if(!slide)throw new Error(`Cannot export a question with missing source ${number}.`);
  const file=slide.source??deck.name;
  return {file,position:slide.sourceSlide??number,unit:/\.pdf$/i.test(file)?'page':'slide',title:slide.title};
 };
 const completed=new Set(processed.filter(n=>sources.has(n)));
 return {sourceFor,metadata:{version:1,deck:deck.name,sample:!!deck.sample,coverage:{totalSources:deck.slides.length,processedSources:deck.slides.filter(s=>completed.has(s.number)).map(s=>s.number),pendingSources:deck.slides.filter(s=>!completed.has(s.number)).map(s=>s.number)}}};
}
export function cardsToJSON(cards:Card[],deck:Deck,processed=cards.map(c=>c.slide)){
 const {sourceFor,metadata}=exportContext(deck,processed);
 return JSON.stringify({...metadata,type:'flashcards',cards:cards.map((card,i)=>{const c=cardSchema.parse(card);return {id:`card-${i+1}`,...c,source:sourceFor(c.slide)}})},null,2)+'\n';
}
export function quizToJSON(questions:Quiz[],deck:Deck,processed=questions.map(q=>q.slide)){
 const {sourceFor,metadata}=exportContext(deck,processed);
 return JSON.stringify({...metadata,type:'quiz',answerIndexBase:0,quiz:questions.map((question,i)=>{const q=quizSchema.parse(question);return {id:`question-${i+1}`,...q,source:sourceFor(q.slide)}})},null,2)+'\n';
}
export function cardsToTSV(cards:Card[],source=false){const clean=(s:string)=>s.replace(/[\t\r\n]+/g,' ').trim();return cards.map(c=>`${clean(c.front)}\t${clean(c.back)}${source?` (Slide ${c.slide})`:''}`).join('\n');}
export function download(name:string,text:string,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name.replace(/[^a-zA-Z0-9._ -]/g,'_');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function guideMarkdown(pack:StudyPack){return `# ${pack.deck.name}\n\n`+(pack.deck.documents?.length?'## Source map\n\n'+pack.deck.slides.map(s=>`- Study slide ${s.number}: ${s.source??pack.deck.name}, original slide ${s.sourceSlide??s.number}`).join('\n')+'\n\n':'')+Object.values(pack.lessons).sort((a,b)=>a.slide-b.slide).map(l=>`## Slide ${l.slide}: ${l.title}\n\n${l.bigIdea}\n\n${l.explanation.join('\n\n')}\n\n### Key terms\n\n${l.terms.map(t=>`- **${t.term}:** ${t.definition}`).join('\n')}\n\n### Worked example\n\n${l.example}\n\n### Connections\n\n${l.connections}\n\n### Common misconceptions\n\n${l.misconceptions.map(m=>'- '+m).join('\n')}\n\n### Check your understanding\n\n${l.check.question}\n\nAnswer: ${l.check.answer}\n\n${l.limitations.length?'### Source limitations\n\n'+l.limitations.join('\n\n'):''}`).join('\n\n---\n\n')}
