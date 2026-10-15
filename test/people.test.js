import test from 'node:test';
import assert from 'node:assert/strict';
import {manualPerson,deletePerson} from '../people.js';
import {normalizeSapPerson} from '../adapters/sap.js';
test('Getrennte Namen, Kontaktstandard 0 und unveränderliche Kennung bei Bearbeitung',()=>{
 const p=manualPerson({first_name:' Anna ',last_name:' Muster ',contacts:[{type:'email',value:'anna@example.test'}]},null,'EXT-generated');
 assert.equal(p.name,'Anna Muster');assert.equal(p.first_name,'Anna');assert.equal(p.last_name,'Muster');assert.equal(p.contacts[0].priority,0);
 const updated=manualPerson({first_name:'Anne',last_name:'Muster',employee_id:'Andere-ID',contacts:p.contacts},p);
 assert.equal(updated.employee_id,'EXT-generated');assert.equal(updated.name,'Anne Muster');
 assert.throws(()=>manualPerson({first_name:'Anna',last_name:''},null,'EXT-invalid'),/Vorname und Name/);
});
test('Bestehende vollständige Namen und weitere Kontakte gehen nicht verloren',()=>{
 const legacy={employee_id:'LEGACY-ID',name:'Bestehender vollständiger Name',source:'manual',contacts:[{type:'Telefon',value:'Alt',priority:3}]};
 const updated=manualPerson({first_name:'',last_name:''},legacy);
 assert.equal(updated.name,legacy.name);assert.equal(updated.employee_id,legacy.employee_id);assert.deepEqual(updated.contacts,legacy.contacts);
});
test('SAP nimmt getrennte Namen explizit entgegen und lässt persID unverändert',()=>{
 const mapping={employee_id:'persID',first_name:'Vorname',last_name:'Name',department_id:'Abteilung',contacts:'Kontakte'};
 const p=normalizeSapPerson({persID:'SAP-123',Vorname:'Anna',Name:'Muster',Abteilung:'A',Kontakte:[{type:'phone_mobile',value:'Beispiel'}]},mapping);
 assert.equal(p.employee_id,'SAP-123');assert.equal(p.name,'Anna Muster');assert.equal(p.first_name,'Anna');assert.equal(p.last_name,'Muster');assert.equal(p.contacts[0].priority,0);
 const legacy=normalizeSapPerson({persID:'SAP-456',name:'Unaufgeteilter Name',department:'A'},{employee_id:'persID',name:'name',department_id:'department'});
 assert.equal(legacy.name,'Unaufgeteilter Name');assert.equal(legacy.first_name,undefined);
});

test('Personenlöschung schützt laufende und zukünftige Dienste und erhält die Historie am exakten Dienstende',()=>{
 const now=Date.parse('2026-10-15T12:00:00Z');
 for(const end of [now+1,now+86400000]){const s={people:[{employee_id:'P'}],assignments:[{employee_id:'P',end_on:new Date(end).toISOString()}],audit:[]};assert.throws(()=>deletePerson(s,'P',now),/laufende oder zukünftige/);assert.equal(s.people[0].deleted_at,undefined);assert.equal(s.audit.length,0);}
 const duty={employee_id:'P',end_on:new Date(now).toISOString()};const s={people:[{employee_id:'P',name:'Name'}],assignments:[duty],audit:[]};assert.equal(deletePerson(s,'P',now).archived,true);assert.equal(s.people[0].deleted_at,'2026-10-15T14:00:00+02:00');assert.deepEqual(s.assignments,[duty]);assert.equal(s.audit[0].action,'delete');assert.throws(()=>deletePerson(s,'P',now),/nicht gefunden/);
 const idle={people:[{employee_id:'SAP',source:'SAP'}],assignments:[],audit:[]};assert.equal(deletePerson(idle,'SAP',now).ok,true);
});
