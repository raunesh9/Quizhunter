import type {Slide} from './types';

export const normalizePractice=(text:string)=>text.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();

// Detect response-format leakage without rejecting legitimate code, formulas,
// non-English text, or questions that teach JSON as a subject.
export function practiceTextIssue(text:string):string|null {
 const value=text.trim();
 if(!value||!/[\p{L}\p{N}]/u.test(value))return 'Study text must contain a readable question or answer.';
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(value)||/\[object Object\]/.test(value))return 'Study text contains unreadable characters.';
 const fields=value.match(/["“”](?:front|back|slide|practiceStatus|practiceNote|correctAnswer|additionalProperties|properties|required)["“”]\s*:/g)??[];
 if(fields.length>=2||/^[\s`]*(?:json\s*)?\{\s*["“”](?:cards|quiz|lesson)["“”]\s*:/i.test(value))return 'Study text contains a broken response instead of study material.';
 if(/(\b[\p{L}\p{N}]+\b)(?:[\s,;.!-]+\1){5,}/iu.test(value)||/([\s\S]{12,100}?)\1{4,}/u.test(value)||/[^\s]{160,}/u.test(value))return 'Study text contains repeated or unreadable output.';
 return null;
}

export function isHousekeepingQuestion(text:string):boolean {
 return /\b(?:title|topic|subject|focus|author|date|presenter|agenda)\b.{0,65}\b(?:this|that|the|our)\b.{0,45}\b(?:slide|page|presentation|lecture|deck|course|document|talk|class|session)\b|\b(?:purpose|role)\s+of\s+(?:this|that|the|our)\s+(?:(?:introductory|first|last|opening|title|current)\s+)?(?:slide|page|presentation|lecture|deck|course|session)\b/i.test(text);
}

export function practiceQuestionIssue(text:string):string|null {
 // Source numbers belong in metadata. Questions must work without the page open.
 if(/\b(?:this|that|the (?:first|last|opening|title|current|previous|next))\s+(?:slide|page)\b|\b(?:slide|page)\s*(?:#\s*)?\d+\b|\b(?:on|in|from|of|to)\s+the\s+(?:slide|page)\b/i.test(text))return 'Ask a standalone concept question without referring to a slide or page.';
 if(/\bthe (?:slide|page)\s+(?:shows?|presents?|depicts?|illustrates?|describes?|discusses?|explains?|covers?|focuses?)\b/i.test(text))return 'Name the concept instead of asking about the page.';
 if(isHousekeepingQuestion(text))return 'Omit presentation housekeeping questions entirely. If the source has only a title, topic list, or administrative details, return empty practice arrays.';
 return null;
}

// A model may still try to quiz a cover page. Omit that trivia, rather than
// treating an otherwise readable but irrelevant page as a failed generation.
// Malformed or gibberish content is left for the validator and retry path.
export function removeHousekeepingOutput(mode:string,value:unknown):unknown {
 if(!['cards','quiz','agent'].includes(mode)||!value||typeof value!=='object')return value;
 const root={...value} as Record<string,unknown>;let removed=0;
 for(const [key,field] of [['cards','front'],['quiz','question']]){
  if(mode!==key&&mode!=='agent')continue;
  const items=root[key];
  if(Array.isArray(items))root[key]=items.filter(item=>{
   const question=item&&typeof item==='object'?item[field]:undefined;
   if(typeof question==='string'&&isHousekeepingQuestion(question)){removed++;return false}
   return true;
  });
 }
 if(mode==='agent'&&removed&&Array.isArray(root.cards)&&!root.cards.length&&Array.isArray(root.quiz)&&!root.quiz.length){
  root.practiceStatus='not_applicable';root.practiceNote='Only presentation housekeeping was offered as practice; no substantive concept questions were supported.';
 }
 return root;
}

// Only skip sources whose lack of evidence is certain. Images and speaker notes
// can add substance to an opening page and must still be read by the model.
export function practiceSkipReason(slide:Slide):string|null {
 if(slide.images.length||slide.notes.trim())return null;
 const text=normalizePractice(slide.text),title=normalizePractice(slide.title);
 if(!text)return 'This page has no readable study content.';
 if(text===title&&text.split(' ').length<=14&&!/[.!?=;]|\b(?:is|are|means|causes|converts|produces|generates|requires|equals|defined|uses|contains)\b/i.test(text))return 'This page contains only a heading, with no concepts or facts to test.';
 return null;
}

export function shuffledIndices(length:number,random:()=>number=Math.random):number[]{
 const result=Array.from({length},(_,i)=>i);
 for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}
 return result;
}

export function quizRound(candidates:number[],previous:number[]=[],random:()=>number=Math.random):number[]{
 const next=shuffledIndices(candidates.length,random).map(i=>candidates[i]);
 // Retaking a quiz should visibly change its order when there is a choice.
 if(next.length>1&&next.every((n,i)=>n===(previous.length?previous:candidates)[i]))next.push(next.shift()!);
 return next;
}
