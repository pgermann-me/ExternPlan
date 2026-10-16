export const personGroupIds=p=>Array.isArray(p?.group_ids)?p.group_ids:(p?.group_id?[p.group_id]:[]);
export const personDepartmentIds=(p,groups)=>[...new Set([p.department_id,...groups.filter(g=>!g.deleted_at&&personGroupIds(p).includes(g.id)).map(g=>g.department_id)].filter(Boolean))];
export const allowedFunctionRegions=(fn,group,regions)=>fn.geo_ids.filter(id=>regions.some(r=>r.id===id&&!r.deleted_at)&&(!Array.isArray(group?.geo_ids)||group.geo_ids.includes(id)));
export function planningPeople(s,groupId,departmentId){
 const group=s.groups.find(g=>g.id===groupId&&!g.deleted_at);
 if(groupId&&!group)throw Error('Gruppe unbekannt');
 if(departmentId&&!s.departments.some(d=>d.id===departmentId&&!d.deleted_at))throw Error('Abteilung unbekannt');
 if(group&&departmentId&&group.department_id!==departmentId)throw Error('Gruppe gehört nicht zur gewählten Abteilung');
 return s.people.filter(p=>(!groupId&&!departmentId||!p.deleted_at)&&(!groupId||personGroupIds(p).includes(groupId))&&(!departmentId||personDepartmentIds(p,s.groups).includes(departmentId)));
}
export function validatePlanningGroup(s,input){
 if(input.planning_department_id&&!planningPeople(s,input.planning_group_id,input.planning_department_id).some(p=>p.employee_id===input.employee_id))throw Error('Person gehört nicht zur gewählten Abteilung');
 if(!input.planning_group_id)return;
 const group=s.groups.find(g=>g.id===input.planning_group_id&&!g.deleted_at);
 const person=s.people.find(p=>p.employee_id===input.employee_id&&!p.deleted_at);
 if(!group||!person||!personGroupIds(person).includes(group.id))throw Error('Person gehört nicht zur gewählten Gruppe');
 const fn=s.functions.find(f=>f.id===input.function_id&&!f.deleted_at);
 const regions=input.region_ids??(input.geodependency?[input.geodependency]:[]);
 if(!fn||regions.some(id=>!allowedFunctionRegions(fn,group,s.regions).includes(id)))throw Error('Region ist für Funktion und Gruppe nicht zulässig');
}
