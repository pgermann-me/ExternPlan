import {assertRegionDeletable,deleteMaster} from './master-data.js';
import {regionScopeFields,scopeSnapshot,changedScope} from './public/region-bulk-scope.js';
import {validateScopeRestrictions} from './public/organization.js';
import {audit} from './domain.js';
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
export function bulkRegionScopes(state,input){
 const {ids,expected,changes}=input;
 if(!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail('1 bis 1000 eindeutige Gebiete wählen');
 if(!Array.isArray(expected)||expected.length!==ids.length||new Set(expected.map(r=>r?.id)).size!==ids.length||expected.some(r=>!r||!ids.includes(r.id)||regionScopeFields.some(k=>!Array.isArray(r[k])||r[k].some(id=>typeof id!=='string'))))fail('Die Vergleichsdaten der Gebiete fehlen. Bitte neu laden');
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(k=>!regionScopeFields.includes(k)))fail('Ungültige Zuordnungsänderung');
 for(const [key,patch] of Object.entries(changes)){
  if(!patch||!['keep','add','replace','clear'].includes(patch.mode))fail('Ungültiger Änderungsmodus');
  if(['add','replace'].includes(patch.mode)&&(!Array.isArray(patch.ids)||!patch.ids.length||patch.ids.some(id=>typeof id!=='string')||new Set(patch.ids).size!==patch.ids.length))fail('Für Ergänzen oder Ersetzen mindestens einen eindeutigen Eintrag wählen');
 }
 const updates=ids.map(id=>{
  const before=state.regions.find(r=>r.id===id&&!r.deleted_at);if(!before)fail('Ein Gebiet wurde inzwischen gelöscht. Bitte neu laden',409);
  if(JSON.stringify(scopeSnapshot(before))!==JSON.stringify(scopeSnapshot(expected.find(r=>r.id===id))))fail('Zuordnungen wurden inzwischen geändert: '+before.name+'. Bitte neu laden',409);
  const after={...before};for(const key of regionScopeFields)if(changes[key]&&changes[key].mode!=='keep')after[key]=changedScope(before[key],changes[key]);
  try{validateScopeRestrictions(state,'regions',after);}catch(error){fail(before.name+': '+error.message);}
  return {before,after};
 });
 let updated=0;
 for(const {before,after} of updates){if(JSON.stringify(scopeSnapshot(before))===JSON.stringify(scopeSnapshot(after)))continue;state.regions[state.regions.indexOf(before)]=after;audit(state,'regions','update',before,after);updated++;}
 return {selected:ids.length,updated};
}

export function bulkDeleteRegions(state,ids,now=Date.now()){
 if(!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)fail('1 bis 1000 eindeutige Gebiete wählen');
 for(const id of ids)assertRegionDeletable(state,id);
 for(const id of ids)deleteMaster(state,'regions',id,now);
 return {deleted:ids.length};
}

export function prepareRegionDuplicate(state,sourceId,input,layers){
 const source=state.regions.find(r=>r.id===sourceId&&!r.deleted_at);if(!source)fail('Originalgebiet nicht gefunden',404);
 const key=typeof input.id==='string'?input.id.trim():'';
 if(!key||key==='undefined'||key.length>200)fail('Eine neue Geo_ID mit 1 bis 200 Zeichen eingeben');
 if(state.regions.some(r=>r.id===key))fail('Diese Geo_ID ist bereits vergeben oder für ein gelöschtes Gebiet reserviert',409);
 const name=typeof input.name==='string'?input.name.trim():'';if(!name||name.length>500)fail('Beschreibung mit 1 bis 500 Zeichen eingeben');
 const region=structuredClone(source);region.id=key;region.name=name;
 delete region.deleted_at;delete region.region_group_scopes;delete region.region_group_scope;delete region.configured_geo_ids;
 const polygon=Object.hasOwn(source,'polygon_geo_id')?source.polygon_geo_id:source.id;
 region.polygon_geo_id=layers.some(l=>l.geojson.features.some(f=>String(f.properties.GEO_ID)===polygon))?polygon:null;
 // A duplicate deliberately shares the source geometry, even if its new ID has another polygon.
 region.polygon_link_mode='shared';return region;
}
