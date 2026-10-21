import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkRegionScopes} from '../region-bulk.js';
import {scopeSnapshot} from '../public/region-bulk-scope.js';
const state=()=>({regions:Array.from({length:80},(_,i)=>({id:'R'+i,name:'Gebiet '+i,polygon_geo_id:'P'+i,department_ids:['A'],group_ids:[],function_ids:['F1']})),departments:[{id:'A'},{id:'B'}],groups:[{id:'GA',department_id:'A'},{id:'GB',department_id:'B'}],functions:[{id:'F1'},{id:'F2'}],assignments:[{assignment_id:'unverändert'}],audit:[]});
const request=(s,changes)=>({ids:s.regions.map(r=>r.id),expected:s.regions.map(scopeSnapshot),changes});
test('80 Gebiete werden gleichzeitig mehreren Abteilungen, Gruppen und Funktionen zugewiesen',()=>{
 const s=state(),input=request(s,{department_ids:{mode:'add',ids:['B']},group_ids:{mode:'replace',ids:['GA','GB']},function_ids:{mode:'add',ids:['F2']}});
 assert.deepEqual(bulkRegionScopes(s,input),{selected:80,updated:80});assert.equal(s.audit.length,80);for(const r of s.regions){assert.deepEqual(r.department_ids,['A','B']);assert.deepEqual(r.group_ids,['GA','GB']);assert.deepEqual(r.function_ids,['F1','F2']);assert.equal(r.polygon_geo_id,'P'+r.id.slice(1));}assert.deepEqual(s.assignments,[{assignment_id:'unverändert'}]);
 const same=request(s,{function_ids:{mode:'add',ids:['F2']}});assert.equal(bulkRegionScopes(s,same).updated,0);
});
test('Ersetzen, Freigeben und Nicht ändern bleiben getrennt und erhalten sonstige Gebietsdaten',()=>{
 const s=state();bulkRegionScopes(s,request(s,{department_ids:{mode:'replace',ids:['B']},group_ids:{mode:'replace',ids:['GB']},function_ids:{mode:'keep'}}));assert.deepEqual(s.regions[0].function_ids,['F1']);
 bulkRegionScopes(s,request(s,{group_ids:{mode:'clear'},function_ids:{mode:'clear'}}));assert.deepEqual(s.regions[0].group_ids,[]);assert.deepEqual(s.regions[0].function_ids,[]);assert.deepEqual(s.regions[0].department_ids,['B']);
});
test('Konflikte und ungültige Zuordnungen werden vor jeder Änderung abgewiesen',()=>{
 for(const changes of [{department_ids:{mode:'replace',ids:['B']},group_ids:{mode:'add',ids:['GA']}},{function_ids:{mode:'replace',ids:['unbekannt']}},{department_ids:{mode:'replace',ids:[]}}]){const s=state(),before=structuredClone(s);assert.throws(()=>bulkRegionScopes(s,request(s,changes)));assert.deepEqual(s,before);}
 const s=state(),stale=request(s,{department_ids:{mode:'add',ids:['B']}});s.regions[79].function_ids=['F2'];const before=structuredClone(s);assert.throws(()=>bulkRegionScopes(s,stale),{status:409});assert.deepEqual(s,before);
});


import {bulkDeleteRegions} from '../region-bulk.js';
import {deleteMaster} from '../master-data.js';
import {permitted} from '../accounts.js';
test('Mehrere unbenutzte Gebiete gemeinsam archivieren; Stammdatenbezüge und Polygone erhalten',()=>{
 const s=state();s.assignments=[];s.rules=[];s.favorites=[];const before=structuredClone(s.regions);assert.equal(bulkDeleteRegions(s,['R0','R1']).deleted,2);assert(s.regions.slice(0,2).every(r=>r.deleted_at));assert.equal(s.regions[0].polygon_geo_id,before[0].polygon_geo_id);assert.deepEqual(s.regions[2],before[2]);assert.equal(s.audit.length,2);
});
test('Verweise aus beliebigen Diensten verhindern auch eine teilweise Gebietslöschung',()=>{
 for(const end_on of ['2000-01-01T00:00Z','2099-01-01T00:00Z']){const s=state();s.rules=[];s.favorites=[];s.assignments=[{function_id:'F1',geodependency:'R1',end_on}];const before=structuredClone(s);assert.throws(()=>bulkDeleteRegions(s,['R0','R1']),/verweist/);assert.deepEqual(s,before);assert.throws(()=>deleteMaster(s,'regions','R1'),/verweist/);assert.deepEqual(s,before);}
});
test('Gesamtgebietsabdeckung und gelöschte Funktionshistorie schützen referenzierte Teilgebiete',()=>{
 const s=state();s.rules=[];s.favorites=[];s.functions[0].covers={GANZ:['R1']};s.functions[0].deleted_at='2026-01-01';s.assignments=[{function_id:'F1',geodependency:'GANZ',end_on:'2000-01-01T00:00Z'}];const before=structuredClone(s);assert.throws(()=>bulkDeleteRegions(s,['R0','R1']),/Gesamtgebiet/);assert.deepEqual(s,before);
 s.assignments=[];assert.equal(bulkDeleteRegions(s,['R0','R1']).deleted,2);
 assert.equal(permitted('planner','POST','/api/regions/delete-many'),false);assert.equal(permitted('user','POST','/api/regions/delete-many'),false);
});
