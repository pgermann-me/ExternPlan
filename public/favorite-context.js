import {personGroupIds,personDepartmentIds,allowedFunctionRegions} from './organization.js';
// All preset regions must fit: applying a preset never silently drops regions.
export function favoriteMatchesContext(state,f,context){
 const fn=state.functions.find(x=>x.id===f.function_id&&!x.deleted_at);
 if(f.deleted_at||!fn||fn.id!==context.function_id)return false;
 const group=state.groups.find(g=>g.id===context.group_id&&!g.deleted_at);
 if(context.group_id&&!group)return false;
 const collections={function:'functions',group:'groups',department:'departments'};
 if(!state[collections[f.scope_type]]?.some(x=>x.id===f.scope_id&&!x.deleted_at))return false;
 const ownerGroup=f.scope_type==='group'?state.groups.find(g=>g.id===f.scope_id):null;
 if(context.department_id&&(f.scope_type==='department'&&f.scope_id!==context.department_id||ownerGroup&&ownerGroup.department_id!==context.department_id))return false;
 if(fn.geo_ids.length){
  if(!f.region_ids.length||!f.region_ids.every(id=>context.region_ids.includes(id)&&allowedFunctionRegions(fn,group,state.regions).includes(id)&&allowedFunctionRegions(fn,ownerGroup,state.regions).includes(id)))return false;
 }else if(f.region_ids.length)return false;
 if(f.scope_type==='function')return f.scope_id===fn.id;
 if(group)return f.scope_type==='group'?f.scope_id===group.id:f.scope_id===group.department_id;
 const people=state.people.filter(p=>context.employee_ids.includes(p.employee_id));
 return people.some(p=>f.scope_type==='group'?personGroupIds(p).includes(f.scope_id):personDepartmentIds(p,state.groups).includes(f.scope_id));
}
