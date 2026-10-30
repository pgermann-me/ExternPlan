import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../data-cleanup.js';
import {planningStatistics} from '../statistics.js';
import {scopedState} from '../access-scope.js';
import {permitted,roleViews} from '../accounts.js';
function fixture(){
 const s=emptyState();s.departments=[{id:'D'},{id:'OTHER'}];s.groups=[{id:'G',department_id:'D'},{id:'H',department_id:'OTHER'}];s.regions=[{id:'R1'},{id:'R2'}];s.functions=[{id:'F',name:'Pikett',geo_ids:['R1','R2'],covers:{}},{id:'F2',name:'Zweite Funktion',geo_ids:[],covers:{}},{id:'W',name:'Immer',geo_ids:['R1'],duty_time_model:'always',covers:{}}];s.people=[{employee_id:'P',name:'Anna Muster',first_name:'Anna',last_name:'Muster',department_id:'D',group_ids:['G']},{employee_id:'Q',name:'Andere Person',department_id:'OTHER',group_ids:['H']}];
 const a=(id,from,to,extra={})=>({assignment_id:id,employee_id:'P',function_id:'F',geodependency:'R1',start_on:from,end_on:to,...extra});
 s.assignments=[a('A','2026-10-01T06:00+02:00','2026-10-01T12:00+02:00'),a('B','2026-10-01T10:00+02:00','2026-10-01T14:00+02:00',{geodependency:'R2'}),a('C','2026-10-01T15:00+02:00','2026-10-01T17:00+02:00'),a('D','2026-10-01T07:00+02:00','2026-10-01T09:00+02:00',{function_id:'F2',geodependency:null}),a('Q','2026-10-01T08:00+02:00','2026-10-01T09:00+02:00',{employee_id:'Q'}),a('W','2026-10-01T00:00+02:00','2026-10-02T00:00+02:00',{function_id:'W'})];return s;
}
const range={date_from:'2026-10-01',date_to:'2026-10-01'};
test('Statistics aggregate actual hours per person/function without double-counting overlapping regions',()=>{
 const s=fixture(),before=structuredClone(s),r=planningStatistics(s,range);assert.equal(r.rows.length,3);assert.equal(r.rows.find(x=>x.employee_id==='P'&&x.function_id==='F').hours,10);assert.equal(r.rows.find(x=>x.employee_id==='P'&&x.function_id==='F2').hours,2);assert.equal(r.total_hours,13);assert.equal(r.people_count,2);assert.equal(r.function_count,2);assert.equal(r.rows.find(x=>x.employee_id==='P').person_name,'Muster Anna');assert.deepEqual(s,before);
 assert.equal(planningStatistics(s,{...range,function_id:'F',region_id:'R1'}).total_hours,9);assert.equal(planningStatistics(s,{...range,department_id:'D',group_id:'G',function_id:'F'}).total_hours,10);
 assert.equal(planningStatistics(s,{date_from:'2027-01-01',date_to:'2027-01-31'}).rows.length,0);
});
test('Inclusive Swiss dates clip crossing services and count 23/25-hour daylight-saving days correctly',()=>{
 const s=fixture();s.assignments=s.assignments.slice(0,1);Object.assign(s.assignments[0],{start_on:'2026-10-24T07:00+02:00',end_on:'2026-10-26T07:00+01:00'});assert.equal(planningStatistics(s,{date_from:'2026-10-25',date_to:'2026-10-25'}).total_hours,25);Object.assign(s.assignments[0],{start_on:'2026-03-28T07:00+01:00',end_on:'2026-03-30T07:00+02:00'});assert.equal(planningStatistics(s,{date_from:'2026-03-29',date_to:'2026-03-29'}).total_hours,23);
 Object.assign(s.assignments[0],{start_on:'2026-09-30T22:00+02:00',end_on:'2026-10-01T00:00+02:00'});assert.equal(planningStatistics(s,range).total_hours,0);
});
test('Scoped planners see only their actual permitted assignments; historical people/functions stay named',()=>{
 const s=fixture(),user={role:'planner',access_scope:{department_ids:['D'],group_ids:['G'],region_ids:['R1']}};const result=planningStatistics(scopedState(s,user),range);assert.equal(result.people_count,1);assert.equal(result.total_hours,8);assert.ok(result.rows.every(r=>r.employee_id==='P'&&r.function_id==='F'));
 s.people[0].deleted_at='2026-10-02';s.functions[0].deleted_at='2026-10-02';const historical=planningStatistics(s,range).rows.find(r=>r.employee_id==='P'&&r.function_id==='F');assert.equal(historical.hours,10);assert.equal(historical.person_archived,true);assert.equal(historical.function_archived,true);
});
test('Statistics validate filters/date ranges and are accessible only to planners and admins',()=>{
 const s=fixture();for(const patch of [{date_from:''},{date_to:'2026-02-30'},{date_to:'2026-09-30'},{function_id:'hidden'},{group_id:'H',department_id:'D'}])assert.throws(()=>planningStatistics(s,{...range,...patch}));
 for(const role of ['admin','planner']){assert.equal(permitted(role,'GET','/api/statistics'),true);assert.ok(roleViews[role].includes('statistics'));}assert.equal(permitted('user','GET','/api/statistics'),false);assert.ok(!roleViews.user.includes('statistics'));
});
