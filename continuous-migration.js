import {audit,change,instant} from './domain.js';
export function mergeContinuousDuties(s){
 if(s.continuous_storage_version===1)return {merged:0};
 const groups=new Map();for(const a of s.assignments){const style=s.assignment_styles?.[a.assignment_id];if(!style||!style.standing_function_id&&!s.favorites?.some(f=>f.id===style.favorite_id&&f.schedule_mode==='continuous'))continue;const key=JSON.stringify([a.employee_id,a.function_id,a.geodependency,a.priority,style.color,style.standing_function_id||style.favorite_id]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
 let removed=0;const deleted=new Set();for(const entries of groups.values()){
  entries.sort((a,b)=>instant(a.start_on)-instant(b.start_on));let first=entries[0],before=null;
  const flush=()=>{if(!before)return;change(s,'update',first);audit(s,'assignment','merge-continuous',before,{...first});before=null;};
  for(const next of entries.slice(1)){if(instant(first.end_on)!==instant(next.start_on)){flush();first=next;continue;}before??={...first};first.end_on=next.end_on;first.revision=Math.max(first.revision,next.revision)+1;change(s,'delete',{...next,revision:next.revision+1});audit(s,'assignment','delete',next,null);deleted.add(next.assignment_id);delete s.assignment_styles[next.assignment_id];removed++;}flush();
 }
 if(removed)s.assignments=s.assignments.filter(a=>!deleted.has(a.assignment_id));s.continuous_storage_version=1;return {merged:removed};
}
