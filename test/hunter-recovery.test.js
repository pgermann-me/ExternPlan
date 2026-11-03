import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../data-cleanup.js';
import {recoverHunterPeople,hunterPeopleRecoveryId} from '../hunter-recovery.js';
import {pikettByRegion} from '../public/pikett-region-data.js';
const fixture=()=>{
 const s=emptyState();s.regions=[{id:'J012',name:'Revier Zwölf'}];s.departments=[{id:'D',name:'Jäger'}];s.groups=[{id:'G',name:'J012 · Revier Zwölf',department_id:'D',hunter_geo_id:'J012',geo_ids:['J012']}];s.functions=[{id:'F',name:'Jäger',geo_ids:['J012'],covers:{},duty_time_model:'scheduled',duty_color:'#123456'}];return s;
};
const person=(id,priority)=>({employee_id:id,source:'manual',first_name:'Anna',last_name:'Test',name:'Anna Test',department_id:'D',group_ids:['G'],contacts:[{type:'phone_mobile',value:'+41790000000',priority:0}],birth_date:'1972-04-19',business_address:{city:'Testort'},function_regions:[{function_id:'F',geo_id:'J012',priority}]});
test('Archivierte und fehlende Jäger werden aus dem Protokoll mit Prios 0 und 3 und Zeitbereich Immer wiederhergestellt',()=>{
 const s=fixture(),archived={...person('P',3),deleted_at:'2026-10-21'},missing=person('M',0);s.people=[archived];s.audit=[{entity:'person',before:null,after:missing}];s.assignments=[{assignment_id:'unchanged'}];const duties=structuredClone(s.assignments);
 assert.deepEqual(recoverHunterPeople(s),{created:1,restored:1,updated:0,changed:true});assert.equal(s.people.length,2);assert.equal(s.people.find(p=>p.employee_id==='P').deleted_at,undefined);assert.deepEqual(s.people.find(p=>p.employee_id==='M'),{...missing,group_id:'G'});assert.equal(s.people.find(p=>p.employee_id==='P').function_regions[0].priority,3);assert.equal(s.functions[0].duty_time_model,'always');assert.equal(s.functions[0].duty_color,undefined);assert.deepEqual(s.assignments,duties);assert.ok(s.migrations.some(m=>m.id===hunterPeopleRecoveryId));
 const mapData={layers:[{geojson:{features:[{properties:{GEO_ID:'J012'},geometry:{type:'Polygon',coordinates:[[[9,47],[10,47],[10,48],[9,48],[9,47]]]}}]}}]};assert.deepEqual(pikettByRegion(s,mapData,'2026-10-22T10:00:00+02:00',47.5,9.5).rows.map(r=>[r.employee_id,r.kind,r.priority]),[['P','always',3],['M','always',0]]);
 const saved=JSON.stringify(s);recoverHunterPeople(s);assert.equal(JSON.stringify(s),saved);s.people[0].deleted_at='later';recoverHunterPeople(s);assert.equal(s.people[0].deleted_at,'later');
});
test('Aktuelle Personenangaben und bestehende Prioritäten gewinnen; fehlende Jäger-Zuordnungen werden ergänzt',()=>{
 const s=fixture(),old=person('P',3),current={...person('P',1),first_name:'Neu',contacts:[],function_regions:[{function_id:'F',geo_id:'J012',priority:1},{function_id:'OTHER',geo_id:null,priority:0}]};s.people=[current,{...person('M',0),function_regions:[]}];s.audit=[{entity:'person',before:null,after:old},{entity:'person',before:null,after:person('M',0)}];
 recoverHunterPeople(s);const p=s.people.find(p=>p.employee_id==='P');assert.equal(p.first_name,'Neu');assert.deepEqual(p.contacts,[]);assert.equal(p.function_regions[0].priority,1);assert.equal(p.function_regions[1].function_id,'OTHER');assert.equal(s.people.find(p=>p.employee_id==='M').function_regions[0].priority,0);
});
test('Archivierte Funktion, Abteilung und Gruppen werden unter den bisherigen Kennungen reaktiviert',()=>{
 const s=fixture();for(const collection of [s.functions,s.departments,s.groups])collection[0].deleted_at='2026-10-21';s.people=[{...person('P',2),deleted_at:'2026-10-21'}];recoverHunterPeople(s);for(const collection of [s.functions,s.departments,s.groups]){assert.equal(collection.length,1);assert.equal(collection[0].deleted_at,undefined);}assert.equal(s.functions[0].id,'F');assert.deepEqual(s.people[0].group_ids,['G']);
});
test('Fremde Personen und SAP-Kollisionen werden nicht reaktiviert; leere Installation bleibt leer',()=>{
 const s=fixture();s.people=[{employee_id:'P',source:'SAP',deleted_at:'2026-10-21'},{employee_id:'OTHER',source:'manual',deleted_at:'2026-10-21'}];s.audit=[{entity:'person',after:person('P',1)}];const people=structuredClone(s.people);recoverHunterPeople(s);assert.deepEqual(s.people,people);const empty=emptyState();assert.deepEqual(recoverHunterPeople(empty),{created:0,restored:0,updated:0});assert.equal(empty.functions.length,0);assert.equal(empty.people.length,0);
});

test('Ein Personen-Snapshot reicht auch nach Verlust der Organisationsstammdaten zur Wiederherstellung',()=>{
 const s=emptyState();s.regions=[{id:'J012',name:'Revier Zwölf'}];s.audit=[{entity:'person',action:'delete',before:person('P',2),after:null}];recoverHunterPeople(s);assert.equal(s.people.length,1);assert.equal(s.functions[0].id,'F');assert.equal(s.functions[0].duty_time_model,'always');assert.deepEqual(s.people[0].function_regions,[{function_id:'F',geo_id:'J012',priority:2}]);assert.equal(s.departments[0].name,'Jäger');assert.equal(s.groups[0].hunter_geo_id,'J012');
});
