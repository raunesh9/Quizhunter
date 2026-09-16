"use client";
import {Sparkles,Check,BookOpen,Layers,GraduationCap} from 'lucide-react';
import {Progress} from '@/components/ui/progress';
import {agentResultKey} from '@/lib/study/agent';
import type {AgentResults,Slide,StudySettings} from '@/lib/study/types';

export function StudyAgent({slides,results,failures,level,busy,current,onRun,onSource}:{slides:Slide[];results:AgentResults;failures:Record<number,string>;level:StudySettings['level'];busy:boolean;current:number|null;onRun:()=>void;onSource:(slide:number)=>void}){
 const completed=slides.flatMap(s=>{const r=results[agentResultKey(level,s.number)];return r?[r]:[]});
 const done=completed.length,remaining=slides.length-done;
 const cardCount=completed.reduce((n,r)=>n+r.cards.length,0),quizCount=completed.reduce((n,r)=>n+r.quiz.length,0);
 return <section className="study-agent" aria-labelledby="agent-title">
  <div className="agent-heading"><span className="agent-symbol"><Sparkles size={22}/></span><div><p className="mini-label">YOUR DEDICATED AI AGENT</p><h2 id="agent-title">A complete study pack. Every slide.</h2></div></div>
  <p className="agent-description">Detailed explanations, focused flashcards, and quizzes with explained answers. The agent works through your entire collection and checks each slide before moving on.</p>
  <div className="agent-stats"><span><BookOpen size={15}/>{done} / {slides.length} slides</span><span><Layers size={15}/>{cardCount} cards</span><span><GraduationCap size={15}/>{quizCount} questions</span></div>
  <Progress value={100*done/slides.length} aria-label="Slides completed by the study agent"/>
  <div className="agent-actions"><button className="button" disabled={busy} onClick={onRun}>{remaining===0?<Check size={16}/>:<Sparkles size={16}/>} {remaining===0?'Open completed study pack':done?'Continue study agent':'Build complete study pack'}</button><span>Deep dive · {level.charAt(0).toUpperCase()+level.slice(1)}</span></div>
  <p className="agent-hint">{remaining?`${remaining} slides left. `:''}One AI request per slide. Keep the app open while it works. You can stop anytime; save a study pack to resume after closing the app. API usage is billed to your account.</p>
  <details className="agent-coverage"><summary>View coverage for all {slides.length} slides</summary><ol aria-label="Slide coverage">{slides.map(s=>{const result=results[agentResultKey(level,s.number)];return <li key={s.number}><button className="agent-source" onClick={()=>onSource(s.number)}><strong>{s.number}. {s.title}</strong><span>{s.source??'Deck'} · Original slide {s.sourceSlide??s.number}</span></button><span className={`agent-slide-state ${result?'complete':failures[s.number]?'failed':''}`}>{result?'Explained':current===s.number?'Working…':failures[s.number]?'Needs retry':'Pending'}</span>{result&&<small>{result.practiceStatus==='ready'?`${result.cards.length} flashcards · ${result.quiz.length} quiz questions`:`No practice questions: ${result.practiceNote}`}</small>}{failures[s.number]&&!result&&<small className="error-text">{failures[s.number]}</small>}</li>})}</ol></details>
 </section>;
}
