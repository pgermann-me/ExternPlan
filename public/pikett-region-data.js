import {priorityRank} from './priority.js';
import {regionsAtPoint} from './region-point.js';
import {polygonId} from './region-geometry.js';
import {withRegionGroups} from './region-groups.js';
import {personScopeAllows} from './organization.js';
import {listContacts} from './pikett-list-data.js';
const personName=p=>p?.last_name&&p?.first_name?`${p.last_name} ${p.first_name}`:p?.name||'Unbekannte Person';
export function pikettByRegion(state,mapData,at,lat,lng){
 const time=new Date(at).getTime();
 if(!Number.isFinite(time))throw Error('Ungültiger Zeitpunkt');
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('Ungültiger Kartenpunkt');
 state=withRegionGroups(state);
 const regions=regionsAtPoint(state,mapData,[lng,lat]),ids=new Set(regions.map(r=>r.id)),rows=[];
 const functions=new Map([...state.functions,...(state.archived_master?.functions||[])].map(f=>[f.id,f])),people=new Map([...state.people,...(state.archived_people||[])].map(p=>[p.employee_id,p]));
 for(const a of state.assignments){
  const fn=functions.get(a.function_id);if(!fn||fn.duty_time_model==='always'||new Date(a.start_on).getTime()>time||new Date(a.end_on).getTime()<=time)continue;
  const matching=regions.filter(r=>r.id===a.geodependency||(fn.covers?.[a.geodependency]||[]).includes(r.id));if(!matching.length)continue;
  const person=people.get(a.employee_id);rows.push({kind:'scheduled',assignment_id:a.assignment_id,function_id:fn.id,function_name:fn.name,employee_id:a.employee_id,person_name:personName(person),region_name:matching.map(r=>r.name).join(', '),region_ids:matching.map(r=>r.id),priority:a.priority,start_on:a.start_on,end_on:a.end_on,contacts:listContacts(person?.contacts)});
 }
 for(const person of state.people.filter(p=>!p.deleted_at))for(const affiliation of person.function_regions||[]){
  const fn=functions.get(affiliation.function_id),region=regions.find(r=>r.id===affiliation.geo_id);
  if(!ids.has(affiliation.geo_id)||!fn||fn.deleted_at||fn.duty_time_model!=='always'||!fn.geo_ids.includes(affiliation.geo_id)||!personScopeAllows(state,fn,person,fn.id)||!personScopeAllows(state,region,person,fn.id))continue;
  rows.push({kind:'always',function_id:fn.id,function_name:fn.name,employee_id:person.employee_id,person_name:personName(person),region_name:region.name,region_ids:[region.id],priority:affiliation.priority??0,start_on:null,end_on:null,contacts:listContacts(person.contacts)});
 }
 rows.sort((a,b)=>a.function_name.localeCompare(b.function_name,'de-CH')||priorityRank(a.priority)-priorityRank(b.priority)||a.region_name.localeCompare(b.region_name,'de-CH')||a.person_name.localeCompare(b.person_name,'de-CH'));
 return {at:new Date(time).toISOString(),point:{lat,lng},regions:regions.map(r=>({id:r.id,name:r.name,polygon_geo_id:polygonId(r)})),rows};
}
