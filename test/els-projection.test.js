import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment,change,makeExport,confirmExport,instant} from '../domain.js';
import {mergeContinuousDuties} from '../continuous-migration.js';
const now=instant('2026-10-24T00:00+02:00');
const create=(s,extra={})=>{const a=validateAssignment(s,{employee_id:'DEMO-001',function_id:'DEMO-KTD',geodependency:'NORD',priority:3,start_on:'2026-10-01T00:00+02:00',end_on:'2026-12-31T23:59+01:00',...extra}).assignment;s.assignments.push(a);change(s,'create',a);return a;};
test('Fünf Schweizer Tage: lange Dienste nur im Export aufgeteilt, Winterzeit lokal korrekt',()=>{
 const s=demo(),a=create(s),before=structuredClone(s.assignments),e=makeExport(s,'snapshot',now);assert.deepEqual(s.assignments,before);assert.equal(e.scope.from,'2026-10-24T00:00:00+02:00');assert.equal(e.scope.until,'2026-10-29T00:00:00+01:00');assert.equal(e.changes.length,6);assert(e.changes.every(c=>c.source_assignment_id===a.assignment_id&&c.priority===3&&instant(c.end_on)-instant(c.start_on)<=86400000));assert.equal(e.changes[0].start_on,e.scope.from);assert.equal(e.changes.at(-1).end_on,e.scope.until);for(let i=1;i<e.changes.length;i++)assert.equal(e.changes[i-1].end_on,e.changes[i].start_on);assert.deepEqual(e.changes.filter(c=>c.start_on.startsWith('2026-10-25')).map(c=>c.end_on),['2026-10-25T23:00:00+01:00','2026-10-26T00:00:00+01:00']);
});
test('Rollierendes Delta läuft ohne neue Planung weiter; Teilstückkennungen stabil und Revisionen steigen',()=>{
 const s=demo(),a=create(s),first=makeExport(s,'delta',now);assert.equal(makeExport(s,'delta',now).changes.length,first.changes.length);confirmExport(s,first.export_id);assert.equal(s.outbox.length,0);assert.equal(makeExport(s,'delta',now).changes.length,0);
 const moved=makeExport(s,'delta',now+3600000),firstId=first.changes[0].assignment_id,row=moved.changes.find(c=>c.assignment_id===firstId);assert(row);assert.equal(row.start_on,'2026-10-24T01:00:00+02:00');assert(row.revision>first.changes[0].revision);confirmExport(s,moved.export_id);confirmExport(s,first.export_id);assert.equal(s.els.assignments[firstId].start_on,row.start_on);assert.equal(s.els.assignments[a.assignment_id].revision,1);
 const future=makeExport(s,'delta',instant('2026-10-30T00:00+01:00'));assert(future.changes.some(c=>c.action==='create'&&c.start_on.startsWith('2026-11-03')));assert(future.changes.some(c=>c.action==='delete'));assert.equal(s.assignments.length,1);
});
test('Löschungen werden auf frühere Teilstücke übertragen, fehlgeschlagene Tombstones wiederholt',()=>{
 const s=demo(),a=create(s),first=makeExport(s,'delta',now);confirmExport(s,first.export_id);s.assignments=[];change(s,'delete',{...a,revision:2});const removed=makeExport(s,'delta',now);assert.equal(removed.changes.length,6);assert(removed.changes.every(c=>c.action==='delete'&&!('start_on'in c)));
 confirmExport(s,removed.export_id,{syncPerson(){},applyAssignment(){return {acknowledged:false,error:'Testfehler'};}});assert.equal(s.outbox.length,1);const retry=makeExport(s,'delta',now);assert.deepEqual(retry.changes,removed.changes);confirmExport(s,retry.export_id);assert.equal(s.outbox.length,0);assert.equal(s.els.assignments[a.assignment_id].deleted,true);confirmExport(s,first.export_id);assert.equal(s.els.assignments[a.assignment_id].deleted,true);
});
test('Dienste ausserhalb des Fensters bleiben lokal und werden später exportiert; Sommerzeittag hat 23h',()=>{
 const s=demo(),a=create(s,{start_on:'2026-11-01T00:00+01:00',end_on:'2026-11-02T00:00+01:00'});assert.equal(makeExport(s,'delta',now).changes.length,0);assert.equal(s.outbox.length,1);assert.equal(makeExport(s,'delta',instant('2026-10-30T00:00+01:00')).changes[0].source_assignment_id,a.assignment_id);
 const spring=demo();create(spring,{start_on:'2026-03-28T00:00+01:00',end_on:'2026-04-10T00:00+02:00'});const e=makeExport(spring,'snapshot',instant('2026-03-28T00:00+01:00')),day=e.changes.find(c=>c.start_on.startsWith('2026-03-29'));assert.equal(instant(day.end_on)-instant(day.start_on),23*3600000);
});
test('Migration verbindet nur kompatible markierte Immer-Dienste und erhält Prioritäten/Farben',()=>{
 const s=demo(),a=create(s,{start_on:'2026-10-24T00:00+02:00',end_on:'2026-10-25T00:00+02:00'}),b=create(s,{start_on:a.end_on,end_on:'2026-10-26T00:00+01:00'}),c=create(s,{priority:2,start_on:b.end_on,end_on:'2026-10-27T00:00+01:00'});s.assignment_styles=Object.fromEntries([a,b,c].map(a=>[a.assignment_id,{standing_function_id:a.function_id,color:'#808080'}]));assert.equal(mergeContinuousDuties(s).merged,1);assert.equal(s.assignments.length,2);assert.equal(a.end_on,b.end_on);assert.equal(a.priority,3);assert.equal(c.priority,2);assert(s.outbox.some(x=>x.assignment_id===b.assignment_id&&x.action==='delete'));assert.equal(mergeContinuousDuties(s).merged,0);
});

test('Legacy-Exportkennungen werden einmal gelöscht, ohne die Bestätigung des langen Quelldiensts zu verlieren',()=>{
 const s=demo(),a=create(s);s.exports.push({payload:{export_id:'legacy',changes:[{action:'create',...a}]}});s.els.assignments[a.assignment_id]={...a};const first=makeExport(s,'delta',now);assert(first.changes.some(c=>c.assignment_id===a.assignment_id&&c.action==='delete'));confirmExport(s,first.export_id);assert.equal(s.els.assignments[a.assignment_id].deleted,false);assert.equal(s.els.projection_receipts[a.assignment_id].deleted,true);assert.equal(makeExport(s,'delta',now).changes.length,0);
});

import {simulatedElsAdapter} from '../adapters/els.js';
test('Erfolgreicher Legacy-Tombstone quittiert keine teilweise fehlgeschlagene neue Projektion',()=>{
 const s=demo(),a=create(s);s.exports.push({payload:{export_id:'legacy',changes:[{action:'create',...a}]}});const e=makeExport(s,'delta',now),blocked=e.changes.find(c=>c.source_assignment_id===a.assignment_id).assignment_id;
 confirmExport(s,e.export_id,{syncPerson:simulatedElsAdapter.syncPerson,applyAssignment(els,c){return c.assignment_id===blocked?{acknowledged:false,error:'Testfehler'}:simulatedElsAdapter.applyAssignment(els,c);}});assert.equal(s.outbox.length,1);assert.equal(s.els.assignments[a.assignment_id]?.projection_summary,undefined);const retry=makeExport(s,'delta',now);assert(retry.changes.some(c=>c.assignment_id===blocked));confirmExport(s,retry.export_id);assert.equal(s.outbox.length,0);
});
