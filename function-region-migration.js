import {audit,id,iso} from './domain.js';
import {regionGroupIds} from './public/region-groups.js';
export const functionRegionMigrationId='2026-10-28-functions-use-region-groups';
export function normalizeFunctionRegionModel(state){
 const changedFunctions=[],changedRegions=[];
 for(const region of state.regions){
  const previous=region.covered_region_ids,parts=[...new Set([...(previous||[]),...state.functions.flatMap(f=>f.covers?.[region.id]||[])])].filter(id=>id!==region.id&&state.regions.some(r=>r.id===id));
  if(previous===undefined||JSON.stringify(previous)!==JSON.stringify(parts)){const before=structuredClone(region);region.covered_region_ids=parts;changedRegions.push(region.id);audit(state,'regions','coverage-definition',before,structuredClone(region));}
 }
 for(const fn of state.functions){
  if(fn.region_assignment_mode==='groups'&&!fn.geo_ids?.length&&!Object.keys(fn.covers||{}).length)continue;
  const before=structuredClone(fn);fn.region_assignment_mode='groups';fn.geo_ids=[];fn.covers={};changedFunctions.push(fn.id);audit(state,'functions','region-groups-only',before,structuredClone(fn));
 }
 const first=!(state.migrations||[]).some(m=>m.id===functionRegionMigrationId);
 if(!first&&!changedFunctions.length&&!changedRegions.length)return null;
 const result={id:functionRegionMigrationId,at:iso(Date.now()),functions:changedFunctions,regions:changedRegions};state.migrations??=[];state.migrations.push(result);return result;
}
// Newly imported geographic functions also use an explicit, visible region group.
export function assignImportedFunctionRegions(state,fn,ids){
 if(fn.region_assignment_mode!=='groups'&&!(state.migrations||[]).some(m=>m.id===functionRegionMigrationId)){fn.geo_ids=[...new Set([...(fn.geo_ids||[]),...ids])];return;}
 fn.region_assignment_mode='groups';fn.geo_ids=[];fn.covers={};if(!ids.length)return;state.region_groups??=[];
 let group=state.region_groups.find(g=>!g.deleted_at&&g.import_function_id===fn.id);
 if(!group){group={id:id(),name:fn.name+' · Importgebiete',function_ids:[fn.id],import_function_id:fn.id};state.region_groups.push(group);audit(state,'region_groups','create',null,structuredClone(group));}
 if(!group.function_ids?.includes(fn.id)){const before=structuredClone(group);group.function_ids=[...(group.function_ids||[]),fn.id];audit(state,'region_groups','update',before,structuredClone(group));}
 for(const region of state.regions.filter(r=>!r.deleted_at&&ids.includes(r.id))){if(regionGroupIds(region).includes(group.id))continue;const before=structuredClone(region);region.region_group_ids=[...regionGroupIds(region),group.id];delete region.region_group_id;audit(state,'regions','update',before,structuredClone(region));}
}
