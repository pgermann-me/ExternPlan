import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState} from '../data-cleanup.js';
import {recoverRegionState,hunterRecoveryId,linkRegionPolygons} from '../region-recovery.js';
import {regionPolygonLayers} from '../public/region-geometry.js';
import {regionsAtPoint} from '../public/region-point.js';
const catalog=[{id:'J001',name:'Revier Eins'},{id:'J012',name:'Revier Zwölf'}];
const layers=[{id:'map',geojson:{type:'FeatureCollection',features:[{type:'Feature',properties:{GEO_ID:'J012',Beschreibung:'Revier Zwölf'},geometry:{type:'Polygon',coordinates:[[[9,47],[10,47],[10,48],[9,48],[9,47]]]}}]}}];
test('Jäger-Gebiete werden mit Geo_IDs, archivierten Einschränkungen und Prioritäten wiederhergestellt',()=>{
 const s=emptyState();s.regions=[{id:'J012',name:'Eigener Name',deleted_at:'2026-10-21',polygon_geo_id:null,region_group_ids:['RG'],department_ids:['D']}];
 s.functions=[{id:'F',name:'Jäger',geo_ids:[],duty_time_model:'always'}];s.people=[{employee_id:'P',function_regions:[{function_id:'F',geo_id:'J012',priority:3},{function_id:'F',geo_id:'J900',priority:0}]}];
 s.audit.push({entity:'regions',before:{id:'J001',name:'Historischer Name',group_ids:['G']},after:null});
 const people=structuredClone(s.people);const result=recoverRegionState(s,catalog,layers);
 assert.deepEqual(result,{created:2,restored:1,functions:1,linked:1,recovered:true});assert.deepEqual(s.people,people);
 const restored=s.regions.find(r=>r.id==='J012');assert.equal(restored.deleted_at,undefined);assert.equal(restored.name,'Eigener Name');assert.deepEqual(restored.region_group_ids,['RG']);assert.deepEqual(restored.department_ids,['D']);assert.equal(restored.polygon_geo_id,'J012');
 assert.equal(s.regions.find(r=>r.id==='J001').name,'Historischer Name');assert.deepEqual(s.functions[0].geo_ids,['J001','J012','J900']);assert.equal(regionPolygonLayers({layers},restored)[0].geojson.features.length,1);
 assert.ok(s.migrations.some(m=>m.id===hunterRecoveryId));const snapshot=JSON.stringify(s);assert.deepEqual(recoverRegionState(s,catalog,layers),{created:0,restored:0,functions:0,linked:0});assert.equal(JSON.stringify(s),snapshot);
 restored.deleted_at='later';recoverRegionState(s,catalog,layers);assert.equal(restored.deleted_at,'later');
});
test('Eigene Geo_ID verbindet Polygone auch nach zuvor fehlender oder falscher Verknüpfung',()=>{
 for(const polygon_geo_id of [null,'OTHER',undefined]){const s=emptyState();s.regions=[{id:'J012',name:'Revier',polygon_geo_id}];assert.equal(linkRegionPolygons(s,layers),1);assert.equal(s.regions[0].polygon_geo_id,'J012');assert.deepEqual(regionsAtPoint(s,{layers},[9.5,47.5]).map(r=>r.id),['J012']);assert.equal(linkRegionPolygons(s,layers),0);}
});
test('Leere Installation bekommt keine Jägerdaten; Katalog enthält nur Gebietskennungen und Namen',()=>{
 const s=emptyState();recoverRegionState(s,catalog,[]);assert.equal(s.regions.length,0);assert.equal((s.migrations||[]).length,0);
 const data=JSON.parse(readFileSync(new URL('../map-data/hunter-regions.json',import.meta.url)));assert.equal(data.length,147);assert.equal(new Set(data.map(r=>r.id)).size,147);for(const r of data){assert.match(r.id,/^J\d{3}$/);assert.deepEqual(Object.keys(r),['id','name']);assert.ok(r.name);}
});

import {spawn} from 'node:child_process';
import {mkdtempSync,readdirSync,statSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
test('Serverstart stellt Jägergebiete aus dem Katalog mit privater Sicherung wieder her',async()=>{
 const dir=mkdtempSync('/tmp/externplan-region-recovery-');let child;
 const s=emptyState();s.functions=[{id:'F',name:'Jäger',duty_time_model:'always',geo_ids:['J012'],covers:{}}];s.regions=[{id:'J012',name:'Revier Zwölf',deleted_at:'2026-10-21',polygon_geo_id:null}];s.people=[{employee_id:'P',name:'Test',deleted_at:'2026-10-21',function_regions:[{function_id:'F',geo_id:'J012',priority:2}]}];
 const db=new DatabaseSync(dir+'/externplan.sqlite');db.exec('CREATE TABLE state(id INTEGER PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE imported_map_layers(id TEXT PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(s));db.prepare('INSERT INTO imported_map_layers VALUES(?,?)').run('map',JSON.stringify(layers[0]));db.close();
 const raw=()=>{const d=new DatabaseSync(dir+'/externplan.sqlite');const raw=d.prepare('SELECT data FROM state').get().data;d.close();return raw;};
 const start=async()=>{child=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',EXTERNPLAN_TEST_FIXTURES:'1',PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>{child.kill();reject(Error(log));},15000);child.stdout.on('data',d=>{log+=d;if(/Port \d+/.test(log)){clearTimeout(timer);resolve();}});child.stderr.on('data',d=>log+=d);child.once('exit',()=>{clearTimeout(timer);reject(Error(log));});});};
 const stop=async()=>{await new Promise(resolve=>{child.once('exit',resolve);child.kill();});child=null;};
 try{
  await start();const state=JSON.parse(raw());assert.equal(state.regions.length,147);assert.equal(state.regions.find(r=>r.id==='J012').polygon_geo_id,'J012');assert.equal(state.regions.find(r=>r.id==='J012').deleted_at,undefined);assert.equal(state.people[0].function_regions[0].priority,2);assert.equal(state.people[0].employee_id,'P');assert.equal(state.people[0].deleted_at,undefined);assert.equal(state.functions[0].duty_time_model,'always');assert.equal(state.functions[0].geo_ids.length,147);
  const backups=readdirSync(dir).filter(n=>n.startsWith('backup-before-region-recovery-'));assert.equal(backups.length,1);assert.equal(statSync(dir+'/'+backups[0]).mode&0o777,0o600);assert.deepEqual(JSON.parse(readFileSync(dir+'/'+backups[0],'utf8')),s);
  const peopleBackups=readdirSync(dir).filter(n=>n.startsWith('backup-before-hunter-people-recovery-'));assert.equal(peopleBackups.length,1);assert.equal(statSync(dir+'/'+peopleBackups[0]).mode&0o777,0o600);assert.equal(JSON.parse(readFileSync(dir+'/'+peopleBackups[0],'utf8')).people[0].deleted_at,'2026-10-21');
  const original=raw();await stop();await start();assert.equal(raw(),original);assert.equal(readdirSync(dir).filter(n=>n.startsWith('backup-before-region-recovery-')).length,1);await stop();
 }finally{if(child)await stop();rmSync(dir,{recursive:true,force:true});}
});
