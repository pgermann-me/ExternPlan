import test from 'node:test';
import assert from 'node:assert/strict';
import {movePeriod,toggleHalfMonth,halfMonthResult} from '../public/month-navigation.js';
import {demo,validateAssignment} from '../domain.js';
import {personMonth} from '../person-planning.js';
test('Monatsnavigation wechselt ganze und halbe Monate über Jahresgrenzen',()=>{
 assert.deepEqual(movePeriod('2026-12',0,1),{month:'2027-01',half:0});
 assert.deepEqual(movePeriod('2027-01',0,-1),{month:'2026-12',half:0});
 assert.deepEqual(movePeriod('2026-12',1,1),{month:'2026-12',half:2});
 assert.deepEqual(movePeriod('2026-12',2,1),{month:'2027-01',half:1});
 assert.deepEqual(movePeriod('2027-01',1,-1),{month:'2026-12',half:2});
 assert.deepEqual(movePeriod('2026-12',2,-1),{month:'2026-12',half:1});
 assert.deepEqual(toggleHalfMonth('2026-12',0),{month:'2026-12',half:1});
 for(const half of [1,2])assert.deepEqual(toggleHalfMonth('2026-12',half),{month:'2027-01',half:0});
});
test('Halbmonate schneiden übergreifende Balken ab, erhalten Uhrzeiten und verändern keine Quelldaten',()=>{
 const s=demo();s.assignments.push(validateAssignment(s,{employee_id:'DEMO-001',function_id:'DEMO-ORT',geodependency:null,priority:1,start_on:'2026-10-15T18:00',end_on:'2026-10-16T06:00'}).assignment);
 const full=personMonth(s,'2026-10','DEMO-ORT'),before=structuredClone(full);
 const first=halfMonthResult(full,1),second=halfMonthResult(full,2),bar=r=>r.rows.find(p=>p.employee_id==='DEMO-001').bars[0];
 assert.equal(first.days.length,15);assert.equal(first.days.at(-1),'2026-10-15');assert.equal(second.days.length,16);assert.equal(second.days[0],'2026-10-16');
 assert.equal(bar(first).left,14.75);assert.equal(bar(first).width,.25);assert.equal(bar(second).left,0);assert.equal(bar(second).width,.25);
 assert.equal(bar(second).start_on,s.assignments[0].start_on);assert.equal(bar(second).end_on,s.assignments[0].end_on);
 assert.equal(second.rows[0].cells.length,16);assert.equal(second.day_meta[0].date,'2026-10-16');assert.deepEqual(full,before);assert.equal(halfMonthResult(full,0),full);
 const autumnDay=second.day_meta.find(d=>d.date==='2026-10-25');assert.equal((new Date(autumnDay.end_on)-new Date(autumnDay.start_on))/3600000,25);
});
test('Februarhälften haben korrekte Grenzen auch in Schaltjahren und behalten Personen ohne Dienste',()=>{
 for(const [month,count] of [['2026-02',13],['2028-02',14]]){
  const result=halfMonthResult(personMonth(demo(),month,'DEMO-ORT'),2);assert.equal(result.days.length,count);assert.equal(result.rows.length,2);assert.equal(result.days.at(-1),month+'-'+(15+count));assert.ok(result.rows.every(r=>r.bars.length===0&&r.cells.length===count));
 }
});
