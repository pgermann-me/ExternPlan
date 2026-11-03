import test from 'node:test';
import assert from 'node:assert/strict';
import {coverage,prepareCoverage,demo,instant} from '../domain.js';
test('indexed coverage preserves gaps, order, whole-region coverage and Swiss DST',()=>{
 const s=demo();
 s.rules.push({function_id:'DEMO-KTD',geo_id:'SÜD',mode:'weekly',windows:[{start_day:7,start_time:'01:00',end_day:7,end_time:'04:00'}]});
 s.assignments=Array.from({length:30},(_,i)=>({assignment_id:String(i),function_id:'DEMO-KTD',geodependency:['NORD','SÜD','GANZ'][i%3],start_on:`2026-10-${String(i+1).padStart(2,'0')}T02:00:00+02:00`,end_on:`2026-10-${String(i+1).padStart(2,'0')}T03:00:00+01:00`}));
 const before=JSON.stringify(s),indexed=prepareCoverage(s,instant('2026-10-01T00:00'),instant('2026-11-01T00:00'));
 for(let day=1;day<=30;day++)for(const geo of ['NORD','SÜD','GANZ',null]){
  const a=instant(`2026-10-${String(day).padStart(2,'0')}T00:00`),b=instant(`2026-10-${String(day+1).padStart(2,'0')}T00:00`);
  assert.deepEqual(coverage(indexed,'DEMO-KTD',geo,a,b),coverage(s,'DEMO-KTD',geo,a,b));
 }
 assert.equal(JSON.stringify(indexed),before);assert.equal(JSON.stringify(s),before);
 const restricted=prepareCoverage({...s,assignments:[]});
 assert.equal(coverage(restricted,'DEMO-KTD','NORD',instant('2026-10-01T00:00'),instant('2026-10-02T00:00')).assignments.length,0);
});
