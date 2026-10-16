import test from 'node:test';
import assert from 'node:assert/strict';
import {daySegment} from '../public/day-segment.js';
const duty=(start_on,end_on)=>({start_on,end_on});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.00001);
test('Dienst wird an Tagesgrenzen ohne Datum geteilt; Mitternachtsende zählt exklusiv',()=>{
 const a=duty('2026-10-14T07:00:00+02:00','2026-10-15T07:00:00+02:00');
 const first=daySegment(a,'2026-10-14'),last=daySegment(a,'2026-10-15');
 assert.equal(first.start_time,'07:00');assert.equal(first.end_time,'24:00');close(first.left,7/24*100);close(first.width,17/24*100);
 assert.equal(last.start_time,'00:00');assert.equal(last.end_time,'07:00');assert.equal(last.left,0);close(last.width,7/24*100);
 const midnight=duty(a.start_on,'2026-10-15T00:00:00+02:00');assert.equal(daySegment(midnight,'2026-10-14').end_time,'24:00');assert.equal(daySegment(midnight,'2026-10-15'),null);
 assert.equal(daySegment(a,'2026-10-16'),null);
});
test('Tagesbalken berücksichtigen 23 und 25 echte Schweizer Tagesstunden',()=>{
 const spring=daySegment(duty('2026-03-28T19:00:00+01:00','2026-03-29T07:00:00+02:00'),'2026-03-29');close(spring.width,6/23*100);assert.equal(spring.end_time,'07:00');
 const autumn=daySegment(duty('2026-10-24T19:00:00+02:00','2026-10-25T07:00:00+01:00'),'2026-10-25');close(autumn.width,8/25*100);assert.equal(autumn.end_time,'07:00');
 const all=daySegment(duty('2026-10-24T19:00:00+02:00','2026-10-26T07:00:00+01:00'),'2026-10-25');assert.deepEqual(all,{start_time:'00:00',end_time:'24:00',left:0,width:100});
 const utc=daySegment(duty('2026-10-14T22:00:00Z','2026-10-15T01:00:00Z'),'2026-10-15');assert.equal(utc.start_time,'00:00');assert.equal(utc.end_time,'03:00');
});
