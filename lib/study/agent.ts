import type {AgentResults,AgentSlideResult,Slide,StudySettings} from './types';
import {validateAgentResult} from './schemas';
import {studyBatches} from './batches';

export const agentResultKey=(level:StudySettings['level'],slide:number)=>`${level}:${slide}`;

export class StudyRequestError extends Error {
  constructor(message:string,public status:number){super(message);this.name='StudyRequestError'}
}

// Keep the current slide's neighbors in context even for the final slides of a large collection.
export function agentContext(slides:Slide[],current:number):string {
  const index=slides.findIndex(s=>s.number===current);
  const describe=(s:Slide)=>`Study slide ${s.number}: ${s.title.slice(0,160)} (${s.source??'Deck'}, original slide ${s.sourceSlide??s.number})`;
  const nearby=slides.slice(Math.max(0,index-3),index+4);
  const neighborhood=nearby.map(describe).join('\n');
  const outline=slides.filter(s=>!nearby.includes(s)).map(s=>`Study slide ${s.number}: ${s.title.slice(0,60)}`).join('\n');
  return `Nearby slide titles (context only, not evidence):\n${neighborhood}\n\nOther slide titles:\n${outline}`.slice(0,12000);
}

type AgentOptions={
  slides:Slide[];
  level:StudySettings['level'];
  previous:AgentResults;
  signal:AbortSignal;
  request:(slide:Slide,context:string,signal:AbortSignal)=>Promise<unknown>;
  onStart:(slide:Slide,completed:number,total:number)=>void;
  onComplete:(key:string,result:AgentSlideResult)=>void;
  onError:(slide:Slide,message:string)=>void;
};

export async function runStudyAgent(options:AgentOptions){
  const {slides,level,previous,signal,request,onStart,onComplete,onError}=options;
  const pending=slides.filter(s=>!previous[agentResultKey(level,s.number)]);
  let completed=slides.length-pending.length,consecutiveFailures=0;
  const failures:Record<number,string>={};
  for(const slide of pending){
    signal.throwIfAborted();
    onStart(slide,completed,slides.length);
    try{
      studyBatches([slide],'explain');
      const response=await request(slide,agentContext(slides,slide.number),signal);
      signal.throwIfAborted();
      const result=validateAgentResult(response,slide.number);
      onComplete(agentResultKey(level,slide.number),result);
      completed++;consecutiveFailures=0;
    }catch(error){
      if(signal.aborted)throw error;
      const message=error instanceof Error?error.message:'This slide could not be completed.';
      failures[slide.number]=message;onError(slide,message);
      consecutiveFailures++;
      if(error instanceof StudyRequestError&&[401,403,429].includes(error.status))throw error;
      if(consecutiveFailures>=3)throw new Error('The agent paused after three consecutive errors. Completed slides are kept. Check the errors and continue when ready.');
    }
  }
  return {completed,total:slides.length,failures};
}
