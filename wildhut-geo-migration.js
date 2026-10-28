import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {audit,id,iso} from './domain.js';
export const wildhutGeoIds=Object.freeze({WH10:'WH_AI_Oegg',WH09:'WH_AI_App',WH08:'WH_AR',WH01:'WH_SG_1',WH02:'WH_SG_2',WH03:'WH_SG_3',WH04:'WH_SG_4',WH05:'WH_SG_5',WH06:'WH_SG_6',WH07:'WH_SG_7'});
export const wildhutMigrationId='2026-10-22-wildhut-geo-identifiers';
const geo=value=>Object.hasOwn(wildhutGeoIds,value)?wildhutGeoIds[value]:value;
const list=value=>{if(!Array.isArray(value)||!value.some(v=>geo(v)!==v))return value;return [...new Set(value.map(geo))];};
function fields(record,changes){let next=record;for(const [key,value] of Object.entries(changes))if(value!==record[key])next={...next,[key]:value};return next;}
const assignment=record=>record?fields(record,{geodependency:geo(record.geodependency)}):record;
function covers(value){
 if(!value)return value;const previous=Object.entries(value),entries=previous.map(([key,parts])=>[geo(key),list(parts)]);
 if(entries.every(([key,parts],i)=>key===previous[i][0]&&parts===previous[i][1]))return value;
 if(new Set(entries.map(([key])=>key)).size!==entries.length)throw Error('Kennungsänderung: Gesamtgebiets-Kennungen kollidieren');
 return Object.fromEntries(entries);
}
function affiliations(rows){
 if(!rows)return rows;const next=rows.map(r=>fields(r,{geo_id:geo(r.geo_id)}));if(next.every((r,i)=>r===rows[i]))return rows;
 if(new Set(next.map(r=>JSON.stringify([r.function_id,r.geo_id]))).size!==next.length)throw Error('Kennungsänderung: doppelte Funktions-/Gebietszuordnung');
 return next;
}
function revisionIndex(state){
 const result=new Map(),add=(key,revision)=>{if(key)result.set(key,Math.max(result.get(key)||0,revision||0));};
 for(const collection of [state.assignments,state.outbox])for(const a of collection)add(a.assignment_id,a.revision);
 for(const e of state.exports)for(const a of e.payload.changes)add(a.assignment_id,a.revision);
 for(const [key,a] of Object.entries(state.els.assignments))add(key,a.revision);
 return result;
}
// Build a plan without changing the original state, receipts or generated export files.
export function planWildhutGeoRename(state,layers=[],users=[],now=Date.now()){
 const regions=state.regions.map(r=>fields(r,{id:geo(r.id),polygon_geo_id:geo(r.polygon_geo_id),covered_region_ids:list(r.covered_region_ids)}));
 if(new Set(regions.map(r=>r.id)).size!==regions.length)throw Error('Kennungsänderung: Eine neue Wildhut-Geo_ID ist bereits vergeben');
 const polygonIds=new Set(layers.flatMap(l=>l.geojson.features.map(f=>String(f.properties.GEO_ID))));
 for(const [old,key] of Object.entries(wildhutGeoIds))if(polygonIds.has(old)&&polygonIds.has(key))throw Error('Kennungsänderung: Kartenpolygone für '+old+' und '+key+' sind bereits vorhanden');
 const mappedLayers=layers.map(layer=>{const features=layer.geojson.features.map(f=>geo(f.properties.GEO_ID)===f.properties.GEO_ID?f:{...f,properties:{...f.properties,GEO_ID:geo(f.properties.GEO_ID)}});return features.every((f,i)=>f===layer.geojson.features[i])?layer:{...layer,geojson:{...layer.geojson,features}};});
 const mappedUsers=users.map(user=>{const scope=JSON.parse(user.access_scope||'{}'),next=fields(scope,{region_ids:list(scope.region_ids),region_id:geo(scope.region_id)});return next===scope?user:{...user,access_scope:JSON.stringify(next),revision:user.revision+1};});
 const next={...state,
  regions,
  functions:state.functions.map(f=>fields(f,{geo_ids:list(f.geo_ids),covers:covers(f.covers)})),
  groups:state.groups.map(g=>fields(g,{geo_ids:list(g.geo_ids),hunter_geo_id:geo(g.hunter_geo_id)})),
  departments:state.departments.map(d=>fields(d,{geo_ids:list(d.geo_ids)})),
  people:state.people.map(p=>fields(p,{function_regions:affiliations(p.function_regions)})),
  rules:state.rules.map(r=>fields(r,{geo_id:geo(r.geo_id)})),
  favorites:(state.favorites||[]).map(f=>{const ids=list(f.region_ids);return ids===f.region_ids?f:{...f,region_ids:ids,revision:(f.revision||0)+1};}),
  assignments:state.assignments.map(assignment),outbox:state.outbox.map(assignment)
 };
 const changedAssignments=new Map();
 for(let i=0;i<next.assignments.length;i++)if(next.assignments[i]!==state.assignments[i])changedAssignments.set(next.assignments[i].assignment_id,{before:state.assignments[i],after:next.assignments[i]});
 const counters=Object.fromEntries(['regions','functions','groups','departments','people','rules','favorites','assignments','outbox'].map(type=>[type,next[type].filter((r,i)=>r!==(state[type]||[])[i]).length]));
 counters.map_layers=mappedLayers.filter((r,i)=>r!==layers[i]).length;counters.user_scopes=mappedUsers.filter((r,i)=>r!==users[i]).length;
 // Undo snapshots are live references and must use the new identifiers as well.
 let revisions;
 if(changedAssignments.size){
  revisions=revisionIndex(state);
  for(const pair of changedAssignments.values())pair.after={...pair.after,revision:(revisions.get(pair.before.assignment_id)||0)+1};
  next.assignments=next.assignments.map(a=>changedAssignments.get(a.assignment_id)?.after||a);
  next.outbox=next.outbox.filter(a=>!changedAssignments.has(a.assignment_id));
  for(const {after} of changedAssignments.values())next.outbox.push({action:'update',...after});
 }
 if(state.planning_undo){next.planning_undo=state.planning_undo.map(record=>{
  const entries=record.entries.map(entry=>{
   const before=assignment(entry.before);let after=assignment(entry.after),revision=entry.revision;
   const pair=changedAssignments.get(entry.key);
   if(pair&&entry.revision===revisions.get(entry.key)&&JSON.stringify(entry.after)===JSON.stringify(pair.before)){after={...after,revision:pair.after.revision};revision=pair.after.revision;}
   return fields(entry,{before,after,revision});
  });return entries.every((e,i)=>e===record.entries[i])?record:{...record,entries};
 });counters.undo_records=next.planning_undo.filter((r,i)=>r!==state.planning_undo[i]).length;}
 if(!Object.values(counters).some(Boolean))return null;
 next.audit=[...state.audit];next.migrations=[...(state.migrations||[])];
 const summary={id:wildhutMigrationId,at:iso(now),mapping:{...wildhutGeoIds},changed:counters};
 next.migrations.push(summary);
 for(let i=0;i<regions.length;i++)if(regions[i]!==state.regions[i])audit(next,'regions','update',state.regions[i],regions[i]);
 for(const {before,after} of changedAssignments.values())audit(next,'assignment','update',before,after);
 audit(next,'maintenance','rename-wildhut-geo-identifiers',null,summary);
 return {state:next,layers:mappedLayers,users:mappedUsers,summary};
}
export function migrateWildhutGeoIds(db,{dataDir,now=Date.now()}){
 db.exec('BEGIN IMMEDIATE');
 try{
  const state=JSON.parse(db.prepare('SELECT data FROM state WHERE id=1').get().data),rows=db.prepare('SELECT id,data FROM imported_map_layers ORDER BY rowid').all(),layers=rows.map(r=>JSON.parse(r.data));
  const users=db.prepare('SELECT id,access_scope,revision FROM app_users').all(),plan=planWildhutGeoRename(state,layers,users,now);
  if(!plan){db.exec('COMMIT');return null;}
  const backup=resolve(dataDir,'backup-before-wildhut-geo-rename-'+id()+'.json');
  writeFileSync(backup,JSON.stringify({state,imported_map_layers:rows,user_scopes:users}),{mode:0o600,flag:'wx'});
  db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(plan.state));
  for(let i=0;i<layers.length;i++)if(plan.layers[i]!==layers[i])db.prepare('UPDATE imported_map_layers SET data=? WHERE id=?').run(JSON.stringify(plan.layers[i]),rows[i].id);
  for(let i=0;i<users.length;i++)if(plan.users[i]!==users[i])db.prepare('UPDATE app_users SET access_scope=?,revision=? WHERE id=?').run(plan.users[i].access_scope,plan.users[i].revision,users[i].id);
  db.exec('COMMIT');return {...plan.summary,backup};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
