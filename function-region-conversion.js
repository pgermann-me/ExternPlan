import {createHash} from 'node:crypto';
import {personDepartmentIds,personGroupIds} from './public/organization.js';
import {withRegionGroups} from './public/region-groups.js';
import {validatePersonAffiliations} from './people.js';
import {validateFavorite} from './favorites.js';
import {audit,change,instant,validateAssignment} from './domain.js';
const active=r=>!r.deleted_at;
export const regionConversionToken=(s,key,input={})=>createHash('sha256').update(JSON.stringify({request:{region_group_ids:[...(input.region_group_ids||[])].sort(),geo_id:input.geo_id,extend_region_access:input.extend_region_access===true},organization_groups:s.groups,departments:s.departments,function:s.functions.find(f=>f.id===key),groups:s.region_groups,regions:s.regions,people:s.people,assignments:s.assignments.filter(a=>a.function_id===key),favorites:(s.favorites||[]).filter(f=>f.function_id===key),rules:s.rules.filter(r=>r.function_id===key)})).digest('hex');
export function prepareFunctionRegionConversion(s,key,input,now=Date.now()){
 if(input.extend_region_access!==undefined&&typeof input.extend_region_access!=='boolean')throw Error('Ungültige Option für Gebietsfreigaben');
 const original=s.functions.find(f=>f.id===key&&active(f));if(!original)throw Error('Funktion nicht gefunden');
 if(original.duty_time_model==='always')throw Error('Diese Umstellung ist für zeitlich geplante Dienste vorgesehen');
 const ids=input.region_group_ids;
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!(s.region_groups||[]).some(g=>g.id===id&&active(g))))throw Error('Mindestens eine gültige Gebietsgruppe wählen');
 const next=structuredClone(s),fn=next.functions.find(f=>f.id===key);fn.region_assignment_mode='groups';fn.geo_ids=[];fn.covers={};
 for(const group of next.region_groups.filter(active)){
  const before=structuredClone(group),has=group.function_ids?.includes(key);if(has===ids.includes(group.id))continue;
  group.function_ids=ids.includes(group.id)?[...(group.function_ids||[]),key]:(group.function_ids||[]).filter(id=>id!==key);audit(next,'region_groups','update',before,structuredClone(group));
 }
 const region=next.regions.find(r=>r.id===input.geo_id&&active(r)),accessChanges=[];
 if(input.extend_region_access&&region)extendRegionAccess(next,key,ids,region,now,accessChanges);
 const view=withRegionGroups(next),target=view.regions.find(r=>r.id===input.geo_id&&active(r));
 if(!target||!view.functions.find(f=>f.id===key).geo_ids.includes(target.id))throw Error('Ein Zielgebiet aus den gewählten Gebietsgruppen wählen');
 const summary={function_name:fn.name,region_name:target.name,assignments:0,past_assignments:0,favorites:0,people:0,access_changes:accessChanges};
 for(const person of next.people){
  const rows=person.function_regions||[];if(!rows.some(r=>r.function_id===key))continue;
  const before=structuredClone(person),mapped=rows.map(r=>r.function_id===key?{...r,geo_id:target.id}:r);
  const seen=new Set();for(const row of mapped){const signature=JSON.stringify([row.function_id,row.geo_id]);if(seen.has(signature))throw Error('Die Person '+person.name+' hat mehrere Zuordnungen für diese Funktion. Bitte diese vor der Umstellung bereinigen.');seen.add(signature);}
  person.function_regions=mapped;
  if(active(person)){try{validatePersonAffiliations({...view,people:next.people},person,before);}catch(error){throw Error(person.name+': '+error.message+' Bei Bedarf die Option „Gebietsfreigaben ergänzen“ aktivieren und die Vorschau erneut anzeigen.');}}
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

// Only the explicit admin conversion option may extend geographic configuration.
// Retain existing entries; an empty restriction remains unrestricted.
function extendRegionAccess(s,key,ids,region,now,changes){
 const dutyPeople=new Set(s.assignments.filter(a=>a.function_id===key&&instant(a.end_on)>now).map(a=>a.employee_id));
 const people=s.people.filter(p=>active(p)&&(dutyPeople.has(p.employee_id)||p.function_regions?.some(r=>r.function_id===key)));
 const contexts=people.map(p=>({departments:personDepartmentIds(p,s.groups),groups:personGroupIds(p).filter(id=>s.groups.some(g=>g.id===id&&active(g)))}));
 for(const f of (s.favorites||[]).filter(f=>active(f)&&f.function_id===key)){
  if(f.scope_type==='department')contexts.push({departments:[f.scope_id],groups:null});
  if(f.scope_type==='group'){const g=s.groups.find(g=>g.id===f.scope_id&&active(g));if(g)contexts.push({departments:[g.department_id].filter(Boolean),groups:[g.id]});}
 }
 const labels=(type,values)=>values.map(id=>s[type].find(r=>r.id===id)?.name||id).join(', ');
 const update=(type,record,edit)=>{const before=structuredClone(record),details=[];edit(details);if(JSON.stringify(before)===JSON.stringify(record))return;audit(s,type,'update',before,structuredClone(record));changes.push({type,id:record.id,name:record.name||record.id,details});};
 for(const [type,record] of [['regions',region],...s.region_groups.filter(g=>active(g)&&ids.includes(g.id)&&(region.region_group_ids||[region.region_group_id]).includes(g.id)).map(g=>['region_groups',g])]){
  update(type,record,details=>{
   for(const [field,contextField,collection,label] of [['department_ids','departments','departments','Abteilungen'],['group_ids','groups','groups','Gruppen']]){
    if(!record[field]?.length)continue;
    const applicable=contexts.filter(c=>c[contextField]!==null),unrestricted=applicable.some(c=>!c[contextField].length);
    const added=[...new Set(applicable.flatMap(c=>c[contextField]))].filter(id=>!record[field].includes(id));
    if(unrestricted){record[field]=[];details.push(label+': alle (bestehende Person ohne entsprechende Zuordnung)');}
    else if(added.length){record[field].push(...added);details.push(label+' ergänzt: '+labels(collection,added));}
   }
   // Keep restricted department/group combinations valid after extending groups.
   if(record.department_ids?.length&&record.group_ids?.length){const extra=s.groups.filter(g=>record.group_ids.includes(g.id)&&g.department_id&&!record.department_ids.includes(g.department_id)).map(g=>g.department_id);record.department_ids=[...new Set([...record.department_ids,...extra])];if(extra.length)details.push('Abteilungen der Gruppen ergänzt: '+labels('departments',[...new Set(extra)]));}
   if(type==='regions'&&record.function_ids?.length&&!record.function_ids.includes(key)){record.function_ids.push(key);details.push('Funktion ergänzt: '+(s.functions.find(f=>f.id===key)?.name||key));}
  });
 }
 const groupIds=new Set(contexts.flatMap(c=>c.groups||[]));
 for(const group of s.groups.filter(g=>active(g)&&groupIds.has(g.id)&&Array.isArray(g.geo_ids)&&!g.geo_ids.includes(region.id)))update('groups',group,details=>{group.geo_ids.push(region.id);details.push('Gebiet ergänzt: '+region.name);});
}
