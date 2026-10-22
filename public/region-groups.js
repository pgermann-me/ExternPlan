// Resolve group membership per request; stored region/function identifiers remain unchanged.
const resolved=Symbol('regionGroupsResolved');
export const regionGroupIds=region=>region.region_group_ids||(region.region_group_id?[region.region_group_id]:[]);
export function withRegionGroups(state){
 if(state[resolved])return state;
 const groups=(state.region_groups||[]).filter(g=>!g.deleted_at);
 if(!groups.length)return state;
 const byId=new Map(groups.map(g=>[g.id,g])),members=new Map(groups.map(g=>[g.id,[]]));
 const regions=state.regions.map(r=>{
  const affiliations=regionGroupIds(r).map(id=>byId.get(id)).filter(Boolean);if(!affiliations.length||r.deleted_at)return r;
  for(const group of affiliations)members.get(group.id).push(r.id);
  return {...r,region_group_scopes:affiliations.map(group=>({department_ids:group.department_ids||[],group_ids:group.group_ids||[],function_ids:group.function_ids||[]}))};
 });
 const assigned=(key,id)=>groups.filter(g=>g[key]?.includes(id)).flatMap(g=>members.get(g.id));
 const functions=state.functions.map(f=>{
  const ids=assigned('function_ids',f.id);return ids.length?{...f,configured_geo_ids:f.geo_ids,geo_ids:[...new Set([...f.geo_ids,...ids])]}:f;
 });
 const organizationGroups=state.groups.map(g=>{
  const assignedGroups=groups.filter(rg=>rg.group_ids?.includes(g.id));if(!assignedGroups.length)return g;
  return {...g,configured_geo_ids:g.geo_ids??null,geo_ids:[...new Set([...(g.geo_ids||[]),...assigned('group_ids',g.id)])]};
 });
 return {...state,regions,functions,groups:organizationGroups,[resolved]:true};
}
