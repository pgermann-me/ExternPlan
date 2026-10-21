import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkPeopleOrganization,personOrganizationSnapshot} from '../people-bulk.js';
import {permitted} from '../accounts.js';
const state=()=>({people:[{employee_id:'1',name:'Eins',department_id:'A',group_ids:['GA'],contacts:[{type:'phone_mobile',value:'Test'}],birth_date:'1972-04-19'},{employee_id:'2',name:'Zwei',group_ids:[]}],departments:[{id:'A'},{id:'B'}],groups:[{id:'GA',department_id:'A'},{id:'GB',department_id:'B'},{id:'GA2',department_id:'A'}],regions:[],functions:[],assignments:[],favorites:[],audit:[]});
const admin={role:'admin'},request=s=>({expected:s.people.map(personOrganizationSnapshot),department:{mode:'set',id:'B'},groups:{mode:'add',ids:['GB']}});
test('Mehrere Personen atomar zuweisen; Ergänzen erhält andere Gruppen und Personendaten',()=>{
 const s=state(),input=request(s);assert.equal(bulkPeopleOrganization(s,input,admin).updated,2);assert.deepEqual(s.people[0].group_ids,['GA','GB']);assert.equal(s.people[0].department_id,'B');assert.equal(s.people[0].contacts[0].value,'Test');assert.equal(s.people[0].birth_date,'1972-04-19');assert.equal(s.audit.length,2);
 const repeat={...input,expected:s.people.map(personOrganizationSnapshot)};assert.equal(bulkPeopleOrganization(s,repeat,admin).updated,0);assert.equal(s.audit.length,2);
});
test('Ersetzen, Leeren und keine Änderung sind getrennte Aktionen',()=>{
 const s=state();bulkPeopleOrganization(s,{expected:s.people.map(personOrganizationSnapshot),groups:{mode:'replace',ids:['GA2']}},admin);assert.deepEqual(s.people[0].group_ids,['GA2']);assert.equal(s.people[0].department_id,'A');bulkPeopleOrganization(s,{expected:s.people.map(personOrganizationSnapshot),department:{mode:'clear'},groups:{mode:'clear'}},admin);assert.equal(s.people[0].department_id,null);assert.deepEqual(s.people[0].group_ids,[]);assert.equal(s.people[0].group_id,null);
});
test('Konflikt oder ungültiger letzter Datensatz verhindert jede Teiländerung',()=>{
 for(const alter of [input=>input.expected[1].group_ids=['GA'],input=>input.expected[1].employee_id='missing',input=>input.groups.ids=['unknown'],input=>input.groups.ids=['GA']]){const s=state(),before=structuredClone(s),input=request(s);alter(input);assert.throws(()=>bulkPeopleOrganization(s,input,admin));assert.deepEqual(s,before);}
});
test('Planer behalten verborgene Mitgliedschaften und können nur im eigenen Bereich zuweisen',()=>{
 const s=state();s.people[0].group_ids=['GA','GB'];s.people[0].department_id='B';const user={role:'planner',access_scope:{group_ids:['GA','GA2']}};
 bulkPeopleOrganization(s,{expected:[{employee_id:'1',department_id:null,group_ids:['GA']}],groups:{mode:'replace',ids:['GA','GA2']}},user);assert.deepEqual(s.people[0].group_ids,['GA','GA2','GB']);assert.equal(s.people[0].department_id,'B');
 for(const body of [{expected:[personOrganizationSnapshot(s.people[1])]},{expected:[{employee_id:'1',department_id:null,group_ids:['GA','GA2']}],groups:{mode:'replace',ids:['GB']}}]){const before=structuredClone(s);assert.throws(()=>bulkPeopleOrganization(s,body,user),{status:403});assert.deepEqual(s,before);}
 assert.equal(permitted('planner','POST','/api/people/bulk-organization'),true);assert.equal(permitted('user','POST','/api/people/bulk-organization'),false);
});

import {bulkDeletePeople} from '../people-bulk.js';
test('Sammellöschen ist atomar, geschützt durch zukünftige Dienste und Berechtigungen',()=>{
 const s=state();s.assignments=[{employee_id:'2',end_on:'2099-01-01T00:00Z'}];const before=structuredClone(s);assert.throws(()=>bulkDeletePeople(s,['1','2'],admin));assert.deepEqual(s,before);s.assignments=[];assert.throws(()=>bulkDeletePeople(s,['1','2'],{role:'planner',access_scope:{group_ids:['GA']}}),{status:403});assert(!s.people.some(p=>p.deleted_at));assert.equal(bulkDeletePeople(s,['1','2'],admin).deleted,2);assert(s.people.every(p=>p.deleted_at));assert.equal(s.audit.length,2);
});

import {bulkDeletePersonDuties} from '../people-bulk.js';
test('Alle Dienste ausgewählter Personen löschen, mit Tombstones; Personen und fremde Dienste erhalten',()=>{
 const s=state();s.outbox=[];s.assignments=[{assignment_id:'past',employee_id:'1',revision:2,start_on:'2000-01-01T00:00Z',end_on:'2000-01-02T00:00Z'},{assignment_id:'future',employee_id:'1',revision:1,start_on:'2099-01-01T00:00Z',end_on:'2099-01-02T00:00Z'},{assignment_id:'other',employee_id:'2',revision:1}];s.assignment_styles={past:{color:'#808080'},future:{color:'#123456'},other:{color:'#abcdef'}};const people=structuredClone(s.people),expected=s.assignments.slice(0,2).map(a=>({assignment_id:a.assignment_id,revision:a.revision}));
 assert.equal(bulkDeletePersonDuties(s,{employee_ids:['1'],expected},admin).deleted_duties,2);assert.deepEqual(s.assignments.map(a=>a.assignment_id),['other']);assert.deepEqual(s.people,people);assert.deepEqual(s.outbox.map(a=>[a.action,a.revision]),[['delete',3],['delete',2]]);assert.deepEqual(s.assignment_styles,{other:{color:'#abcdef'}});assert.equal(s.audit.length,2);
});
test('Dienstlöschung bei Änderungen oder fehlender Berechtigung vollständig abbrechen',()=>{
 const s=state();s.outbox=[];s.assignments=[{assignment_id:'one',employee_id:'1',revision:2},{assignment_id:'two',employee_id:'2',revision:1}];const before=structuredClone(s);
 assert.throws(()=>bulkDeletePersonDuties(s,{employee_ids:['1'],expected:[{assignment_id:'one',revision:1}]},admin),{status:409});assert.deepEqual(s,before);
 assert.throws(()=>bulkDeletePersonDuties(s,{employee_ids:['1','2'],expected:s.assignments}, {role:'planner',access_scope:{group_ids:['GA']}}),{status:403});assert.deepEqual(s,before);
 assert.throws(()=>bulkDeletePersonDuties(s,{employee_ids:['1'],expected:[]},admin),{status:409});assert.deepEqual(s,before);
 assert.equal(permitted('planner','POST','/api/people/delete-duties'),true);assert.equal(permitted('user','POST','/api/people/delete-duties'),false);
});
test('Dienste ausserhalb der regionalen Berechtigung können auch bei sichtbarer Person nicht gelöscht werden',()=>{
 const s=state();s.regions=[{id:'N'},{id:'S'}];s.functions=[{id:'F',geo_ids:['N','S'],covers:{}}];s.assignments=[{assignment_id:'hidden',employee_id:'1',function_id:'F',geodependency:'S',revision:1}];s.outbox=[];const before=structuredClone(s);assert.throws(()=>bulkDeletePersonDuties(s,{employee_ids:['1'],expected:[]},{role:'planner',access_scope:{region_ids:['N']}}),{status:403});assert.deepEqual(s,before);
});
