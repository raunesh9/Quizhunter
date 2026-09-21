"use client";
import {useEffect} from 'react';
import {ArrowLeft,BookOpen,ChevronLeft,ChevronRight,Download} from 'lucide-react';
import {LessonView} from '@/components/study-results';
import type {Lesson,Slide} from '@/lib/study/types';

export type ReadingEntry={slide:Slide;lesson:Lesson};

export function ExplanationReader({entries,current,collection,onSelect,onBack,onExport}:{
 entries:ReadingEntry[];current:number;collection:string;
 onSelect:(number:number)=>void;onBack:()=>void;onExport:()=>void;
}){
 const index=Math.max(0,entries.findIndex(entry=>entry.slide.number===current));
 const entry=entries[index];
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'})},[entry?.slide.number]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||document.querySelector('[role="dialog"]'))return;
   if((event.target as HTMLElement|null)?.closest('input,textarea,select,[contenteditable="true"],[role="tablist"],summary'))return;
   if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
   const next=entries[index+(event.key==='ArrowRight'?1:-1)];
   if(next){event.preventDefault();onSelect(next.slide.number)}
  };
  document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
 },[entries,index,onSelect]);

 return <section className="explanation-reader" aria-label="Explanation reader">
  <div className="reader-actions"><button className="text-button" onClick={onBack}><ArrowLeft size={16}/>Back to study studio</button>{!!entries.length&&<button className="text-button" onClick={onExport}><Download size={15}/>Export guide</button>}</div>
  {!entry?<div className="reader-paper empty-state"><BookOpen size={30}/><h1>No saved explanations</h1><p>Choose a slide in the study studio to create an explanation.</p><button className="button" onClick={onBack}>Open study studio</button></div>:<>
   <div className="slide-stepper reader-navigation" aria-label="Explanation navigation">
    <button className="stepper-button" aria-label="Previous explanation" disabled={index===0} onClick={()=>onSelect(entries[index-1].slide.number)}><ChevronLeft size={17}/><span>Previous</span></button>
    <label className="stepper-picker"><span>EXPLANATION {index+1} OF {entries.length}<small>← → keys</small></span><select className="native-select" aria-label="Go to explanation" value={entry.slide.number} onChange={event=>onSelect(Number(event.target.value))}>{entries.map(({slide})=><option key={slide.number} value={slide.number}>{slide.number}. {slide.title}{slide.source?` · ${slide.source} (p. ${slide.sourceSlide??slide.number})`:''}</option>)}</select></label>
    <button className="stepper-button" aria-label="Next explanation" disabled={index===entries.length-1} onClick={()=>onSelect(entries[index+1].slide.number)}><span>Next</span><ChevronRight size={17}/></button>
   </div>
   <div className="reader-paper" key={entry.slide.number}>
    <header className="reader-heading"><p>{entry.slide.source?`${entry.slide.source} · Original page ${entry.slide.sourceSlide??entry.slide.number}`:`${collection} · Slide ${entry.slide.number}`}</p><h1>{entry.lesson.title||entry.slide.title}</h1></header>
    <LessonView lesson={entry.lesson}/>
   </div>
  </>}
 </section>;
}
