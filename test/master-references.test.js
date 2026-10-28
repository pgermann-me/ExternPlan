import test from 'node:test';
import assert from 'node:assert/strict';
import {masterReferences} from '../public/master-references.js';
const state={departments:[{id:'D'}],groups:[{id:'G',department_id:'D'},{id:'G2',department_id:'D2'}],people:[{employee_id:'P',name:'Vor Nach',first_name:'Vor',last_name:'Nach',group_ids:['G2','G']},{employee_id:'idle',name:'Ohne Dienst',department_id:'D'},{employee_id:'other',name:'Andere'}],functions:[{id:'F',name:'Pikett',geo_ids:['ALL'],covers:{ALL:['NORD']}}],assignments:[{employee_id:'P',function_id:'F',geodependency:'ALL'},{employee_id:'P',function_id:'F',geodependency:'ALL'}]};
test('Abteilungen und mehrere Gruppen liefern Personen auch ohne Dienst, Funktionen aus Diensten ohne Duplikate',()=>{
 const dept=masterReferences(state,'departments','D');assert.deepEqual(dept.people.map(p=>p.id),['P','idle']);assert.deepEqual(dept.functions,[{id:'F',name:'Pikett'}]);assert.deepEqual(masterReferences(state,'groups','G').people,[{id:'P',name:'Nach Vor'}]);assert.deepEqual(masterReferences(state,'groups','G2').functions,dept.functions);assert.deepEqual(masterReferences(state,'groups','missing'),{people:[],functions:[]});
});
test('Gebietsabdeckung verbindet Funktionen und Dienstpersonen; Funktionsreferenzen erfinden keine Qualifikationen',()=>{
 assert.deepEqual(masterReferences(state,'regions','NORD'),{people:[],functions:[]});assert.deepEqual(masterReferences(state,'functions','F').people,[{id:'P',name:'Nach Vor'}]);
});
