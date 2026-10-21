import {DateTime} from 'luxon';
import {audit,change,id,instant,iso,validateAssignment,zone} from './domain.js';
export const standingDefaults=(now=Date.now())=>{const day=DateTime.fromMillis(now,{zone});return {from:day.toISODate(),to:day.endOf('year').toISODate()};};
export function validateStandingFunction(fn){
 if(fn.duty_time_model!=null&&!['scheduled','always'].includes(fn.duty_time_model))throw Error('Unbekannter Zeitbereich');
 if(fn.duty_color!=null&&!/^#[0-9a-f]{6}$/i.test(fn.duty_color))throw Error('Ungültige Farbe für ständige Dienste');
}
export function createStandingDuties(s,functionId,input={},now=Date.now()){
 const fn=s.functions.find(f=>f.id===functionId&&!f.deleted_at);if(!fn||fn.duty_time_model!=='always')throw Error('Funktion benötigt den Zeitbereich Immer');
 const defaults=standingDefaults(now),from=input.from??defaults.from,to=input.to??defaults.to,color=input.color??fn.duty_color??'#808080';
 const dates=[from,to].map(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?DateTime.fromISO(value,{zone}):null);
 if(dates.some(d=>!d?.isValid)||dates[1]<dates[0]||dates[1].diff(dates[0],'days').days>365)throw Error('Von/Bis müssen gültige Daten sein (höchstens 366 Tage)');
 if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('Ungültige Dienstfarbe');
 const targets=new Map(),people=new Map(s.people.filter(p=>!p.deleted_at).map(p=>[p.employee_id,p]));
 const key=(person,geo)=>JSON.stringify([person,geo]);
 for(const p of people.values())for(const r of p.function_regions||[])if(r.function_id===fn.id)targets.set(key(p.employee_id,r.geo_id),{person:p,geo:r.geo_id,priority:r.priority});
 for(const a of s.assignments)if(a.function_id===fn.id&&people.has(a.employee_id)&&!targets.has(key(a.employee_id,a.geodependency))){const person=people.get(a.employee_id);if(!Array.isArray(person.function_regions))targets.set(key(a.employee_id,a.geodependency),{person,geo:a.geodependency,priority:a.priority});}
 if(targets.size>250000)throw Error('Zu viele Zuordnungen auf einmal');
 const slots=[[dates[0].toMillis(),dates[1].plus({days:1}).minus({minutes:1}).toMillis()]];
 const existing=new Map();for(const a of s.assignments)if(a.function_id===fn.id){const k=key(a.employee_id,a.geodependency);if(!existing.has(k))existing.set(k,[]);existing.get(k).push([instant(a.start_on),instant(a.end_on)]);}
 const prepared=[];let already_planned=0;
 for(const [k,target] of targets){
  const template=validateAssignment({...s,assignments:[]},{employee_id:target.person.employee_id,function_id:fn.id,geodependency:target.geo,priority:target.priority,start_on:iso(slots[0][0]),end_on:iso(slots[0][1])}).assignment;
  const intervals=(existing.get(k)||[]).sort((a,b)=>a[0]-b[0]);let cursor=0;
  for(const [start,end] of slots){const count=prepared.length;while(cursor<intervals.length&&intervals[cursor][1]<=start)cursor++;let current=start;
   for(let i=cursor;i<intervals.length&&intervals[i][0]<end;i++){const [a,b]=intervals[i];if(a>current)prepared.push({...template,assignment_id:id(),start_on:iso(current),end_on:iso(Math.min(a,end))});current=Math.max(current,b);if(current>=end)break;}
   if(current<end)prepared.push({...template,assignment_id:id(),start_on:iso(current),end_on:iso(end)});if(prepared.length===count)already_planned++;
  }
 }
 s.assignment_styles??={};for(const a of prepared){s.assignments.push(a);s.assignment_styles[a.assignment_id]={color,standing_function_id:fn.id};change(s,'create',a);audit(s,'assignment','create',null,a);}
 const result={created:prepared.length,people:new Set([...targets.values()].map(t=>t.person.employee_id)).size,targets:targets.size,already_planned,from,to,color};audit(s,'function','standing-duties',null,{function_id:fn.id,...result});return result;
}
