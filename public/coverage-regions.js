// Only coverage calculations may expand a whole region into its configured parts.
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
