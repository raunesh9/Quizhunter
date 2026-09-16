import {z} from 'zod';
import {MAX_COLLECTION_SLIDES,MAX_SLIDES_PER_FILE} from './limits';
const short=z.string().max(12000);const ref=z.number().int().min(1).max(MAX_COLLECTION_SLIDES);
export const lessonSchema=z.object({slide:ref,title:short,bigIdea:short,explanation:z.array(short).min(1).max(20),terms:z.array(z.object({term:short,definition:short})).max(30),example:short,connections:short,misconceptions:z.array(short).max(15),check:z.object({question:short,answer:short}),limitations:z.array(short).max(15)});
export const cardSchema=z.object({front:short,back:short,slide:ref});
export const quizSchema=z.object({question:short,options:z.array(short).length(4),answer:z.number().int().min(0).max(3),explanation:short,slide:ref});
export const agentSlideSchema=z.object({lesson:lessonSchema,cards:z.array(cardSchema).max(4),quiz:z.array(quizSchema).max(2),practiceStatus:z.enum(['ready','not_applicable']),practiceNote:z.string().max(2000)}).superRefine((result,ctx)=>{
 const invalid=result.cards.some(c=>c.slide!==result.lesson.slide)||result.quiz.some(q=>q.slide!==result.lesson.slide||new Set(q.options).size!==4);
 const missing=result.practiceStatus==='ready'&&(result.cards.length<2||result.quiz.length<1);
 const unsupported=result.practiceStatus==='not_applicable'&&(result.cards.length>0||result.quiz.length>0||result.practiceNote.trim().length<10);
 const duplicate=new Set(result.cards.map(c=>c.front.trim().toLowerCase())).size!==result.cards.length||new Set(result.quiz.map(q=>q.question.trim().toLowerCase())).size!==result.quiz.length;
 if(invalid||missing||unsupported||duplicate)ctx.addIssue({code:z.ZodIssueCode.custom,message:'The agent output is incomplete or contains invalid source references or duplicate questions.'});
});
export function validateAgentResult(value:unknown,slide:number){const result=agentSlideSchema.parse(value);if(result.lesson.slide!==slide)throw Error('The agent returned the wrong source slide.');return result}
export const slideSchema=z.object({number:ref,title:z.string().max(200),text:z.string().max(50000),notes:z.string().max(50000),source:z.string().max(250).optional(),sourceSlide:z.number().int().min(1).max(MAX_SLIDES_PER_FILE).optional(),images:z.array(z.string().max(3000000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)).max(4)});
export const packSchema=z.object({
 version:z.literal(1),
 deck:z.object({name:z.string().max(250),slides:z.array(slideSchema).min(1).max(MAX_COLLECTION_SLIDES),warnings:z.array(z.string().max(1000)).max(2000),sample:z.boolean().optional(),documents:z.array(z.string().max(250)).max(MAX_COLLECTION_SLIDES).optional()}),
 lessons:z.record(lessonSchema),cards:z.array(cardSchema).max(MAX_COLLECTION_SLIDES*60),quiz:z.array(quizSchema).max(MAX_COLLECTION_SLIDES*30),
 progress:z.object({cards:z.array(ref).max(MAX_COLLECTION_SLIDES),quiz:z.array(ref).max(MAX_COLLECTION_SLIDES)}).optional(),
 agentResults:z.record(agentSlideSchema).optional()
}).superRefine((pack,ctx)=>{
 const refs=new Set(pack.deck.slides.map(s=>s.number));
 if(refs.size!==pack.deck.slides.length||[...Object.values(pack.lessons),...pack.cards,...pack.quiz].some(x=>!refs.has(x.slide))||[...(pack.progress?.cards??[]),...(pack.progress?.quiz??[])].some(n=>!refs.has(n)))ctx.addIssue({code:z.ZodIssueCode.custom,message:'The pack contains invalid slide references.'});
 for(const [key,result] of Object.entries(pack.agentResults??{})){if(!refs.has(result.lesson.slide)||!['beginner','college','advanced'].some(level=>key===`${level}:${result.lesson.slide}`))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid agent checkpoint.'});}
});
export const requestSchema=z.object({mode:z.enum(['explain','cards','quiz','ask','agent']),slides:z.array(slideSchema).min(1).max(6),context:z.string().max(12000).default(''),depth:z.enum(['detailed','simple','exam']),level:z.enum(['beginner','college','advanced']),question:z.string().max(2000).default('')}).refine(body=>body.mode!=='agent'||body.slides.length===1,{message:'Agent requests must contain exactly one slide.'});
const str={type:'string'};const num={type:'integer'};const arr=(items:unknown)=>({type:'array',items});const obj=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const lessonOutput=obj({slide:num,title:str,bigIdea:str,explanation:arr(str),terms:arr(obj({term:str,definition:str})),example:str,connections:str,misconceptions:arr(str),check:obj({question:str,answer:str}),limitations:arr(str)});
export const outputSchemas={
 agent:obj({lesson:lessonOutput,cards:arr(obj({front:str,back:str,slide:num})),quiz:arr(obj({question:str,options:arr(str),answer:num,explanation:str,slide:num})),practiceStatus:{type:'string',enum:['ready','not_applicable']},practiceNote:str}),
 explain:obj({slide:num,title:str,bigIdea:str,explanation:arr(str),terms:arr(obj({term:str,definition:str})),example:str,connections:str,misconceptions:arr(str),check:obj({question:str,answer:str}),limitations:arr(str)}),
 cards:obj({cards:arr(obj({front:str,back:str,slide:num}))}),
 quiz:obj({quiz:arr(obj({question:str,options:arr(str),answer:num,explanation:str,slide:num}))}),
 ask:obj({answer:str,slides:arr(num)})
};
export function validateOutput(mode:string,value:unknown,refs:number[]){if(mode==='agent'){if(refs.length!==1)throw Error('Expected one slide');return validateAgentResult(value,refs[0]);}const allowed=(n:number)=>refs.includes(n);if(mode==='explain'){const x=lessonSchema.parse(value);if(!allowed(x.slide))throw Error('Invalid source reference');return x}if(mode==='cards'){const x=z.object({cards:z.array(cardSchema).min(1).max(60)}).parse(value);if(x.cards.some(c=>!allowed(c.slide)))throw Error('Invalid source reference');return x}if(mode==='quiz'){const x=z.object({quiz:z.array(quizSchema).min(1).max(30)}).parse(value);if(x.quiz.some(q=>!allowed(q.slide)||new Set(q.options).size!==4))throw Error('Invalid quiz');return x}const x=z.object({answer:short,slides:z.array(ref).max(6)}).parse(value);if(x.slides.some(n=>!allowed(n)))throw Error('Invalid source reference');return x;}
