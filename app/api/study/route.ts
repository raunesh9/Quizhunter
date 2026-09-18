import {requestSchema,outputSchemas,validateOutput} from '@/lib/study/schemas';
import {INSTRUCTIONS,jobs,QUICK_INSTRUCTIONS} from '@/lib/study/prompts';
import {generateLocal,isLocalRequest,LocalAIError} from '@/lib/study/local-ai';
import {practiceSkipReason,removeHousekeepingOutput} from '@/lib/study/practice-quality';
import {skippedPracticeBundle} from '@/lib/study/curation';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 const fail=(error:string,status=400)=>Response.json({error},{status,headers});
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return fail('This request must come from the study app.',403);
 const local=request.headers.get('x-study-provider')==='local';
 if(local&&!isLocalRequest(request))return fail('Local AI is available in the desktop app or local preview.',403);
 const key=request.headers.get('x-openai-key')??'';if(!local&&!/^sk-[A-Za-z0-9_-]{10,500}$/.test(key))return fail('Connect an OpenAI API key or select Local AI in AI settings.',401);
 if(Number(request.headers.get('content-length')??0)>14000000)return fail('This batch is too large. Try fewer or smaller slides.',413);
 let body;try{const text=await request.text();if(text.length>14000000)return fail('This batch is too large.',413);body=requestSchema.parse(JSON.parse(text));}catch{return fail('The study request is invalid. Please reload the deck and try again.');}
 if(body.mode==='ask'&&!body.question.trim())return fail('Enter a question first.');
 if(body.mode==='cards'||body.mode==='quiz'){
  body.slides=body.slides.filter(s=>!practiceSkipReason(s));
  if(!body.slides.length)return Response.json({[body.mode]:[]},{headers});
 }
 if(body.mode==='agent'){
  const reason=practiceSkipReason(body.slides[0]);
  if(reason)return Response.json(skippedPracticeBundle(body.slides[0],reason),{headers});
 }
 if(local){try{return Response.json(await generateLocal(body,request.signal),{headers})}catch(error){
  if(error instanceof LocalAIError)return fail(error.message,error.status);
  if(error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError'))return fail('Local generation stopped or timed out. Completed work is kept. Try a shorter page.',504);
  return fail('Local AI stopped responding. Check that Ollama is running, then try again.',503);
 }}
 const content:({type:'input_text';text:string}|{type:'input_image';image_url:string;detail:'auto'})[]=[{type:'input_text',text:JSON.stringify({task:body.mode,level:body.level,depth:body.depth,outline:body.context,studentQuestion:body.question})}];
 for(const s of body.slides){content.push({type:'input_text',text:JSON.stringify({slide:s.number,sourceDocument:s.source,originalSlide:s.sourceSlide,title:s.title,text:s.text,speakerNotes:s.notes})});for(const image of s.images)content.push({type:'input_image',image_url:image,detail:'auto'});}
 try{const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.4',store:false,instructions:INSTRUCTIONS+'\n'+jobs[body.mode]+(body.pace==='quick'?'\n'+QUICK_INSTRUCTIONS:''),input:[{role:'user',content}],max_output_tokens:12000,text:{format:{type:'json_schema',name:`study_${body.mode}`,strict:true,schema:outputSchemas[body.mode]}}}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(180000)])});
 if(!response.ok){if(response.status===401)return fail('This API key was rejected. Check it in Connect AI.',401);if(response.status===429)return fail('Your OpenAI account reached a rate or billing limit. Check your API balance, then retry.',429);if(response.status===403||response.status===404)return fail('Your API account cannot use the configured GPT-5.4 model. Check model access.',403);return fail('OpenAI could not complete this request. Try again in a moment.',502)}
 const data=await response.json() as {status:string;output?:{content?:{type:string;text?:string;refusal?:string}[]}[]};if(data.status!=='completed')return fail('The answer was cut short. Try a smaller selection or Simple mode.',502);const parts=data.output?.flatMap(o=>o.content??[])??[];if(parts.some(p=>p.type==='refusal'))return fail('The model could not help with this material. Try a different question.',422);const output=parts.filter(p=>p.type==='output_text').map(p=>p.text??'').join('');const result=validateOutput(body.mode,removeHousekeepingOutput(body.mode,JSON.parse(output)),body.slides.map(s=>s.number));return Response.json(result,{headers});
 }catch(error){if(error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError'))return fail('This request timed out. Try again with fewer slides.',504);return fail('The response could not be completed or validated. Please try again.',502)}
}
