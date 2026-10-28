import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,instant} from '../domain.js';
import {saveFavorite,previewFavorite,applyFavorite} from '../favorites.js';
import {planningChange,undoPlanning} from '../planning-undo.js';
import {assignmentsInRange} from '../public/planning-range.js';
const setup=(extra={})=>{const s=demo();const f=saveFavorite(s,{name:'Bereich',function_id:'DEMO-KTD',scope_type:'function',scope_id:'DEMO-KTD',region_ids:['NORD'],start_time:'07:00',duration_minutes:1440,priority:2,...extra});return {s,f};};
const input=(f,extra={})=>({employee_id:'DEMO-EXT-001',date_from:'2026-10-24',date_to:'2026-10-26',revision:f.revision,...extra});
test('Period planning repeats daily with fixed Swiss times across DST, skips duplicates and supports one undo',()=>{
 const {s,f}=setup();const before=structuredClone(s);const p=previewFavorite(s,f.id,input(f));assert.deepEqual(s,before);assert.equal(p.assignments.length,4); // 25-hour DST day is split into <=24h pieces.
 assert.equal(p.start_on,'2026-10-24T07:00:00+02:00');assert.equal(p.end_on,'2026-10-27T07:00:00+01:00');
 const r=planningChange(s,()=>applyFavorite(s,f.id,input(f)));assert.ok(r.undo_token);assert.equal(r.assignments.length,4);
 const again=applyFavorite(s,f.id,input(f));assert.equal(again.assignments.length,0);assert.equal(again.already_planned,4);
 undoPlanning(s,r.undo_token);assert.equal(s.assignments.length,0);assert.equal(s.outbox.at(-1).action,'delete');
});
test('Weekly patterns plan only starting weekdays inside the inclusive range',()=>{
 const {s,f}=setup({schedule_mode:'weekly',weekly_windows:[{weekdays:[1,3,5],start_time:'12:00',end_time:'14:00',end_day_offset:0},{weekdays:[5],start_time:'17:00',end_time:'08:00',end_day_offset:1}]});
 const r=applyFavorite(s,f.id,input(f,{date_from:'2026-10-20',date_to:'2026-10-23'}));assert.equal(r.assignments.length,3);assert.deepEqual(r.assignments.map(a=>a.start_on.slice(0,16)),['2026-10-21T12:00','2026-10-23T12:00','2026-10-23T17:00']);
 assert.equal(r.assignments.at(-1).end_on.slice(0,16),'2026-10-24T08:00');
});
test('Single fixed weekday repeats weekly without planning outside the range; empty result is valid',()=>{
 const {s,f}=setup({start_weekday:5,duration_minutes:120});
 assert.equal(previewFavorite(s,f.id,input(f,{date_from:'2026-10-20',date_to:'2026-10-29'})).assignments.length,1);
 const result=previewFavorite(s,f.id,input(f,{date_from:'2026-10-24',date_to:'2026-10-26'}));assert.equal(result.assignments.length,0);assert.equal(result.start_on,null);assert.equal(result.end_on,null);
});
test('Continuous presets use requested period, preserving original preset dates',()=>{
 const {s,f}=setup({schedule_mode:'continuous',start_date:'2026-09-01',end_date:'2026-09-02'});
 const before=structuredClone(f);const r=applyFavorite(s,f.id,input(f));assert.equal(r.assignments.length,1);assert.equal(r.start_on,'2026-10-24T00:00:00+02:00');assert.equal(r.end_on,'2026-10-26T23:59:00+01:00');assert.deepEqual(f,before);
});
test('Invalid date ranges and late validation failures never partially plan',()=>{
 const {s,f}=setup();for(const extra of [{date_from:undefined},{date_to:'2026-02-30'},{date_to:'2026-10-23'},{date_to:'2027-10-25'}])assert.throws(()=>applyFavorite(s,f.id,input(f,extra)));
 const shorter={...input(f),date_from:'2026-10-26',date_to:'2026-10-26'};applyFavorite(s,f.id,shorter);s.assignments[0].priority=9;const before=structuredClone(s);assert.throws(()=>applyFavorite(s,f.id,input(f)),/Doppel/);assert.deepEqual(s,before);
});
test('Deletion range uses Swiss dates, exclusive ends, person boundaries and readonly duties',()=>{
 const a=(id,start,end,extra={})=>({assignment_id:id,employee_id:'P',start_on:start,end_on:end,...extra});
 const entries=[a('prior','2026-10-23T22:00:00Z','2026-10-24T22:00:00Z'),a('overlap','2026-10-24T21:00:00Z','2026-10-25T02:00:00Z'),a('day','2026-10-24T22:00:00Z','2026-10-25T23:00:00Z'),a('next','2026-10-25T23:00:00Z','2026-10-26T03:00:00Z'),a('hidden','2026-10-25T12:00:00Z','2026-10-25T13:00:00Z',{access_read_only:true}),a('other','2026-10-25T12:00:00Z','2026-10-25T13:00:00Z',{employee_id:'Q'})];
 const filter={employee_id:'P',date_from:'2026-10-25',date_to:'2026-10-25'};
 assert.deepEqual(assignmentsInRange(entries,filter).map(a=>a.assignment_id),['day']);
 assert.deepEqual(assignmentsInRange(entries,{...filter,match:'overlap'}).map(a=>a.assignment_id),['overlap','day']);
 assert.throws(()=>assignmentsInRange(entries,{...filter,date_to:'2026-02-30'}));
});
