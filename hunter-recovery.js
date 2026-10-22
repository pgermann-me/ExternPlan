import {audit,id,iso} from './domain.js';
import {personGroupIds} from './public/organization.js';
export const hunterPeopleRecoveryId='2026-10-22-restore-hunter-people';
const hunterName=r=>r?.name?.trim().toLocaleLowerCase('de-CH')==='jäger';
const hunterGeo=value=>/^J\d{3}$/.test(value||'');
export function recoverHunterPeople(s,now=Date.now()){
 const result={created:0,restored:0,updated:0};
 if((s.migrations||[]).some(m=>m.id===hunterPeopleRecoveryId))return result;
 const functions=new Map(s.functions.map(f=>[f.id,f])),groups=new Map(s.groups.map(g=>[g.id,g]));
 const departments=new Map(s.departments.map(d=>[d.id,d]));
 for(const a of s.audit)for(const r of [a.before,a.after])if(r?.id){
  if(a.entity==='functions'&&!s.functions.some(f=>f.id===r.id))functions.set(r.id,r);
  if(a.entity==='groups'&&!s.groups.some(g=>g.id===r.id))groups.set(r.id,r);
  if(a.entity==='departments'&&!s.departments.some(d=>d.id===r.id))departments.set(r.id,r);
 }
 const hunterFunctions=new Set([...functions.values()].filter(hunterName).map(f=>f.id));
 const hunterDepartments=new Set([...departments.values()].filter(hunterName).map(d=>d.id));
 const hunterGroups=new Set([...groups.values()].filter(g=>hunterGeo(g.hunter_geo_id)||hunterDepartments.has(g.department_id)).map(g=>g.id));
 const isHunter=p=>p&&(p.source==='manual'||!p.source)&&(hunterDepartments.has(p.department_id)||personGroupIds(p).some(id=>hunterGroups.has(id))||p.function_regions?.some(r=>hunterFunctions.has(r.function_id)||hunterGeo(r.geo_id)&&!functions.has(r.function_id)));
 const candidates=new Map();
 // Keep the latest known hunter snapshot even when a later edit removed its affiliation.
 for(const a of s.audit)if(a.entity==='person')for(const p of [a.before,a.after])if(isHunter(p)&&p.employee_id)candidates.set(p.employee_id,p);
 for(const p of s.people)if(isHunter(p)&&!candidates.has(p.employee_id))candidates.set(p.employee_id,p);
 for(const p of candidates.values())for(const r of p.function_regions||[])if(hunterGeo(r.geo_id)&&!functions.has(r.function_id)){hunterFunctions.add(r.function_id);functions.set(r.function_id,{id:r.function_id,name:'Jäger',geo_ids:[],covers:{}});}
 let fn=s.functions.find(f=>!f.deleted_at&&hunterName(f));
 if(!candidates.size&&!fn)return result;
 if(!fn){
  const saved=[...functions.values()].find(hunterName);fn={...(saved||{id:id(),name:'Jäger',geo_ids:[],covers:{}})};delete fn.deleted_at;
  const old=s.functions.find(f=>f.id===fn.id);if(old)s.functions[s.functions.indexOf(old)]=fn;else s.functions.push(fn);
  audit(s,'functions','restore',old||null,structuredClone(fn));
 }
 const beforeFn=structuredClone(fn);fn.duty_time_model='always';delete fn.duty_color;
 let department=s.departments.find(d=>!d.deleted_at&&hunterName(d));
 if(candidates.size&&!department){const saved=[...departments.values()].find(hunterName);department={...(saved||{id:id(),name:'Jäger'})};delete department.deleted_at;const old=s.departments.find(d=>d.id===department.id);if(old)s.departments[s.departments.indexOf(old)]=department;else s.departments.push(department);audit(s,'departments','restore',old||null,{...department});}
 const groupForGeo=new Map();
 const ensureGroup=geo=>{
  if(groupForGeo.has(geo))return groupForGeo.get(geo);
  const region=s.regions.find(r=>r.id===geo&&!r.deleted_at);if(!region)return null;
  let group=s.groups.find(g=>!g.deleted_at&&g.department_id===department.id&&g.hunter_geo_id===geo);
  if(!group){const saved=[...groups.values()].find(g=>g.department_id===department.id&&g.hunter_geo_id===geo);group={...(saved||{id:id(),name:geo+' · '+region.name,department_id:department.id,geo_ids:[geo],hunter_geo_id:geo})};delete group.deleted_at;const old=s.groups.find(g=>g.id===group.id);if(old)s.groups[s.groups.indexOf(old)]=group;else s.groups.push(group);audit(s,'groups','restore',old||null,{...group});}
  groupForGeo.set(geo,group.id);return group.id;
 };
 for(const [employeeId,saved] of candidates){
  const previous=s.people.find(p=>p.employee_id===employeeId);if(previous?.source&&previous.source!=='manual')continue;
  const source=previous||saved,p={...source};delete p.deleted_at;
  const rows=(source.function_regions||[]).map(r=>({...r}));
  for(const r of saved.function_regions||[])if(hunterFunctions.has(r.function_id)&&!rows.some(x=>x.function_id===r.function_id&&x.geo_id===r.geo_id))rows.push({...r});
  p.function_regions=rows.filter(r=>r.function_id===fn.id||!hunterFunctions.has(r.function_id)||!rows.some(x=>x.function_id===fn.id&&x.geo_id===r.geo_id)).map(r=>hunterFunctions.has(r.function_id)?{...r,function_id:fn.id}:r).filter((r,i,all)=>all.findIndex(x=>x.function_id===r.function_id&&x.geo_id===r.geo_id)===i);
  const geos=p.function_regions.filter(r=>r.function_id===fn.id&&hunterGeo(r.geo_id)&&s.regions.some(g=>g.id===r.geo_id&&!g.deleted_at)).map(r=>r.geo_id);
  const groupIds=geos.map(ensureGroup).filter(Boolean);
  p.group_ids=[...new Set([...personGroupIds(p),...groupIds])];p.group_id=p.group_ids[0]||null;
  if(!p.department_id||!s.departments.some(d=>d.id===p.department_id&&!d.deleted_at))p.department_id=department.id;
  if(!p.source)p.source='manual';
  fn.geo_ids=[...new Set([...(fn.geo_ids||[]),...geos])];
  if(previous&&JSON.stringify(previous)===JSON.stringify(p))continue;
  if(previous)s.people[s.people.indexOf(previous)]=p;else s.people.push(p);
  result[!previous?'created':previous.deleted_at?'restored':'updated']++;audit(s,'person','restore',previous||null,structuredClone(p));
 }
 if(JSON.stringify(beforeFn)!==JSON.stringify(fn))audit(s,'functions','update',beforeFn,structuredClone(fn));
 s.migrations??=[];s.migrations.push({id:hunterPeopleRecoveryId,at:iso(now),...result});
 return {...result,changed:true};
}
