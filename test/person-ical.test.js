import test from 'node:test';
import assert from 'node:assert/strict';
import {personIcal} from '../public/person-ical.js';
const state=()=>({people:[{employee_id:'P',name:'Müller Anna'}],functions:[],regions:[],archived_master:{functions:[{id:'F',name:'Pikett, Arzt; Süd'}],regions:[{id:'R',name:'Rheintal'}]},assignments:[{assignment_id:'a',employee_id:'P',function_id:'F',geodependency:'R',priority:1,revision:2,start_on:'2026-10-24T07:00:00+02:00',end_on:'2026-10-25T07:00:00+01:00'}]});
test('iCal erhält Originaldienste über Zeitumstellung, stabile UID und Revision',()=>{
 const s=state(),ical=personIcal(s,'P','2026-10',new Date('2026-10-15T12:00Z'));assert.match(ical,/DTSTART:20261024T050000Z\r\nDTEND:20261025T060000Z/);assert.match(ical,/UID:a@externplan/);assert.match(ical,/SEQUENCE:1/);assert.match(ical,/SUMMARY:Pikett\\, Arzt\\; Süd\r\n/);assert.match(ical,/LOCATION:Rheintal\r\n/);assert.match(ical,/DTSTAMP:20261015T120000Z/);assert.equal(ical.match(/BEGIN:VEVENT/g).length,1);
 s.assignments[0].revision=3;assert.match(personIcal(s,'P','2026-10'),/UID:a@externplan\r\n.*\r\nSEQUENCE:2/);
});
test('iCal exportiert nur Person und Monatsüberschneidungen mit exklusivem Ende',()=>{
 const s=state();s.assignments.push({...s.assignments[0],assignment_id:'month',start_on:'2026-09-30T07:00+02:00',end_on:'2026-10-02T07:00+02:00'},{...s.assignments[0],assignment_id:'outside',start_on:'2026-09-30T07:00+02:00',end_on:'2026-10-01T00:00+02:00'},{...s.assignments[0],assignment_id:'other',employee_id:'OTHER'});
 const ical=personIcal(s,'P','2026-10');assert.equal(ical.match(/BEGIN:VEVENT/g).length,2);assert.match(ical,/UID:month@externplan/);assert.doesNotMatch(ical,/UID:outside|UID:other/);assert.match(ical,/DTSTART:20260930T050000Z/);assert.equal(personIcal(s,'P','2026-12').includes('BEGIN:VEVENT'),false);
});
test('iCal faltet UTF-8 nach 75 Oktetten und maskiert Text gegen neue Eigenschaften',()=>{
 const s=state();s.archived_master.functions[0].name='Ä'.repeat(70)+'\nBEGIN:VEVENT;Text,Ende\\';const ical=personIcal(s,'P','2026-10');for(const line of ical.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 const unfolded=ical.replace(/\r\n /g,'');assert.ok(unfolded.includes('Ä'.repeat(70)+'\\nBEGIN:VEVENT\\;Text\\,Ende\\\\'));assert.equal(ical.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1);assert.ok(ical.endsWith('\r\n'));
});
