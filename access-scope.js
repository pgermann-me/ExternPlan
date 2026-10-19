import {personGroupIds,personDepartmentIds,scopeAllows,personScopeAllows} from './public/organization.js';

const dimensions=[['department_ids','department_id','departments'],['group_ids','group_id','groups'],['region_ids','region_id','regions']];
const denied=()=>{const e=Error('Diese Daten liegen ausserhalb Ihrer Berechtigung');e.status=403;throw e;};
// Read old single selections without widening existing account permissions.
export function normalizeAccessScope(input={}){
 const out={};for(const [plural,single] of dimensions){const value=Object.hasOwn(input,plural)?input[plural]:input[single];const ids=Array.isArray(value)?value:value?[value]:[];if(ids.length)out[plural]=[...new Set(ids)];}return out;
}
export const restricted=user=>user?.role!=='admin'&&Object.values(normalizeAccessScope(user?.access_scope)).some(ids=>ids.length);
export function validateAccessScope(s,input,role){
 if(role==='admin')return {};
 input??={};
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!dimensions.some(([plural,single])=>k===plural||k===single)))throw Error('Ungültige Zugriffsbegrenzung');
 for(const [plural,single,type] of dimensions){
  if(Object.hasOwn(input,plural)&&Object.hasOwn(input,single))throw Error('Zugriffsbegrenzung doppelt angegeben');
  const value=Object.hasOwn(input,plural)?input[plural]:input[single];
  if(Object.hasOwn(input,plural)&&!Array.isArray(value))throw Error('Mehrfachauswahl als Liste erforderlich');
  const ids=Array.isArray(value)?value:value==null||value===''?[]:[value];
  if(new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!s[type].some(x=>x.id===id&&!x.deleted_at)))throw Error('Ungültige Zugriffsbegrenzung: '+plural);
 }
 const out=normalizeAccessScope(input),deps=out.department_ids||[],groups=s.groups.filter(g=>out.group_ids?.includes(g.id));
 if(deps.length&&groups.some(g=>!deps.includes(g.department_id)))throw Error('Gruppen müssen zu einer gewählten Abteilung gehören');
 const contexts=groups.length?groups.map(g=>({department_id:g.department_id,group_id:g.id})):deps.length?deps.map(id=>({department_id:id})): [{}];
 for(const id of out.region_ids||[]){const r=s.regions.find(r=>r.id===id);if(!contexts.some(c=>scopeAllows(r,c,s.groups)&&(!c.group_id||!Array.isArray(s.groups.find(g=>g.id===c.group_id)?.geo_ids)||s.groups.find(g=>g.id===c.group_id).geo_ids.includes(id))))throw Error('Region ist für die gewählten Abteilungen oder Gruppen nicht zulässig');}
 return out;
}
// Alternatives within each dimension, intersection across dimensions.
export function accessPolicy(s,user){
 const limited=restricted(user),scope=limited?normalizeAccessScope(user.access_scope):{},deps=scope.department_ids||[],selectedGroups=scope.group_ids||[],selectedRegions=scope.region_ids||[];
 const effectiveDeps=deps.length?deps:selectedGroups.length?[...new Set(s.groups.filter(g=>selectedGroups.includes(g.id)).map(g=>g.department_id))]:[];
 const contexts=selectedGroups.length?s.groups.filter(g=>selectedGroups.includes(g.id)&&(!deps.length||deps.includes(g.department_id))).map(g=>({department_id:g.department_id,group_id:g.id})):effectiveDeps.length?effectiveDeps.map(id=>({department_id:id})): [{}];
 const contextAllows=(r,function_id)=>contexts.some(c=>scopeAllows(r,{...c,function_id},s.groups));
 const groups=s.groups.filter(g=>(!selectedGroups.length||selectedGroups.includes(g.id))&&(!effectiveDeps.length||effectiveDeps.includes(g.department_id))&&(!selectedRegions.length||selectedRegions.some(id=>{const r=s.regions.find(r=>r.id===id);return r&&!r.deleted_at&&(!Array.isArray(g.geo_ids)||g.geo_ids.includes(id))&&scopeAllows(r,{department_id:g.department_id,group_id:g.id},s.groups);} )));
 const groupIds=new Set(groups.map(g=>g.id));
 const departments=s.departments.filter(d=>(!effectiveDeps.length||effectiveDeps.includes(d.id))&&(!selectedRegions.length||selectedRegions.some(id=>{const r=s.regions.find(r=>r.id===id);return r&&scopeAllows(r,{department_id:d.id},s.groups);} )));
 const departmentIds=new Set(departments.map(d=>d.id));
 const personAllowed=p=>{
  if(!p||effectiveDeps.length&&!personDepartmentIds(p,s.groups).some(id=>effectiveDeps.includes(id))||selectedGroups.length&&!personGroupIds(p).some(id=>selectedGroups.includes(id)&&groupIds.has(id)))return false;
  if(!selectedRegions.length)return true;
  const own=groups.filter(g=>!g.deleted_at&&personGroupIds(p).includes(g.id));
  if(personGroupIds(p).length&&!own.length)return false;
  const projected={...p,group_ids:personGroupIds(p).filter(id=>groupIds.has(id)),department_id:departmentIds.has(p.department_id)?p.department_id:null};
  return selectedRegions.some(id=>{const r=s.regions.find(r=>r.id===id);return r&&!r.deleted_at&&(!own.length||own.some(g=>!Array.isArray(g.geo_ids)||g.geo_ids.includes(id)))&&personScopeAllows({...s,groups},{...r,function_ids:[]},projected);});
 };
 const organizationCompatible=r=>(!r.department_ids?.length||r.department_ids.some(id=>departmentIds.has(id)))&&(!r.group_ids?.length||r.group_ids.some(id=>groupIds.has(id)));
 const regions=s.regions.filter(r=>organizationCompatible(r)&&(!selectedRegions.length||selectedRegions.includes(r.id))&&contextAllows(r)&&(!selectedGroups.length||groups.some(g=>!Array.isArray(g.geo_ids)||g.geo_ids.includes(r.id))));
 const regionIds=new Set(regions.map(r=>r.id));
 const targetAllowed=(f,geo)=>{
  const r=geo===null?null:s.regions.find(r=>r.id===geo);
  return contexts.some(c=>scopeAllows(f,c,s.groups)&&(geo===null?!selectedRegions.length:regionIds.has(geo)&&scopeAllows(r,{...c,function_id:f.id},s.groups)&&(!c.group_id||!Array.isArray(s.groups.find(g=>g.id===c.group_id)?.geo_ids)||s.groups.find(g=>g.id===c.group_id).geo_ids.includes(geo))));
 };
 const functions=s.functions.filter(f=>organizationCompatible(f)&&(f.geo_ids.length?f.geo_ids.some(id=>targetAllowed(f,id)):targetAllowed(f,null)));
 const functionIds=new Set(functions.map(f=>f.id));
 const assignmentAllowed=(a,{covering=false}={})=>{
  const p=s.people.find(p=>p.employee_id===a.employee_id),f=s.functions.find(f=>f.id===a.function_id);
  if(!personAllowed(p)||!f||!functionIds.has(f.id))return false;
  const candidates=covering?[a.geodependency,...(f.covers?.[a.geodependency]||[])]:[a.geodependency];
  return candidates.some(geo=>targetAllowed(f,geo));
 };
 const personDeletable=p=>!personGroupIds(p).some(id=>!groupIds.has(id))&&(!p.department_id||departmentIds.has(p.department_id))&&(!selectedRegions.length||personGroupIds(p).length>0&&personGroupIds(p).every(id=>{const g=s.groups.find(g=>g.id===id);return Array.isArray(g?.geo_ids)&&g.geo_ids.every(id=>selectedRegions.includes(id));}))&&!s.assignments.some(a=>a.employee_id===p.employee_id&&!assignmentAllowed(a));
 const projectPerson=p=>{const ids=personGroupIds(p).filter(id=>groupIds.has(id));return {...p,group_ids:ids,group_id:ids[0]||null,department_id:departmentIds.has(p.department_id)?p.department_id:null,access_can_delete:personDeletable(p)};};
 const favoriteAllowed=f=>functionIds.has(f.function_id)&&(f.scope_type!=='group'||groupIds.has(f.scope_id))&&(f.scope_type!=='department'||departmentIds.has(f.scope_id))&&(!selectedRegions.length||f.region_ids?.length>0)&&(f.region_ids||[]).every(id=>targetAllowed(s.functions.find(fn=>fn.id===f.function_id),id));
 return {limited,scope,groups,groupIds,departments,departmentIds,regions,regionIds,functions,functionIds,personAllowed,projectPerson,personDeletable,assignmentAllowed,favoriteAllowed,targetAllowed};
}
export function scopedState(s,user){
 if(!restricted(user))return s;
 const p=accessPolicy(s,user),assignments=s.assignments.filter(a=>p.assignmentAllowed(a,{covering:true})).flatMap(a=>p.assignmentAllowed(a)?[a]:(s.functions.find(f=>f.id===a.function_id)?.covers?.[a.geodependency]||[]).filter(id=>p.assignmentAllowed({...a,geodependency:id})).map(id=>({...a,geodependency:id,access_read_only:true})));
 const assignmentIds=new Set(assignments.map(a=>a.assignment_id));
 const trim=record=>Object.fromEntries(Object.entries(record).map(([k,v])=>[k,k==='department_ids'&&Array.isArray(v)?v.filter(id=>p.departmentIds.has(id)):k==='group_ids'&&Array.isArray(v)?v.filter(id=>p.groupIds.has(id)):k==='function_ids'&&Array.isArray(v)?v.filter(id=>p.functionIds.has(id)):v]));
 return {...s,departments:p.departments,groups:p.groups.map(g=>({...g,...(Array.isArray(g.geo_ids)?{geo_ids:g.geo_ids.filter(id=>p.regionIds.has(id))}:{})})),people:s.people.filter(p.personAllowed).map(p.projectPerson),regions:p.regions.map(trim),functions:p.functions.map(f=>({...trim(f),geo_ids:f.geo_ids.filter(id=>p.targetAllowed(f,id)),covers:Object.fromEntries(Object.entries(f.covers||{}).filter(([id])=>p.regionIds.has(id)).map(([id,parts])=>[id,parts.filter(id=>p.regionIds.has(id))]))})),rules:s.rules.filter(r=>p.functionIds.has(r.function_id)&&(r.geo_id===null||p.regionIds.has(r.geo_id))),favorites:(s.favorites||[]).filter(p.favoriteAllowed).map(trim),assignments,assignment_styles:Object.fromEntries(Object.entries(s.assignment_styles||{}).filter(([id])=>assignmentIds.has(id)).map(([id,style])=>[id,{color:style.color}])),planning_undo:[],audit:[],outbox:[],exports:[],person_exports:[],els:{}};
}
export function assertScopedMutation(before,after,user){
 if(!restricted(user))return;
 const p=accessPolicy(before,user),next=accessPolicy(after,user),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 for(const [type,key,allows] of [['assignments','assignment_id',(r,policy)=>policy.assignmentAllowed(r)],['people','employee_id',(r,policy)=>policy.personAllowed(r)],['favorites','id',(r,policy)=>policy.favoriteAllowed(r)]]){
  const old=new Map((before[type]||[]).map(r=>[r[key],r])),now=new Map((after[type]||[]).map(r=>[r[key],r]));
  for(const id of new Set([...old.keys(),...now.keys()])){const a=old.get(id),b=now.get(id);if(same(a,b))continue;
   if(type==='favorites'&&a&&b&&same({...a,sort_order:0},{...b,sort_order:0}))continue;
   if(a&&!allows(a,p)||b&&!allows(b,next))denied();
   if(type==='people'){
    if(a&&!a.deleted_at&&b?.deleted_at){if(!p.personDeletable(a))denied();}
    if(b&&personGroupIds(b).some(id=>!p.groupIds.has(id)&&!personGroupIds(a).includes(id)))denied();
   }
  }
 }
}
export function scopedPersonInput(s,user,input,previous){
 if(!restricted(user))return input;
 const p=accessPolicy(s,user);if(previous&&!p.personAllowed(previous))denied();
 const ids=input.group_ids??(input.group_id?[input.group_id]:[]);
 if(!Array.isArray(ids)||ids.some(id=>!p.groupIds.has(id)))denied();
 if(input.department_id&&!p.departmentIds.has(input.department_id))denied();
 const hidden=personGroupIds(previous).filter(id=>!p.groupIds.has(id));
 return {...input,group_ids:[...new Set([...ids,...hidden])],department_id:input.department_id||(!p.departmentIds.has(previous?.department_id)?previous?.department_id:null)||null};
}
export function assertFavoriteAccess(s,user,key,input){
 if(!restricted(user))return;
 const p=accessPolicy(s,user),f=(s.favorites||[]).find(f=>f.id===key);
 if(!f||!p.favoriteAllowed(f)||!p.personAllowed(s.people.find(p=>p.employee_id===input.employee_id)))denied();
 for(const [key,ids] of [['planning_department_id',p.departmentIds],['planning_group_id',p.groupIds]])if(input[key]&&!ids.has(input[key]))denied();
}
export function scopedFavoriteOrder(s,user,ids,expected){
 if(!restricted(user))return {ids,expected};
 const p=accessPolicy(s,user),current=(s.favorites||[]).map((f,i)=>({f,i})).filter(x=>!x.f.deleted_at).sort((a,b)=>(a.f.sort_order??a.i)-(b.f.sort_order??b.i)||a.i-b.i).map(x=>x.f);
 const visible=current.filter(p.favoriteAllowed).map(f=>f.id);
 if(!Array.isArray(ids)||!Array.isArray(expected)||JSON.stringify(expected)!==JSON.stringify(visible)||ids.length!==visible.length||new Set(ids).size!==ids.length||ids.some(id=>!visible.includes(id)))denied();
 let index=0;return {ids:current.map(f=>p.favoriteAllowed(f)?ids[index++]:f.id),expected:current.map(f=>f.id)};
}
