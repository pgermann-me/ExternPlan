import test from 'node:test';
import assert from 'node:assert/strict';
import {movePeriod,toggleHalfMonth,halfMonthResult} from '../public/month-navigation.js';
import {demo,validateAssignment} from '../domain.js';
import {personMonth} from '../person-planning.js';
test('Monatsnavigation erhält den versetzten Zeitraum und wechselt beim Ausschalten zum ganzen Folgemonat',()=>{
 for(const half of [0,1]){
  assert.deepEqual(movePeriod('2026-12',half,1),{month:'2027-01',half});
  assert.deepEqual(movePeriod('2027-01',half,-1),{month:'2026-12',half});
 }
 assert.deepEqual(toggleHalfMonth('2026-12',0),{month:'2026-12',half:1});
 assert.deepEqual(toggleHalfMonth('2026-12',1),{month:'2027-01',half:0});
});
test('Versetzter Monat vereinigt Tage und durchgehende Balken beider Monate ohne Duplikate',()=>{
 const s=demo();
 for(const [start_on,end_on] of [['2026-10-15T18:00','2026-10-16T06:00'],['2026-10-31T18:00','2026-11-01T06:00'],['2026-11-10T07:00','2026-11-10T19:00']])s.assignments.push(validateAssignment(s,{employee_id:'DEMO-001',function_id:'DEMO-ORT',geodependency:null,priority:1,start_on,end_on}).assignment);
 const october=personMonth(s,'2026-10','DEMO-ORT'),november=personMonth(s,'2026-11','DEMO-ORT'),before=structuredClone([october,november]);
 const shifted=halfMonthResult(october,1,november),row=shifted.rows.find(p=>p.employee_id==='DEMO-001');
 assert.equal(shifted.days.length,31);assert.equal(shifted.days[0],'2026-10-16');assert.equal(shifted.days.at(-1),'2026-11-15');
 assert.equal(row.bars.length,3);assert.equal(row.bars[0].left,0);assert.equal(row.bars[0].width,.25);assert.equal(row.bars[0].start_on,s.assignments[0].start_on);
 assert.equal(row.bars[1].left,15.75);assert.equal(row.bars[1].width,.5);assert.equal(row.bars[1].end_on,s.assignments[1].end_on);
 assert.equal(row.cells[16].assignments[0].assignment_id,s.assignments[1].assignment_id);assert.equal(shifted.day_meta[16].date,'2026-11-01');
 assert.deepEqual([october,november],before);assert.equal(halfMonthResult(october,0),october);
 const autumnDay=shifted.day_meta.find(d=>d.date==='2026-10-25');assert.equal((new Date(autumnDay.end_on)-new Date(autumnDay.start_on))/3600000,25);
});
test('Februar bis März berücksichtigt Schaltjahre und behält Personen ohne Dienste',()=>{
 for(const [month,next,count] of [['2026-02','2026-03',28],['2028-02','2028-03',29]]){
  const s=demo(),result=halfMonthResult(personMonth(s,month,'DEMO-ORT'),1,personMonth(s,next,'DEMO-ORT'));
  assert.equal(result.days.length,count);assert.equal(result.rows.length,2);assert.equal(result.days[0],month+'-16');assert.equal(result.days.at(-1),next+'-15');assert.ok(result.rows.every(r=>r.bars.length===0&&r.cells.length===count));
 }
});
