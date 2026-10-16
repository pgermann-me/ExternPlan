import {personGroupIds,allowedFunctionRegions,planningPeople} from './public/organization.js';
import { DateTime } from 'luxon';
import {timelineBars} from './timeline.js';
import { instant, overlap, iso, zone } from './domain.js';
const planningName=p=>p.last_name&&p.first_name?`${p.last_name} ${p.first_name}`:p.name;
// With a group selected, include all its members; otherwise use actual assignments.
export function personMonth(state, month, functionId, selectedRegions,groupId,departmentId) {
 if(!/^\d{4}-\d{2}$/.test(month||''))throw Error('Monat als YYYY-MM');
 const start=DateTime.fromISO(month+'-01',{zone});if(!start.isValid)throw Error('Ungültiger Monat');
 const fn=state.functions.find(f=>f.id===functionId&&!f.deleted_at);if(!fn)throw Error('Funktion unbekannt');
 const group=state.groups.find(g=>g.id===groupId&&!g.deleted_at);if(groupId&&!group)throw Error('Gruppe unbekannt');
 const scopedPeople=planningPeople(state,groupId,departmentId);
 const allowed=allowedFunctionRegions(fn,group,state.regions);
 const regions=selectedRegions===undefined?allowed:selectedRegions;
 if(!Array.isArray(regions)||regions.some(g=>!allowed.includes(g)||!state.regions.some(r=>r.id===g&&!r.deleted_at)))throw Error('Region ist für Funktion und Gruppe nicht zulässig');
 const days=Array.from({length:start.daysInMonth},(_,i)=>start.plus({days:i}));
 const monthInterval=[start.toMillis(),start.plus({months:1}).toMillis()];
 const assignments=state.assignments.filter(a=>a.function_id===functionId &&
   (!fn.geo_ids.length? a.geodependency===null : regions.some(g=>a.geodependency===g||(fn.covers[a.geodependency]||[]).includes(g))) &&
   overlap([instant(a.start_on),instant(a.end_on)],monthInterval));
 const dayMeta=days.map(d=>({date:d.toISODate(),weekday:d.weekday,week_number:d.weekNumber,week_year:d.weekYear,start_on:iso(d.toMillis()),end_on:iso(d.plus({days:1}).toMillis())}));
 const byPerson=new Map();
 for(const a of assignments){const list=byPerson.get(a.employee_id)||[];list.push(a);byPerson.set(a.employee_id,list);}
 const rows=scopedPeople.filter(p=>groupId?!p.deleted_at&&personGroupIds(p).includes(groupId):byPerson.has(p.employee_id)).sort((a,b)=>planningName(a).localeCompare(planningName(b),'de-CH')).map(p=>({
   employee_id:p.employee_id,name:planningName(p),group_id:p.group_id,group_ids:personGroupIds(p),...timelineBars(byPerson.get(p.employee_id)||[],dayMeta,state.assignment_styles||{}),
   cells:days.map(d=>({assignments:(byPerson.get(p.employee_id)||[]).filter(a=>overlap([instant(a.start_on),instant(a.end_on)],[d.toMillis(),d.plus({days:1}).toMillis()])).sort((a,b)=>instant(a.start_on)-instant(b.start_on)||a.priority-b.priority)}))
 }));
 return {month,day_meta:dayMeta,department_id:departmentId||null,group_id:groupId||null,function_id:functionId,region_ids:regions,days:days.map(d=>d.toISODate()),rows};
}
