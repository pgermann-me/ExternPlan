import {personGroupIds,personDepartmentIds,scopeAllows,personScopeAllows} from './public/organization.js';

const keys=['department_id','group_id','region_id'];
const denied=()=>{const e=Error('Diese Daten liegen ausserhalb Ihrer Berechtigung');e.status=403;throw e;};
export const restricted=user=>user?.role!=='admin'&&keys.some(k=>user?.access_scope?.[k]);
export function validateAccessScope(s,input,role){
 if(role==='admin')return {};
 if(input==null)input={};
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw Error('Ungültige Zugriffsbegrenzung');
 const out={};for(const [key,type] of [['department_id','departments'],['group_id','groups'],['region_id','regions']]){
  const id=input[key];if(id===null||id===undefined||id==='')continue;
  if(typeof id!=='string'||!s[type].some(x=>x.id===id&&!x.deleted_at))throw Error('Ungültige Zugriffsbegrenzung: '+key);out[key]=id;
 }
 const group=s.groups.find(g=>g.id===out.group_id);
 if(group&&out.department_id&&group.department_id!==out.department_id)throw Error('Gruppe gehört nicht zur gewählten Abteilung');
 if(out.region_id&&group&&Array.isArray(group.geo_ids)&&!group.geo_ids.includes(out.region_id))throw Error('Region ist für die Gruppe nicht zulässig');
 const region=s.regions.find(r=>r.id===out.region_id);
 if(region&&!scopeAllows(region,out,s.groups))throw Error('Region ist für die Abteilung oder Gruppe nicht zulässig');
 return out;
}
// Build the policy from the full state. Never infer permission from client filters.
export function accessPolicy(s,user){
 const limited=restricted(user),scope=limited?user.access_scope:{},dep=scope.department_id||s.groups.find(g=>g.id===scope.group_id)?.department_id;
 const context={department_id:dep,group_id:scope.group_id};
 const regionContext=r=>scopeAllows(r,context,s.groups);
 const groups=s.groups.filter(g=>(!scope.group_id||g.id===scope.group_id)&&(!dep||g.department_id===dep)&&(!scope.region_id||(!Array.isArray(g.geo_ids)||g.geo_ids.includes(scope.region_id))&&scopeAllows(s.regions.find(r=>r.id===scope.region_id)||{},{department_id:g.department_id,group_id:g.id},s.groups)));
 const groupIds=new Set(groups.map(g=>g.id));
 const departments=s.departments.filter(d=>(!dep||d.id===dep)&&(!scope.region_id||regionContext(s.regions.find(r=>r.id===scope.region_id)||{})&&(!(s.regions.find(r=>r.id===scope.region_id)?.department_ids?.length)||s.regions.find(r=>r.id===scope.region_id).department_ids.includes(d.id))));
 const departmentIds=new Set(departments.map(d=>d.id));
 const projectPerson=p=>{const ids=personGroupIds(p).filter(id=>groupIds.has(id));return {...p,group_ids:ids,group_id:ids[0]||null,department_id:departmentIds.has(p.department_id)?p.department_id:null,access_can_delete:personDeletable(p)};};
 const personAllowed=p=>{
  if(!p)return false;
  if(dep&&!personDepartmentIds(p,s.groups).includes(dep)||scope.group_id&&!personGroupIds(p).includes(scope.group_id))return false;
  if(!scope.region_id)return true;
  const r=s.regions.find(r=>r.id===scope.region_id);if(!r||r.deleted_at)return false;
  const own=s.groups.filter(g=>!g.deleted_at&&personGroupIds(p).includes(g.id)&&groupIds.has(g.id));
  if(personGroupIds(p).length&&!own.length)return false;
  if(own.length&&!own.some(g=>!Array.isArray(g.geo_ids)||g.geo_ids.includes(r.id)))return false;
  const projected={...p,group_ids:personGroupIds(p).filter(id=>groupIds.has(id)),department_id:departmentIds.has(p.department_id)?p.department_id:null};return personScopeAllows({...s,groups}, {...r,function_ids:[]},projected);
 };
 const organizationCompatible=r=>(!r.department_ids?.length||r.department_ids.some(id=>departmentIds.has(id)))&&(!r.group_ids?.length||r.group_ids.some(id=>groupIds.has(id)));
 const regions=s.regions.filter(r=>organizationCompatible(r)&&(!scope.region_id||r.id===scope.region_id)&&regionContext(r)&&(!scope.group_id||!Array.isArray(groups[0]?.geo_ids)||groups[0].geo_ids.includes(r.id)));
 const regionIds=new Set(regions.map(r=>r.id));
 const functions=s.functions.filter(f=>organizationCompatible(f)&&scopeAllows(f,context,s.groups)&&(f.geo_ids.length?f.geo_ids.some(id=>regionIds.has(id)&&scopeAllows(s.regions.find(r=>r.id===id)||{}, {...context,function_id:f.id},s.groups)):!scope.region_id));
 const functionIds=new Set(functions.map(f=>f.id));
 const assignmentAllowed=(a,{covering=false}={})=>{
  const p=s.people.find(p=>p.employee_id===a.employee_id),f=s.functions.find(f=>f.id===a.function_id);
  if(!personAllowed(p)||!f||!functionIds.has(f.id))return false;
  if(a.geodependency===null)return !scope.region_id;
  const candidates=covering?[a.geodependency,...(f.covers?.[a.geodependency]||[])]:[a.geodependency];
  return candidates.some(geo=>regionIds.has(geo)&&scopeAllows(s.regions.find(r=>r.id===geo)||{}, {...context,function_id:f.id},s.groups));
 };
 const personDeletable=p=>!personGroupIds(p).some(id=>!groupIds.has(id))&&(!p.department_id||departmentIds.has(p.department_id))&&(!scope.region_id||personGroupIds(p).length>0&&personGroupIds(p).every(id=>{const g=s.groups.find(g=>g.id===id);return Array.isArray(g?.geo_ids)&&g.geo_ids.every(id=>id===scope.region_id);}))&&!s.assignments.some(a=>a.employee_id===p.employee_id&&!assignmentAllowed(a));
 const favoriteAllowed=f=>functionIds.has(f.function_id)&&(f.scope_type!=='group'||groupIds.has(f.scope_id))&&(f.scope_type!=='department'||departmentIds.has(f.scope_id))&&(!scope.region_id||f.region_ids?.length>0)&&(f.region_ids||[]).every(id=>regionIds.has(id)&&scopeAllows(s.regions.find(r=>r.id===id)||{}, {...context,function_id:f.function_id},s.groups));
 return {limited,scope,groups,groupIds,departments,departmentIds,regions,regionIds,functions,functionIds,personAllowed,projectPerson,personDeletable,assignmentAllowed,favoriteAllowed};
}
export function scopedState(s,user){
 if(!restricted(user))return s;
 const p=accessPolicy(s,user),assignments=s.assignments.filter(a=>p.assignmentAllowed(a,{covering:true})).flatMap(a=>p.assignmentAllowed(a)?[a]:(s.functions.find(f=>f.id===a.function_id)?.covers?.[a.geodependency]||[]).filter(id=>p.assignmentAllowed({...a,geodependency:id})).map(id=>({...a,geodependency:id,access_read_only:true})));
 const assignmentIds=new Set(assignments.map(a=>a.assignment_id));
 const trim=record=>Object.fromEntries(Object.entries(record).map(([k,v])=>[k,k==='department_ids'&&Array.isArray(v)?v.filter(id=>p.departmentIds.has(id)):k==='group_ids'&&Array.isArray(v)?v.filter(id=>p.groupIds.has(id)):k==='function_ids'&&Array.isArray(v)?v.filter(id=>p.functionIds.has(id)):v]));
 return {...s,departments:p.departments,groups:p.groups.map(g=>({...g,...(Array.isArray(g.geo_ids)?{geo_ids:g.geo_ids.filter(id=>p.regionIds.has(id))}:{})})),people:s.people.filter(p.personAllowed).map(p.projectPerson),regions:p.regions.map(trim),functions:p.functions.map(f=>({...trim(f),geo_ids:f.geo_ids.filter(id=>p.regionIds.has(id)&&scopeAllows(s.regions.find(r=>r.id===id)||{},{department_id:p.scope.department_id,group_id:p.scope.group_id,function_id:f.id},s.groups)),covers:Object.fromEntries(Object.entries(f.covers||{}).filter(([id])=>p.regionIds.has(id)).map(([id,parts])=>[id,parts.filter(id=>p.regionIds.has(id))]))})),rules:s.rules.filter(r=>p.functionIds.has(r.function_id)&&(r.geo_id===null||p.regionIds.has(r.geo_id))),favorites:(s.favorites||[]).filter(p.favoriteAllowed).map(trim),assignments,assignment_styles:Object.fromEntries(Object.entries(s.assignment_styles||{}).filter(([id])=>assignmentIds.has(id)).map(([id,style])=>[id,{color:style.color}])),planning_undo:[],audit:[],outbox:[],exports:[],person_exports:[],els:{}};
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
