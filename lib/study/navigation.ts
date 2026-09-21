import type {Lesson,Slide,StudySettings} from './types';

// Settings describe the next generation, not which existing work is accessible.
export function findLesson(lessons:Record<string,Lesson>,slide:number,settings:StudySettings){
 const exact=`${settings.depth}:${settings.level}:${slide}`;
 if(lessons[exact])return {lesson:lessons[exact],key:exact,exact:true};
 const matches=Object.entries(lessons).filter(([,l])=>l.slide===slide);
 const match=matches.find(([key])=>key.split(':')[1]===settings.level)??matches.at(-1);
 return match?{lesson:match[1],key:match[0],exact:false}:undefined;
}
export type StudyScope='current'|'selected'|'all';
export function scopedSlides(slides:Slide[],current:number|undefined,selected:number[],scope:StudyScope){
 const ids=new Set(selected);
 return slides.filter(s=>scope==='all'||(scope==='current'?s.number===current:ids.has(s.number)));
}
