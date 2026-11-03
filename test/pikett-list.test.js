import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../domain.js';
import {pikettList,listContacts} from '../public/pikett-list-data.js';
const assignment=(id,start,end,extra={})=>({assignment_id:id,employee_id:'DEMO-001',function_id:'DEMO-KTD',geodependency:'NORD',start_on:start,end_on:end,...extra});
test('Pikettliste zeigt gültige sowie später am Schweizer Tag startende Dienste; Ende ist exklusiv',()=>{
 const s=demo();s.assignments=[assignment('active','2026-10-18T07:00:00+02:00','2026-10-20T07:00:00+02:00'),assignment('ended','2026-10-19T07:00:00+02:00','2026-10-19T12:00:00+02:00'),assignment('later','2026-10-19T17:00:00+02:00','2026-10-20T07:00:00+02:00'),assignment('tomorrow','2026-10-20T00:00:00+02:00','2026-10-21T00:00:00+02:00')];
 const rows=pikettList(s,'2026-10-19T12:00:00+02:00').rows;assert.deepEqual(rows.map(r=>r.assignment_id),['active','later']);assert.deepEqual(rows.map(r=>r.future),[false,true]);assert.equal(rows[0].function_name,'KTD Pikett');assert.equal(rows[0].region_name,'Beispiel NORD');
 assert.equal(pikettList(s,'2026-10-19T17:00:00+02:00').rows.find(r=>r.assignment_id==='later').future,false);
 assert.deepEqual(pikettList(s,'2026-11-01T12:00:00+01:00').rows,[]);
});
test('Schweizer Tagesgrenze, Zeitumstellung und historische Namen bleiben korrekt',()=>{
 const s=demo();s.archived_people=[{...s.people[0],first_name:'Anna',last_name:'Historisch'}];s.people.shift();s.archived_master={functions:[s.functions.shift()],regions:[s.regions.shift()]};
 s.assignments=[assignment('night','2026-10-24T22:30:00Z','2026-10-25T06:00:00Z')];
 assert.equal(pikettList(s,'2026-10-24T21:30:00Z').rows.length,0);
 const row=pikettList(s,'2026-10-24T22:00:00Z').rows[0];assert.equal(row.future,true);assert.equal(row.person_name,'Historisch Anna');assert.equal(row.function_name,'KTD Pikett');assert.equal(row.region_name,'Beispiel NORD');
 assert.equal(pikettList(s,'2026-10-25T02:30:00+02:00').rows[0].future,false);assert.equal(pikettList(s,'2026-10-25T02:30:00+01:00').rows[0].future,false);
});
test('Nur Telefonnummern werden nach Priorität ausgegeben',()=>{
 assert.deepEqual(listContacts([{type:'email',value:'person@example.invalid',priority:1},{type:'E-Mail',value:'andere@example.invalid',priority:0},{type:'Email',value:'dritte@example.invalid',priority:2},{type:'Notiz',value:'Hinweis',priority:0},{type:'phone_private',value:'3',priority:0},{type:'Polycom',value:'2',priority:2},{type:'phone_mobile',value:'1',priority:1}]),['(1) Telefon Mobil: 1','(2) Polycom: 2','Telefon Privat: 3']);
});
