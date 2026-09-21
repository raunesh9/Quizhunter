"use client";
import {useState} from 'react';
import {Image,Maximize2,Sparkles,Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {Diagram,Slide} from '@/lib/study/types';

export function DiagramView({slide,analysis,busy,onAnalyze,onRemove}:{slide:Slide;analysis?:Diagram;busy:boolean;onAnalyze:()=>void;onRemove:()=>void}){
 const [expanded,setExpanded]=useState<number|null>(null);
 return <div className="diagram-view"><div className="view-top"><span className="small muted">Source visuals · slide {slide.number}</span><button className="button" disabled={busy||!slide.images.length} onClick={onAnalyze}><Sparkles size={15}/>{analysis?'Analyze again':'Analyze diagram'}</button></div>
  {slide.images.length?<div className="source-gallery">{slide.images.map((image,i)=><button className="source-visual" key={i} onClick={()=>setExpanded(i)} aria-label={`Enlarge source image ${i+1}`}><img src={image} alt={`Original image ${i+1} from ${slide.source??slide.title}, page ${slide.sourceSlide??slide.number}`}/><span><Maximize2 size={14}/>Enlarge source</span></button>)}</div>:<div className="empty-state"><Image size={30}/><h3>No source image on this page.</h3><p>Quick import skips images on text-only PDFs. For a missing visual, import the PDF in Thorough mode in a new collection.</p></div>}
  {analysis?<article className="lesson diagram-analysis"><div className="big-idea"><span className="mini-label">READING THE VISUAL</span><p>{analysis.summary}</p></div>{!!analysis.observations.length&&<><h3>What’s shown</h3><ul>{analysis.observations.map((text,i)=><li key={i}>{text}</li>)}</ul></>}{!!analysis.relationships.length&&<><h3>How it fits together</h3><ul>{analysis.relationships.map((text,i)=><li key={i}>{text}</li>)}</ul></>}{!!analysis.limitations.length&&<div className="notice"><strong>What the source cannot confirm</strong>{analysis.limitations.map((text,i)=><p key={i}>{text}</p>)}</div>}<button className="text-button remove-content" onClick={onRemove}><Trash2 size={14}/>Remove analysis</button></article>:slide.images.length>0&&<p className="notice">Analyze the visible labels, arrows, axes, and relationships. The original image stays beside the explanation so you can check it.</p>}
  <Dialog open={expanded!==null} onOpenChange={open=>{if(!open)setExpanded(null)}}><DialogContent className="image-dialog"><DialogTitle>Source page {slide.sourceSlide??slide.number}</DialogTitle><DialogDescription>{slide.source??slide.title}</DialogDescription>{expanded!==null&&<img src={slide.images[expanded]} alt="Enlarged source visual"/>}</DialogContent></Dialog>
 </div>;
}
