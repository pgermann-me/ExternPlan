import test from 'node:test';
import assert from 'node:assert/strict';
import {filteredGroups,groupedDepartments} from '../public/group-view-data.js';
const state={departments:[{id:'A',name:'Alpha'},{id:'B',name:'Beta'},{id:'C',name:'Leer'}],groups:[{id:'all',name:'Alle',department_id:'A'},{id:'north',name:'Nord',department_id:'A',geo_ids:['N']},{id:'south',name:'Süd',department_id:'B',geo_ids:['S']},{id:'none',name:'Ohne Regionen',department_id:'B',geo_ids:[]},{id:'orphan',name:'Ohne Abteilung',department_id:null,geo_ids:['N']}],regions:[{id:'N',name:'Nord'},{id:'S',name:'Süd'},{id:'A-only',name:'Abteilungsgebiet',department_ids:['A']},{id:'specific',name:'Gruppengebiet',group_ids:['north']} ]};
test('Gruppenfilter kombiniert Abteilung und mehrere alternative Regionen einschliesslich Alle Regionen',()=>{
 assert.deepEqual(filteredGroups(state,{department:'A',regions:['N']}).map(g=>g.id),['all','north']);assert.deepEqual(filteredGroups(state,{regions:['N','S']}).map(g=>g.id),['all','north','south','orphan']);assert.equal(filteredGroups(state,{department:'B',regions:['N']}).length,0);assert.equal(filteredGroups(state,{}).length,5);
});
test('Gebietsbegrenzungen und explizit leere Gebietslisten werden im Gruppenfilter berücksichtigt',()=>{
 assert.deepEqual(filteredGroups(state,{regions:['A-only']}).map(g=>g.id),['all']);assert.equal(filteredGroups(state,{regions:['unbekannt']}).length,0);assert(!filteredGroups(state,{regions:['N']}).some(g=>g.id==='none'));
});
test('Baumstruktur behält leere Abteilungen und führt Gruppen ohne Abteilung separat',()=>{
 const nodes=groupedDepartments(state);assert.deepEqual(nodes.map(n=>n.department?.id||null),['A','B','C',null]);assert.deepEqual(nodes[0].groups.map(g=>g.id),['all','north']);assert.equal(nodes[2].groups.length,0);assert.deepEqual(groupedDepartments(state,{department:'B',regions:['N']}).map(n=>n.groups.length),[0]);assert.deepEqual(groupedDepartments(state,{regions:['N']}).map(n=>n.department?.id||null),['A',null]);
});
