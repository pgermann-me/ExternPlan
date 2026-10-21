export const regionScopeFields=['department_ids','group_ids','function_ids'];
export const scopeSnapshot=region=>({id:region.id,...Object.fromEntries(regionScopeFields.map(key=>[key,[...(region[key]||[])].sort()]))});
export function changedScope(current,change){
 if(!change||change.mode==='keep')return [...(current||[])];
 if(change.mode==='clear')return [];
 if(change.mode==='add')return [...new Set([...(current||[]),...change.ids])];
 return [...change.ids];
}
