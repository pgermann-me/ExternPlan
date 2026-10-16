import test from 'node:test';
import assert from 'node:assert/strict';
import {favoriteSchedule,favoriteDurationFromEnd,favoriteTimeLabel,favoriteWeeklyWindows} from '../public/favorite-time.js';
test('Explizite Endzeit und Endtag ergeben dieselbe nominale Dauer, einschliesslich 24:00',()=>{
 for(const [start,end,day,duration] of [['16:00','24:00',2,3360],['16:00','00:00',3,3360],['07:00','07:00',1,1440],['19:00','07:30',1,750],['08:00','17:15',0,555]]){
  assert.equal(favoriteDurationFromEnd(start,end,day),duration);const schedule=favoriteSchedule({start_time:start,duration_minutes:duration});assert.equal(favoriteDurationFromEnd(start,schedule.end_time,schedule.end_day_offset),duration);
 }
 for(const [end,day] of [['24:01',2],['25:00',2],['16:00',0],['15:00',0],['17:00',-1],['17:00',1.5]])assert.throws(()=>favoriteDurationFromEnd('16:00',end,day));
});
test('End-Wochentag folgt geänderter Tagesdauer auch über eine Woche hinweg',()=>{
 assert.equal(favoriteTimeLabel({start_weekday:5,start_time:'16:00',duration_minutes:2880}),'Fr 16:00 – ⇒ So (+2 Tage) 16:00');assert.equal(favoriteTimeLabel({start_weekday:5,start_time:'16:00',duration_minutes:3360}),'Fr 16:00 – ⇒ Mo (+3 Tage) 00:00');assert.equal(favoriteTimeLabel({start_weekday:7,start_time:'07:00',duration_minutes:1440}),'So 07:00 – ⇒ Mo 07:00');assert.equal(favoriteTimeLabel({start_weekday:5,start_time:'16:00',duration_minutes:10080}),'Fr 16:00 – ⇒ Fr (+7 Tage) 16:00');
 assert.equal(favoriteTimeLabel({start_time:'07:00',duration_minutes:1440}),'07:00 – ⇒ 07:00');
});

test('Wochenmuster zeigt Wochentage und alle Teilzeitfenster kompakt an',()=>{
 const weekly_windows=[{weekdays:[1,2,3,4,5],start_time:'12:00',end_time:'14:00',end_day_offset:0},{weekdays:[1,2,3,4,5],start_time:'17:00',end_time:'08:00',end_day_offset:1},{weekdays:[6,7],start_time:'08:00',end_time:'08:00',end_day_offset:1}];assert.equal(favoriteTimeLabel({schedule_mode:'weekly',weekly_windows}),'Mo–Fr: 12:00 – 14:00; Mo–Fr: 17:00 – ⇒ 08:00; Sa–So: 08:00 – ⇒ 08:00');const normalized=favoriteWeeklyWindows([{weekdays:[5],start_time:'16:00',end_time:'24:00',end_day_offset:0}]);assert.equal(normalized[0].end_time,'00:00');assert.equal(normalized[0].end_day_offset,1);
});
