import {swissTime} from './time.js';
// Visual geometry only: the actual assignment times and coverage stay unchanged.
export function dayBars(bars,days){
 const buckets=new Map(),seen=new Set();
 for(const bar of bars){
  if(seen.has(bar.assignment_id))continue;seen.add(bar.assignment_id);
  const day=swissTime(bar.start_on).slice(0,10).split('.').reverse().join('-');
  const index=days.indexOf(day);if(index<0)continue;
  const list=buckets.get(index)||[];list.push(bar);buckets.set(index,list);
 }
 return {lanes:1,bars:[...buckets.entries()].sort(([a],[b])=>a-b).flatMap(([day,list])=>list.sort((a,b)=>new Date(a.start_on)-new Date(b.start_on)||a.priority-b.priority||a.assignment_id.localeCompare(b.assignment_id)).map((bar,i)=>({...bar,left:day+i/list.length,width:1/list.length,lane:0})))};
}
