import test from 'node:test';
import assert from 'node:assert/strict';
import {DateTime} from 'luxon';
import {createStandingDuties,standingDefaults,validateStandingFunction} from '../standing-duties.js';
const fixture=()=>({people:[{employee_id:'P1',function_regions:[{function_id:'J',geo_id:'J012',priority:3}]},{employee_id:'P2',function_regions:[{function_id:'J',geo_id:'J012',priority:1}]}],functions:[{id:'J',name:'Jäger',geo_ids:['J012'],covers:{},duty_time_model:'always'}],regions:[{id:'J012'}],groups:[],departments:[],assignments:[],outbox:[],audit:[]});
const duration=a=>DateTime.fromISO(a.end_on).toMillis()-DateTime.fromISO(a.start_on).toMillis();
test('Ständige Dienste für alle zugeordneten Personen mit Gebietspriorität und grauer Standardfarbe',()=>{
 const s=fixture(),result=createStandingDuties(s,'J',{from:'2026-10-21',to:'2026-10-22'});assert.equal(result.created,4);assert.equal(result.people,2);assert.equal(s.assignments[0].start_on,'2026-10-21T00:00:00+02:00');assert.equal(s.assignments[0].end_on,s.assignments[1].start_on);assert.equal(s.assignments[1].end_on,'2026-10-22T23:59:00+02:00');assert.deepEqual(s.assignments.map(a=>a.priority),[3,3,1,1]);assert(s.assignments.every(a=>s.assignment_styles[a.assignment_id].color==='#808080'));assert.equal(s.outbox.length,4);
 const original=structuredClone(s.assignments);assert.equal(createStandingDuties(s,'J',{from:'2026-10-21',to:'2026-10-22'}).created,0);assert.deepEqual(s.assignments,original);
});
test('Schweizer Vorgabe heute bis Jahresende; Jahresgrenze nach Schweizer Datum',()=>{
 assert.deepEqual(standingDefaults(Date.parse('2026-12-31T23:30:00Z')),{from:'2027-01-01',to:'2027-12-31'});const s=fixture();const result=createStandingDuties(s,'J',{},Date.parse('2026-12-30T12:00Z'));assert.equal(result.created,4);assert.equal(result.to,'2026-12-31');
});
test('Winterzeitkorrektur am Umstellungstag, nie mehr als 24h; Sommerzeittag 23h',()=>{
 const s=fixture();s.people=s.people.slice(0,1);createStandingDuties(s,'J',{from:'2026-10-24',to:'2026-10-26',color:'#123456'});assert.equal(s.assignments.length,4);assert(s.assignments.every(a=>duration(a)<=86400000));assert.equal(s.assignments[1].start_on,'2026-10-25T00:00:00+02:00');assert.equal(s.assignments[2].end_on,'2026-10-26T00:00:00+01:00');assert.equal(duration(s.assignments[2]),3600000);assert(s.assignments.every(a=>s.assignment_styles[a.assignment_id].color==='#123456'));for(let i=1;i<s.assignments.length;i++)assert.equal(s.assignments[i-1].end_on,s.assignments[i].start_on);
 const spring=fixture();spring.people=spring.people.slice(0,1);createStandingDuties(spring,'J',{from:'2026-03-29',to:'2026-03-30'});assert.equal(duration(spring.assignments[0]),23*3600000);
});
test('Nur Lücken ergänzen; bestehende Dienste weder überschreiben noch überlappen',()=>{
 const s=fixture();s.people=s.people.slice(0,1);s.assignments.push({assignment_id:'existing',employee_id:'P1',function_id:'J',geodependency:'J012',priority:5,start_on:'2026-10-21T08:00:00+02:00',end_on:'2026-10-21T12:00:00+02:00',revision:1});createStandingDuties(s,'J',{from:'2026-10-21',to:'2026-10-21'});assert.equal(s.assignments.length,3);assert.equal(s.assignments[0].priority,5);assert.equal(s.assignments[1].end_on,s.assignments[0].start_on);assert.equal(s.assignments[2].start_on,s.assignments[0].end_on);
});
test('Ungültige Daten, Farben und Zuordnungen schreiben keine Teilmenge',()=>{
 for(const input of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-22',to:'2026-10-21'},{from:'2026-01-01',to:'2027-01-02'},{color:'red'}]){const s=fixture(),before=structuredClone(s);assert.throws(()=>createStandingDuties(s,'J',input));assert.deepEqual(s,before);}
 const s=fixture();s.people[1].function_regions[0].geo_id='missing';const before=structuredClone(s);assert.throws(()=>createStandingDuties(s,'J',{from:'2026-10-21',to:'2026-10-22'}));assert.deepEqual(s,before);assert.throws(()=>validateStandingFunction({duty_time_model:'weekly'}));
});
test('Historische Dienste als Zuordnung nur für Personen ohne explizite Importzuordnungen',()=>{
 const s=fixture();s.people=[{employee_id:'legacy'},{employee_id:'removed',function_regions:[]}];for(const p of s.people)s.assignments.push({employee_id:p.employee_id,function_id:'J',geodependency:'J012',priority:2,start_on:'2020-01-01T00:00:00+01:00',end_on:'2020-01-02T00:00:00+01:00'});const result=createStandingDuties(s,'J',{from:'2026-10-21',to:'2026-10-21'});assert.equal(result.created,1);assert.equal(result.people,1);assert.equal(s.assignments.at(-1).employee_id,'legacy');
});
