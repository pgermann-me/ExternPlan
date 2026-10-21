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
