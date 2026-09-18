"use client";
import {useEffect,useRef,useState,useMemo} from 'react';
import {BookOpen,ArrowUpRight,Upload,Layers,Sparkles,GraduationCap,ArrowRight,FileText,Download,LoaderCircle,ChevronLeft,ChevronRight,MessageCircle,Check,KeyRound,X,Home as HomeIcon,Trash2,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from '@/components/ui/select';
import {Progress} from '@/components/ui/progress';
import {StudyHome} from '@/components/study-home';
import {CollectionManager} from '@/components/collection-manager';
import {appendDecks,contentKey,emptyHidden,removePages,visiblePack} from '@/lib/study/collection';
import {generationBatches} from '@/lib/study/performance';
import {StudyAgent} from '@/components/study-agent';
import {runStudyAgent,StudyRequestError,agentResultKey} from '@/lib/study/agent';
import {LessonView,Flashcards,QuizView} from '@/components/study-results';
import {demoDeck,demoLessons,demoCards,demoQuiz} from '@/lib/study/demo';
import {parseDeck} from '@/lib/study/parser';
import {download,guideMarkdown} from '@/lib/study/export';
import {cardSchema,lessonSchema,quizSchema} from '@/lib/study/schemas';
import {z} from 'zod';
import {curatePractice,curateAgentResults,restoreStudyPack} from '@/lib/study/curation';
import {MAX_SLIDES_PER_FILE,MAX_FILE_MB,MAX_COLLECTION_SLIDES,MAX_FILES_PER_UPLOAD,MAX_STUDY_PACK_MB,MAX_SOURCE_BYTES} from '@/lib/study/limits';
import {slideBytes} from '@/lib/study/batches';
import type {Deck,Slide,Lesson,Card,Quiz,StudyMode,StudySettings,StudyPack,StudyProgress,AgentResults,HiddenContent} from '@/lib/study/types';
export default function Home(){
 const [deck,setDeck]=useState<Deck|null>(null),[slideIndex,setSlideIndex]=useState(0),[tab,setTab]=useState('explain');
 const [screen,setScreen]=useState<'home'|'workspace'>('home'),[manageOpen,setManageOpen]=useState(false);
 const [hidden,setHidden]=useState<HiddenContent>(emptyHidden);
 const [undoState,setUndoState]=useState<{pack:StudyPack;chats:Record<number,{question:string;answer:string}[]>;slideIndex:number;message:string}|null>(null);
 const [provider,setProvider]=useState<'local'|'openai'>('local');
 const [localReady,setLocalReady]=useState(false),[localMessage,setLocalMessage]=useState('Checking local AI…');
 async function checkLocalAI(){try{const r=await fetch('/api/local-ai');const d=z.object({ready:z.boolean(),running:z.boolean(),error:z.string().optional()}).parse(await r.json());setLocalReady(!!d.ready);setLocalMessage(d.ready?'Gemma 3 is ready on this Mac. No API key needed.':d.running?'Ollama is running. The Gemma 3 model download must finish before generation.':d.error||'Local AI is not running. Open the Quizhunter desktop app or start Ollama.')}catch{setLocalReady(false);setLocalMessage('Could not check local AI. Try again.')}}
 useEffect(()=>{void checkLocalAI();const timer=setInterval(()=>void checkLocalAI(),15000);return()=>clearInterval(timer)},[]);
 const [key,setKey]=useState(''),[keyDraft,setKeyDraft]=useState(''),[settingsOpen,setSettingsOpen]=useState(false),[keyError,setKeyError]=useState('');
 const [settings,setSettings]=useState<StudySettings>({depth:'simple',level:'college',pace:'quick'});
 const [lessons,setLessons]=useState<Record<string,Lesson>>({}),[cards,setCards]=useState<Card[]>([]),[quiz,setQuiz]=useState<Quiz[]>([]);
 const [agentResults,setAgentResults]=useState<AgentResults>({}),[agentFailures,setAgentFailures]=useState<Record<number,string>>({}),[agentCurrent,setAgentCurrent]=useState<number|null>(null);
 const [progress,setProgress]=useState<StudyProgress>({cards:[],quiz:[]});
 const [busy,setBusy]=useState(''),[percent,setPercent]=useState(0),[error,setError]=useState(''),[status,setStatus]=useState(''),[dragging,setDragging]=useState(false);
 const [question,setQuestion]=useState(''),[chats,setChats]=useState<Record<number,{question:string;answer:string}[]>>({});
 const fileInput=useRef<HTMLInputElement>(null),packInput=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null);
 const deckRef=useRef(deck);deckRef.current=deck;
 useEffect(()=>()=>controller.current?.abort(),[]);
 const slide=deck?.slides[slideIndex];const lessonId=(n:number)=>`${settings.depth}:${settings.level}:${n}`;const lesson=slide&&!hidden.lessons.includes(slide.number)?lessons[lessonId(slide.number)]:undefined;
 const outline=deck?.slides.map(s=>`Study slide ${s.number}: ${s.title}${s.source?` [${s.source}, original slide ${s.sourceSlide}]`:""}`).join('\n').slice(0,10000)??'';
 const curated=useMemo(()=>curatePractice(cards,quiz,deck?.slides??[]),[cards,quiz,deck]);
 const cleanCards=useMemo(()=>curated.cards.items.filter(c=>!hidden.cards.includes(contentKey(c))),[curated,hidden.cards]);
 const cleanQuiz=useMemo(()=>curated.quiz.items.filter(q=>!hidden.quiz.includes(contentKey(q))),[curated,hidden.quiz]);
 const validAgentResults=useMemo(()=>curateAgentResults(agentResults,deck?.slides??[]),[agentResults,deck]);
 const practiceProgress={cards:progress.cards.filter(n=>!curated.cards.retry.includes(n)),quiz:progress.quiz.filter(n=>!curated.quiz.retry.includes(n))};
 const setNewDeck=(d:Deck,l:Record<string,Lesson>={},c:Card[]=[],q:Quiz[]=[],a:AgentResults={},h:HiddenContent=emptyHidden())=>{setHidden(h);setScreen('workspace');setUndoState(null);controller.current?.abort();setDeck(d);setLessons(l);setCards(c);setQuiz(q);setAgentResults(a);setAgentFailures({});setAgentCurrent(null);setProgress({cards:[],quiz:[]});setSlideIndex(0);setTab('explain');setError('');setStatus('');setChats({});setQuestion('')};
 const sample=()=>{setSettings({depth:'detailed',level:'college',pace:'thorough'});setNewDeck(demoDeck,Object.fromEntries(demoLessons.map(l=>[`detailed:college:${l.slide}`,l])),demoCards,demoQuiz,Object.fromEntries(demoLessons.map(l=>[agentResultKey('college',l.slide),{lesson:l,cards:demoCards.filter(c=>c.slide===l.slide),quiz:demoQuiz.filter(q=>q.slide===l.slide),practiceStatus:'ready',practiceNote:'Prepared example study material.'}])))};
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
    const d=await parseDeck(selected[i],message=>setBusy(`File ${i+1} of ${selected.length}: ${message}`),{pace:settings.pace});
    count+=d.slides.length;
    if(count>MAX_COLLECTION_SLIDES)throw Error(`These files would exceed ${MAX_COLLECTION_SLIDES} slides. Choose fewer decks.`);
    const slides=d.slides.map(slide=>({...slide,source:selected[i].name,sourceSlide:slide.number}));
    bytes+=slides.reduce((total,s)=>total+slideBytes(s),0);
    if(bytes>MAX_SOURCE_BYTES)throw Error('This collection contains too much image data. Study these decks in separate collections or use smaller PDF exports.');
    parsed.push({...d,documents:[selected[i].name],slides});
    setPercent(Math.round(100*(i+1)/selected.length));
   }
   const d=appendDecks(existing,parsed,MAX_COLLECTION_SLIDES);
   setNewDeck(d,existing?lessons:{},existing?cards:[],existing?quiz:[],existing?agentResults:{},existing?hidden:emptyHidden());
   if(existing)setProgress(progress);
   setStatus(`${selected.length} ${selected.length===1?'deck':'decks'} added. ${d.slides.length} slides ready to study.${existing?' Existing study material kept; continue the agent to cover the new slides.':''}`);
  }catch(e){setError((e instanceof Error?e.message:'Could not read these files.')+' Your existing material is unchanged.')}
  finally{setBusy('');if(fileInput.current)fileInput.current.value=''}
 }

 const ensureKey=()=>{if(provider==='local'){setError('');return true}if(key)return true;setKeyDraft('');setSettingsOpen(true);setError('Connect AI, then choose the study action again.');return false};
 async function request(mode:StudyMode,slides:Slide[],signal:AbortSignal,q='',context=outline,requestSettings=settings){
  const response=await fetch('/api/study',{method:'POST',headers:{'Content-Type':'application/json','x-study-provider':provider,...(provider==='openai'?{'x-openai-key':key}:{})},body:JSON.stringify({mode,slides,context,...requestSettings,question:q}),signal});
  const data:unknown=await response.json();
  if(!response.ok)throw new StudyRequestError(z.object({error:z.string()}).safeParse(data).data?.error||'The request failed. Try again.',response.status);
  return data;
 }
 async function runAgent(){
  if(!deck||busy)return;
  const cached=deck.slides.flatMap(s=>{const r=validAgentResults[agentResultKey(settings.level,s.number,settings.pace)];return r?[r]:[]});
  if(cached.length===deck.slides.length){
   setLessons(previous=>({...previous,...Object.fromEntries(cached.map(r=>[`${settings.pace==='quick'?'simple':'detailed'}:${settings.level}:${r.lesson.slide}`,r.lesson]))}));
   setCards(cached.flatMap(r=>r.cards));setQuiz(cached.flatMap(r=>r.quiz));
   setProgress({cards:cached.map(r=>r.lesson.slide),quiz:cached.map(r=>r.lesson.slide)});
   setSettings(s=>({...s,depth:s.pace==='quick'?'simple':'detailed'}));setTab('explain');setStatus('Your completed study pack is open. Choose a slide, Flashcards, or Quiz.');return;
  }
  if(deck.sample||!ensureKey())return;
  if(cached.length){
   const sources=new Set(cached.map(r=>r.lesson.slide));
   setLessons(previous=>({...previous,...Object.fromEntries(cached.map(r=>[`${settings.pace==='quick'?'simple':'detailed'}:${settings.level}:${r.lesson.slide}`,r.lesson]))}));
   setCards(previous=>[...previous.filter(c=>!sources.has(c.slide)),...cached.flatMap(r=>r.cards)].sort((a,b)=>a.slide-b.slide));
   setQuiz(previous=>[...previous.filter(q=>!sources.has(q.slide)),...cached.flatMap(r=>r.quiz)].sort((a,b)=>a.slide-b.slide));
  }
  const ctrl=new AbortController();controller.current=ctrl;
  const level=settings.level;
  setSettings(s=>({...s,depth:s.pace==='quick'?'simple':'detailed'}));setTab('explain');setBusy('Planning your complete study pack…');setError('');setStatus('');setAgentFailures({});
  setPercent(100*deck.slides.filter(s=>validAgentResults[agentResultKey(level,s.number,settings.pace)]).length/deck.slides.length);
  try{
   const outcome=await runStudyAgent({slides:deck.slides,level,pace:settings.pace,previous:validAgentResults,signal:ctrl.signal,
    request:(slide,context,signal)=>request('agent',[slide],signal,'',context,{depth:settings.pace==='quick'?'simple':'detailed',level,pace:settings.pace}),
    onStart:(slide,done,total)=>{setAgentCurrent(slide.number);setBusy(`Study agent · slide ${slide.number} · ${done} of ${total} complete…`);setPercent(100*done/total)},
    onComplete:(key,result)=>{
     const n=result.lesson.slide;
     setAgentResults(previous=>({...previous,[key]:result}));
     setLessons(previous=>({...previous,[`${settings.pace==='quick'?'simple':'detailed'}:${level}:${n}`]:result.lesson}));
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
  const source=mode==='explain'?(all?deck.slides.filter(s=>!lessons[lessonId(s.number)]):[deck.slides[slideIndex]]):deck.slides.filter(s=>all||!practiceProgress[mode].includes(s.number));
  let newCards=[...cleanCards],newQuiz=[...cleanQuiz];let completed=0;let batchCount=0;
  if(mode!=='explain')setProgress(p=>({...p,[mode]:all?[]:practiceProgress[mode]}));
  try{
   const batches=generationBatches(source,mode,provider,settings.pace);batchCount=batches.length;
   for(let batchIndex=0;batchIndex<batches.length;batchIndex++){
    const batch=batches[batchIndex];
    ctrl.signal.throwIfAborted();
    setBusy(mode==='explain'?`Explaining slide ${batch[0].number} · ${completed+1} of ${batches.length}…`:`Creating ${mode==='cards'?'flashcards':'questions'} · ${batch.length} source ${batch.length===1?'page':'pages'} · batch ${completed+1} of ${batches.length}…`);
    let data:unknown;
    try{data=await request(mode,batch,ctrl.signal)}catch(error){
     if(provider==='local'&&batch.length>1&&error instanceof StudyRequestError&&error.status===502&&!ctrl.signal.aborted){
      batches.splice(batchIndex,1,...batch.map(s=>[s]));batchCount=batches.length;batchIndex--;continue;
     }
     throw error;
    }
    if(mode==='explain'){const lesson=lessonSchema.parse(data);setLessons(l=>({...l,[lessonId(lesson.slide)]:lesson}));setHidden(h=>({...h,lessons:h.lessons.filter(n=>n!==lesson.slide)}))}
    if(mode==='cards'){newCards=[...newCards.filter(c=>!batch.some(s=>s.number===c.slide)),...z.object({cards:z.array(cardSchema)}).parse(data).cards];setCards([...newCards])}
    if(mode==='quiz'){newQuiz=[...newQuiz.filter(q=>!batch.some(s=>s.number===q.slide)),...z.object({quiz:z.array(quizSchema)}).parse(data).quiz];setQuiz([...newQuiz])}
    if(mode!=='explain'){
     setProgress(p=>({...p,[mode]:[...new Set([...p[mode],...batch.map(s=>s.number)])]}));
     setAgentResults(previous=>Object.fromEntries(Object.entries(previous).filter(([,r])=>!batch.some(s=>s.number===r.lesson.slide))));
    }
    completed++;setPercent(Math.round(100*completed/batches.length));
   }
   setStatus(mode==='explain'?'Explanations ready.':`${mode==='cards'?'Flashcards':'Practice quiz'} ready. Only useful study concepts are included; title-only and administrative content is skipped.`);
  }catch(e){setError((ctrl.signal.aborted?'Generation stopped.':e instanceof z.ZodError?'The model returned unusable study text. Try this batch again.':e instanceof Error?e.message:'Generation failed.')+` ${completed} of ${batchCount} batches completed this run. Your completed work is kept; continue to pick up where you left off.`)}
  finally{setBusy('');controller.current=null}
 }

 async function ask(){if(!slide||!question.trim()||busy||!ensureKey())return;const ctrl=new AbortController();controller.current=ctrl;const currentQuestion=question.trim();const n=slide.number;setBusy('Thinking through your question…');setError('');try{const data=await request('ask',[slide],ctrl.signal,currentQuestion);setChats(c=>({...c,[n]:[...(c[n]??[]),{question:currentQuestion,answer:z.object({answer:z.string()}).parse(data).answer}]}));setQuestion('')}catch(e){setError(ctrl.signal.aborted?'Question cancelled.':e instanceof Error?e.message:'Could not answer the question.')}finally{setBusy('');controller.current=null}}
 const pack=():StudyPack=>({version:1,deck:deck!,lessons,cards:curated.cards.items,quiz:curated.quiz.items,progress:practiceProgress,agentResults:validAgentResults,hidden,settings});
 async function restore(file?:File){
  if(!file||busy)return;setError('');setBusy('Opening your study pack…');setPercent(0);
  try{
   if(file.size>MAX_STUDY_PACK_MB*1024*1024)throw Error(`This study pack is too large (maximum ${MAX_STUDY_PACK_MB} MB).`);
   const {pack:p,removed}=restoreStudyPack(JSON.parse(await file.text()));
   setNewDeck(p.deck,p.lessons,p.cards,p.quiz,p.agentResults,p.hidden);
   setProgress(p.progress??{cards:[...new Set(p.cards.map(c=>c.slide))],quiz:[...new Set(p.quiz.map(q=>q.slide))]});
   setSettings(p.settings??{depth:'detailed',level:'college',pace:'thorough'});setStatus(removed?`Study pack restored. Removed ${removed} unusable, duplicate, or irrelevant practice items. Use Rebuild to refresh the questions.`:'Study pack restored.');
  }catch(e){setError(e instanceof z.ZodError?'This file is not a valid Quizhunter study pack.':e instanceof Error?e.message:'Could not restore the study pack.')}
  finally{setBusy('');if(packInput.current)packInput.current.value=''}
 }
 function rememberRemoval(message:string){setStatus('');setError('');if(deck)setUndoState({pack:pack(),chats,slideIndex,message})}
 function applyPack(p:StudyPack|null){
  setDeck(p?.deck??null);setLessons(p?.lessons??{});setCards(p?.cards??[]);setQuiz(p?.quiz??[]);setProgress(p?.progress??{cards:[],quiz:[]});setAgentResults(p?.agentResults??{});setHidden(p?.hidden??emptyHidden());setAgentFailures({});setAgentCurrent(null);setSlideIndex(0);setError('');setStatus('');
  if(!p){setScreen('home');setManageOpen(false);setChats({})}
 }
 function deletePages(numbers:number[]){if(!deck||busy||!numbers.length)return;rememberRemoval(`${numbers.length} ${numbers.length===1?'page':'pages'} removed with related study material.`);applyPack(removePages(pack(),numbers));setChats(c=>Object.fromEntries(Object.entries(c).filter(([n])=>!numbers.includes(Number(n)))))}
 function removeContent(type:'cards'|'quiz',item:Card|Quiz){if(busy)return;rememberRemoval(type==='cards'?'Flashcard removed.':'Quiz question removed.');setHidden(h=>({...h,[type]:[...new Set([...h[type],contentKey(item)])]}))}
 function removeLesson(){if(!slide||busy)return;rememberRemoval('Explanation removed.');setHidden(h=>({...h,lessons:[...new Set([...h.lessons,slide.number])]}))}
 function undoRemoval(){if(!undoState||busy)return;applyPack(undoState.pack);setChats(undoState.chats);setSlideIndex(undoState.slideIndex);setSettings(undoState.pack.settings??settings);setScreen('workspace');setUndoState(null);setStatus('Removal undone.')}
 function restoreHidden(){if(busy)return;rememberRemoval('Removed content restored.');setHidden(emptyHidden());setStatus('Removed practice items and explanations are visible again.')}
 const hiddenCount=hidden.cards.length+hidden.quiz.length+hidden.lessons.length;
 const setPace=(pace:'quick'|'thorough')=>setSettings(s=>({...s,pace,depth:pace==='quick'?'simple':'detailed'}));
 const remainingLessons=deck?.slides.filter(s=>!lessons[lessonId(s.number)]).length??0;
 const remainingCards=deck?.slides.filter(s=>!practiceProgress.cards.includes(s.number)).length??0;
 const remainingQuiz=deck?.slides.filter(s=>!practiceProgress.quiz.includes(s.number)).length??0;

 const source=(n:number)=>{const i=deck?.slides.findIndex(s=>s.number===n)??-1;if(i>=0){setSlideIndex(i);setTab('explain')}};
 return <div className="app-shell"><header className="topbar"><button className="brand brand-button" onClick={()=>setScreen('home')} aria-label="Quizhunter home"><span className="brand-mark"><BookOpen size={23}/></span>quizhunter<span className="brand-dot">.</span></button><nav className="topbar-nav" aria-label="Main navigation"><button className="text-button" aria-current={screen==='home'?'page':undefined} onClick={()=>setScreen('home')}><HomeIcon size={16}/>Home</button><button className="text-button" aria-current={screen==='workspace'?'page':undefined} onClick={()=>setScreen('workspace')}><BookOpen size={16}/>Study studio</button></nav><button className="button outline" onClick={()=>{setKeyDraft(key);setSettingsOpen(true)}}>{provider==='local'?<Sparkles size={16}/>:key?<Check size={16}/>:<KeyRound size={16}/>} {provider==='local'?'Local AI · Settings':key?'AI connected':'Connect AI'}<ArrowUpRight size={15}/></button></header><main className="workspace"><input type="file" ref={fileInput} accept=".pptx,.pdf" multiple className="sr-only" aria-label="Upload PowerPoints or PDFs" onChange={e=>upload(e.target.files??undefined)}/><input type="file" ref={packInput} accept=".json" className="sr-only" aria-label="Open saved study pack" onChange={e=>restore(e.target.files?.[0])}/>{undoState&&<div className="undo-banner" role="status"><span>{undoState.message}</span><button className="text-button" disabled={!!busy} onClick={undoRemoval}><RotateCcw size={16}/>Undo</button><button className="icon-button" aria-label="Dismiss undo" onClick={()=>setUndoState(null)}><X size={15}/></button></div>}{screen==='home'?<>
 {error&&<p className="error-banner" role="alert">{error}</p>}{status&&!busy&&<p className="success-banner" role="status">{status}</p>}
 {busy&&<div className="busy-banner home-busy" role="status"><div><LoaderCircle size={18} className="spin"/><span>{busy}</span>{controller.current&&<button className="text-button" onClick={()=>controller.current?.abort()}>Stop</button>}</div><Progress value={percent} aria-label="Generation progress"/></div>}
 <StudyHome deck={deck} cards={cleanCards.length} questions={cleanQuiz.length} lessons={new Set(Object.values(lessons).filter(l=>!hidden.lessons.includes(l.slide)).map(l=>l.slide)).size} busy={!!busy} pace={settings.pace??'thorough'} onPace={setPace} onUpload={()=>fileInput.current?.click()} onRestore={()=>packInput.current?.click()} onSample={sample} onContinue={next=>{if(next)setTab(next);setScreen('workspace')}} onManage={()=>setManageOpen(true)}/>
 </>:<><div className="page-heading"><div><p className="eyebrow">LESS SLIDE READING. MORE UNDERSTANDING.</p><h1>Make it <span>click.</span></h1><p className="subtitle">Your PDFs and slides, turned into explanations, flashcards, and quizzes.</p></div><span className="workspace-label"><GraduationCap size={18}/> Study workspace</span></div>
 {error&&<div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}{status&&!busy&&<p className="success-banner" role="status"><Check size={16}/>{status}</p>}
 <div className="studio-grid"><aside className="input-panel"><div className="panel-title"><span className="step">01</span><h2>{deck?'Your study material':'Start with a PDF or PowerPoint'}</h2></div>
 {!deck?<><button className={`upload-zone ${dragging?'dragging':''}`} disabled={!!busy} onClick={()=>fileInput.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(e.dataTransfer.files)}}><span className="upload-symbol"><Upload size={25}/></span><strong>Drop your PDFs or PowerPoints here</strong><span>or click to choose multiple files</span><small>PPTX or PDF · {MAX_FILE_MB} MB & {MAX_SLIDES_PER_FILE} slides per file</small></button><div className="divider"><span>JUST EXPLORING?</span></div><button className="sample-button" onClick={sample} disabled={!!busy}><span className="sample-icon"><FileText size={22}/></span><span><strong>Try a sample lesson</strong><small>Memory & learning · 3 slides</small></span><ArrowRight size={18}/></button><div className="study-note"><Sparkles size={19}/><p>Go beyond the bullet points.<br/><span>Get the why, the how, and the “oh, I get it.”</span></p></div></>:<><div className="deck-heading"><span className="sample-icon"><FileText size={22}/></span><div><h2>{deck.name}</h2><p>{deck.slides.length} slides {deck.sample?'· Sample lesson':`· ${deck.documents?.length??1} decks`}</p></div></div>{!!deck.documents?.length&&<div className="deck-list">{deck.documents.map((name,i)=><span key={i}>{i+1}. {name}</span>)}</div>}<div className="actions"><button className="text-button" disabled={!!busy} onClick={()=>setManageOpen(true)}><SlidersHorizontal size={15}/>Manage pages</button><button className="text-button remove-content" disabled={!!busy} onClick={()=>slide&&deletePages([slide.number])}><Trash2 size={15}/>Remove this page</button></div><label className="field-label" htmlFor="slide-picker">Choose a slide</label><Select value={String(slideIndex)} onValueChange={v=>setSlideIndex(Number(v))}><SelectTrigger id="slide-picker" className="w-full"><SelectValue/></SelectTrigger><SelectContent>{deck.slides.map((s,i)=><SelectItem value={String(i)} key={s.number}>{s.number}. {s.title.slice(0,48)}{s.source?` · ${s.source.slice(0,30)}`:''}</SelectItem>)}</SelectContent></Select><div className="slide-nav"><button className="icon-button" aria-label="Previous slide" disabled={slideIndex===0} onClick={()=>setSlideIndex(i=>i-1)}><ChevronLeft size={18}/></button><span>{slideIndex+1} of {deck.slides.length}</span><button className="icon-button" aria-label="Next slide" disabled={slideIndex===deck.slides.length-1} onClick={()=>setSlideIndex(i=>i+1)}><ChevronRight size={18}/></button></div><label className="field-label" htmlFor="pace">Generation pace</label><Select value={settings.pace??'thorough'} disabled={!!busy||!!deck.sample} onValueChange={v=>setPace(v as 'quick'|'thorough')}><SelectTrigger id="pace"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="quick">Quick · Key ideas, less waiting</SelectItem><SelectItem value="thorough">Thorough · More depth</SelectItem></SelectContent></Select><p className="pace-hint">{settings.pace==='quick'?'Short explanations and focused practice. Use Thorough for more examples and detail.':'Deeper explanations and more practice. Takes longer on your Mac.'}</p><div className="field-grid"><div><label className="field-label" htmlFor="depth">Explanation style</label><Select value={settings.depth} disabled={!!busy||!!deck.sample} onValueChange={v=>setSettings(s=>({...s,depth:v as StudySettings['depth'],...(v==='detailed'?{pace:'thorough' as const}:{})}))}><SelectTrigger id="depth" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="detailed">Deep dive</SelectItem><SelectItem value="simple">Simple & clear</SelectItem><SelectItem value="exam">Exam focus</SelectItem></SelectContent></Select></div><div><label className="field-label" htmlFor="level">Learning level</label><Select value={settings.level} disabled={!!busy||!!deck.sample} onValueChange={v=>setSettings(s=>({...s,level:v as StudySettings['level']}))}><SelectTrigger id="level" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="beginner">Beginner</SelectItem><SelectItem value="college">College</SelectItem><SelectItem value="advanced">Advanced</SelectItem></SelectContent></Select></div></div><details className="source-details"><summary>View extracted source</summary><p className="source-text">{slide?.text||'No text extracted. Use the slide image when available.'}</p>{slide?.notes&&<><strong>Speaker notes</strong><p className="source-text">{slide.notes}</p></>}{slide?.images.map((img,i)=><img key={i} src={img} alt={`Source image ${i+1} from slide ${slide.number}`} className="slide-image"/>)}</details>{!!deck.warnings.length&&<details className="source-details"><summary>Reading notes</summary>{deck.warnings.map((w,i)=><p key={i} className="small muted">{w}</p>)}</details>}<div className="aside-actions"><button className="button outline" disabled={!!busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/> Add PowerPoints / PDFs</button><button className="button outline" onClick={()=>download(deck.name+'-study-pack.json',JSON.stringify(pack()),'application/json')}><Download size={15}/>Save study pack</button></div><p className="small muted">Work stays in this tab. Save a study pack to keep your slides and generated material after closing it.</p></>}
 <button className="text-button restore-button" disabled={!!busy} onClick={()=>packInput.current?.click()}>Open a saved study pack</button>{!deck&&<p className="privacy-note">{provider==='local'?'Your files are read in your browser. Local AI processes selected content on this Mac.':'Your files are read in your browser. When you generate, selected content is sent to OpenAI using your API key.'}</p>}</aside>
 <section className="preview-panel" aria-busy={!!busy}>{busy&&<div className="busy-banner" role="status"><div><LoaderCircle size={18} className="spin"/><span>{busy}</span>{controller.current&&<button className="text-button" onClick={()=>controller.current?.abort()}>Stop</button>}</div><Progress value={percent} aria-label="Generation progress"/></div>}
 {deck&&<StudyAgent slides={deck.slides} results={validAgentResults} failures={agentFailures} level={settings.level} pace={settings.pace} hidden={hidden} cardCount={cleanCards.length} quizCount={cleanQuiz.length} provider={provider} busy={!!busy} current={agentCurrent} onRun={()=>void runAgent()} onSource={source}/>}
 {!deck?<><div className="panel-title"><span className="step">02</span><h2>Turn information into understanding</h2><span className="badge">A LOOK INSIDE</span></div><div className="preview-top"><span className="eyebrow">EXPLAIN · PRACTICE · REMEMBER</span><h2>One study agent.<br/>For every page.</h2><p>Upload PDFs or PowerPoints. The agent reads each page, creates focused flashcards and quizzes, and lets you download them as JSON.</p></div><div className="example-note"><span className="mini-label">EXAMPLE EXPLANATION</span><h3>Why does testing yourself work?</h3><p>Retrieving an idea strengthens your ability to find it again. Think of a path through a forest: each time you walk it, the route becomes easier to follow.</p><div className="source-chip">Memory & learning · Slide 2</div></div><div className="feature-row"><span><BookOpen size={18}/>Deep explanations</span><span><Layers size={18}/>Flashcards</span><span><GraduationCap size={18}/>Practice quizzes</span></div></>:<><div className="result-heading"><span className="eyebrow">{tab==='cards'||tab==='quiz'?'YOUR WHOLE COLLECTION':`${deck.sample?'SAMPLE LESSON':'YOUR STUDY STUDIO'} · SLIDE ${slide?.number}`}</span><h2>{tab==='cards'?'Practice the key concepts':tab==='quiz'?'Mix it up. Test your understanding.':slide?.title}</h2>{tab==='cards'||tab==='quiz'?<p className="source-origin">{deck.name} · {tab==='quiz'?'Questions are shuffled each round.':'Focused on useful ideas.'} Source pages are available for review.</p>:slide?.source&&<p className="source-origin">{slide.source} · Original slide {slide.sourceSlide}</p>}</div><Tabs value={tab} onValueChange={setTab}><TabsList className="study-tabs"><TabsTrigger value="explain"><BookOpen/>Explain</TabsTrigger><TabsTrigger value="cards"><Layers/>Flashcards</TabsTrigger><TabsTrigger value="quiz"><GraduationCap/>Quiz</TabsTrigger><TabsTrigger value="ask"><MessageCircle/>Ask</TabsTrigger></TabsList><TabsContent value="explain">{lesson?<><div className="actions end"><button className="text-button remove-content" disabled={!!busy} onClick={removeLesson}><Trash2 size={15}/>Remove explanation</button></div><LessonView lesson={lesson}/><div className="actions"><button className="button outline" onClick={()=>download(deck.name+'-study-guide.md',guideMarkdown(visiblePack(pack())))}><Download size={15}/>Export study guide</button>{!deck.sample&&<button className="text-button" disabled={!!busy} onClick={()=>generate('explain')}>Regenerate this slide</button>}</div></>:<div className="empty-state"><BookOpen size={35}/><h3>Let’s make this slide make sense.</h3><p>Get a detailed explanation, key terms, worked examples, common traps, and a question to check your understanding.</p><button className="button" disabled={!!busy} onClick={()=>generate('explain')}><Sparkles size={16}/>Explain this slide</button></div>}{!deck.sample&&<div className="batch-action"><button className="text-button" disabled={!!busy||!remainingLessons} onClick={()=>generate('explain',true)}>{remainingLessons?`Explain ${remainingLessons===deck.slides.length?'all':'remaining'} ${remainingLessons} slides`:'All slides explained'}</button><small>One AI request per slide. Stop and continue anytime. {provider==='local'?'Runs on your Mac. No API key or usage charges.':'API usage is billed to your account.'}</small></div>}</TabsContent><TabsContent value="cards">
 {curated.cards.removed>0&&<p className="notice">Hidden {curated.cards.removed} unusable, duplicate, or irrelevant cards. Rebuild flashcards to replace old material.</p>}
 {!deck.sample&&<div className="batch-action actions">{remainingCards>0&&cleanCards.length>0&&<button className="text-button" disabled={!!busy} onClick={()=>generate('cards')}>Continue flashcards · {remainingCards} pages left</button>}<button className="text-button" disabled={!!busy} onClick={()=>generate('cards',true)}>Rebuild flashcards</button></div>}
 {cleanCards.length?<Flashcards key={JSON.stringify(cleanCards)} cards={cleanCards} deck={deck} processed={[...new Set([...practiceProgress.cards,...cleanCards.map(c=>c.slide)])]} onSource={source} onRemove={c=>removeContent('cards',c)} busy={!!busy}/>:<div className="empty-state"><Layers size={35}/><h3>{curated.cards.items.length?'All flashcards removed.':remainingCards?'Build knowledge that sticks.':'No useful flashcards found yet.'}</h3><p>Create focused flashcards from useful concepts across your collection. Title-only pages and presentation housekeeping are skipped.</p>{curated.cards.items.length>0?<button className="button" disabled={!!busy} onClick={restoreHidden}>Restore removed content</button>:<button className="button" disabled={!!busy} onClick={()=>generate('cards',!remainingCards)}><Sparkles size={16}/>{remainingCards?'Create flashcards':'Try again'}</button>}</div>}
 </TabsContent><TabsContent value="quiz">
 {curated.quiz.removed>0&&<p className="notice">Hidden {curated.quiz.removed} unusable, duplicate, or irrelevant questions. Rebuild the quiz to replace old material.</p>}
 {!deck.sample&&<div className="batch-action actions">{remainingQuiz>0&&cleanQuiz.length>0&&<button className="text-button" disabled={!!busy} onClick={()=>generate('quiz')}>Continue quiz · {remainingQuiz} pages left</button>}<button className="text-button" disabled={!!busy} onClick={()=>generate('quiz',true)}>Rebuild quiz</button></div>}
 {cleanQuiz.length?<QuizView key={JSON.stringify(cleanQuiz)} questions={cleanQuiz} deck={deck} processed={[...new Set([...practiceProgress.quiz,...cleanQuiz.map(q=>q.slide)])]} onSource={source} onRemove={q=>removeContent('quiz',q)} busy={!!busy}/>:<div className="empty-state"><GraduationCap size={35}/><h3>{curated.quiz.items.length?'All quiz questions removed.':remainingQuiz?'Find out what you really know.':'No useful quiz questions found yet.'}</h3><p>Practice standalone concept questions across your collection, in a new order each round. Useful introductory content is included.</p>{curated.quiz.items.length>0?<button className="button" disabled={!!busy} onClick={restoreHidden}>Restore removed content</button>:<button className="button" disabled={!!busy} onClick={()=>generate('quiz',!remainingQuiz)}><Sparkles size={16}/>{remainingQuiz?'Create practice quiz':'Try again'}</button>}</div>}
 </TabsContent><TabsContent value="ask"><div className="ask-intro"><h3>Stay curious.</h3><p>Ask a question about slide {slide?.number}. Each question is answered independently using this slide and its notes.</p></div>{(chats[slide!.number]??[]).map((c,i)=><div className="chat-pair" key={i}><p className="chat-question">{c.question}</p><p className="chat-answer">{c.answer}</p></div>)}<form onSubmit={e=>{e.preventDefault();void ask()}}><label className="field-label" htmlFor="question">Your question</label><textarea id="question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Why does this happen? Can you give me another example?" rows={4} maxLength={2000}/><div className="actions end"><button className="button" disabled={!!busy||!question.trim()} type="submit">Ask your tutor <ArrowRight size={16}/></button></div></form></TabsContent></Tabs>{!deck.sample&&<p className="ai-note">AI can make mistakes. Use the source slide to check important details.</p>}</>}
 </section></div></>}<footer>Built for the moment it finally makes sense.<span>JSON, Quizlet & Anki exports included</span></footer></main>
 {deck&&<CollectionManager key={deck.slides.map(s=>s.number).join(',')} deck={deck} open={manageOpen} onOpenChange={setManageOpen} busy={!!busy} onRemove={deletePages} hiddenCount={hiddenCount} onRestoreHidden={restoreHidden}/>}
 <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="connection-dialog"><DialogTitle>Your AI study tutor</DialogTitle><DialogDescription>Use AI on this Mac without an API key, or choose OpenAI.</DialogDescription><label className="field-label" htmlFor="ai-provider">Run AI using</label><Select value={provider} disabled={!!busy} onValueChange={v=>{setProvider(v as 'local'|'openai');setError('');setStatus('')}}><SelectTrigger id="ai-provider"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="local">Local AI · No API key</SelectItem><SelectItem value="openai">OpenAI · API key required</SelectItem></SelectContent></Select>{provider==='local'?<><div className="notice"><strong>{localReady?'Local AI is ready':'Local AI setup'}</strong><p role="status">{localMessage}</p><p>Gemma 3 reads text and page images on this Mac. Quick mode keeps explanations and practice concise to reduce waiting. Thorough mode takes longer. Smaller local models can miss details; check answers against your source.</p></div><div className="actions end"><button className="button outline" onClick={()=>void checkLocalAI()}>Check again</button><button className="button" onClick={()=>{setSettingsOpen(false);setError('');setStatus('Local AI selected. Choose Build complete study pack, Flashcards, or Quiz to begin.')}}>Use local AI</button></div></>:<form onSubmit={e=>{e.preventDefault();if(!/^sk-[A-Za-z0-9_-]{10,500}$/.test(keyDraft.trim())){setKeyError('Enter a valid OpenAI API key beginning with sk-.');return}setKey(keyDraft.trim());setKeyDraft('');setKeyError('');setSettingsOpen(false);setError('');setStatus('API key added for this session. Choose an action to start studying.')}}><label htmlFor="api-key" className="field-label">OpenAI API key</label><input id="api-key" type="password" autoComplete="off" value={keyDraft} onChange={e=>setKeyDraft(e.target.value)} placeholder="sk-…" maxLength={503}/>{keyError&&<p className="error-text" role="alert">{keyError}</p>}<div className="notice"><p>The key stays in memory for this tab and is forwarded securely to OpenAI when you generate. Quizhunter does not save your key or decks on its server.</p><p>Uses GPT-5.4. API billing is separate from a ChatGPT subscription. Connecting saves the key for this session; the first request checks access.</p></div><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-link">Create or manage an API key ↗</a><div className="actions end">{key&&<button type="button" className="button outline" disabled={!!busy} onClick={()=>{setKey('');setKeyDraft('');setSettingsOpen(false)}}>Disconnect</button>}<button className="button" type="submit">Connect AI</button></div></form>}</DialogContent></Dialog></div>
}
