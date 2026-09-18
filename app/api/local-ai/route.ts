import {isLocalRequest,localAIStatus,LOCAL_MODEL} from '@/lib/study/local-ai';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'};
 if(!isLocalRequest(request)||request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({running:false,ready:false,model:LOCAL_MODEL,error:'Local AI is available in the desktop app or local preview.'},{status:403,headers});
 try{return Response.json(await localAIStatus(request.signal),{headers})}
 catch{return Response.json({running:false,ready:false,model:LOCAL_MODEL},{headers})}
}
