import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {coverage,prepareCoverage} from '../domain.js';
const s={functions:[{id:'f',covers:{}}],rules:[{function_id:'f',geo_id:null,mode:'continuous'}],assignments:Array.from({length:4000},(_,i)=>({assignment_id:String(i),function_id:i%2?'other':'f',geodependency:'r'+i%20,start_on:'2026-10-01T07:00:00+02:00',end_on:'2026-11-01T07:00:00+01:00'}))};
const start=Date.parse('2026-10-01T00:00:00+02:00');
function measure(indexed){
 const t=performance.now(),state=indexed?prepareCoverage(s,start,start+32*86400000):s;let count=0;
 for(let day=0;day<31;day++)for(let r=0;r<20;r++)count+=coverage(state,'f','r'+r,start+day*86400000,start+(day+1)*86400000).assignments.length;
 return {milliseconds:Math.round(performance.now()-t),count};
}
const baseline=measure(false),optimized=measure(true);
assert.equal(optimized.count,baseline.count);
console.log(JSON.stringify({baseline,optimized,speedup:(baseline.milliseconds/optimized.milliseconds).toFixed(1)},null,2));
