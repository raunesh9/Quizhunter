import {z} from 'zod';
import {agentSlideSchema,cardSchema,quizSchema,packContentSchema,packSchema} from './schemas';
import {normalizePractice,practiceSkipReason} from './practice-quality';
import {MAX_COLLECTION_SLIDES} from './limits';
import type {AgentResults,AgentSlideResult,Card,Quiz,Slide} from './types';

export function curatePractice(cards:unknown[],quiz:unknown[],slides:Slide[]){
 const sources=new Map(slides.map(s=>[s.number,s]));
 function clean<T extends Card|Quiz>(items:unknown[],schema:z.ZodType<T>,question:(item:T)=>string){
  const seen=new Set<string>(),retry=new Set<number>();let removed=0;
  const kept:T[]=[];
  for(const item of items){
   const parsed=schema.safeParse(item);
   const ref=item&&typeof item==='object'&&'slide' in item?item.slide:undefined;
   const source=typeof ref==='number'?sources.get(ref):undefined;
   if(!parsed.success||!source){removed++;if(source&&!practiceSkipReason(source))retry.add(source.number);continue}
   const key=normalizePractice(question(parsed.data));
   if(practiceSkipReason(source)||seen.has(key)){removed++;continue}
   seen.add(key);kept.push(parsed.data);
  }
  return {items:kept,removed,retry:[...retry]};
 }
 return {cards:clean(cards,cardSchema,c=>c.front),quiz:clean(quiz,quizSchema,q=>q.question)};
}

export function curateAgentResults(results:Record<string,unknown>,slides:Slide[]):AgentResults{
 const refs=new Set(slides.map(s=>s.number));
 return Object.fromEntries(Object.entries(results).flatMap(([key,value])=>{
  const parsed=agentSlideSchema.safeParse(value);
  if(!parsed.success||!refs.has(parsed.data.lesson.slide)||!['beginner','college','advanced'].some(level=>key===`${level}:${parsed.data.lesson.slide}`||key===`${level}:${parsed.data.lesson.slide}:quick`))return [];
  const result=parsed.data,source=slides.find(s=>s.number===result.lesson.slide)!;
  if(practiceSkipReason(source)&&result.practiceStatus!=='not_applicable')return [];
  return [[key,result]];
 }));
}

// Older packs may contain broken AI text. Recover their usable content without
// bypassing validation of the document structure or source references.
const recoverablePack=packContentSchema.extend({
 cards:z.array(z.unknown()).max(MAX_COLLECTION_SLIDES*60),
 quiz:z.array(z.unknown()).max(MAX_COLLECTION_SLIDES*30),
 agentResults:z.record(z.unknown()).optional(),
});
export function restoreStudyPack(value:unknown){
 const raw=recoverablePack.parse(value),clean=curatePractice(raw.cards,raw.quiz,raw.deck.slides);
 const progress=raw.progress??{cards:clean.cards.items.map(c=>c.slide),quiz:clean.quiz.items.map(q=>q.slide)};
 const pack=packSchema.parse({...raw,cards:clean.cards.items,quiz:clean.quiz.items,
  progress:{cards:progress.cards.filter(n=>!clean.cards.retry.includes(n)),quiz:progress.quiz.filter(n=>!clean.quiz.retry.includes(n))},
  agentResults:curateAgentResults(raw.agentResults??{},raw.deck.slides)});
 return {pack,removed:clean.cards.removed+clean.quiz.removed};
}

export function skippedPracticeBundle(slide:Slide,reason:string):AgentSlideResult{
 return {lesson:{slide:slide.number,title:slide.title,bigIdea:reason,explanation:[reason+' It is kept as source material but excluded from practice.'],terms:[],example:'No grounded practice example is available on this page.',connections:'Continue to the pages with substantive concepts.',misconceptions:[],check:{question:'',answer:''},limitations:[reason]},cards:[],quiz:[],practiceStatus:'not_applicable',practiceNote:reason};
}
