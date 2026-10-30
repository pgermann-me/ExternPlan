import {createHash} from 'node:crypto';
import {withRegionGroups} from './public/region-groups.js';
import {validatePersonAffiliations} from './people.js';
import {validateFavorite} from './favorites.js';
import {audit,change,instant,validateAssignment} from './domain.js';
const active=r=>!r.deleted_at;
export const regionConversionToken=(s,key,input={})=>createHash('sha256').update(JSON.stringify({request:{region_group_ids:[...(input.region_group_ids||[])].sort(),geo_id:input.geo_id},function:s.functions.find(f=>f.id===key),groups:s.region_groups,regions:s.regions,people:s.people,assignments:s.assignments.filter(a=>a.function_id===key),favorites:(s.favorites||[]).filter(f=>f.function_id===key),rules:s.rules.filter(r=>r.function_id===key)})).digest('hex');
export function prepareFunctionRegionConversion(s,key,input,now=Date.now()){
 const original=s.functions.find(f=>f.id===key&&active(f));if(!original)throw Error('Funktion nicht gefunden');
 if(original.duty_time_model==='always')throw Error('Diese Umstellung ist für zeitlich geplante Dienste vorgesehen');
 const ids=input.region_group_ids;
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!(s.region_groups||[]).some(g=>g.id===id&&active(g))))throw Error('Mindestens eine gültige Gebietsgruppe wählen');
 const next=structuredClone(s),fn=next.functions.find(f=>f.id===key);fn.region_assignment_mode='groups';fn.geo_ids=[];fn.covers={};
 for(const group of next.region_groups.filter(active)){
  const before=structuredClone(group),has=group.function_ids?.includes(key);if(has===ids.includes(group.id))continue;
  group.function_ids=ids.includes(group.id)?[...(group.function_ids||[]),key]:(group.function_ids||[]).filter(id=>id!==key);audit(next,'region_groups','update',before,structuredClone(group));
 }
 const view=withRegionGroups(next),target=view.regions.find(r=>r.id===input.geo_id&&active(r));
 if(!target||!view.functions.find(f=>f.id===key).geo_ids.includes(target.id))throw Error('Ein Zielgebiet aus den gewählten Gebietsgruppen wählen');
 const summary={function_name:fn.name,region_name:target.name,assignments:0,past_assignments:0,favorites:0,people:0};
 for(const person of next.people){
  const rows=person.function_regions||[];if(!rows.some(r=>r.function_id===key))continue;
  const before=structuredClone(person),mapped=rows.map(r=>r.function_id===key?{...r,geo_id:target.id}:r);
  const seen=new Set();for(const row of mapped){const signature=JSON.stringify([row.function_id,row.geo_id]);if(seen.has(signature))throw Error('Die Person '+person.name+' hat mehrere Zuordnungen für diese Funktion. Bitte diese vor der Umstellung bereinigen.');seen.add(signature);}
  person.function_regions=mapped;
  if(active(person))validatePersonAffiliations({...view,people:next.people},person,before);
  audit(next,'person','update',before,structuredClone(person));summary.people++;
 }
 const source=s.assignments.filter(a=>a.function_id===key),working={...view,people:next.people,assignments:next.assignments.filter(a=>a.function_id!==key)};
 const converted=new Map();
 for(const a of source){
  const historical=instant(a.end_on)<=now;
  // Archived historical people remain archived in storage; permit only the
  // geographic correction of their existing, already-ended duty here. Current
  // organization restrictions do not retrospectively invalidate that history.
  const validation=historical?{...working,people:working.people.map(p=>p.employee_id===a.employee_id?{...p,deleted_at:undefined}:p),functions:working.functions.map(f=>f.id===key?{...f,department_ids:[],group_ids:[]}:f),regions:working.regions.map(r=>r.id===target.id?{...r,department_ids:[],group_ids:[],function_ids:[],region_group_scopes:[]}:r)}:working;
  const result={...a,...validateAssignment(validation,{...a,geodependency:target.id},a).assignment};
  converted.set(a.assignment_id,result);working.assignments.push(result);summary.assignments++;if(historical)summary.past_assignments++;
 }
 next.assignments=next.assignments.map(a=>converted.get(a.assignment_id)||a);
 for(const a of source){const after=converted.get(a.assignment_id);change(next,'update',after);audit(next,'assignment','update',a,after);}
 for(const favorite of (next.favorites||[]).filter(f=>active(f)&&f.function_id===key)){
  const before=structuredClone(favorite);favorite.region_ids=[target.id];favorite.revision=(favorite.revision||0)+1;validateFavorite({...view,people:next.people},favorite);audit(next,'favorite','update',before,structuredClone(favorite));summary.favorites++;
 }
 audit(next,'functions','update',original,structuredClone(fn));audit(next,'function_region_conversion','update',null,summary);
 return {state:next,summary,token:regionConversionToken(s,key,input)};
}
