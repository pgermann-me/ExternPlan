import {audit,iso} from './domain.js';
export const hunterRecoveryId='2026-10-22-restore-hunter-regions';
export function linkRegionPolygons(state,layers){
 const ids=new Set(layers.flatMap(l=>l.geojson.features.map(f=>String(f.properties.GEO_ID))));let linked=0;
 for(const region of state.regions)if(region.polygon_link_mode!=='shared'&&ids.has(region.id)&&region.polygon_geo_id!==region.id){
  const before={...region};region.polygon_geo_id=region.id;audit(state,'regions','link-polygon',before,{...region});linked++;
 }
 return linked;
}
// Recover only geographic master data; personal data and priorities are untouched.
export function recoverRegionState(state,catalog,layers,now=Date.now()){
 const result={created:0,restored:0,functions:0,linked:0};
 const hunterId=value=>/^J\d{3}$/.test(value||'');
 const hasHunters=state.regions.some(r=>hunterId(r.id))||state.people.some(p=>p.function_regions?.some(r=>hunterId(r.geo_id)))||state.groups.some(g=>hunterId(g.hunter_geo_id)||g.geo_ids?.some(hunterId))||state.functions.some(f=>f.name?.toLocaleLowerCase('de-CH')==='jäger'||f.geo_ids?.some(hunterId))||layers.some(l=>l.geojson.features.some(f=>hunterId(f.properties.GEO_ID)));
 if(hasHunters&&!(state.migrations||[]).some(m=>m.id===hunterRecoveryId)){
  const entries=new Map(catalog.map(r=>[r.id,r]));
  for(const region of state.regions.filter(r=>hunterId(r.id)))entries.set(region.id,region);
  for(const layer of layers)for(const feature of layer.geojson.features){const id=String(feature.properties.GEO_ID);if(hunterId(id)&&!entries.has(id))entries.set(id,{id,name:feature.properties.Beschreibung||id});}
  const references=[...state.people.flatMap(p=>(p.function_regions||[]).map(r=>r.geo_id)),...state.groups.flatMap(g=>[g.hunter_geo_id,...(g.geo_ids||[])]),...state.functions.flatMap(f=>f.geo_ids||[])];
  for(const id of references)if(hunterId(id)&&!entries.has(id))entries.set(id,{id,name:id});
  const history=new Map();for(const a of state.audit)if(a.entity==='regions'){const record=a.after||a.before;if(record?.id)history.set(record.id,record);}
  for(const entry of entries.values()){
   const region=state.regions.find(r=>r.id===entry.id);
   if(!region){
    const saved=history.get(entry.id);
    const restored={...(saved||entry),id:entry.id};delete restored.deleted_at;
    state.regions.push(restored);audit(state,'regions','restore',null,restored);result.created++;
   }else if(region.deleted_at){const before={...region};delete region.deleted_at;audit(state,'regions','restore',before,{...region});result.restored++;}
  }
  for(const fn of state.functions.filter(f=>!f.deleted_at&&f.name?.toLocaleLowerCase('de-CH')==='jäger')){
   const ids=[...new Set([...(fn.geo_ids||[]),...entries.keys()])];
   if(ids.length!==(fn.geo_ids||[]).length){const before={...fn};fn.geo_ids=ids;audit(state,'functions','update',before,{...fn});result.functions++;}
  }
  state.migrations??=[];state.migrations.push({id:hunterRecoveryId,at:iso(now)});
  result.recovered=true;
 }
 result.linked=linkRegionPolygons(state,layers);
 return result;
}
