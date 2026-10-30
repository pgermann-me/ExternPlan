import {withRegionGroups} from './region-groups.js';
import {allowedFunctionRegions,scopeAllows} from './organization.js';
export function statisticsRegions(state,{function_id,department_id,group_id}={}){
 const s=withRegionGroups({...state,functions:[...state.functions,...(state.archived_master?.functions||[])]});
 const group=s.groups.find(g=>g.id===group_id&&!g.deleted_at);if(group_id&&!group)return [];
 const functions=s.functions.filter(f=>f.duty_time_model!=='always'&&(!function_id||f.id===function_id)&&scopeAllows(f,{department_id,group_id},s.groups));
 const ids=new Set(functions.flatMap(fn=>allowedFunctionRegions(fn,group,s.regions,department_id,s.groups)));
 return s.regions.filter(r=>!r.deleted_at&&ids.has(r.id)).sort((a,b)=>(a.name||a.id).localeCompare(b.name||b.id,'de-CH'));
}
