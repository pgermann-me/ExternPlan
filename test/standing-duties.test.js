import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStandingFunction} from '../standing-duties.js';
import {demo,validateAssignment,makeExport,instant} from '../domain.js';
import {availableFunctions,controlFunctions} from '../public/organization.js';
import {personMonth} from '../person-planning.js';
import {saveFavorite} from '../favorites.js';
const setup=()=>{const s=demo(),a=validateAssignment(s,{employee_id:'DEMO-001',function_id:'DEMO-KTD',geodependency:'NORD',priority:3,start_on:'2026-10-22T00:00+02:00',end_on:'2026-12-31T23:59+01:00'}).assignment;s.assignments.push(a);s.functions[0].duty_time_model='always';return {s,a};};
test('Immer benötigt nur den Zeitbereich, keine Dienstfarbe; ungültiges Modell ablehnen',()=>{
 assert.doesNotThrow(()=>validateStandingFunction({duty_time_model:'always'}));assert.throws(()=>validateStandingFunction({duty_time_model:'weekly'}));
});
test('Immer aus Kontrollansicht und Planungsfiltern entfernen; alte Dienste nicht als Balken darstellen',()=>{
 const {s,a}=setup(),before=structuredClone(s.assignments);assert(!availableFunctions(s).some(f=>f.id===a.function_id));assert(!controlFunctions(s).some(f=>f.id===a.function_id));assert.throws(()=>personMonth(s,'2026-10',a.function_id),/unbekannt/);
 const result=personMonth(s,'2026-10');assert(result.rows.every(row=>row.bars.every(bar=>bar.function_id!==a.function_id)));assert.deepEqual(s.assignments,before);
});
test('Weder manuelle Zuteilungen noch Favoriten dürfen Immer-Funktionen planen',()=>{
 const {s,a}=setup();assert.throws(()=>validateAssignment(s,{...a,start_on:'2027-01-01T00:00+01:00',end_on:'2027-01-02T00:00+01:00'}),/keine Dienste/);assert.throws(()=>saveFavorite(s,{name:'Nicht planen',scope_type:'function',scope_id:a.function_id,function_id:a.function_id,region_ids:['NORD'],start_time:'07:00',duration_minutes:60,priority:1}),/keine Dienste/);
});
test('Immer aus beiden ELS-Exportmodi ausschliessen, auch frühere Exportdaten nicht erneut übermitteln',()=>{
 const {s,a}=setup(),now=instant('2026-10-22T00:00+02:00');s.functions[0].duty_time_model='scheduled';makeExport(s,'snapshot',now);s.functions[0].duty_time_model='always';s.outbox.push({action:'delete',...a,revision:2});const before=structuredClone(s.assignments);
 for(const mode of ['delta','snapshot'])assert.equal(makeExport(s,mode,now).changes.length,0);assert.deepEqual(s.assignments,before);
});
