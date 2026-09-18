import JSZip from 'jszip';
import type {Deck, Slide} from './types';
import {MAX_SLIDES_PER_FILE,MAX_FILE_MB,MAX_SOURCE_BYTES} from './limits';
import {slideBytes} from './batches';
import {mapLimited,textOnlyPDF} from './performance';
import type {StudySettings} from './types';
const xml=(s:string)=>{const doc=new DOMParser().parseFromString(s,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('A slide contains damaged XML. Please export the deck as PDF.');return doc;};
const nodes=(root:Document|Element,name:string)=>Array.from(root.getElementsByTagNameNS('*',name));
const paragraphs=(root:Document|Element)=>nodes(root,'p').map(p=>nodes(p,'t').map(t=>t.textContent??'').join('')).filter(Boolean).join('\n');
const resolve=(base:string,target:string)=>{const parts=(target.startsWith('/')?target.slice(1):base+'/'+target).split('/');const out:string[]=[];for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p)}return out.join('/')};
async function smallImage(data:Blob):Promise<string>{const bitmap=await createImageBitmap(data);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image processing unavailable');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.8)}finally{bitmap.close()}}
export async function parseDeck(file:File,onProgress:(s:string)=>void,options:{pace?:StudySettings['pace']}={}):Promise<Deck>{
 if(file.size>MAX_FILE_MB*1024*1024)throw Error(`Choose a file no larger than ${MAX_FILE_MB} MB.`);
 if(/\.pdf$/i.test(file.name))return parsePDF(file,onProgress,options);
 if(!/\.pptx$/i.test(file.name))throw Error('Please choose a .pptx or .pdf file. Save older .ppt files as .pptx first.');
 let zip:JSZip;try{zip=await JSZip.loadAsync(file)}catch{throw Error('This PowerPoint could not be opened. It may be damaged or password-protected. Try exporting it as PDF.');}
 const entries=Object.values(zip.files);if(entries.length>12000)throw Error('This deck has too many embedded files. Export it as PDF.');
 let total=0;for(const entry of entries){const size=(entry as unknown as {_data?:{uncompressedSize:number}})._data?.uncompressedSize??0;total+=size;if(size>100*1024*1024||total>500*1024*1024)throw Error('This deck expands to too much data. Reduce embedded media or export as PDF.');}
 const get=async(p:string)=>{const f=zip.file(p);if(!f)throw Error('PowerPoint is missing required slide data. Export it as PDF.');return xml(await f.async('string'));};
 const relationships=async(p:string)=>{if(!zip.file(p))return [];return nodes(await get(p),'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External');};
 const presentation=await get('ppt/presentation.xml');const rels=await relationships('ppt/_rels/presentation.xml.rels');
 const paths=nodes(presentation,'sldId').map(s=>{const id=s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');const r=rels.find(r=>r.getAttribute('Id')===id);if(!r)throw Error('A slide reference is missing. Export this file as PDF.');return resolve('ppt',r.getAttribute('Target')??'')});
 if(!paths.length)throw Error('There are no slides in this PowerPoint.');if(paths.length>MAX_SLIDES_PER_FILE)throw Error(`Please split your deck into files of ${MAX_SLIDES_PER_FILE} slides or fewer.`);
 const imageCache=new Map<string,Promise<string>>();
 const slides:Slide[]=[];const warnings=new Set<string>(['PowerPoint text, tables, speaker notes, and embedded pictures are read. For full chart, SmartArt, equation, and layout interpretation, upload a PDF export.']);
 for(let i=0;i<paths.length;i++){onProgress(`Reading slide ${i+1} of ${paths.length}…`);const path=paths[i];const doc=await get(path);const base=path.slice(0,path.lastIndexOf('/'));const name=path.slice(path.lastIndexOf('/')+1);const sr=await relationships(`${base}/_rels/${name}.rels`);let notes='';const nr=sr.find(r=>r.getAttribute('Type')?.endsWith('/notesSlide'));if(nr){const nd=await get(resolve(base,nr.getAttribute('Target')??''));notes=nodes(nd,'sp').filter(s=>!nodes(s,'ph').some(p=>['sldNum','hdr','ftr','dt','sldImg'].includes(p.getAttribute('type')??''))).map(paragraphs).join('\n')}
 const images:string[]=[];const imageIds=[...new Set(nodes(doc,'blip').map(n=>n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed')).filter(Boolean))];
 if(imageIds.length>4)warnings.add(`Slide ${i+1}: only the first 4 embedded pictures are included. Use PDF to preserve the full slide.`);
 for(const id of imageIds.slice(0,4)){const r=sr.find(r=>r.getAttribute('Id')===id);if(!r)continue;const target=resolve(base,r.getAttribute('Target')??'');const f=zip.file(target);if(!f)continue;try{if(!imageCache.has(target))imageCache.set(target,f.async('uint8array').then(bytes=>smallImage(new Blob([bytes as BlobPart]))));images.push(await imageCache.get(target)!)}catch{warnings.add(`Slide ${i+1}: a picture format could not be read. Upload a PDF to include it.`)}}
 const text=paragraphs(doc);if(text.length+notes.length>50000)throw Error(`Slide ${i+1} contains too much text. Split it into smaller slides.`);const titleShape=nodes(doc,'sp').find(s=>nodes(s,'ph').some(p=>['title','ctrTitle'].includes(p.getAttribute('type')??'')));
 slides.push({number:i+1,title:(titleShape?paragraphs(titleShape):text.split('\n')[0]||`Slide ${i+1}`).slice(0,200),text,notes,images});
 if(i%5===4)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {name:file.name.replace(/\.pptx$/i,''),slides,warnings:[...warnings]};
}
async function parsePDF(file:File,onProgress:(s:string)=>void,options:{pace?:StudySettings['pace']}={}):Promise<Deck>{
 const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
 onProgress('Opening PDF…');
 const task=pdfjs.getDocument({data:await file.arrayBuffer(),useSystemFonts:true,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',iccUrl:'/pdfjs/iccs/'});
 try{
  const pdf=await task.promise;
  if(pdf.numPages>MAX_SLIDES_PER_FILE)throw Error(`Please split the PDF into files of ${MAX_SLIDES_PER_FILE} pages or fewer.`);
  if(!pdf.numPages)throw Error('This PDF has no pages.');
  const warnings=['PDF pages are treated as study slides. Original page numbers are preserved in JSON downloads.'];
  let bytes=0,completed=0,textPages=0;
  const slides=await mapLimited(Array.from({length:pdf.numPages},(_,i)=>i+1),options.pace==='quick'?2:1,async n=>{
   const page=await pdf.getPage(n),canvas=document.createElement('canvas');
   try{
    let text='',canUseText=false;
    try{const content=await page.getTextContent();text=content.items.map(x=>'str' in x?x.str+('hasEOL' in x&&x.hasEOL?'\n':' '):'').join('').trim();
     if(options.pace==='quick'&&text&&text.length<=50000){try{const operators=await page.getOperatorList();canUseText=textOnlyPDF(content.items.filter(x=>'str' in x),operators.fnArray,pdfjs.OPS)}catch{/* Unknown graphics must retain their image. */}}
    }
    catch{warnings.push(`${file.name}, page ${n}: text extraction failed. The agent will use the page image.`)}
    if(!text)warnings.push(`${file.name}, page ${n}: no selectable text. The agent will read the page image; small or blurry text may be unreadable.`);
    if(text.length>50000)warnings.push(`${file.name}, page ${n}: extracted text was shortened to 50,000 characters. The page image is also included.`);
    const images:string[]=[];
    try{
     if(canUseText){textPages++}else{
     const v=page.getViewport({scale:1});
     const viewport=page.getViewport({scale:Math.min(1.5,1400/Math.max(v.width,v.height))});
     canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
     const ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF rendering is unavailable.');
     await page.render({canvasContext:ctx,canvas,viewport}).promise;
     images.push(canvas.toDataURL('image/jpeg',.8));
     }
    }catch{
     if(!text)throw Error(`${file.name}, page ${n} could not be read or rendered. Try exporting a new PDF.`);
     warnings.push(`${file.name}, page ${n}: the page image could not be rendered. Only extracted text is available; diagrams and layout cannot be checked.`);
    }
    const slide:Slide={number:n,title:text.split('\n')[0].slice(0,160)||`Page ${n}`,text:text.slice(0,50000),notes:'',images,source:file.name,sourceSlide:n};
    bytes+=slideBytes(slide);
    if(bytes>MAX_SOURCE_BYTES)throw Error('This PDF contains too much extracted data. Split it into smaller files.');
    completed++;onProgress(`Read page ${completed} of ${pdf.numPages}…`);
    return slide;
   }finally{page.cleanup();canvas.width=0;canvas.height=0}
  });
  if(textPages)warnings.push(`${textPages} text-only pages were read directly for speed. Pages with graphics or complex text layout retain their images.`);
  return {name:file.name.replace(/\.pdf$/i,''),slides,warnings};
 }catch(error){
  if(error instanceof Error&&error.name==='PasswordException')throw Error('This PDF is password-protected. Unlock it and save a copy before uploading.');
  if(error instanceof Error&&error.name==='InvalidPDFException')throw Error('This PDF is damaged or is not a valid PDF. Export a new copy and try again.');
  throw error;
 }finally{await task.destroy()}
}
