import test from 'node:test';
import assert from 'node:assert/strict';
import {formatTimeInput} from '../public/time-input.js';
import {localDate,localDateTime} from '../public/time.js';
test('Compact Swiss dates and times acquire separators progressively without inventing digits',()=>{
 for(const [raw,expected] of [['2','2'],['27','27.'],['2710','27.10.'],['27102026','27.10.2026 '],['2710202613','27.10.2026 13:'],['271020261340','27.10.2026 13:40']])assert.equal(formatTimeInput(raw),expected);
 assert.equal(formatTimeInput(''), '');assert.equal(formatTimeInput('19101972','date'),'19.10.1972');assert.equal(formatTimeInput('0745','time'),'07:45');assert.equal(formatTimeInput('24:00','time'),'24:00');
});
test('Pasted formatted values and repeated formatting preserve the local time without seconds',()=>{
 for(const raw of ['191019721340','19.10.1972 13:40']){const value=formatTimeInput(raw);assert.equal(value,'19.10.1972 13:40');assert.equal(formatTimeInput(value),value);assert.equal(localDateTime(value),'1972-10-19T13:40:00');}
 assert.equal(formatTimeInput('27.10.2026 13:40:45'),'27.10.2026 13:40');
});
test('Formatting keeps invalid calendar values invalid rather than silently changing them',()=>{
 assert.throws(()=>localDate(formatTimeInput('29022026','date')),/Ungültiges Datum/);assert.throws(()=>localDateTime(formatTimeInput('271020262560')));assert.throws(()=>localDateTime(formatTimeInput('27102026')));
});
