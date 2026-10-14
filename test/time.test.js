import test from 'node:test';
import assert from 'node:assert/strict';
import {swissTime,swissDate,localDate,localDateTime,displayTimes} from '../public/time.js';
test('Schweizer Darstellung mit Sekunden unabhängig von Browser-/Serverzeitzone',()=>{
 assert.equal(swissTime('1972-04-19T12:40:45Z'),'19.04.1972 13:40:45');
 assert.equal(swissTime('2026-07-01T12:40:45Z'),'01.07.2026 14:40:45');
 assert.equal(swissTime('2026-01-01T12:40:45Z'),'01.01.2026 13:40:45');
 assert.equal(swissTime('2026-10-25T00:30:00Z'),'25.10.2026 02:30:00');assert.equal(swissTime('2026-10-25T01:30:00Z'),'25.10.2026 02:30:00');
 assert.equal(swissDate('2026-10-07'),'07.10.2026');
});
test('Datum-/Zeiteingaben validieren und Schweizer lokale Sekunden erhalten',()=>{
 assert.equal(localDate('29.02.2024'),'2024-02-29');assert.equal(localDateTime('19.04.1972 13:40:45'),'1972-04-19T13:40:45');
 for(const bad of ['29.02.2026','31.04.2026','00.01.2026'])assert.throws(()=>localDate(bad));
 for(const bad of ['19.04.1972 24:00:00','19.04.1972 13:60:00','19.04.1972 13:40:60','1972-04-19T13:40'])assert.throws(()=>localDateTime(bad));
});
test('Audit/Import-Zeitanzeige verändert keine ursprünglichen maschinenlesbaren Daten',()=>{
 const source={changes:[{start_on:'2026-10-07T07:00:00+02:00',valid_from:'2026-10-01'}]};
 const display=displayTimes(source);assert.equal(display.changes[0].start_on,'07.10.2026 07:00:00');assert.equal(display.changes[0].valid_from,'01.10.2026');assert.equal(source.changes[0].start_on,'2026-10-07T07:00:00+02:00');
});
