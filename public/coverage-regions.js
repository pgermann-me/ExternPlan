// Only coverage calculations expand a whole-region duty into its configured parts.
export function coveredRegionIds(state,functionId,geoId){
 const byId=new Map(state.regions.map(r=>[r.id,r])),legacy=state.functions.find(f=>f.id===functionId)?.covers||{},result=new Set(),visited=new Set([geoId]);
 const visit=id=>{const region=byId.get(id),parts=region&&Object.hasOwn(region,'covered_region_ids')?region.covered_region_ids:legacy[id]||[];for(const part of parts){if(visited.has(part)||byId.get(part)?.deleted_at)continue;visited.add(part);result.add(part);visit(part);}};
 visit(geoId);return [...result];
}
export function validateRegionCoverage(state,region){
 const ids=region.covered_region_ids||[];
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||id===region.id||!state.regions.some(r=>r.id===id&&!r.deleted_at)))throw Error('Teilgebiete müssen eindeutige bestehende Gebiete sein; ein Gebiet kann sich nicht selbst abdecken');
 const regions=state.regions.filter(r=>r.id!==region.id).concat(region),byId=new Map(regions.map(r=>[r.id,r.covered_region_ids||[]]));
 const visiting=new Set(),done=new Set();
 const visit=id=>{if(visiting.has(id))throw Error('Gesamt- und Teilgebiete dürfen keinen Kreis bilden');if(done.has(id))return;visiting.add(id);for(const part of byId.get(id)||[])visit(part);visiting.delete(id);done.add(id);};
 for(const id of byId.keys())visit(id);
}

// Broaden only the explicit planning filter, never a duty's assigned region.
export function regionIdsWithParents(state,functionId,geoId){
 if(!geoId)return [];
 const regions=state.regions.filter(r=>!r.deleted_at),active=new Set(regions.map(r=>r.id));
 if(!active.has(geoId))return [];
 const legacy=state.functions.find(f=>f.id===functionId)?.covers||{},parents=new Map();
 for(const region of regions)for(const part of Object.hasOwn(region,'covered_region_ids')?region.covered_region_ids:legacy[region.id]||[]){
  if(!active.has(part))continue;
  if(!parents.has(part))parents.set(part,[]);parents.get(part).push(region.id);
 }
 const result=new Set([geoId]),queue=[geoId];
 for(let index=0;index<queue.length;index++)for(const id of parents.get(queue[index])||[])if(!result.has(id)){result.add(id);queue.push(id);}
 return [...result];
}

// A parent row is redundant only when the filtered control view contains a
// descendant of the same function. Keep it when no permitted child row is shown.
export function controlRowsWithoutParents(state,rows){
 const regionsByFunction=new Map();
 for(const row of rows){if(!regionsByFunction.has(row.function_id))regionsByFunction.set(row.function_id,new Set());regionsByFunction.get(row.function_id).add(row.geo_id);}
 return rows.filter(row=>!row.geo_id||!coveredRegionIds(state,row.function_id,row.geo_id).some(id=>regionsByFunction.get(row.function_id).has(id)));
}
