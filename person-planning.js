import {withRegionGroups} from './public/region-groups.js';
import {personGroupIds,allowedFunctionRegions,planningPeople,personScopeAllows,availableFunctions} from './public/organization.js';
import { DateTime } from 'luxon';
import {timelineBars} from './timeline.js';
import { instant, overlap, iso, zone, coverage, prepareCoverage } from './domain.js';
const planningName=p=>p.last_name&&p.first_name?`${p.last_name} ${p.first_name}`:p.name;
// Active people remain available for planning in empty months; archived people appear only with historical duties.
export function personMonth(state, month, functionId, selectedRegions,groupId,departmentId) {
 state=withRegionGroups(state);
 if(!/^\d{4}-\d{2}$/.test(month||''))throw Error('Monat als YYYY-MM');
 const start=DateTime.fromISO(month+'-01',{zone});if(!start.isValid)throw Error('Ungültiger Monat');
 const functions=functionId?[state.functions.find(f=>f.id===functionId&&!f.deleted_at&&f.duty_time_model!=='always')]:availableFunctions(state,groupId,departmentId);if(functionId&&!functions[0])throw Error('Funktion unbekannt');
 const group=state.groups.find(g=>g.id===groupId&&!g.deleted_at);if(groupId&&!group)throw Error('Gruppe unbekannt');
 const organizationPeople=planningPeople(state,groupId,departmentId);
 const allowed=[...new Set(functions.flatMap(fn=>allowedFunctionRegions(fn,group,state.regions,departmentId,state.groups)))];
 const regions=selectedRegions===undefined?allowed:selectedRegions;
 if(!Array.isArray(regions)||regions.some(g=>!allowed.includes(g)||!state.regions.some(r=>r.id===g&&!r.deleted_at)))throw Error('Region ist für Funktion und Gruppe nicht zulässig');
 const scopedPeople=organizationPeople.filter(p=>functions.some(fn=>personScopeAllows(state,fn,p,fn.id)&&(!fn.geo_ids.length||!regions.length||regions.some(id=>allowedFunctionRegions(fn,group,state.regions,departmentId,state.groups).includes(id)&&personScopeAllows(state,state.regions.find(r=>r.id===id),p,fn.id)))));
 const days=Array.from({length:start.daysInMonth},(_,i)=>start.plus({days:i}));
 const monthInterval=[start.toMillis(),start.plus({months:1}).toMillis()];
 const assignments=state.assignments.filter(a=>{
   const fn=functions.find(f=>f.id===a.function_id);if(!fn)return false;
   const allowedForFunction=allowedFunctionRegions(fn,group,state.regions,departmentId,state.groups);
   return (!fn.geo_ids.length?(a.geodependency===null||fn.region_assignment_mode==='groups'&&(!regions.length||regions.includes(a.geodependency))):regions.some(g=>allowedForFunction.includes(g)&&a.geodependency===g))&&overlap([instant(a.start_on),instant(a.end_on)],monthInterval);
 });
 const eligible=new Set(organizationPeople.map(p=>p.employee_id)),coverageState=prepareCoverage({...state,assignments:state.assignments.filter(a=>eligible.has(a.employee_id))},...monthInterval,{includeCoveredRegions:false});
 const targets=functions.flatMap(fn=>fn.geo_ids.length?regions.filter(id=>allowedFunctionRegions(fn,group,state.regions,departmentId,state.groups).includes(id)).map(geo=>[fn.id,geo]):[[fn.id,null]]);
 const coverageStatuses=days.map(day=>{
  const required=targets.map(([fn,geo])=>coverage(coverageState,fn,geo,day.toMillis(),day.plus({days:1}).toMillis()).status).filter(status=>status!=='kein Pikett erforderlich');
  return !required.length?'kein Pikett erforderlich':required.every(status=>status==='vollständig besetzt')?'vollständig besetzt':required.every(status=>status==='unbesetzt')?'unbesetzt':'teilweise besetzt';
 });
 const dayMeta=days.map(d=>({date:d.toISODate(),weekday:d.weekday,week_number:d.weekNumber,week_year:d.weekYear,start_on:iso(d.toMillis()),end_on:iso(d.plus({days:1}).toMillis())}));
 const byPerson=new Map();
 for(const a of assignments){const list=byPerson.get(a.employee_id)||[];list.push(a);byPerson.set(a.employee_id,list);}
 const dayBounds=dayMeta.map(d=>[instant(d.start_on),instant(d.end_on)]);
 const rows=scopedPeople.filter(p=>!p.deleted_at||byPerson.has(p.employee_id)).sort((a,b)=>planningName(a).localeCompare(planningName(b),'de-CH')).map(p=>({
   employee_id:p.employee_id,name:planningName(p),group_id:p.group_id,group_ids:personGroupIds(p),...timelineBars(byPerson.get(p.employee_id)||[],dayMeta,state.assignment_styles||{}),
   cells:dayBounds.map(bounds=>({assignments:(byPerson.get(p.employee_id)||[]).filter(a=>overlap([instant(a.start_on),instant(a.end_on)],bounds)).sort((a,b)=>instant(a.start_on)-instant(b.start_on)||a.priority-b.priority)}))
 }));
 return {month,day_meta:dayMeta,coverage_statuses:coverageStatuses,department_id:departmentId||null,group_id:groupId||null,function_id:functionId||null,region_ids:regions,days:days.map(d=>d.toISODate()),rows};
}
