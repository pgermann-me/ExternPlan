import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment} from '../domain.js';
import {personMonth} from '../person-planning.js';
const add=(s,extra={})=>{const a=validateAssignment(s,{employee_id:'DEMO-001',function_id:'DEMO-KTD',geodependency:'NORD',priority:1,start_on:'2026-10-07T07:00',end_on:'2026-10-08T07:00',...extra}).assignment;s.assignments.push(a);return a;};
test('Personenraster nach Funktion und mehreren Regionen ohne Duplikate',()=>{
 const s=demo();add(s);add(s,{employee_id:'DEMO-EXT-001',geodependency:'SÜD',priority:3});
 assert.equal(personMonth(s,'2026-10','DEMO-KTD',['NORD']).rows.length,1);
 const both=personMonth(s,'2026-10','DEMO-KTD',['NORD','SÜD']);assert.equal(both.rows.length,2);assert.equal(both.days.length,31);assert.equal(both.rows.find(p=>p.employee_id==='DEMO-EXT-001').cells[6].assignments[0].priority,3);
 assert.equal(personMonth(s,'2026-10','DEMO-KTD',[]).rows.length,0);
 assert.equal(personMonth(s,'2026-11','DEMO-KTD').rows.length,0);
});
test('Gesamtgebiet zählt über explizite Beziehungen, pro Person/Tag nur einmal',()=>{
 const s=demo();const a=add(s,{geodependency:'GANZ'});const result=personMonth(s,'2026-10','DEMO-KTD',['NORD','SÜD']);assert.equal(result.rows.length,1);assert.equal(result.rows[0].cells[6].assignments.length,1);assert.equal(result.rows[0].cells[6].assignments[0].assignment_id,a.assignment_id);
 s.functions[0].covers={};assert.equal(personMonth(s,'2026-10','DEMO-KTD',['NORD']).rows.length,0);
});
test('Tages-/Monatsgrenzen und Ende exklusiv im Personenraster',()=>{
 const s=demo();add(s,{start_on:'2026-09-30T20:00',end_on:'2026-10-02T00:00'});add(s,{employee_id:'DEMO-EXT-001',start_on:'2026-09-29T07:00',end_on:'2026-10-01T00:00'});
 const r=personMonth(s,'2026-10','DEMO-KTD',['NORD']);assert.equal(r.rows.length,1);assert.equal(r.rows[0].cells[0].assignments.length,1);assert.equal(r.rows[0].cells[1].assignments.length,0);
});
test('Ortsunabhängige Funktionen und Sommer-/Winterzeit-Tagesgrenzen',()=>{
 const s=demo();add(s,{function_id:'DEMO-ORT',geodependency:null,start_on:'2026-10-24T07:00',end_on:'2026-10-25T07:00'});
 const r=personMonth(s,'2026-10','DEMO-ORT',[]);assert.equal(r.rows.length,1);assert.equal(r.rows[0].cells[23].assignments.length,1);assert.equal(r.rows[0].cells[24].assignments.length,1);assert.equal(r.rows[0].cells[25].assignments.length,0);
 assert.throws(()=>personMonth(s,'2026-10','DEMO-KTD',['UA_SG']));assert.throws(()=>personMonth(s,'2026-13','DEMO-KTD'));assert.throws(()=>personMonth(s,'2026-10','UNKNOWN'));
});
