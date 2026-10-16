import {favoriteDurationFromEnd,favoriteSchedule} from './favorite-time.js';
// Keep the existing ELS-independent coverage representation while editing weekday groups.
export function coverageWindowGroups(windows){
 const grouped=new Map();
 for(const w of windows){
  const offset=(w.end_day-w.start_day+7)%7|| (w.end_time<=w.start_time?7:0);
  const key=JSON.stringify([w.start_time,w.end_time,offset]);
  if(!grouped.has(key))grouped.set(key,{weekdays:[],start_time:w.start_time,end_time:w.end_time,end_day_offset:offset});
  if(!grouped.get(key).weekdays.includes(w.start_day))grouped.get(key).weekdays.push(w.start_day);
 }
 return [...grouped.values()].map(w=>({...w,weekdays:w.weekdays.sort((a,b)=>a-b)}));
}
export function expandCoverageWindows(groups){
 if(!Array.isArray(groups)||!groups.length)throw Error('Mindestens ein Wochenzeitfenster anlegen');
 return groups.flatMap(w=>{
  if(!Array.isArray(w.weekdays)||!w.weekdays.length||new Set(w.weekdays).size!==w.weekdays.length||w.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))throw Error('Für jedes Zeitfenster mindestens einen eindeutigen Wochentag wählen');
  const duration_minutes=favoriteDurationFromEnd(w.start_time,w.end_time,w.end_day_offset);if(duration_minutes>10080)throw Error('Ein Soll-Zeitfenster darf höchstens eine Woche dauern');
  const schedule=favoriteSchedule({start_time:w.start_time,duration_minutes});
  return [...w.weekdays].sort((a,b)=>a-b).map(day=>({start_day:day,start_time:w.start_time,end_day:(day-1+schedule.end_day_offset)%7+1,end_time:schedule.end_time}));
 });
}
