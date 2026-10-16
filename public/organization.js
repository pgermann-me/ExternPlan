export const personGroupIds=p=>Array.isArray(p?.group_ids)?p.group_ids:(p?.group_id?[p.group_id]:[]);
export const personDepartmentIds=(p,groups)=>[...new Set([p.department_id,...groups.filter(g=>!g.deleted_at&&personGroupIds(p).includes(g.id)).map(g=>g.department_id)].filter(Boolean))];
export const allowedFunctionRegions=(fn,group,regions,departmentId,groups=[])=>fn.geo_ids.filter(id=>regions.some(r=>r.id===id&&!r.deleted_at&&scopeAllows(r,{group_id:group?.id,department_id:departmentId||group?.department_id,function_id:fn.id},groups.length?groups:group?[group]:[]))&&(!Array.isArray(group?.geo_ids)||group.geo_ids.includes(id)));
export function planningPeople(s,groupId,departmentId){
 const group=s.groups.find(g=>g.id===groupId&&!g.deleted_at);
 if(groupId&&!group)throw Error('Gruppe unbekannt');
 if(departmentId&&!s.departments.some(d=>d.id===departmentId&&!d.deleted_at))throw Error('Abteilung unbekannt');
 if(group&&departmentId&&group.department_id!==departmentId)throw Error('Gruppe gehört nicht zur gewählten Abteilung');
 return s.people.filter(p=>(!groupId&&!departmentId||!p.deleted_at)&&(!groupId||personGroupIds(p).includes(groupId))&&(!departmentId||personDepartmentIds(p,s.groups).includes(departmentId)));
}
// Function affiliations come from duties across all months, as on person records.
export function controlFunctions(s,groupId,departmentId){
 const active=availableFunctions(s,groupId,departmentId);
 if(!groupId&&!departmentId)return active;
 const members=new Set(planningPeople(s,groupId,departmentId).map(p=>p.employee_id));
 const functions=new Set(s.assignments.filter(a=>members.has(a.employee_id)).map(a=>a.function_id));
 return active.filter(f=>functions.has(f.id)||f.department_ids?.length||f.group_ids?.length);
}
export function validatePlanningGroup(s,input){
 const context={department_id:input.planning_department_id,group_id:input.planning_group_id,function_id:input.function_id};
 const fnRecord=s.functions.find(f=>f.id===input.function_id);
 if(fnRecord&&!scopeAllows(fnRecord,context,s.groups))throw Error('Funktion ist für die gewählte Abteilung oder Gruppe nicht zulässig');
 for(const id of input.region_ids??(input.geodependency?[input.geodependency]:[])){const r=s.regions.find(r=>r.id===id);if(r&&!scopeAllows(r,context,s.groups))throw Error('Gebiet ist für die gewählte Abteilung, Gruppe oder Funktion nicht zulässig');}

 if(input.planning_department_id&&!planningPeople(s,input.planning_group_id,input.planning_department_id).some(p=>p.employee_id===input.employee_id))throw Error('Person gehört nicht zur gewählten Abteilung');
 if(!input.planning_group_id)return;
 const group=s.groups.find(g=>g.id===input.planning_group_id&&!g.deleted_at);
 const person=s.people.find(p=>p.employee_id===input.employee_id&&!p.deleted_at);
 if(!group||!person||!personGroupIds(person).includes(group.id))throw Error('Person gehört nicht zur gewählten Gruppe');
 const fn=s.functions.find(f=>f.id===input.function_id&&!f.deleted_at);
 const regions=input.region_ids??(input.geodependency?[input.geodependency]:[]);
 if(!fn||regions.some(id=>!allowedFunctionRegions(fn,group,s.regions).includes(id)))throw Error('Region ist für Funktion und Gruppe nicht zulässig');
}
// Missing or empty restrictions mean unrestricted. All configured dimensions apply.
export function scopeAllows(record,{department_id,group_id,function_id}={},groups=[]){
 const dep=department_id||groups.find(g=>g.id===group_id)?.department_id;
 if(record.department_ids?.length&&dep&&!record.department_ids.includes(dep))return false;
 if(record.group_ids?.length&&group_id&&!record.group_ids.includes(group_id))return false;
 if(record.group_ids?.length&&dep&&!record.group_ids.some(id=>groups.some(g=>g.id===id&&g.department_id===dep&&!g.deleted_at)))return false;
 if(record.function_ids?.length&&function_id&&!record.function_ids.includes(function_id))return false;
 return true;
}
export function personScopeAllows(s,record,p,functionId){
 if(!record)return false;
 if(record.function_ids?.length&&!record.function_ids.includes(functionId))return false;
 const groups=s.groups.filter(g=>!g.deleted_at&&personGroupIds(p).includes(g.id));
 if(record.group_ids?.length)return groups.some(g=>record.group_ids.includes(g.id)&&(!record.department_ids?.length||record.department_ids.includes(g.department_id)));
 return !record.department_ids?.length||personDepartmentIds(p,s.groups).some(id=>record.department_ids.includes(id));
}
export function availableFunctions(s,groupId,departmentId){return s.functions.filter(f=>!f.deleted_at&&scopeAllows(f,{group_id:groupId,department_id:departmentId},s.groups));}
export function validateScopeRestrictions(s,type,p){
 for(const [key,collection] of [['department_ids','departments'],['group_ids','groups'],...(type==='regions'?[['function_ids','functions']]:[])]){
  if(p[key]!=null&&(!Array.isArray(p[key])||new Set(p[key]).size!==p[key].length||p[key].some(id=>!s[collection].some(x=>x.id===id&&!x.deleted_at))))throw Error('Ungültige Einschränkung: '+key);
 }
 if(p.department_ids?.length&&p.group_ids?.some(id=>!s.groups.some(g=>g.id===id&&p.department_ids.includes(g.department_id))))throw Error('Gruppen müssen zu einer ausgewählten Abteilung gehören');
}
