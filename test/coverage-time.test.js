import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageWindowGroups,expandCoverageWindows} from '../public/coverage-time.js';
import {demo,coverage,instant} from '../domain.js';
test('Mehrfach-Wochentage werden als einzelne Soll-Zeitfenster gespeichert und beim Bearbeiten wieder gruppiert',()=>{
 const groups=[{weekdays:[1,2,3,4,5],start_time:'12:00',end_time:'14:00',end_day_offset:0},{weekdays:[1,2,3,4,5],start_time:'17:00',end_time:'08:00',end_day_offset:1},{weekdays:[6,7],start_time:'08:00',end_time:'08:00',end_day_offset:1}];
 const windows=expandCoverageWindows(groups);assert.equal(windows.length,12);assert.deepEqual(coverageWindowGroups(windows),groups);
 const s=demo();s.rules=[{function_id:'DEMO-KTD',geo_id:null,mode:'weekly',windows}];const monday=coverage(s,'DEMO-KTD','NORD',instant('2026-10-19T00:00'),instant('2026-10-20T00:00'));
 assert.deepEqual(monday.gaps.map(g=>[g.start_on.slice(11,16),g.end_on.slice(11,16)]),[['00:00','08:00'],['12:00','14:00'],['17:00','00:00']]);
 const saturday=coverage(s,'DEMO-KTD','NORD',instant('2026-10-17T00:00'),instant('2026-10-18T00:00'));assert.equal(saturday.gaps.length,1);assert.equal(instant(saturday.gaps[0].end_on)-instant(saturday.gaps[0].start_on),86400000);
 s.rules[0].windows=expandCoverageWindows([groups[0]]);assert.equal(coverage(s,'DEMO-KTD','NORD',instant('2026-10-17T00:00'),instant('2026-10-18T00:00')).status,'kein Pikett erforderlich');
});
test('Bestehende Wochenend-/Ganzwochenregeln und 24:00 behalten ihre Bedeutung',()=>{
 const old=[{start_day:5,start_time:'07:00',end_day:1,end_time:'07:00'},{start_day:2,start_time:'12:00',end_day:2,end_time:'14:00'},{start_day:1,start_time:'08:00',end_day:1,end_time:'08:00'}];assert.deepEqual(expandCoverageWindows(coverageWindowGroups(old)),old);
 assert.deepEqual(expandCoverageWindows([{weekdays:[7],start_time:'17:00',end_time:'24:00',end_day_offset:0}]),[{start_day:7,start_time:'17:00',end_day:1,end_time:'00:00'}]);
 for(const w of [{weekdays:[],start_time:'12:00',end_time:'14:00',end_day_offset:0},{weekdays:[1],start_time:'12:00',end_time:'11:00',end_day_offset:0},{weekdays:[1],start_time:'12:00',end_time:'14:00',end_day_offset:8}])assert.throws(()=>expandCoverageWindows([w]));
});

test('Gültig bis includes the full Swiss end date, including 23/25-hour days and a single-day validity',()=>{
 for(const [date,next,hours] of [['2026-03-29','2026-03-30',23],['2026-10-25','2026-10-26',25],['2026-10-20','2026-10-21',24]]){
  const s=demo();s.rules=[{function_id:'DEMO-KTD',geo_id:null,mode:'continuous',windows:[],valid_from:date,valid_until:date}];
  const result=coverage(s,'DEMO-KTD','NORD',instant(date+'T00:00'),instant(next+'T00:00'));
  assert.equal(result.status,'unbesetzt');assert.equal(result.gaps.length,1);assert.equal(instant(result.gaps[0].end_on)-instant(result.gaps[0].start_on),hours*3600000);
  assert.equal(coverage(s,'DEMO-KTD','NORD',instant(next+'T00:00'),instant(next+'T01:00')).status,'kein Pikett erforderlich');
 }
 const s=demo();s.rules=[{function_id:'DEMO-KTD',geo_id:null,mode:'weekly',windows:[{start_day:2,start_time:'12:00',end_day:2,end_time:'14:00'}],valid_from:'2026-10-01',valid_until:'2026-10-20'}];
 const result=coverage(s,'DEMO-KTD','NORD',instant('2026-10-20T00:00'),instant('2026-10-21T00:00'));assert.equal(result.status,'unbesetzt');assert.equal(result.gaps[0].start_on.slice(11,16),'12:00');assert.equal(result.gaps[0].end_on.slice(11,16),'14:00');
});
