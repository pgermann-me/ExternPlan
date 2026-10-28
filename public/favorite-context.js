import {personGroupIds,personDepartmentIds,allowedFunctionRegions,scopeAllows,personScopeAllows} from './organization.js';
import {withRegionGroups,regionGroupIds} from './region-groups.js';
// Keep one explanation for both the planning filter and its unavailable-favorites panel.
export function favoriteContextProblem(state,f,context){
 state=withRegionGroups(state);
 const fn=state.functions.find(x=>x.id===f.function_id&&!x.deleted_at);
 if(f.deleted_at)return 'Der Favorit wurde gelöscht.';
 if(!fn)return 'Die Funktion des Favoriten ist nicht mehr verfügbar.';
 if(context.function_id&&fn.id!==context.function_id)return 'Eine andere Funktion ist ausgewählt.';
 if(fn.region_group_ids?.length&&!fn.geo_ids.length)return 'Die Gebietsgruppen der Funktion enthalten noch keine Gebiete.';
 if(fn.duty_time_model==='always')return 'Immer-Funktionen werden über dauerhafte Zuordnungen geplant.';
 if(!scopeAllows(fn,context,state.groups))return `Die Funktion „${fn.name}“ ist für die gewählte Abteilung oder Gruppe nicht freigegeben. Einschränkungen unter Stammdaten → Funktionen prüfen.`;
 const group=state.groups.find(g=>g.id===context.group_id&&!g.deleted_at);
 if(context.group_id&&!group)return 'Die gewählte Gruppe ist nicht mehr verfügbar.';
 const collections={function:'functions',group:'groups',department:'departments'},owner=state[collections[f.scope_type]]?.find(x=>x.id===f.scope_id&&!x.deleted_at);
 if(!owner)return 'Der bisherige Geltungsbereich des Favoriten ist nicht mehr verfügbar. Favorit bearbeiten und der Funktion zuordnen.';
 const ownerGroup=f.scope_type==='group'?owner:null;
 if(context.department_id&&(f.scope_type==='department'&&f.scope_id!==context.department_id||ownerGroup&&ownerGroup.department_id!==context.department_id))return `Der Favorit ist noch an ${f.scope_type==='department'?'die Abteilung':'die Gruppe'} „${owner.name}“ gebunden und passt nicht zur gewählten Abteilung. Geltungsbereich im Favoriten prüfen.`;
 if(fn.geo_ids.length){
  if(!f.region_ids.length)return `Die Funktion „${fn.name}“ ist gebietsabhängig, aber im Favoriten sind keine Regionen hinterlegt. Favorit bearbeiten und Regionen wählen.`;
  for(const id of f.region_ids){
   const region=state.regions.find(r=>r.id===id&&!r.deleted_at);
   if(!region||!fn.geo_ids.includes(id))return `Die Region „${region?.name||id}“ ist der Funktion nicht mehr zugeordnet. Regionen im Favoriten prüfen.`;
   if(!allowedFunctionRegions(fn,group,state.regions,context.department_id,state.groups).includes(id)){
    const names=regionGroupIds(region).map(key=>state.region_groups?.find(g=>g.id===key)?.name).filter(Boolean);
    return `Die Region „${region.name}“ ist für die gewählte Abteilung, Gruppe oder Funktion nicht freigegeben.${names.length?' Gebietsgruppen: '+names.join(', ')+'.':''} Freigaben am Gebiet, an seinen Gebietsgruppen und an der gewählten Gruppe prüfen.`;
   }
   if(!(context.region_ids||[]).includes(id))return `Die Region „${region.name}“ ist im Planungsfilter nicht ausgewählt. Alle Regionen des Favoriten müssen ausgewählt sein.`;
   if(ownerGroup&&!allowedFunctionRegions(fn,ownerGroup,state.regions,ownerGroup.department_id,state.groups).includes(id))return `Die Region „${region.name}“ ist für die bisherige Favoritengruppe „${ownerGroup.name}“ nicht freigegeben.`;
  }
 }else if(f.region_ids.length)return 'Die Funktion ist ortsunabhängig, aber im Favoriten sind Regionen hinterlegt. Funktion und Regionen prüfen.';
 if(f.scope_type==='function')return f.scope_id===fn.id?null:'Der Favorit ist einer anderen Funktion zugeordnet.';
 if(group)return (f.scope_type==='group'?f.scope_id===group.id:f.scope_id===group.department_id)?null:`Der Favorit ist noch an ${f.scope_type==='group'?'die Gruppe':'die Abteilung'} „${owner.name}“ gebunden und passt nicht zur gewählten Gruppe.`;
 const people=state.people.filter(p=>(context.employee_ids||[]).includes(p.employee_id)&&personScopeAllows(state,fn,p,fn.id)&&f.region_ids.every(id=>personScopeAllows(state,state.regions.find(r=>r.id===id),p,fn.id)));
 return people.some(p=>f.scope_type==='group'?personGroupIds(p).includes(f.scope_id):personDepartmentIds(p,state.groups).includes(f.scope_id))?null:`Keine angezeigte Person gehört zum bisherigen Favoritenbereich „${owner.name}“.`;
}
// Applying a preset never silently drops any of its configured regions.
export const favoriteMatchesContext=(state,f,context)=>!favoriteContextProblem(state,f,context);
// Definition filters match configured scopes; no planned services or assigned people are required.
export function favoriteDefinitionMatches(state,f,context={}){
 if(f.deleted_at||context.function_id&&f.function_id!==context.function_id)return false;
 if(context.region_ids?.length&&!f.region_ids.some(id=>context.region_ids.includes(id)))return false;
 if(!context.department_id&&!context.group_id)return true;
 const fn=state.functions.find(fn=>fn.id===f.function_id&&!fn.deleted_at),group=state.groups.find(g=>g.id===context.group_id&&!g.deleted_at);
 if(!fn||context.group_id&&!group||!scopeAllows(fn,context,state.groups))return false;
 const department=context.department_id||group?.department_id;
 if(f.scope_type==='department'&&department&&f.scope_id!==department)return false;
 if(f.scope_type==='group'){
  const owner=state.groups.find(g=>g.id===f.scope_id&&!g.deleted_at);
  if(!owner||group&&owner.id!==group.id||department&&owner.department_id!==department)return false;
 }
 return f.region_ids.every(id=>allowedFunctionRegions(fn,group,state.regions,department,state.groups).includes(id));
}
