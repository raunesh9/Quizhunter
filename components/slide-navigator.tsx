"use client";
import {useState} from 'react';
import {Search,Trash2,Check,SlidersHorizontal} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {Slide} from '@/lib/study/types';

export function SlideNavigator({slides,current,selected,explained,onNavigate,onSelect,onDelete,open,onOpenChange,hiddenCount,onRestoreHidden,deleteDisabled}:{slides:Slide[];current:number;selected:number[];explained:Set<number>;onNavigate:(n:number)=>void;onSelect:(ids:number[])=>void;onDelete:(ids:number[])=>void;open:boolean;onOpenChange:(open:boolean)=>void;hiddenCount:number;onRestoreHidden:()=>void;deleteDisabled:boolean}){
 const [search,setSearch]=useState('');
 const matching=slides.filter(s=>`${s.number} ${s.title} ${s.source??''} ${s.sourceSlide??''}`.toLowerCase().includes(search.toLowerCase()));
 const toggle=(n:number)=>onSelect(selected.includes(n)?selected.filter(id=>id!==n):[...selected,n]);
 return <div className="slide-browser">
  <button className="text-button manage-slides-trigger" onClick={()=>onOpenChange(true)}><SlidersHorizontal size={14}/>Manage slides</button>
  <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="collection-dialog slide-manager"><DialogTitle>Manage slides</DialogTitle><DialogDescription>Choose specific slides for generation, or delete pages you no longer need. Original files stay untouched.</DialogDescription>
  <label className="page-search"><Search size={15}/><input aria-label="Search slides" placeholder="Find a slide or file…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  <div className="page-selection"><span>{selected.length} selected</span><button className="text-button" onClick={()=>onSelect([...new Set([...selected,...matching.map(s=>s.number)])])}>Select visible</button><button className="text-button" disabled={!selected.length} onClick={()=>onSelect([])}>Clear</button></div>
  <div className="slide-list" aria-label="Slides">{matching.map(s=><div className={`slide-row ${s.number===current?'current':''}`} key={s.number}>
   <input type="checkbox" aria-label={`Select slide ${s.number}`} checked={selected.includes(s.number)} onChange={()=>toggle(s.number)}/>
   <button className="slide-jump" aria-current={s.number===current?'page':undefined} onClick={()=>onNavigate(s.number)} title={`${s.title}\n${s.source??''} · page ${s.sourceSlide??s.number}`}><span className="slide-index">{s.number}</span><span><strong>{/^\d+$/.test(s.title)?`Page ${s.sourceSlide??s.number}`:s.title}</strong><small>{s.source?`${s.source} · p. ${s.sourceSlide}`:'Study material'}</small></span>{explained.has(s.number)&&<Check className="slide-ready" size={13} aria-label="Explanation ready"/>}</button>
  </div>)}</div>
  {!matching.length&&<p className="small muted">No matching slides.</p>}
  <div className="slide-delete-actions"><button className="text-button remove-content" disabled={deleteDisabled} onClick={()=>{onDelete([current]);onOpenChange(false)}}><Trash2 size={14}/>Delete current slide</button>{selected.length>0&&<button className="text-button remove-content" disabled={deleteDisabled} onClick={()=>{onDelete(selected);onOpenChange(false)}}>Delete selected ({selected.length})</button>}</div>
  <div className="actions end">{hiddenCount>0&&<button className="text-button" onClick={onRestoreHidden}>Restore removed content ({hiddenCount})</button>}<button className="button" onClick={()=>onOpenChange(false)}>Done{selected.length?` · ${selected.length} selected`:''}</button></div>
  </DialogContent></Dialog>
 </div>;
}
