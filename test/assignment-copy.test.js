import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment,instant} from '../domain.js';
import {copyAssignments} from '../assignment-copy.js';
import {planningChange,undoPlanning} from '../planning-undo.js';
import {permitted} from '../accounts.js';
const admin={role:'admin'};
function setup(){
 const s=demo();const a=validateAssignment(s,{employee_id:'DEMO-001',function_id:'DEMO-KTD',geodependency:'NORD',priority:2,start_on:'2026-10-24T07:00+02:00',end_on:'2026-10-25T07:00+01:00'}).assignment;s.assignments.push(a);
 const b=validateAssignment(s,{employee_id:'DEMO-EXT-001',function_id:'DEMO-KTD',geodependency:'SÜD',priority:3,start_on:'2026-10-27T19:00+01:00',end_on:'2026-10-28T07:00+01:00'}).assignment;s.assignments.push(b);
 s.assignment_styles={[a.assignment_id]:{color:'#123abc',favorite_id:'F'},[b.assignment_id]:{color:'#9900aa'}};
 return {s,a,b};
}
const request=s=>({assignments:s.assignments.map(a=>({assignment_id:a.assignment_id,revision:a.revision})).reverse(),employee_id:'DEMO-EXT-001',date:'2026-11-01'});
test('Copy preserves calendar offsets, clocks, function, region, priority and styles with new identities and one undo',()=>{
 const {s,a,b}=setup(),before=structuredClone(s),r=planningChange(s,()=>copyAssignments(s,request(s),admin));assert.equal(r.assignments.length,2);assert.ok(r.undo_token);
 const first=r.assignments.find(x=>x.geodependency==='NORD'),second=r.assignments.find(x=>x.geodependency==='SÜD');assert.equal(first.start_on,'2026-11-01T07:00:00+01:00');assert.equal(first.end_on,'2026-11-02T07:00:00+01:00');assert.equal(second.start_on,'2026-11-04T19:00:00+01:00');assert.equal(second.end_on,'2026-11-05T07:00:00+01:00');assert.equal(instant(first.end_on)-instant(first.start_on),86400000);
 for(const [copy,source] of [[first,a],[second,b]]){assert.equal(copy.employee_id,'DEMO-EXT-001');assert.notEqual(copy.assignment_id,source.assignment_id);assert.equal(copy.revision,1);assert.equal(copy.priority,source.priority);assert.deepEqual(s.assignment_styles[copy.assignment_id],before.assignment_styles[source.assignment_id]);}
 assert.deepEqual(s.assignments.slice(0,2),before.assignments);assert.equal(s.outbox.length,2);assert.ok(s.outbox.every(c=>c.action==='create'));undoPlanning(s,r.undo_token);assert.deepEqual(s.assignments,before.assignments);assert.deepEqual(s.assignment_styles,before.assignment_styles);
});
test('Source conflicts, invalid dates and a late duplicate leave every original and style unchanged',()=>{
 const {s}=setup();for(const patch of [{date:'2026-02-30'},{employee_id:'missing'},{assignments:[]},{assignments:[{assignment_id:'missing',revision:1}]},{assignments:[{assignment_id:s.assignments[0].assignment_id,revision:99}]}]){const before=structuredClone(s);assert.throws(()=>copyAssignments(s,{...request(s),...patch},admin));assert.deepEqual(s,before);}
 const duplicate=validateAssignment(s,{...s.assignments[1],start_on:'2026-11-04T19:00+01:00',end_on:'2026-11-05T07:00+01:00'}).assignment;s.assignments.push(duplicate);const before=structuredClone(s);const input=request(s);input.assignments=before.assignments.slice(0,2).map(a=>({assignment_id:a.assignment_id,revision:a.revision}));assert.throws(()=>copyAssignments(s,input,admin),/Doppel/);assert.deepEqual(s,before);
});
test('Scoped users cannot copy hidden sources, hidden targets or services outside the selected organization',()=>{
 const {s,a}=setup(),before=structuredClone(s);assert.throws(()=>copyAssignments(s,request(s),{role:'user',access_scope:{region_ids:['NORD']}}),{status:403});assert.deepEqual(s,before);
 s.people.push({employee_id:'HIDDEN',name:'Hidden',department_id:'OTHER',contacts:[]});const single={...request(s),assignments:[{assignment_id:a.assignment_id,revision:a.revision}],employee_id:'HIDDEN'};assert.throws(()=>copyAssignments(s,single,{role:'planner',access_scope:{department_ids:['demo-abteilung']}}),{status:403});
 assert.throws(()=>copyAssignments(s,{...single,employee_id:'DEMO-001',planning_group_id:'demo-gruppe'},admin),/Gruppe/);
 for(const role of ['user','planner','admin'])assert.equal(permitted(role,'POST','/api/assignments/copy'),true);
});
test('Nonexistent Swiss wall times reject a copy; the repeated autumn hour keeps its offset on an unchanged date',()=>{
 const {s}=setup();s.assignments=[];const a=validateAssignment(s,{employee_id:'DEMO-001',function_id:'DEMO-KTD',geodependency:'NORD',priority:1,start_on:'2026-03-28T02:30+01:00',end_on:'2026-03-28T04:00+01:00'}).assignment;s.assignments.push(a);const before=structuredClone(s);assert.throws(()=>copyAssignments(s,{...request(s),date:'2026-03-29'},admin),/existiert/);assert.deepEqual(s,before);
 s.assignments=[validateAssignment(s,{...a,start_on:'2026-10-25T02:30+01:00',end_on:'2026-10-25T04:00+01:00'}).assignment];const r=copyAssignments(s,{...request(s),date:'2026-10-25'},admin);assert.equal(r.assignments[0].start_on,'2026-10-25T02:30:00+01:00');
});
