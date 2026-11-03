import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment,change,makeExport} from '../domain.js';
import {planningChange,undoPlanning} from '../planning-undo.js';
import {saveFavorite,applyFavorite} from '../favorites.js';
import {publicState} from '../master-data.js';
const input={employee_id:'DEMO-001',function_id:'DEMO-ORT',geodependency:null,priority:1,start_on:'2026-10-20T07:00+02:00',end_on:'2026-10-20T19:00+02:00'};
const create=s=>planningChange(s,()=>{const r=validateAssignment(s,input);s.assignments.push(r.assignment);change(s,'create',r.assignment);return r;});
test('Undo creation emits a newer deletion and consumes the private token',()=>{
 const s=demo(),r=create(s);assert.ok(r.undo_token);assert.equal(publicState(s).planning_undo,undefined);undoPlanning(s,r.undo_token);assert.equal(s.assignments.length,0);assert.equal(s.outbox.at(-1).action,'delete');assert.equal(s.outbox.at(-1).revision,2);assert.throws(()=>undoPlanning(s,r.undo_token));
});
test('Undo edits and exported deletions restores times with increasing ELS revisions',()=>{
 const s=demo(),a=create(s).assignment;
 const edited=planningChange(s,()=>{const r=validateAssignment(s,{...a,priority:2},a);s.assignments[0]=r.assignment;change(s,'update',r.assignment);return r;});
 undoPlanning(s,edited.undo_token);assert.equal(s.assignments[0].priority,1);assert.equal(s.assignments[0].revision,3);
 const deleted=planningChange(s,()=>{const a=s.assignments.pop();change(s,'delete',{...a,revision:a.revision+1});return {ok:true};});
 const exported=makeExport(s);s.outbox=[];undoPlanning(s,deleted.undo_token);assert.equal(s.assignments[0].revision,5);assert.equal(s.assignments[0].start_on,a.start_on);assert.equal(s.outbox.at(-1).action,'create');assert.ok(exported);
});
test('Undo weekly multi-region favorites removes only the newly planned pieces',()=>{
 const s=demo();create(s);const kept=structuredClone(s.assignments);
 const f=saveFavorite(s,{name:'Woche',scope_type:'function',scope_id:'DEMO-KTD',function_id:'DEMO-KTD',region_ids:['NORD','SÜD'],priority:1,schedule_mode:'weekly',weekly_windows:[{weekdays:[1,2,3,4,5],start_time:'12:00',end_time:'14:00',end_day_offset:0}]});
 const r=planningChange(s,()=>applyFavorite(s,f.id,{employee_id:'DEMO-EXT-001',date:'2026-10-20',revision:f.revision}));assert.equal(r.assignments.length,10);undoPlanning(s,r.undo_token);assert.deepEqual(s.assignments,kept);assert.equal(Object.keys(s.assignment_styles).length,0);
});
test('Undo refuses concurrent changes and invalid restorations without partial writes',()=>{
 const s=demo(),r=create(s);s.assignments[0].revision++;const before=structuredClone(s);assert.throws(()=>undoPlanning(s,r.undo_token),/inzwischen/);assert.deepEqual(s,before);
 const clean=demo();create(clean);const removed=planningChange(clean,()=>{clean.assignments=[];return {};});clean.people[0].deleted_at='2026-10-20';const saved=structuredClone(clean);assert.throws(()=>undoPlanning(clean,removed.undo_token),/Person/);assert.deepEqual(clean,saved);
});
test('Idempotent weekly planning keeps the preceding undo available',()=>{
 const s=demo();const r=create(s);assert.equal(planningChange(s,()=>({ok:true})).undo_token,undefined);undoPlanning(s,r.undo_token);assert.equal(s.assignments.length,0);
});
test('Undo of an old deletion detects a later restore and re-delete',()=>{
 const s=demo();create(s);
 const remove=()=>planningChange(s,()=>{const a=s.assignments.pop();change(s,'delete',{...a,revision:a.revision+1});return {};});
 const first=remove();undoPlanning(s,first.undo_token);const second=remove();
 // A stale tab cannot restore an earlier deletion after another operation.
 assert.throws(()=>undoPlanning(s,first.undo_token));undoPlanning(s,second.undo_token);assert.equal(s.assignments[0].revision,5);
});
