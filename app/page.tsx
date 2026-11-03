"use client";
import {useEffect,useRef,useState,useMemo} from 'react';
import {BookOpen,ArrowUpRight,Upload,Layers,Sparkles,GraduationCap,ArrowRight,FileText,Download,LoaderCircle,ChevronLeft,ChevronRight,MessageCircle,Check,KeyRound,X,Home as HomeIcon,Trash2,RotateCcw,SlidersHorizontal,Library,Image as ImageIcon,CheckCheck,Settings as SettingsIcon} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from '@/components/ui/select';
import {Progress} from '@/components/ui/progress';
import {StudyHome} from '@/components/study-home';
import {CollectionManager} from '@/components/collection-manager';
import {appendDecks,contentKey,emptyHidden,removePages,visiblePack} from '@/lib/study/collection';
import {generationBatches} from '@/lib/study/performance';
import {StudyLibrary} from '@/components/study-library';
import {SlideNavigator} from '@/components/slide-navigator';
import {DiagramView} from '@/components/diagram-view';
import {ExplanationReader} from '@/components/explanation-reader';
import {findLesson,scopedSlides} from '@/lib/study/navigation';
import type {StudyScope} from '@/lib/study/navigation';
import {listLibrary,readLibrary,writeLibrary,removeLibrary,libraryRecord} from '@/lib/study/library';
import type {LibrarySummary,LibraryRecord} from '@/lib/study/library';
import {runStudyAgent,StudyRequestError,agentResultKey,cachedAgentResult,reuseStudyMaterial} from '@/lib/study/agent';
import {Flashcards,QuizView} from '@/components/study-results';
import {demoDeck,demoLessons,demoCards,demoQuiz} from '@/lib/study/demo';
import {parseDeck} from '@/lib/study/parser';
import {download,guideMarkdown} from '@/lib/study/export';
import {cardSchema,lessonSchema,quizSchema,diagramSchema} from '@/lib/study/schemas';
import {z} from 'zod';
import {curatePractice,curateAgentResults,restoreStudyPack} from '@/lib/study/curation';
import {MAX_SLIDES_PER_FILE,MAX_FILE_MB,MAX_COLLECTION_SLIDES,MAX_FILES_PER_UPLOAD,MAX_STUDY_PACK_MB,MAX_SOURCE_BYTES} from '@/lib/study/limits';
import {slideBytes} from '@/lib/study/batches';
import type {Deck,Slide,Lesson,Card,Quiz,StudyMode,StudySettings,StudyPack,StudyProgress,AgentResults,HiddenContent,Diagram} from '@/lib/study/types';
export default function Home(){
 const [deck,setDeck]=useState<Deck|null>(null),[slideIndex,setSlideIndex]=useState(0),[tab,setTab]=useState('explain');
 const [screen,setScreen]=useState<'home'|'workspace'|'library'|'reader'>('home'),[manageOpen,setManageOpen]=useState(false);
 const [readerSlide,setReaderSlide]=useState<number|null>(null);
 const [scope,setScope]=useState<StudyScope>('current'),[selected,setSelected]=useState<number[]>([]);
 const [navigatorOpen,setNavigatorOpen]=useState(false);
 const [practiceFilter,setPracticeFilter]=useState<'all'|'scope'>('all');
 const [diagrams,setDiagrams]=useState<Record<string,Diagram>>({});
 const [collectionId,setCollectionId]=useState('');
 const [libraryEntries,setLibraryEntries]=useState<LibrarySummary[]>([]),[libraryLoading,setLibraryLoading]=useState(true);
 const [saveState,setSaveState]=useState(''),[libraryUndo,setLibraryUndo]=useState<LibraryRecord|null>(null);
 const savedSnapshot=useRef<StudyPack|null>(null),packRef=useRef<StudyPack|null>(null),idRef=useRef('');idRef.current=collectionId;
 const [hidden,setHidden]=useState<HiddenContent>(emptyHidden);
 const [undoState,setUndoState]=useState<{id:string;pack:StudyPack;chats:Record<number,{question:string;answer:string}[]>;slideIndex:number;message:string}|null>(null);
 const [provider,setProvider]=useState<'local'|'openai'>('openai');
 const [localAvailable,setLocalAvailable]=useState(false);
 const [localReady,setLocalReady]=useState(false),[localMessage,setLocalMessage]=useState('Checking local AI…');
 async function checkLocalAI(){try{const r=await fetch('/api/local-ai');const d=z.object({ready:z.boolean(),running:z.boolean(),error:z.string().optional()}).parse(await r.json());setLocalReady(!!d.ready);setLocalMessage(d.ready?'Generation is ready on this device.':d.running?'Ollama is running. The Gemma 3 model download must finish before generation.':d.error||'Local AI is not running. Open the Quizhunter desktop app or start Ollama.')}catch{setLocalReady(false);setLocalMessage('Could not check local AI. Try again.')}}
 useEffect(()=>{if(!['localhost','127.0.0.1','[::1]'].includes(window.location.hostname))return;setLocalAvailable(true);setProvider('local');void checkLocalAI();const timer=setInterval(()=>void checkLocalAI(),15000);return()=>clearInterval(timer)},[]);
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
 const slide=deck?.slides[slideIndex]??deck?.slides[0];
 const lessonId=(n:number)=>`${settings.depth}:${settings.level}:${n}`;
 const foundLesson=slide?findLesson(lessons,slide.number,settings):undefined;
 const lesson=slide&&!hidden.lessons.includes(slide.number)?foundLesson?.lesson:undefined;
 const readingEntries=useMemo(()=>(deck?.slides??[]).flatMap(source=>{
  const saved=hidden.lessons.includes(source.number)?undefined:findLesson(lessons,source.number,settings);
  return saved?[{slide:source,lesson:saved.lesson}]:[];
 }),[deck,lessons,hidden.lessons,settings]);
 function openExplanation(){if(!lesson)return;setReaderSlide(lesson.slide);setScreen('reader')}
 const generationSlides=scopedSlides(deck?.slides??[],slide?.number,selected,scope);
 const generationIds=new Set(generationSlides.map(s=>s.number));
 const scopeLabel=scope==='current'?`slide ${slide?.number??''}`:scope==='all'?`all ${generationSlides.length} slides`:`${generationSlides.length} selected ${generationSlides.length===1?'slide':'slides'}`;
 const outline=deck?.slides.map(s=>`Study slide ${s.number}: ${s.title}${s.source?` [${s.source}, original slide ${s.sourceSlide}]`:""}`).join('\n').slice(0,10000)??'';
 const curated=useMemo(()=>curatePractice(cards,quiz,deck?.slides??[]),[cards,quiz,deck]);
 const cleanCards=useMemo(()=>curated.cards.items.filter(c=>!hidden.cards.includes(contentKey(c))),[curated,hidden.cards]);
 const cleanQuiz=useMemo(()=>curated.quiz.items.filter(q=>!hidden.quiz.includes(contentKey(q))),[curated,hidden.quiz]);
 const validAgentResults=useMemo(()=>reuseStudyMaterial(agentResults,deck?.slides??[],lessons,curated.cards.items,curated.quiz.items,settings),[agentResults,deck,lessons,curated,settings]);
 const practiceProgress={cards:[...new Set([...progress.cards,...Object.values(validAgentResults).map(r=>r.lesson.slide)])].filter(n=>!curated.cards.retry.includes(n)),quiz:[...new Set([...progress.quiz,...Object.values(validAgentResults).map(r=>r.lesson.slide)])].filter(n=>!curated.quiz.retry.includes(n))};
 const setNewDeck=(d:Deck,l:Record<string,Lesson>={},c:Card[]=[],q:Quiz[]=[],a:AgentResults={},h:HiddenContent=emptyHidden(),id=crypto.randomUUID(),visuals:Record<string,Diagram>={})=>{setReaderSlide(null);setCollectionId(id);setDiagrams(visuals);setSelected([]);setScope('current');setPracticeFilter('all');setHidden(h);setScreen('workspace');setUndoState(null);controller.current?.abort();setDeck(d);setLessons(l);setCards(c);setQuiz(q);setAgentResults(a);setAgentFailures({});setAgentCurrent(null);setProgress({cards:[],quiz:[]});setSlideIndex(0);setTab('explain');setError('');setStatus('');setChats({});setQuestion('')};
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
   await saveCurrent();
   const d=appendDecks(existing,parsed,MAX_COLLECTION_SLIDES);
   setNewDeck(d,existing?lessons:{},existing?cards:[],existing?quiz:[],existing?agentResults:{},existing?hidden:emptyHidden(),existing?collectionId:crypto.randomUUID(),existing?diagrams:{});
   if(existing)setProgress(progress);
   setStatus(`${selected.length} ${selected.length===1?'deck':'decks'} added. ${d.slides.length} slides ready to study.${existing?' Existing study material kept; continue the agent to cover the new slides.':''}`);
  }catch(e){setError((e instanceof Error?e.message:'Could not read these files.')+' Your existing material is unchanged.')}
  finally{setBusy('');if(fileInput.current)fileInput.current.value=''}
 }

 const ensureKey=()=>{if(provider==='local'){setError('');return true}if(key)return true;setKeyDraft('');setSettingsOpen(true);setError('Open Settings to connect the generation engine, then try again.');return false};
 async function request(mode:StudyMode,slides:Slide[],signal:AbortSignal,q='',context=outline,requestSettings=settings){
  const response=await fetch('/api/study',{method:'POST',headers:{'Content-Type':'application/json','x-study-provider':provider,...(provider==='openai'?{'x-openai-key':key}:{})},body:JSON.stringify({mode,slides,context,...requestSettings,question:q}),signal});
  const data:unknown=await response.json();
  signal.throwIfAborted();
  if(!response.ok)throw new StudyRequestError(z.object({error:z.string()}).safeParse(data).data?.error||'The request failed. Try again.',response.status);
  return data;
 }
 async function runAgent(){
  if(!deck||busy||!generationSlides.length)return;
  const sources=generationSlides;
  const cached=sources.flatMap(s=>{const r=cachedAgentResult(validAgentResults,settings.level,s.number,settings.pace);return r?[r]:[]});
  const depth=settings.pace==='quick'?'simple':'detailed';
  if(cached.length){
   const ids=new Set(cached.map(r=>r.lesson.slide));
   setLessons(previous=>({...previous,...Object.fromEntries(cached.map(r=>[`${settings.pace==='quick'&&validAgentResults[agentResultKey(settings.level,r.lesson.slide,'quick')]?'simple':'detailed'}:${settings.level}:${r.lesson.slide}`,r.lesson]))}));
   setCards(previous=>[...previous,...cached.flatMap(r=>previous.some(c=>c.slide===r.lesson.slide)?[]:r.cards)]);
   setQuiz(previous=>[...previous,...cached.flatMap(r=>previous.some(q=>q.slide===r.lesson.slide)?[]:r.quiz)]);
   setProgress(previous=>({cards:[...new Set([...previous.cards,...ids])],quiz:[...new Set([...previous.quiz,...ids])]}));
  }
  if(cached.length===sources.length){setTab('explain');setStatus('Saved material is ready. Choose a slide or open Flashcards and Quiz.');return}
  if(deck.sample||!ensureKey())return;
  const ctrl=new AbortController();controller.current=ctrl;
  const level=settings.level,pace=settings.pace;
  setTab('explain');setBusy(`Preparing ${scopeLabel}…`);setError('');setStatus('');setAgentFailures({});
  setPercent(100*cached.length/sources.length);
  try{
   const outcome=await runStudyAgent({slides:sources,level,pace,previous:validAgentResults,signal:ctrl.signal,
    request:(slide,context,signal)=>request('agent',[slide],signal,'',context,{depth,level,pace}),
    onStart:(slide,done,total)=>{setAgentCurrent(slide.number);setBusy(`Building slide ${slide.number} · ${done} of ${total} ready`);setPercent(100*done/total)},
    onComplete:(key,result)=>{
     const n=result.lesson.slide;
     setAgentResults(previous=>({...previous,[key]:result}));
     setLessons(previous=>({...previous,[`${depth}:${level}:${n}`]:result.lesson}));
     setCards(previous=>[...previous.filter(c=>c.slide!==n),...result.cards]);
     setQuiz(previous=>[...previous.filter(q=>q.slide!==n),...result.quiz]);
     setHidden(previous=>({...previous,lessons:previous.lessons.filter(id=>id!==n)}));
     setProgress(previous=>({cards:[...new Set([...previous.cards,n])],quiz:[...new Set([...previous.quiz,n])]}));
    },
    onError:(slide,message)=>setAgentFailures(previous=>({...previous,[slide.number]:message}))
   });
   setPercent(100*outcome.completed/outcome.total);
   if(outcome.completed===outcome.total)setStatus(`${outcome.total} ${outcome.total===1?'slide':'slides'} ready. Explanations, flashcards, and quiz are available below.`);
   else setError(`${outcome.completed} of ${outcome.total} slides ready. Retry the unfinished slides below.`);
  }catch(error){
   if(ctrl.signal.aborted)setStatus('Generation stopped. Completed work is kept.');
   else setError((error instanceof Error?error.message:'The study agent could not finish.')+' Completed work is kept.');
  }finally{if(controller.current===ctrl){setAgentCurrent(null);setBusy('');controller.current=null}}
 }

 async function generate(mode:'explain'|'cards'|'quiz',all=false){
  if(!deck||busy||!generationSlides.length)return;if(!ensureKey())return;
  const ctrl=new AbortController();controller.current=ctrl;
  setBusy('Preparing your study material…');setError('');setStatus('');setPercent(0);
  const source=mode==='explain'?(all?generationSlides.filter(s=>!findLesson(lessons,s.number,settings)):[slide!]):generationSlides.filter(s=>all||!practiceProgress[mode].includes(s.number));
  let newCards=[...cleanCards],newQuiz=[...cleanQuiz];let completed=0;let batchCount=0;
  if(mode!=='explain')setProgress(p=>({...p,[mode]:all?practiceProgress[mode].filter(n=>!generationIds.has(n)):practiceProgress[mode]}));
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
    ctrl.signal.throwIfAborted();
    if(mode==='explain'){const lesson=lessonSchema.parse(data);setLessons(l=>({...l,[lessonId(lesson.slide)]:lesson}));setHidden(h=>({...h,lessons:h.lessons.filter(n=>n!==lesson.slide)}))}
    if(mode==='cards'){newCards=[...newCards.filter(c=>!batch.some(s=>s.number===c.slide)),...z.object({cards:z.array(cardSchema)}).parse(data).cards];setCards([...newCards])}
    if(mode==='quiz'){newQuiz=[...newQuiz.filter(q=>!batch.some(s=>s.number===q.slide)),...z.object({quiz:z.array(quizSchema)}).parse(data).quiz];setQuiz([...newQuiz])}
    if(mode!=='explain'){
     setProgress(p=>({...p,[mode]:[...new Set([...p[mode],...batch.map(s=>s.number)])]}));
     setAgentResults(previous=>Object.fromEntries(Object.entries(previous).map(([key,result])=>[key,batch.some(s=>s.number===result.lesson.slide)?{...result,[mode]:mode==='cards'?newCards.filter(c=>c.slide===result.lesson.slide):newQuiz.filter(q=>q.slide===result.lesson.slide)}:result])));
    }
    completed++;setPercent(Math.round(100*completed/batches.length));
   }
   setStatus(mode==='explain'?'Explanations ready.':`${mode==='cards'?'Flashcards':'Practice quiz'} ready. Only useful study concepts are included; title-only and administrative content is skipped.`);
  }catch(e){setError((ctrl.signal.aborted?'Generation stopped.':e instanceof z.ZodError?'The model returned unusable study text. Try this batch again.':e instanceof Error?e.message:'Generation failed.')+` ${completed} of ${batchCount} batches completed this run. Your completed work is kept; continue to pick up where you left off.`)}
  finally{if(controller.current===ctrl){setBusy('');controller.current=null}}
 }

 async function ask(){if(!slide||!question.trim()||busy||!ensureKey())return;const ctrl=new AbortController();controller.current=ctrl;const currentQuestion=question.trim();const n=slide.number;setBusy('Thinking through your question…');setError('');try{const data=await request('ask',[slide],ctrl.signal,currentQuestion);setChats(c=>({...c,[n]:[...(c[n]??[]),{question:currentQuestion,answer:z.object({answer:z.string()}).parse(data).answer}]}));setQuestion('')}catch(e){setError(ctrl.signal.aborted?'Question cancelled.':e instanceof Error?e.message:'Could not answer the question.')}finally{setBusy('');controller.current=null}}
 const pack=():StudyPack=>({version:1,deck:deck!,lessons,cards:curated.cards.items,quiz:curated.quiz.items,progress:practiceProgress,agentResults:validAgentResults,hidden,settings,diagrams});
 async function restore(file?:File){
  if(!file||busy)return;setError('');setBusy('Opening your study pack…');setPercent(0);
  try{
   if(file.size>MAX_STUDY_PACK_MB*1024*1024)throw Error(`This study pack is too large (maximum ${MAX_STUDY_PACK_MB} MB).`);
   const {pack:p,removed}=restoreStudyPack(JSON.parse(await file.text()));
   await saveCurrent();
   setNewDeck(p.deck,p.lessons,p.cards,p.quiz,p.agentResults,p.hidden,crypto.randomUUID(),p.diagrams);
   setProgress(p.progress??{cards:[...new Set(p.cards.map(c=>c.slide))],quiz:[...new Set(p.quiz.map(q=>q.slide))]});
   setSettings(p.settings??{depth:'detailed',level:'college',pace:'thorough'});setStatus(removed?`Study pack restored. Removed ${removed} unusable, duplicate, or irrelevant practice items. Use Rebuild to refresh the questions.`:'Study pack restored.');
  }catch(e){setError(e instanceof z.ZodError?'This file is not a valid Quizhunter study pack.':e instanceof Error?e.message:'Could not restore the study pack.')}
  finally{setBusy('');if(packInput.current)packInput.current.value=''}
 }
 function rememberRemoval(message:string){setStatus('');setError('');if(deck)setUndoState({id:collectionId,pack:pack(),chats,slideIndex,message})}
 function applyPack(p:StudyPack|null){
  setDiagrams(p?.diagrams??{});setSelected(ids=>ids.filter(n=>p?.deck.slides.some(s=>s.number===n)));setDeck(p?.deck??null);setLessons(p?.lessons??{});setCards(p?.cards??[]);setQuiz(p?.quiz??[]);setProgress(p?.progress??{cards:[],quiz:[]});setAgentResults(p?.agentResults??{});setHidden(p?.hidden??emptyHidden());setAgentFailures({});setAgentCurrent(null);setSlideIndex(0);setError('');setStatus('');
  if(!p){setReaderSlide(null);setScreen('home');setManageOpen(false);setChats({})}
 }
 async function deletePages(numbers:number[]){
  if(!deck||!numbers.length||busy&&!controller.current)return;
  controller.current?.abort();
  rememberRemoval(`${numbers.length} ${numbers.length===1?'slide':'slides'} removed with related study material.`);
  const next=removePages(pack(),numbers);
  if(!next){try{await saveCurrent();await removeLibrary(collectionId);setLibraryEntries(entries=>entries.filter(e=>e.id!==collectionId))}catch{setError('Could not update the library. Try deleting again.');return}}
  const nextIndex=next?Math.max(0,next.deck.slides.findIndex(s=>s.number===slide?.number)):0;
  applyPack(next);setSlideIndex(nextIndex);setChats(c=>Object.fromEntries(Object.entries(c).filter(([n])=>!numbers.includes(Number(n)))));
 }
 function removeContent(type:'cards'|'quiz',item:Card|Quiz){rememberRemoval(type==='cards'?'Flashcard removed.':'Quiz question removed.');setHidden(h=>({...h,[type]:[...new Set([...h[type],contentKey(item)])]}))}
 function removeLesson(){if(!slide)return;rememberRemoval('Explanation removed.');setHidden(h=>({...h,lessons:[...new Set([...h.lessons,slide.number])]}))}
 function undoRemoval(){if(!undoState||busy)return;setCollectionId(undoState.id);applyPack(undoState.pack);setChats(undoState.chats);setSlideIndex(undoState.slideIndex);setSettings(undoState.pack.settings??settings);setScreen('workspace');setUndoState(null);setStatus('Removal undone.')}
 function restoreHidden(){if(busy)return;rememberRemoval('Removed content restored.');setHidden(emptyHidden());setStatus('Removed practice items and explanations are visible again.')}
 const hiddenCount=hidden.cards.length+hidden.quiz.length+hidden.lessons.length;
 const setPace=(pace:'quick'|'thorough')=>setSettings(s=>({...s,pace,depth:pace==='quick'?'simple':'detailed'}));
 const remainingLessons=generationSlides.filter(s=>!findLesson(lessons,s.number,settings)).length;
 const remainingCards=generationSlides.filter(s=>!practiceProgress.cards.includes(s.number)).length;
 const remainingQuiz=generationSlides.filter(s=>!practiceProgress.quiz.includes(s.number)).length;

 function navigateSlide(index:number){if(!deck||index<0||index>=deck.slides.length)return;setSlideIndex(index);if(tab==='cards'||tab==='quiz')setTab('explain')}
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(screen!=='workspace'||!deck||!['explain','diagram'].includes(tab)||navigatorOpen||manageOpen||settingsOpen||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
   const target=event.target as HTMLElement|null;
   if(target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="tablist"]')||document.querySelector('[role="dialog"]'))return;
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setSlideIndex(i=>Math.max(0,Math.min(deck.slides.length-1,i+(event.key==='ArrowRight'?1:-1))))}
  };
  document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
 },[screen,deck,tab,navigatorOpen,manageOpen,settingsOpen]);
 const source=(n:number)=>{const i=deck?.slides.findIndex(s=>s.number===n)??-1;if(i>=0){setSlideIndex(i);setTab('explain')}};

 const shownCards=practiceFilter==='all'?cleanCards:cleanCards.filter(c=>generationIds.has(c.slide));
 const shownQuiz=practiceFilter==='all'?cleanQuiz:cleanQuiz.filter(q=>generationIds.has(q.slide));
 const explained=new Set(Object.values(lessons).filter(l=>!hidden.lessons.includes(l.slide)).map(l=>l.slide));
 const completedScope=generationSlides.filter(s=>cachedAgentResult(validAgentResults,settings.level,s.number,settings.pace)).length;
 const currentPack=useMemo(()=>deck?pack():null,[deck,lessons,curated,progress,validAgentResults,hidden,settings,diagrams]);
 packRef.current=currentPack;
 async function persist(id:string,p:StudyPack){
  if(!id)return;
  if(idRef.current===id)setSaveState('Saving…');
  try{const record=libraryRecord(id,p);await writeLibrary(record);setLibraryEntries(entries=>[record.summary,...entries.filter(e=>e.id!==id)]);if(idRef.current===id){savedSnapshot.current=p;setSaveState('Saved to library')}}
  catch(error){if(idRef.current===id)setSaveState('Save failed · retry');setError('Could not save to the library. Download a study pack as a backup, then retry. '+(error instanceof Error?error.message:''));throw error}
 }
 async function saveCurrent(){if(packRef.current&&idRef.current&&savedSnapshot.current!==packRef.current)await persist(idRef.current,packRef.current)}
 useEffect(()=>{void listLibrary().then(setLibraryEntries).catch(()=>setError('Could not open your library. Your current work is still available.')).finally(()=>setLibraryLoading(false))},[]);
 useEffect(()=>{if(currentPack&&collectionId)void persist(collectionId,currentPack).catch(()=>{})},[currentPack,collectionId]);
 useEffect(()=>window.quizhunterLibrary?.onClosing?.(async()=>{controller.current?.abort();await saveCurrent()}),[]);
 async function openSaved(id:string,nextTab:string){
  if(busy)return;
  setBusy('Opening saved collection…');setError('');
  try{await saveCurrent();const {pack:p}=await readLibrary(id);setNewDeck(p.deck,p.lessons,p.cards,p.quiz,p.agentResults,p.hidden,id,p.diagrams);setProgress(p.progress??{cards:[],quiz:[]});setSettings(p.settings??{depth:'simple',level:'college',pace:'quick'});setTab(nextTab);
   const first=nextTab==='explain'?p.deck.slides.findIndex(s=>Object.values(p.lessons).some(l=>l.slide===s.number)&&!p.hidden?.lessons.includes(s.number)):nextTab==='diagram'?p.deck.slides.findIndex(s=>p.diagrams?.[String(s.number)]):0;setSlideIndex(Math.max(0,first));
  }catch(error){setError(error instanceof Error?error.message:'Could not open this collection.')}finally{setBusy('')}
 }
 async function newCollection(){if(busy)return;try{await saveCurrent();applyPack(null);setCollectionId('');setUndoState(null);setScreen('workspace');fileInput.current?.click()}catch{}}
 async function deleteSaved(id:string){if(busy)return;try{await saveCurrent();const record=await readLibrary(id);await removeLibrary(id);setLibraryUndo(record);setLibraryEntries(entries=>entries.filter(e=>e.id!==id));if(collectionId===id){applyPack(null);setCollectionId('');setScreen('library');setUndoState(null)}}catch{setError('Could not delete the saved collection. Try again.')}}
 async function undoLibrary(){if(!libraryUndo)return;try{await writeLibrary(libraryUndo);setLibraryEntries(entries=>[libraryUndo.summary,...entries.filter(e=>e.id!==libraryUndo.summary.id)]);setLibraryUndo(null)}catch{setError('Could not restore the collection. Try again.')}}
 async function analyzeDiagram(){
  if(!slide||busy||!ensureKey())return;
  const ctrl=new AbortController();controller.current=ctrl;setBusy(`Reading the visual on slide ${slide.number}…`);setError('');setPercent(0);
  try{const analysis=diagramSchema.parse(await request('diagram',[slide],ctrl.signal));ctrl.signal.throwIfAborted();setDiagrams(previous=>({...previous,[String(analysis.slide)]:analysis}));setStatus('Diagram analysis ready. Check the original image alongside it.')}
  catch(error){if(!ctrl.signal.aborted)setError(error instanceof Error?error.message:'Could not analyze this image.')}
  finally{if(controller.current===ctrl){setBusy('');controller.current=null}}
 }
 function removeDiagram(){if(!slide)return;rememberRemoval('Diagram analysis removed.');setDiagrams(previous=>Object.fromEntries(Object.entries(previous).filter(([,d])=>d.slide!==slide.number)))}
 const saveDownload=()=>deck&&download(deck.name+'-study-pack.json',JSON.stringify(pack()),'application/json');
 const practiceToolbar=(mode:'cards'|'quiz')=><div className="practice-toolbar"><label>Show <select aria-label={`Filter ${mode==='cards'?'flashcards':'quiz'}`} className="native-select" value={practiceFilter} onChange={e=>setPracticeFilter(e.target.value as 'all'|'scope')}><option value="all">All saved material</option><option value="scope">Current generation scope</option></select></label>{!deck?.sample&&<button className="text-button" disabled={!!busy||!generationSlides.length} onClick={()=>generate(mode,true)}>Generate for {scopeLabel}</button>}</div>;
 return <div className="app-shell">
  <header className="topbar"><button className="brand brand-button" onClick={()=>setScreen('home')} aria-label="Quizhunter home"><span className="brand-mark"><BookOpen size={22}/></span>quizhunter<span className="brand-dot">.</span></button>
   <nav className="topbar-nav" aria-label="Main navigation">{([['home','Home',HomeIcon],['workspace','Study studio',BookOpen],['library','Library',Library]] as const).map(([value,label,Icon])=><button key={value} className="text-button" aria-current={screen===value?'page':undefined} onClick={()=>setScreen(value)}><Icon size={16}/>{label}</button>)}{readerSlide!==null&&deck&&<div className={`reader-tab${screen==='reader'?' active':''}`}><button className="text-button" aria-current={screen==='reader'?'page':undefined} onClick={()=>setScreen('reader')}><BookOpen size={16}/>Explanation</button><button className="reader-close" aria-label="Close explanation tab" onClick={()=>{setReaderSlide(null);if(screen==='reader')setScreen('workspace')}}><X size={14}/></button></div>}</nav>
   <button className="icon-button settings-button" aria-label="Settings" title="Settings" onClick={()=>{setKeyDraft(key);setSettingsOpen(true)}}><SettingsIcon size={19}/></button>
  </header>
  <main className="workspace">
   <input type="file" ref={fileInput} accept=".pptx,.pdf" multiple className="sr-only" aria-label="Upload PowerPoints or PDFs" onChange={e=>upload(e.target.files??undefined)}/>
   <input type="file" ref={packInput} accept=".json" className="sr-only" aria-label="Open saved study pack" onChange={e=>restore(e.target.files?.[0])}/>
   {error&&<div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}
   {status&&!busy&&<p className="success-banner" role="status"><Check size={16}/>{status}</p>}
   {undoState&&<div className="undo-banner" role="status"><span>{undoState.message}</span><button className="text-button" disabled={!!busy} onClick={undoRemoval}><RotateCcw size={15}/>Undo</button><button className="icon-button" aria-label="Dismiss undo" onClick={()=>setUndoState(null)}><X size={15}/></button></div>}
   {libraryUndo&&<div className="undo-banner" role="status"><span>“{libraryUndo.summary.name}” removed from the library.</span><button className="text-button" onClick={()=>void undoLibrary()}>Undo</button><button className="icon-button" aria-label="Dismiss library undo" onClick={()=>setLibraryUndo(null)}><X size={15}/></button></div>}
   {busy&&<div className="busy-banner" role="status"><div><LoaderCircle size={17} className="spin"/><span>{busy}</span>{controller.current&&<button className="text-button" onClick={()=>controller.current?.abort()}>Stop</button>}</div><Progress value={percent} aria-label="Generation progress"/></div>}
   {screen==='home'?<StudyHome deck={deck} cards={cleanCards.length} questions={cleanQuiz.length} lessons={explained.size} busy={!!busy} pace={settings.pace??'quick'} onPace={setPace} onUpload={()=>void newCollection()} onRestore={()=>packInput.current?.click()} onSample={()=>{void saveCurrent().then(sample).catch(()=>{})}} onContinue={next=>{if(next)setTab(next);setScreen('workspace')}} onManage={()=>setManageOpen(true)}/>:screen==='library'?<StudyLibrary entries={libraryEntries} loading={libraryLoading} busy={!!busy} onOpen={(id,tab)=>void openSaved(id,tab)} onRemove={id=>void deleteSaved(id)} onImport={()=>packInput.current?.click()} onNew={()=>void newCollection()}/>:screen==='reader'?<ExplanationReader entries={readingEntries} current={readerSlide??0} collection={deck?.name??''} onSelect={setReaderSlide} onBack={()=>setScreen('workspace')} onExport={()=>deck&&download(deck.name+'-study-guide.md',guideMarkdown(visiblePack(pack())))}/>:<>
    <div className="studio-heading"><div><p className="eyebrow">READ. CONNECT. REMEMBER.</p><h1>Study studio<span>.</span></h1></div>{deck&&<button className="save-state text-button" onClick={()=>void saveCurrent().catch(()=>{})}><CheckCheck size={15}/>{saveState||'Saving…'}</button>}</div>
    <div className="studio-grid"><aside className="input-panel">
     {!deck?<><div className="panel-title"><h2>Your study material</h2></div><button className={`upload-zone ${dragging?'dragging':''}`} disabled={!!busy} onClick={()=>fileInput.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(e.dataTransfer.files)}}><span className="upload-symbol"><Upload size={23}/></span><strong>Upload study material</strong><span>Drop PDFs or PowerPoints here</span><small>{MAX_FILE_MB} MB · {MAX_SLIDES_PER_FILE} slides per file</small></button><button className="text-button" disabled={!!busy} onClick={sample}>Try a sample lesson <ArrowRight size={15}/></button><button className="text-button" disabled={!!busy} onClick={()=>packInput.current?.click()}>Import a saved pack</button></>:<>
      <div className="deck-heading"><span className="sample-icon"><FileText size={20}/></span><div><h2>{deck.name}</h2><p>{deck.slides.length} slides · {deck.sample?'Sample lesson':`${Math.max(1,deck.documents?.length??1)} ${(deck.documents?.length??1)===1?'file':'files'}`}</p></div></div>
      <SlideNavigator open={navigatorOpen} onOpenChange={setNavigatorOpen} hiddenCount={hiddenCount} onRestoreHidden={restoreHidden} deleteDisabled={!!busy&&!controller.current} slides={deck.slides} current={slide!.number} selected={selected} explained={explained} onNavigate={n=>{const i=deck.slides.findIndex(s=>s.number===n);if(i>=0){setSlideIndex(i);if(tab==='cards'||tab==='quiz')setTab('explain')}}} onSelect={ids=>{setSelected(ids);setScope('selected')}} onDelete={ids=>void deletePages(ids)}/>

      <details className="source-details"><summary>Source text & notes</summary><p className="source-text">{slide?.text||'No extracted text. Open Diagrams to view the source image.'}</p>{slide?.notes&&<p className="source-text">{slide.notes}</p>}</details>
      {!!deck.warnings.length&&<details className="source-details"><summary>Import notes ({deck.warnings.length})</summary>{deck.warnings.map((w,i)=><p className="small muted" key={i}>{w}</p>)}</details>}
      <div className="aside-actions"><button className="button outline" disabled={!!busy} onClick={()=>fileInput.current?.click()}><Upload size={14}/>Add files</button><button className="button outline" onClick={saveDownload}><Download size={14}/>Download pack</button></div>
     </>}
    </aside><section className="preview-panel">
     {!deck?<div className="empty-state"><BookOpen size={36}/><h3>Start with something worth learning.</h3><p>Choose a PDF or PowerPoint, select a slide, and build an explanation, flashcards, and a quiz in one step.</p><button className="button outline" onClick={()=>setScreen('library')}><Library size={16}/>Open library</button></div>:<>
      <div className="slide-stepper" aria-label="Slide navigation"><button className="stepper-button" aria-label="Previous slide" disabled={slideIndex===0} onClick={()=>navigateSlide(slideIndex-1)}><ChevronLeft size={17}/><span>Previous</span></button><label className="stepper-picker"><span>SLIDE {slideIndex+1} OF {deck.slides.length}<small>← → keys</small></span><select id="slide-picker" className="native-select" aria-label="Go to slide" value={slide!.number} onChange={e=>navigateSlide(deck.slides.findIndex(s=>s.number===Number(e.target.value)))}>{deck.slides.map(s=><option key={s.number} value={s.number}>{s.number}. {/^\d+$/.test(s.title)?`Page ${s.sourceSlide??s.number}`:s.title}{s.source?` · ${s.source} (p. ${s.sourceSlide})`:''}</option>)}</select></label><button className="stepper-button" aria-label="Next slide" disabled={slideIndex>=deck.slides.length-1} onClick={()=>navigateSlide(slideIndex+1)}><span>Next</span><ChevronRight size={17}/></button></div>
      <div className="generation-bar"><div className="generation-title"><Sparkles size={17}/><strong>Build your study material</strong><span>{completedScope}/{generationSlides.length} ready</span></div>
       <div className="generation-controls"><label>Use<select className="native-select" aria-label="Generation scope" value={scope} disabled={!!busy} onChange={e=>{setScope(e.target.value as StudyScope);if(e.target.value==='selected')setNavigatorOpen(true)}}><option value="current">Current slide</option><option value="selected">Selected slides ({selected.length})</option><option value="all">All slides ({deck.slides.length})</option></select></label><label>Pace<select id="pace" className="native-select" value={settings.pace??'quick'} disabled={!!busy||!!deck.sample} onChange={e=>setPace(e.target.value as 'quick'|'thorough')}><option value="quick">Quick</option><option value="thorough">Thorough</option></select></label><button className="button" disabled={!!busy||!generationSlides.length||(!!deck.sample&&completedScope<generationSlides.length)} onClick={()=>void runAgent()}><Sparkles size={15}/>{completedScope===generationSlides.length&&generationSlides.length?'Open saved material':'Build study pack'}</button></div>
       <div className="generation-foot"><span>{scopeLabel} · {settings.pace==='quick'?'Short explanation, 1–2 cards & 1 quiz per useful slide.':'Detailed explanations and more practice.'} Ready slides are reused.</span><details className="generation-settings"><summary>Options</summary><div className="field-grid"><label className="field-label">Explanation style<select id="depth" className="native-select" value={settings.depth} disabled={!!busy||!!deck.sample} onChange={e=>setSettings(s=>({...s,depth:e.target.value as StudySettings['depth']}))}><option value="simple">Simple & clear</option><option value="detailed">Deep dive</option><option value="exam">Exam focus</option></select></label><label className="field-label">Learning level<select id="level" className="native-select" value={settings.level} disabled={!!busy||!!deck.sample} onChange={e=>setSettings(s=>({...s,level:e.target.value as StudySettings['level']}))}><option value="beginner">Beginner</option><option value="college">College</option><option value="advanced">Advanced</option></select></label></div></details></div>
       {!!Object.keys(agentFailures).length&&<div className="generation-errors">{Object.entries(agentFailures).map(([n,message])=><p key={n}><button className="text-button" onClick={()=>source(Number(n))}>Slide {n}</button> — {message}</p>)}</div>}
      </div>
      <div className="result-heading"><span className="eyebrow">{tab==='cards'||tab==='quiz'?'PRACTICE YOUR KNOWLEDGE':`SLIDE ${slide?.number} ${explained.has(slide!.number)?'· EXPLANATION READY':''}`}</span><h2>{tab==='cards'?'Flashcards':tab==='quiz'?'Practice quiz':slide?.title}</h2><p className="source-origin">{tab==='cards'||tab==='quiz'?`${shownCards.length} flashcards · ${shownQuiz.length} questions · Quiz order is shuffled.`:slide?.source?`${slide.source} · Original page ${slide.sourceSlide}`:deck.name}</p></div>
      <Tabs value={tab} onValueChange={setTab}><TabsList className="study-tabs"><TabsTrigger value="explain"><BookOpen/>Explain</TabsTrigger><TabsTrigger value="cards"><Layers/>Flashcards</TabsTrigger><TabsTrigger value="quiz"><GraduationCap/>Quiz</TabsTrigger><TabsTrigger value="diagram"><ImageIcon/>Diagrams</TabsTrigger><TabsTrigger value="ask"><MessageCircle/>Ask</TabsTrigger></TabsList>
       <TabsContent value="explain">{lesson?<>{!foundLesson?.exact&&<p className="saved-lesson-note">Showing your saved explanation. Options apply when you generate again.</p>}<div className="explanation-preview"><span className="mini-label">OVERVIEW</span><p>{lesson.bigIdea}</p><button className="button" onClick={openExplanation}><BookOpen size={16}/>Open full explanation<ArrowUpRight size={16}/></button></div><div className="actions">{!deck.sample&&<button className="text-button" disabled={!!busy} onClick={()=>generate('explain')}>Regenerate this slide</button>}<button className="text-button remove-content" onClick={removeLesson}><Trash2 size={14}/>Remove explanation</button></div></>:<div className="empty-state"><BookOpen size={30}/><h3>{hidden.lessons.includes(slide!.number)?'Explanation removed.':'Understand this slide.'}</h3><p>{hidden.lessons.includes(slide!.number)?'Restore removed content from the sidebar or generate a fresh explanation.':`Create an explanation for slide ${slide?.number}, or build its full study pack above.`}</p><button className="button" disabled={!!busy} onClick={()=>generate('explain')}><Sparkles size={15}/>Explain this slide</button></div>}{!deck.sample&&generationSlides.length>1&&<button className="text-button" disabled={!!busy||!remainingLessons} onClick={()=>generate('explain',true)}>Explain remaining {remainingLessons} in selection</button>}</TabsContent>
       <TabsContent value="cards">{practiceToolbar('cards')}{shownCards.length?<Flashcards key={collectionId+':'+practiceFilter+(practiceFilter==='scope'?generationSlides.map(s=>s.number).join(','):'')} cards={shownCards} deck={deck} processed={practiceProgress.cards} onSource={source} onRemove={c=>removeContent('cards',c)}/>:<div className="empty-state"><Layers size={32}/><h3>No flashcards in this view yet.</h3><p>Select the slides you want to study, then create focused cards from their useful concepts.</p><button className="button" disabled={!!busy||!generationSlides.length} onClick={()=>generate('cards',true)}>Create flashcards</button></div>}{remainingCards>0&&shownCards.length>0&&<button className="text-button" disabled={!!busy} onClick={()=>generate('cards')}>Create missing cards · {remainingCards} slides</button>}</TabsContent>
       <TabsContent value="quiz">{practiceToolbar('quiz')}{shownQuiz.length?<QuizView key={collectionId+':'+practiceFilter+(practiceFilter==='scope'?generationSlides.map(s=>s.number).join(','):'')} questions={shownQuiz} deck={deck} processed={practiceProgress.quiz} onSource={source} onRemove={q=>removeContent('quiz',q)}/>:<div className="empty-state"><GraduationCap size={32}/><h3>Put your understanding to the test.</h3><p>Questions focus on concepts and are shuffled each round. Title-only and administrative content is skipped.</p><button className="button" disabled={!!busy||!generationSlides.length} onClick={()=>generate('quiz',true)}>Create quiz</button></div>}{remainingQuiz>0&&shownQuiz.length>0&&<button className="text-button" disabled={!!busy} onClick={()=>generate('quiz')}>Create missing questions · {remainingQuiz} slides</button>}</TabsContent>
       <TabsContent value="diagram"><DiagramView key={slide!.number} slide={slide!} analysis={diagrams[String(slide!.number)]} busy={!!busy} onAnalyze={()=>void analyzeDiagram()} onRemove={removeDiagram}/></TabsContent>
       <TabsContent value="ask"><div className="ask-intro"><h3>Ask about slide {slide?.number}.</h3><p>Your tutor can use this page’s text, notes, and images. Each question is answered independently.</p></div>{(chats[slide!.number]??[]).map((c,i)=><div className="chat-pair" key={i}><p className="chat-question">{c.question}</p><p className="chat-answer">{c.answer}</p></div>)}<form onSubmit={e=>{e.preventDefault();void ask()}}><label className="field-label" htmlFor="question">Your question</label><textarea id="question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Explain the graph, or walk me through an example…" rows={3} maxLength={2000}/><div className="actions end"><button className="button" disabled={!!busy||!question.trim()} type="submit">Ask tutor <ArrowRight size={15}/></button></div></form></TabsContent>
      </Tabs><p className="ai-note">Check generated answers against your source. Results are saved to your library as they finish.</p>
     </>}
    </section></div>
   </>}
  </main>
  {deck&&<CollectionManager key={deck.slides.map(s=>s.number).join(',')} deck={deck} open={manageOpen} onOpenChange={setManageOpen} busy={!!busy&&!controller.current} onRemove={numbers=>void deletePages(numbers)} hiddenCount={hiddenCount} onRestoreHidden={restoreHidden}/>}
 <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="connection-dialog"><DialogTitle>Settings</DialogTitle><DialogDescription>Choose how Quizhunter generates your study material.</DialogDescription><label className="field-label" htmlFor="ai-provider">Generation engine</label><Select value={provider} disabled={!!busy} onValueChange={v=>{setProvider(v as 'local'|'openai');setError('');setStatus('')}}><SelectTrigger id="ai-provider"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="local" disabled={!localAvailable}>On this device{localAvailable?'':' · Mac app only'}</SelectItem><SelectItem value="openai">OpenAI</SelectItem></SelectContent></Select>{provider==='local'?<><div className="notice"><strong>{localReady?'Ready to study':'Engine status'}</strong><p role="status">{localMessage}</p><p>Gemma 3 reads text and page images on this Mac. Quick mode keeps explanations and practice concise to reduce waiting. Thorough mode takes longer. Smaller local models can miss details; check answers against your source.</p></div><div className="actions end"><button className="button outline" onClick={()=>void checkLocalAI()}>Check again</button><button className="button" onClick={()=>{setSettingsOpen(false);setError('');setStatus('Settings saved.')}}>Done</button></div></>:<form onSubmit={e=>{e.preventDefault();if(!/^sk-[A-Za-z0-9_-]{10,500}$/.test(keyDraft.trim())){setKeyError('Enter a valid OpenAI API key beginning with sk-.');return}setKey(keyDraft.trim());setKeyDraft('');setKeyError('');setSettingsOpen(false);setError('');setStatus('API key added for this session. Choose an action to start studying.')}}><label htmlFor="api-key" className="field-label">OpenAI API key</label><input id="api-key" type="password" autoComplete="off" value={keyDraft} onChange={e=>setKeyDraft(e.target.value)} placeholder="sk-…" maxLength={503}/>{keyError&&<p className="error-text" role="alert">{keyError}</p>}<div className="notice"><p>The key stays in memory for this tab and is forwarded securely to OpenAI when you generate. Quizhunter does not save your key or decks on its server.</p><p>Uses GPT-5.4. API usage is billed separately by the provider. Connecting saves the key for this session; the first request checks access.</p></div><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-link">Create or manage an API key ↗</a><div className="actions end">{key&&<button type="button" className="button outline" disabled={!!busy} onClick={()=>{setKey('');setKeyDraft('');setSettingsOpen(false)}}>Disconnect</button>}<button className="button" type="submit">Connect AI</button></div></form>}</DialogContent></Dialog></div>
}
