import {withRegionGroups} from './region-groups.js';
import {personScopeAllows} from './organization.js';
export function personAffiliationProblem(state,person,row){
 const s=withRegionGroups(state),fn=s.functions.find(f=>f.id===row.function_id&&!f.deleted_at),region=s.regions.find(r=>r.id===row.geo_id&&!r.deleted_at);
 if(!fn)return 'Die gewählte Funktion ist nicht mehr verfügbar. Bitte neu laden.';
 if(!personScopeAllows(s,fn,person,fn.id))return `Die Funktion „${fn.name}“ ist für die gewählte Abteilung oder Gruppe nicht freigegeben. Bitte die Einschränkungen der Funktion prüfen.`;
 if(fn.region_group_ids?.length&&!fn.geo_ids.length)return 'Die Gebietsgruppen der Funktion enthalten noch keine Gebiete.';
 if(!fn.geo_ids.length)return row.geo_id===null?null:`Die Funktion „${fn.name}“ ist ortsunabhängig und erlaubt keine Gebietszuordnung.`;
 if(!region)return 'Das gewählte Gebiet ist nicht mehr verfügbar. Bitte neu laden.';
 if(!fn.geo_ids.includes(row.geo_id))return `Das Gebiet „${region.name}“ ist der Funktion „${fn.name}“ nicht zugeordnet. Bitte die Gebiete bzw. Gebietsgruppen der Funktion prüfen.`;
 if(!personScopeAllows(s,region,person,fn.id))return `Das Gebiet „${region.name}“ ist für die gewählte Abteilung, Gruppe oder Funktion nicht freigegeben. Bitte die Einschränkungen des Gebiets und seiner Gebietsgruppen prüfen.`;
 return null;
}
export function alwaysPersonContextProblem(state,functionId,geoId,departmentId,groupId){
 state=withRegionGroups(state);
 const group=groupId?state.groups.find(g=>g.id===groupId&&!g.deleted_at):null;
 if(groupId&&!group)return 'Die gewählte Gruppe ist nicht mehr verfügbar.';
 if(group&&departmentId&&group.department_id!==departmentId)return 'Die Gruppe gehört nicht zur gewählten Abteilung.';
 const problem=personAffiliationProblem(state,{department_id:departmentId||group?.department_id||null,group_ids:group?[group.id]:[]},{function_id:functionId,geo_id:geoId});
 if(problem)return problem;
 if(group&&geoId!==null&&Array.isArray(group.geo_ids)&&!group.geo_ids.includes(geoId))return 'Das gewählte Gebiet ist für diese Gruppe nicht freigegeben. Bitte die Regionen bzw. Gebietsgruppen der Gruppe prüfen.';
 return null;
}
export function eligibleAlwaysPersonGroups(state,functionId,geoId,departmentId){
 state=withRegionGroups(state);
 return state.groups.filter(g=>!g.deleted_at&&(!departmentId||g.department_id===departmentId)&&!alwaysPersonContextProblem(state,functionId,geoId,departmentId,g.id));
}
