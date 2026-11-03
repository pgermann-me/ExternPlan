import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment,instant,makeExport as actualMakeExport} from '../domain.js';
import {transferAssignment} from '../assignment-transfer.js';
import {planningChange,undoPlanning} from '../planning-undo.js';
const setup=(extra={})=>{const s=demo();const a=validateAssignment(s,{employee_id:'DEMO-001',function_id:'DEMO-KTD',geodependency:'NORD',priority:2,start_on:'2026-10-24T07:00+02:00',end_on:'2026-10-25T07:00+01:00',...extra}).assignment;s.assignments.push(a);s.assignment_styles={[a.assignment_id]:{color:'#123abc',favorite_id:'origin-favorite'}};return {s,a};};
const request=a=>({revision:a.revision,employee_id:'DEMO-EXT-001',start_on:'2026-10-24T12:00+02:00',end_on:'2026-10-24T18:00+02:00'});
test('Mittlerer Zeitbereich wird lückenlos übertragen; Farbe, Funktion, Gebiet und Priorität bleiben erhalten',()=>{
 const {s,a}=setup(),r=transferAssignment(s,a.assignment_id,request(a));assert.equal(r.assignments.length,3);assert.deepEqual(r.assignments.map(p=>p.employee_id),['DEMO-001','DEMO-EXT-001','DEMO-001']);assert.equal(r.assignments[0].assignment_id,a.assignment_id);assert.equal(r.assignments[0].revision,2);assert.equal(r.transferred.employee_id,'DEMO-EXT-001');
 for(let i=0;i<3;i++){const p=r.assignments[i];assert.equal(p.function_id,a.function_id);assert.equal(p.geodependency,a.geodependency);assert.equal(p.priority,2);assert.deepEqual(s.assignment_styles[p.assignment_id],s.assignment_styles[a.assignment_id]);if(i)assert.equal(r.assignments[i-1].end_on,p.start_on);}
 assert.equal(r.assignments[0].start_on,a.start_on);assert.equal(r.assignments[2].end_on,a.end_on);assert.deepEqual(s.outbox.map(c=>c.action),['update','create','create']);assert.equal(makeExport(s,'snapshot').changes.length,3);
});
test('Beginn, Ende und kompletter Dienst lassen sich ohne Null-Längen übergeben',()=>{
 for(const [start,end,count,employee] of [['2026-10-24T07:00+02:00','2026-10-24T12:00+02:00',2,'DEMO-EXT-001'],['2026-10-24T18:00+02:00','2026-10-25T07:00+01:00',2,'DEMO-001'],['2026-10-24T07:00+02:00','2026-10-25T07:00+01:00',1,'DEMO-EXT-001']]){const {s,a}=setup();const r=transferAssignment(s,a.assignment_id,{...request(a),start_on:start,end_on:end});assert.equal(r.assignments.length,count);assert.equal(r.assignments[0].employee_id,employee);assert.ok(r.assignments.every(p=>instant(p.end_on)>instant(p.start_on)));}
});
test('Ungültige Bereiche, veraltete Revisionen, archivierte oder unzulässige Personen ändern nichts',()=>{
 const {s,a}=setup();for(const bad of [{revision:99},{employee_id:a.employee_id},{employee_id:'missing'},{start_on:'2026-10-24T06:00+02:00'},{end_on:'2026-10-25T08:00+01:00'},{start_on:'2026-10-24T18:00+02:00',end_on:'2026-10-24T12:00+02:00'}]){const before=structuredClone(s);assert.throws(()=>transferAssignment(s,a.assignment_id,{...request(a),...bad}));assert.deepEqual(s,before);}
 s.people[1].deleted_at='2026-10-19';assert.throws(()=>transferAssignment(s,a.assignment_id,request(a)),/Person/);delete s.people[1].deleted_at;s.functions[0].group_ids=['not-a-membership'];assert.throws(()=>transferAssignment(s,a.assignment_id,request(a)),/Funktion/);
});
test('Ein Konflikt beim zweiten Teilstück verhindert auch die Änderung des ersten',()=>{
 const {s,a}=setup();s.assignments.push(validateAssignment(s,{...a,employee_id:'DEMO-EXT-001',start_on:'2026-10-24T12:00+02:00',end_on:'2026-10-24T18:00+02:00'}).assignment);const before=structuredClone(s);assert.throws(()=>transferAssignment(s,a.assignment_id,request(a)),/Doppel/);assert.deepEqual(s,before);
});
test('Sommer-/Winterzeit bleibt sekundengenau; mehrdeutige neue Uhrzeiten benötigen einen Offset',()=>{
 const {s,a}=setup();const before=structuredClone(s);assert.throws(()=>transferAssignment(s,a.assignment_id,{...request(a),start_on:'2026-10-25T02:10',end_on:'2026-10-25T02:50'}),/Mehrdeutig/);assert.deepEqual(s,before);const r=transferAssignment(s,a.assignment_id,{...request(a),start_on:'2026-10-25T02:10:12+02:00',end_on:'2026-10-25T02:50:34+01:00'});assert.equal(instant(r.transferred.end_on)-instant(r.transferred.start_on),6022000);assert.ok(r.transferred.start_on.endsWith('12+02:00'));assert.ok(r.transferred.end_on.endsWith('34+01:00'));
});
test('Die gesamte Übergabe lässt sich als eine Planungsänderung rückgängig machen',()=>{
 const {s,a}=setup();const r=planningChange(s,()=>transferAssignment(s,a.assignment_id,request(a)));assert.ok(r.undo_token);undoPlanning(s,r.undo_token);assert.equal(s.assignments.length,1);assert.deepEqual({...s.assignments[0],revision:a.revision},a);assert.equal(s.assignments[0].revision,3);assert.equal(s.assignment_styles[a.assignment_id].color,'#123abc');assert.equal(s.outbox.filter(c=>c.action==='delete').length,2);
});

const makeExport=(s,mode='delta',at=instant('2026-10-24T00:00+02:00'))=>actualMakeExport(s,mode,at);
