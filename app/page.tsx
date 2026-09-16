"use client";
import {useEffect,useRef,useState} from 'react';
import {BookOpen,ArrowUpRight,Upload,Layers,Sparkles,GraduationCap,ArrowRight,FileText,Download,LoaderCircle,ChevronLeft,ChevronRight,MessageCircle,Check,KeyRound,X} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from '@/components/ui/select';
import {Progress} from '@/components/ui/progress';
import {StudyAgent} from '@/components/study-agent';
import {runStudyAgent,StudyRequestError,agentResultKey} from '@/lib/study/agent';
import {LessonView,Flashcards,QuizView} from '@/components/study-results';
import {demoDeck,demoLessons,demoCards,demoQuiz} from '@/lib/study/demo';
import {parseDeck} from '@/lib/study/parser';
import {download,guideMarkdown} from '@/lib/study/export';
import {cardSchema,lessonSchema,quizSchema,packSchema} from '@/lib/study/schemas';
import {z} from 'zod';
import {MAX_SLIDES_PER_FILE,MAX_FILE_MB,MAX_COLLECTION_SLIDES,MAX_FILES_PER_UPLOAD,MAX_STUDY_PACK_MB,MAX_SOURCE_BYTES} from '@/lib/study/limits';
import {studyBatches,slideBytes} from '@/lib/study/batches';
import type {Deck,Slide,Lesson,Card,Quiz,StudyMode,StudySettings,StudyPack,StudyProgress,AgentResults} from '@/lib/study/types';
export default function Home(){
 const [deck,setDeck]=useState<Deck|null>(null),[slideIndex,setSlideIndex]=useState(0),[tab,setTab]=useState('explain');
 const [key,setKey]=useState(''),[keyDraft,setKeyDraft]=useState(''),[settingsOpen,setSettingsOpen]=useState(false),[keyError,setKeyError]=useState('');
 const [settings,setSettings]=useState<StudySettings>({depth:'detailed',level:'college'});
 const [lessons,setLessons]=useState<Record<string,Lesson>>({}),[cards,setCards]=useState<Card[]>([]),[quiz,setQuiz]=useState<Quiz[]>([]);
 const [agentResults,setAgentResults]=useState<AgentResults>({}),[agentFailures,setAgentFailures]=useState<Record<number,string>>({}),[agentCurrent,setAgentCurrent]=useState<number|null>(null);
 const [progress,setProgress]=useState<StudyProgress>({cards:[],quiz:[]});
 const [busy,setBusy]=useState(''),[percent,setPercent]=useState(0),[error,setError]=useState(''),[status,setStatus]=useState(''),[dragging,setDragging]=useState(false);
 const [question,setQuestion]=useState(''),[chats,setChats]=useState<Record<number,{question:string;answer:string}[]>>({});
 const fileInput=useRef<HTMLInputElement>(null),packInput=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null);
 const deckRef=useRef(deck);deckRef.current=deck;
 useEffect(()=>()=>controller.current?.abort(),[]);
 const slide=deck?.slides[slideIndex];const lessonId=(n:number)=>`${settings.depth}:${settings.level}:${n}`;const lesson=slide?lessons[lessonId(slide.number)]:undefined;
 const outline=deck?.slides.map(s=>`Study slide ${s.number}: ${s.title}${s.source?` [${s.source}, original slide ${s.sourceSlide}]`:""}`).join('\n').slice(0,10000)??'';
 const setNewDeck=(d:Deck,l:Record<string,Lesson>={},c:Card[]=[],q:Quiz[]=[],a:AgentResults={})=>{controller.current?.abort();setDeck(d);setLessons(l);setCards(c);setQuiz(q);setAgentResults(a);setAgentFailures({});setAgentCurrent(null);setProgress({cards:[],quiz:[]});setSlideIndex(0);setTab('explain');setError('');setStatus('');setChats({});setQuestion('')};
 const sample=()=>{setSettings({depth:'detailed',level:'college'});setNewDeck(demoDeck,Object.fromEntries(demoLessons.map(l=>[`detailed:college:${l.slide}`,l])),demoCards,demoQuiz,Object.fromEntries(demoLessons.map(l=>[agentResultKey('college',l.slide),{lesson:l,cards:demoCards.filter(c=>c.slide===l.slide),quiz:demoQuiz.filter(q=>q.slide===l.slide),practiceStatus:'ready',practiceNote:'Prepared example study material.'}])))};
 useEffect(()=>{const context=(document as unknown as {modelContext?:{registerTool:(tool:unknown,options:unknown)=>unknown}}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();try{Promise.resolve(context.registerTool({name:'read_study_outline',title:'Read study outline',description:'Read the loaded deck name and source slide titles. Does not generate content or reveal the API key.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('Expected an empty object');const d=deckRef.current;return d?{name:d.name,slides:d.slides.map(s=>({number:s.number,title:s.title,source:s.source,sourceSlide:s.sourceSlide}))}:{name:null,slides:[]}}},{signal:lifecycle.signal})).catch(()=>{});}catch{}return ()=>lifecycle.abort()},[]);
 async function upload(files?:FileList|File[]){
  if(!files?.length||busy)return;
  const selected=Array.from(files);
  if(selected.length>MAX_FILES_PER_UPLOAD){setError(`Choose up to ${MAX_FILES_PER_UPLOAD} files at a time.`);return}
  setBusy('Opening your slides…');setPercent(0);setError('');setStatus('');
  try{
   const existing=deck&&!deck.sample?deck:null;
   const parsed:Deck[]=[];
   let count=existing?.slides.length??0;
   let bytes=existing?.slides.reduce((total,s)=>total+slideBytes(s),0)??0;
   for(let i=0;i<selected.length;i++){
    if(count>=MAX_COLLECTION_SLIDES)throw Error(`Your collection can contain up to ${MAX_COLLECTION_SLIDES} slides.`);
    const d=await parseDeck(selected[i],message=>setBusy(`File ${i+1} of ${selected.length}: ${message}`));
    count+=d.slides.length;
    if(count>MAX_COLLECTION_SLIDES)throw Error(`These files would exceed ${MAX_COLLECTION_SLIDES} slides. Choose fewer decks.`);
    const slides=d.slides.map(slide=>({...slide,source:selected[i].name,sourceSlide:slide.number}));
    bytes+=slides.reduce((total,s)=>total+slideBytes(s),0);
    if(bytes>MAX_SOURCE_BYTES)throw Error('This collection contains too much image data. Study these decks in separate collections or use smaller PDF exports.');
    parsed.push({...d,documents:[selected[i].name],slides});
    setPercent(Math.round(100*(i+1)/selected.length));
   }
   const combined=[...(existing?.slides??[]),...parsed.flatMap(d=>d.slides)];
   const documents=[...(existing?.documents??[]),...parsed.flatMap(d=>d.documents??[])];
   const d:Deck={name:documents.length===1?parsed[0].name:`Study collection (${documents.length} decks)`,documents,slides:combined.map((slide,i)=>({...slide,number:i+1})),warnings:[...new Set([...(existing?.warnings??[]),...parsed.flatMap(d=>d.warnings)])]};
   setNewDeck(d,existing?lessons:{},existing?cards:[],existing?quiz:[],existing?agentResults:{});
   if(existing)setProgress(progress);
   setStatus(`${selected.length} ${selected.length===1?'deck':'decks'} added. ${d.slides.length} slides ready to study.${existing?' Existing study material kept; continue the agent to cover the new slides.':''}`);
  }catch(e){setError((e instanceof Error?e.message:'Could not read these files.')+' Your existing material is unchanged.')}
  finally{setBusy('');if(fileInput.current)fileInput.current.value=''}
 }

 const ensureKey=()=>{if(key)return true;setKeyDraft('');setSettingsOpen(true);setError('Connect AI, then choose the study action again.');return false};
 async function request(mode:StudyMode,slides:Slide[],signal:AbortSignal,q='',context=outline,requestSettings=settings){
  const response=await fetch('/api/study',{method:'POST',headers:{'Content-Type':'application/json','x-openai-key':key},body:JSON.stringify({mode,slides,context,...requestSettings,question:q}),signal});
  const data:unknown=await response.json();
  if(!response.ok)throw new StudyRequestError(z.object({error:z.string()}).safeParse(data).data?.error||'The request failed. Try again.',response.status);
  return data;
 }
 async function runAgent(){
  if(!deck||busy)return;
  const cached=deck.slides.flatMap(s=>{const r=agentResults[agentResultKey(settings.level,s.number)];return r?[r]:[]});
  if(cached.length===deck.slides.length){
   setLessons(previous=>({...previous,...Object.fromEntries(cached.map(r=>[`detailed:${settings.level}:${r.lesson.slide}`,r.lesson]))}));
   setCards(cached.flatMap(r=>r.cards));setQuiz(cached.flatMap(r=>r.quiz));
   setProgress({cards:cached.map(r=>r.lesson.slide),quiz:cached.map(r=>r.lesson.slide)});
   setSettings(s=>({...s,depth:'detailed'}));setTab('explain');setStatus('Your completed study pack is open. Choose a slide, Flashcards, or Quiz.');return;
  }
  if(deck.sample||!ensureKey())return;
  if(cached.length){
   const sources=new Set(cached.map(r=>r.lesson.slide));
   setLessons(previous=>({...previous,...Object.fromEntries(cached.map(r=>[`detailed:${settings.level}:${r.lesson.slide}`,r.lesson]))}));
   setCards(previous=>[...previous.filter(c=>!sources.has(c.slide)),...cached.flatMap(r=>r.cards)].sort((a,b)=>a.slide-b.slide));
   setQuiz(previous=>[...previous.filter(q=>!sources.has(q.slide)),...cached.flatMap(r=>r.quiz)].sort((a,b)=>a.slide-b.slide));
  }
  const ctrl=new AbortController();controller.current=ctrl;
  const level=settings.level;
  setSettings(s=>({...s,depth:'detailed'}));setTab('explain');setBusy('Planning your complete study pack…');setError('');setStatus('');setAgentFailures({});
  setPercent(100*deck.slides.filter(s=>agentResults[agentResultKey(level,s.number)]).length/deck.slides.length);
  try{
   const outcome=await runStudyAgent({slides:deck.slides,level,previous:agentResults,signal:ctrl.signal,
    request:(slide,context,signal)=>request('agent',[slide],signal,'',context,{depth:'detailed',level}),
    onStart:(slide,done,total)=>{setAgentCurrent(slide.number);setBusy(`Study agent · slide ${slide.number} · ${done} of ${total} complete…`);setPercent(100*done/total)},
    onComplete:(key,result)=>{
     const n=result.lesson.slide;
     setAgentResults(previous=>({...previous,[key]:result}));
     setLessons(previous=>({...previous,[`detailed:${level}:${n}`]:result.lesson}));
     setCards(previous=>[...previous.filter(c=>c.slide!==n),...result.cards].sort((a,b)=>a.slide-b.slide));
     setQuiz(previous=>[...previous.filter(q=>q.slide!==n),...result.quiz].sort((a,b)=>a.slide-b.slide));
     setProgress(previous=>({cards:[...new Set([...previous.cards,n])],quiz:[...new Set([...previous.quiz,n])]}));
    },
    onError:(slide,message)=>setAgentFailures(previous=>({...previous,[slide.number]:message}))
   });
   setPercent(100*outcome.completed/outcome.total);
   if(outcome.completed===outcome.total)setStatus(`Study pack complete. All ${outcome.total} slides have explanations. Open Flashcards or Quiz to study; coverage notes identify slides that could not support practice questions.`);
   else setError(`${outcome.completed} of ${outcome.total} slides complete. Open slide coverage to see the errors, then continue the agent to retry unfinished slides.`);
  }catch(error){
   if(ctrl.signal.aborted)setStatus('Study agent paused. Your completed slides are kept. Continue anytime, or save a study pack to resume later.');
   else setError((error instanceof Error?error.message:'The study agent could not finish.')+' Completed slides are kept; continue to resume.');
  }finally{setAgentCurrent(null);setBusy('');controller.current=null}
 }

 async function generate(mode:'explain'|'cards'|'quiz',all=false){
  if(!deck||busy)return;if(!ensureKey())return;
  const ctrl=new AbortController();controller.current=ctrl;
  setBusy('Preparing your study material…');setError('');setStatus('');setPercent(0);
  const source=mode==='explain'?(all?deck.slides.filter(s=>!lessons[lessonId(s.number)]):[deck.slides[slideIndex]]):deck.slides.filter(s=>!progress[mode].includes(s.number));
  const newCards=[...cards],newQuiz=[...quiz];let completed=0;let batchCount=0;
  try{
   const batches=studyBatches(source,mode);batchCount=batches.length;
   for(const batch of batches){
    ctrl.signal.throwIfAborted();
    setBusy(mode==='explain'?`Explaining slide ${batch[0].number} · ${completed+1} of ${batches.length}…`:`Creating ${mode==='cards'?'flashcards':'questions'} · slides ${batch[0].number}–${batch.at(-1)!.number} · batch ${completed+1} of ${batches.length}…`);
    const data=await request(mode,batch,ctrl.signal);
    if(mode==='explain'){const lesson=lessonSchema.parse(data);setLessons(l=>({...l,[lessonId(lesson.slide)]:lesson}))}
    if(mode==='cards'){newCards.push(...z.object({cards:z.array(cardSchema)}).parse(data).cards);setCards([...newCards])}
    if(mode==='quiz'){newQuiz.push(...z.object({quiz:z.array(quizSchema)}).parse(data).quiz);setQuiz([...newQuiz])}
    if(mode!=='explain')setProgress(p=>({...p,[mode]:[...new Set([...p[mode],...batch.map(s=>s.number)])]}));
    completed++;setPercent(Math.round(100*completed/batches.length));
   }
   setStatus(`${mode==='explain'?'Explanations':mode==='cards'?'Flashcards':'Practice quiz'} ready.`);
  }catch(e){setError((ctrl.signal.aborted?'Generation stopped.':e instanceof Error?e.message:'Generation failed.')+` ${completed} of ${batchCount} batches completed this run. Your completed work is kept; continue to pick up where you left off.`)}
  finally{setBusy('');controller.current=null}
 }

 async function ask(){if(!slide||!question.trim()||busy||!ensureKey())return;const ctrl=new AbortController();controller.current=ctrl;const currentQuestion=question.trim();const n=slide.number;setBusy('Thinking through your question…');setError('');try{const data=await request('ask',[slide],ctrl.signal,currentQuestion);setChats(c=>({...c,[n]:[...(c[n]??[]),{question:currentQuestion,answer:z.object({answer:z.string()}).parse(data).answer}]}));setQuestion('')}catch(e){setError(ctrl.signal.aborted?'Question cancelled.':e instanceof Error?e.message:'Could not answer the question.')}finally{setBusy('');controller.current=null}}
 const pack=():StudyPack=>({version:1,deck:deck!,lessons,cards,quiz,progress,agentResults});
 async function restore(file?:File){
  if(!file||busy)return;setError('');setBusy('Opening your study pack…');setPercent(0);
  try{
   if(file.size>MAX_STUDY_PACK_MB*1024*1024)throw Error(`This study pack is too large (maximum ${MAX_STUDY_PACK_MB} MB).`);
   const p=packSchema.parse(JSON.parse(await file.text()));
   setNewDeck(p.deck,p.lessons,p.cards,p.quiz,p.agentResults);
   setProgress(p.progress??{cards:[...new Set(p.cards.map(c=>c.slide))],quiz:[...new Set(p.quiz.map(q=>q.slide))]});
   setSettings({depth:'detailed',level:'college'});setStatus('Study pack restored.');
  }catch(e){setError(e instanceof z.ZodError?'This file is not a valid Quizhunter study pack.':e instanceof Error?e.message:'Could not restore the study pack.')}
  finally{setBusy('');if(packInput.current)packInput.current.value=''}
 }
 const remainingLessons=deck?.slides.filter(s=>!lessons[lessonId(s.number)]).length??0;
 const remainingCards=deck?.slides.filter(s=>!progress.cards.includes(s.number)).length??0;
 const remainingQuiz=deck?.slides.filter(s=>!progress.quiz.includes(s.number)).length??0;

 const source=(n:number)=>{const i=deck?.slides.findIndex(s=>s.number===n)??-1;if(i>=0){setSlideIndex(i);setTab('explain')}};
 return <div className="app-shell"><header className="topbar"><a href="/" className="brand"><span className="brand-mark"><BookOpen size={23}/></span>quizhunter<span className="brand-dot">.</span></a><span className="header-note">YOUR PERSONAL STUDY STUDIO</span><button className="button outline" onClick={()=>{setKeyDraft(key);setSettingsOpen(true)}}>{key?<Check size={16}/>:<KeyRound size={16}/>} {key?'AI connected':'Connect AI'}<ArrowUpRight size={15}/></button></header><main className="workspace"><div className="page-heading"><div><p className="eyebrow">LESS SLIDE READING. MORE UNDERSTANDING.</p><h1>Make it <span>click.</span></h1><p className="subtitle">Your slides, explained. Your knowledge, put to the test.</p></div><span className="workspace-label"><GraduationCap size={18}/> Study workspace</span></div>
 {error&&<div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}{status&&!busy&&<p className="success-banner" role="status"><Check size={16}/>{status}</p>}
 <div className="studio-grid"><aside className="input-panel"><div className="panel-title"><span className="step">01</span><h2>{deck?'Your study material':'Start with your slides'}</h2></div><input type="file" ref={fileInput} accept=".pptx,.pdf" multiple className="sr-only" aria-label="Upload PowerPoints or PDFs" onChange={e=>upload(e.target.files??undefined)}/><input type="file" ref={packInput} accept=".json" className="sr-only" aria-label="Open saved study pack" onChange={e=>restore(e.target.files?.[0])}/>
 {!deck?<><button className={`upload-zone ${dragging?'dragging':''}`} disabled={!!busy} onClick={()=>fileInput.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(e.dataTransfer.files)}}><span className="upload-symbol"><Upload size={25}/></span><strong>Drop your PowerPoints here</strong><span>or click to choose multiple files</span><small>PPTX or PDF · {MAX_FILE_MB} MB & {MAX_SLIDES_PER_FILE} slides per file</small></button><div className="divider"><span>JUST EXPLORING?</span></div><button className="sample-button" onClick={sample} disabled={!!busy}><span className="sample-icon"><FileText size={22}/></span><span><strong>Try a sample lesson</strong><small>Memory & learning · 3 slides</small></span><ArrowRight size={18}/></button><div className="study-note"><Sparkles size={19}/><p>Go beyond the bullet points.<br/><span>Get the why, the how, and the “oh, I get it.”</span></p></div></>:<><div className="deck-heading"><span className="sample-icon"><FileText size={22}/></span><div><h2>{deck.name}</h2><p>{deck.slides.length} slides {deck.sample?'· Sample lesson':`· ${deck.documents?.length??1} decks`}</p></div></div>{!!deck.documents?.length&&<div className="deck-list">{deck.documents.map((name,i)=><span key={i}>{i+1}. {name}</span>)}</div>}<label className="field-label" htmlFor="slide-picker">Choose a slide</label><Select value={String(slideIndex)} onValueChange={v=>setSlideIndex(Number(v))}><SelectTrigger id="slide-picker" className="w-full"><SelectValue/></SelectTrigger><SelectContent>{deck.slides.map((s,i)=><SelectItem value={String(i)} key={s.number}>{s.number}. {s.title.slice(0,48)}{s.source?` · ${s.source.slice(0,30)}`:''}</SelectItem>)}</SelectContent></Select><div className="slide-nav"><button className="icon-button" aria-label="Previous slide" disabled={slideIndex===0} onClick={()=>setSlideIndex(i=>i-1)}><ChevronLeft size={18}/></button><span>{slideIndex+1} of {deck.slides.length}</span><button className="icon-button" aria-label="Next slide" disabled={slideIndex===deck.slides.length-1} onClick={()=>setSlideIndex(i=>i+1)}><ChevronRight size={18}/></button></div><div className="field-grid"><div><label className="field-label" htmlFor="depth">Explanation style</label><Select value={settings.depth} disabled={!!busy||!!deck.sample} onValueChange={v=>setSettings(s=>({...s,depth:v as StudySettings['depth']}))}><SelectTrigger id="depth" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="detailed">Deep dive</SelectItem><SelectItem value="simple">Simple & clear</SelectItem><SelectItem value="exam">Exam focus</SelectItem></SelectContent></Select></div><div><label className="field-label" htmlFor="level">Learning level</label><Select value={settings.level} disabled={!!busy||!!deck.sample} onValueChange={v=>setSettings(s=>({...s,level:v as StudySettings['level']}))}><SelectTrigger id="level" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="beginner">Beginner</SelectItem><SelectItem value="college">College</SelectItem><SelectItem value="advanced">Advanced</SelectItem></SelectContent></Select></div></div><details className="source-details"><summary>View extracted source</summary><p className="source-text">{slide?.text||'No text extracted. Use the slide image when available.'}</p>{slide?.notes&&<><strong>Speaker notes</strong><p className="source-text">{slide.notes}</p></>}{slide?.images.map((img,i)=><img key={i} src={img} alt={`Source image ${i+1} from slide ${slide.number}`} className="slide-image"/>)}</details>{!!deck.warnings.length&&<details className="source-details"><summary>Reading notes</summary>{deck.warnings.map((w,i)=><p key={i} className="small muted">{w}</p>)}</details>}<div className="aside-actions"><button className="button outline" disabled={!!busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/> Add PowerPoints / PDFs</button><button className="button outline" onClick={()=>download(deck.name+'-study-pack.json',JSON.stringify(pack()),'application/json')}><Download size={15}/>Save study pack</button></div><p className="small muted">Work stays in this tab. Save a study pack to keep your slides and generated material after closing it.</p></>}
 <button className="text-button restore-button" disabled={!!busy} onClick={()=>packInput.current?.click()}>Open a saved study pack</button>{!deck&&<p className="privacy-note">Your files are read in your browser. When you generate, selected slide content is sent to OpenAI using your API key.</p>}</aside>
 <section className="preview-panel" aria-busy={!!busy}>{busy&&<div className="busy-banner" role="status"><div><LoaderCircle size={18} className="spin"/><span>{busy}</span>{controller.current&&<button className="text-button" onClick={()=>controller.current?.abort()}>Stop</button>}</div><Progress value={percent} aria-label="Generation progress"/></div>}
 {deck&&<StudyAgent slides={deck.slides} results={agentResults} failures={agentFailures} level={settings.level} busy={!!busy} current={agentCurrent} onRun={()=>void runAgent()} onSource={source}/>}
 {!deck?<><div className="panel-title"><span className="step">02</span><h2>Turn information into understanding</h2><span className="badge">A LOOK INSIDE</span></div><div className="preview-top"><span className="eyebrow">EXPLAIN · PRACTICE · REMEMBER</span><h2>One study agent.<br/>For every slide.</h2><p>Upload your decks and build a complete study pack: detailed slide explanations, flashcards, and quizzes in one guided run.</p></div><div className="example-note"><span className="mini-label">EXAMPLE EXPLANATION</span><h3>Why does testing yourself work?</h3><p>Retrieving an idea strengthens your ability to find it again. Think of a path through a forest: each time you walk it, the route becomes easier to follow.</p><div className="source-chip">Memory & learning · Slide 2</div></div><div className="feature-row"><span><BookOpen size={18}/>Deep explanations</span><span><Layers size={18}/>Flashcards</span><span><GraduationCap size={18}/>Practice quizzes</span></div></>:<><div className="result-heading"><span className="eyebrow">{deck.sample?'SAMPLE LESSON':'YOUR STUDY STUDIO'} · SLIDE {slide?.number}</span><h2>{slide?.title}</h2>{slide?.source&&<p className="source-origin">{slide.source} · Original slide {slide.sourceSlide}</p>}</div><Tabs value={tab} onValueChange={setTab}><TabsList className="study-tabs"><TabsTrigger value="explain"><BookOpen/>Explain</TabsTrigger><TabsTrigger value="cards"><Layers/>Flashcards</TabsTrigger><TabsTrigger value="quiz"><GraduationCap/>Quiz</TabsTrigger><TabsTrigger value="ask"><MessageCircle/>Ask</TabsTrigger></TabsList><TabsContent value="explain">{lesson?<><LessonView lesson={lesson}/><div className="actions"><button className="button outline" onClick={()=>download(deck.name+'-study-guide.md',guideMarkdown(pack()))}><Download size={15}/>Export study guide</button>{!deck.sample&&<button className="text-button" disabled={!!busy} onClick={()=>generate('explain')}>Regenerate this slide</button>}</div></>:<div className="empty-state"><BookOpen size={35}/><h3>Let’s make this slide make sense.</h3><p>Get a detailed explanation, key terms, worked examples, common traps, and a question to check your understanding.</p><button className="button" disabled={!!busy} onClick={()=>generate('explain')}><Sparkles size={16}/>Explain this slide</button></div>}{!deck.sample&&<div className="batch-action"><button className="text-button" disabled={!!busy||!remainingLessons} onClick={()=>generate('explain',true)}>{remainingLessons?`Explain ${remainingLessons===deck.slides.length?'all':'remaining'} ${remainingLessons} slides`:'All slides explained'}</button><small>One AI request per slide. Stop and continue anytime. API usage is billed to your account.</small></div>}</TabsContent><TabsContent value="cards">{!deck.sample&&cards.length>0&&remainingCards>0&&<div className="batch-action"><button className="text-button" disabled={!!busy} onClick={()=>generate('cards')}>Continue flashcards · {remainingCards} slides left</button></div>}{cards.length?<Flashcards key={cards.map(c=>c.front).join('|')} cards={cards} name={deck.name} onSource={source}/>:<div className="empty-state"><Layers size={35}/><h3>Build knowledge that sticks.</h3><p>Create focused flashcards from your whole deck, study the ones you miss, and export to Quizlet or Anki.</p><button className="button" disabled={!!busy} onClick={()=>generate('cards')}><Sparkles size={16}/>Create flashcards</button></div>}</TabsContent><TabsContent value="quiz">{!deck.sample&&quiz.length>0&&remainingQuiz>0&&<div className="batch-action"><button className="text-button" disabled={!!busy} onClick={()=>generate('quiz')}>Continue quiz · {remainingQuiz} slides left</button></div>}{quiz.length?<QuizView key={quiz.map(q=>q.question).join('|')} questions={quiz} onSource={source}/>:<div className="empty-state"><GraduationCap size={35}/><h3>Find out what you really know.</h3><p>Test yourself on the whole deck with questions that cover concepts and applications, plus explanations for every answer.</p><button className="button" disabled={!!busy} onClick={()=>generate('quiz')}><Sparkles size={16}/>Create practice quiz</button></div>}</TabsContent><TabsContent value="ask"><div className="ask-intro"><h3>Stay curious.</h3><p>Ask a question about slide {slide?.number}. Each question is answered independently using this slide and its notes.</p></div>{(chats[slide!.number]??[]).map((c,i)=><div className="chat-pair" key={i}><p className="chat-question">{c.question}</p><p className="chat-answer">{c.answer}</p></div>)}<form onSubmit={e=>{e.preventDefault();void ask()}}><label className="field-label" htmlFor="question">Your question</label><textarea id="question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Why does this happen? Can you give me another example?" rows={4} maxLength={2000}/><div className="actions end"><button className="button" disabled={!!busy||!question.trim()} type="submit">Ask your tutor <ArrowRight size={16}/></button></div></form></TabsContent></Tabs>{!deck.sample&&<p className="ai-note">AI can make mistakes. Use the source slide to check important details.</p>}</>}
 </section></div><footer>Built for the moment it finally makes sense.<span>Quizlet & Anki exports included</span></footer></main>
 <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="connection-dialog"><DialogTitle>Connect your study tutor</DialogTitle><DialogDescription>Use your OpenAI API key to explain your decks and create study material. The sample lesson works without a key.</DialogDescription><form onSubmit={e=>{e.preventDefault();if(!/^sk-[A-Za-z0-9_-]{10,500}$/.test(keyDraft.trim())){setKeyError('Enter a valid OpenAI API key beginning with sk-.');return}setKey(keyDraft.trim());setKeyDraft('');setKeyError('');setSettingsOpen(false);setError('');setStatus('API key added for this session. Choose an action to start studying.')}}><label htmlFor="api-key" className="field-label">OpenAI API key</label><input id="api-key" type="password" autoComplete="off" value={keyDraft} onChange={e=>setKeyDraft(e.target.value)} placeholder="sk-…" maxLength={503}/>{keyError&&<p className="error-text" role="alert">{keyError}</p>}<div className="notice"><p>The key stays in memory for this tab and is forwarded securely to OpenAI when you generate. Quizhunter does not save your key or decks on its server.</p><p>Uses GPT-5.4. API billing is separate from a ChatGPT subscription. Connecting saves the key for this session; the first request checks access.</p></div><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-link">Create or manage an API key ↗</a><div className="actions end">{key&&<button type="button" className="button outline" disabled={!!busy} onClick={()=>{setKey('');setKeyDraft('');setSettingsOpen(false)}}>Disconnect</button>}<button className="button" type="submit">Connect AI</button></div></form></DialogContent></Dialog></div>
}
