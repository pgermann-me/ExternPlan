import test from 'node:test';
import assert from 'node:assert/strict';
import {dayBars} from '../public/day-bars.js';
const bar=(id,start,end)=>({assignment_id:id,start_on:start,end_on:end,color:'#2563eb',priority:1,left:99,width:99,lane:2});
test('Grobe Tagesansicht verteilt Starts gleichmässig und erhält Originaldaten',()=>{
 const bars=[bar('b','2026-10-24T19:00+02:00','2026-10-26T07:00+01:00'),bar('a','2026-10-24T07:00+02:00','2026-10-25T07:00+01:00'),bar('c','2026-10-25T07:00+01:00','2026-10-26T07:00+01:00')];
 const original=structuredClone(bars),result=dayBars(bars,['2026-10-24','2026-10-25','2026-10-26']);
 assert.deepEqual(result.bars.map(b=>[b.assignment_id,b.left,b.width,b.lane]),[['a',0,.5,0],['b',.5,.5,0],['c',1,1,0]]);assert.equal(result.lanes,1);assert.deepEqual(bars,original);assert.equal(result.bars[0].end_on,bars[1].end_on);
});
test('Starttag wird in Schweizer Zeit bestimmt; Fortsetzungen und vorheriger Monat bleiben leer',()=>{
 const utc=bar('utc','2026-10-24T22:30:00Z','2026-10-26T07:00+01:00');
 assert.equal(dayBars([utc],['2026-10-24']).bars.length,0);assert.equal(dayBars([utc],['2026-10-25']).bars.length,1);
 assert.equal(dayBars([bar('old','2026-09-30T07:00+02:00','2026-10-03T07:00+02:00')],['2026-10-01']).bars.length,0);
 assert.equal(dayBars([utc,utc],['2026-10-25']).bars.length,1);assert.deepEqual(dayBars([],[]),{bars:[],lanes:1});
});
