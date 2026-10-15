import test from 'node:test';
import assert from 'node:assert/strict';
import {groupDayDuties} from '../public/group-day-duties.js';
const a=(id,start,end,extra={})=>({employee_id:'P',function_id:'F',geodependency:'R',assignment_id:id,start_on:start,end_on:end,...extra});
const day='2026-10-15';
test('Fortsetzung und neuer Dienst derselben Funktion/Region bilden einen vollen Tag',()=>{
 const input=[a('a','2026-10-14T07:00+02:00','2026-10-15T07:00+02:00'),a('b','2026-10-15T07:00+02:00','2026-10-16T07:00+02:00')],before=structuredClone(input);
 const groups=groupDayDuties(input,day);assert.equal(groups.length,1);assert.equal(groups[0].assignments.length,2);assert.deepEqual(groups[0].segments,[{start_time:'00:00',end_time:'24:00',left:0,width:100}]);assert.deepEqual(input,before);
});
test('Lücken bleiben sichtbar, Überlappungen werden vereinigt; andere Funktionen/Regionen getrennt',()=>{
 const input=[a('a',day+'T07:00+02:00',day+'T10:00+02:00'),a('b',day+'T09:00+02:00',day+'T12:00+02:00'),a('c',day+'T15:00+02:00',day+'T18:00+02:00'),a('d',day+'T07:00+02:00',day+'T12:00+02:00',{function_id:'F2'}),a('e',day+'T07:00+02:00',day+'T12:00+02:00',{geodependency:'R2'})];
 const groups=groupDayDuties(input,day);assert.equal(groups.length,3);assert.deepEqual(groups[0].segments.map(s=>[s.start_time,s.end_time]),[['07:00','12:00'],['15:00','18:00']]);assert.equal(groupDayDuties(input,'2026-10-16').length,0);
});
