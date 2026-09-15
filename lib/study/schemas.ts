import {z} from 'zod';
const short=z.string().max(12000);const ref=z.number().int().min(1).max(180);
export const lessonSchema=z.object({slide:ref,title:short,bigIdea:short,explanation:z.array(short).min(1).max(20),terms:z.array(z.object({term:short,definition:short})).max(30),example:short,connections:short,misconceptions:z.array(short).max(15),check:z.object({question:short,answer:short}),limitations:z.array(short).max(15)});
export const cardSchema=z.object({front:short,back:short,slide:ref});
export const quizSchema=z.object({question:short,options:z.array(short).length(4),answer:z.number().int().min(0).max(3),explanation:short,slide:ref});
export const slideSchema=z.object({number:ref,title:z.string().max(200),text:z.string().max(50000),notes:z.string().max(50000),source:z.string().max(250).optional(),sourceSlide:z.number().int().min(1).max(60).optional(),images:z.array(z.string().max(3000000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)).max(4)});
export const requestSchema=z.object({mode:z.enum(['explain','cards','quiz','ask']),slides:z.array(slideSchema).min(1).max(6),context:z.string().max(12000).default(''),depth:z.enum(['detailed','simple','exam']),level:z.enum(['beginner','college','advanced']),question:z.string().max(2000).default('')});
const str={type:'string'};const num={type:'integer'};const arr=(items:unknown)=>({type:'array',items});const obj=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const outputSchemas={
 explain:obj({slide:num,title:str,bigIdea:str,explanation:arr(str),terms:arr(obj({term:str,definition:str})),example:str,connections:str,misconceptions:arr(str),check:obj({question:str,answer:str}),limitations:arr(str)}),
 cards:obj({cards:arr(obj({front:str,back:str,slide:num}))}),
 quiz:obj({quiz:arr(obj({question:str,options:arr(str),answer:num,explanation:str,slide:num}))}),
 ask:obj({answer:str,slides:arr(num)})
};
export function validateOutput(mode:string,value:unknown,refs:number[]){const allowed=(n:number)=>refs.includes(n);if(mode==='explain'){const x=lessonSchema.parse(value);if(!allowed(x.slide))throw Error('Invalid source reference');return x}if(mode==='cards'){const x=z.object({cards:z.array(cardSchema).min(1).max(60)}).parse(value);if(x.cards.some(c=>!allowed(c.slide)))throw Error('Invalid source reference');return x}if(mode==='quiz'){const x=z.object({quiz:z.array(quizSchema).min(1).max(30)}).parse(value);if(x.quiz.some(q=>!allowed(q.slide)||new Set(q.options).size!==4))throw Error('Invalid quiz');return x}const x=z.object({answer:short,slides:z.array(ref).max(6)}).parse(value);if(x.slides.some(n=>!allowed(n)))throw Error('Invalid source reference');return x;}
