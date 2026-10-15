import {daySegment} from './day-segment.js';
// Group display entries only; original assignments remain available in details.
export function groupDayDuties(assignments,day){
 const groups=new Map();
 for(const a of assignments){
  if(!daySegment(a,day))continue;
  const key=JSON.stringify([a.employee_id,a.function_id,a.geodependency??null]);
  if(!groups.has(key))groups.set(key,{function_id:a.function_id,geodependency:a.geodependency??null,assignments:[]});
  groups.get(key).assignments.push(a);
 }
 return [...groups.values()].map(group=>{
  const intervals=group.assignments.map(a=>[new Date(a.start_on).getTime(),new Date(a.end_on).getTime()]).sort((a,b)=>a[0]-b[0]),merged=[];
  for(const [start,end] of intervals){const last=merged.at(-1);if(last&&start<=last[1])last[1]=Math.max(last[1],end);else merged.push([start,end]);}
  return {...group,segments:merged.map(([start,end])=>daySegment({start_on:new Date(start).toISOString(),end_on:new Date(end).toISOString()},day)).filter(Boolean)};
 });
}
