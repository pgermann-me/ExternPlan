import {swissTime} from './time.js';
function midnight(day){
 const target=Date.parse(day+'T00:00:00Z');let value=target;
 // Interpret a local Swiss midnight without depending on the browser's timezone.
 for(let i=0;i<3;i++){const local=swissTime(new Date(value)),date=local.slice(0,10).split('.').reverse().join('-');const offset=Date.parse(date+'T'+local.slice(11)+':00Z')-target;if(!offset)return value;value-=offset;}
 return value;
}
export function daySegment(assignment,day){
 const next=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const dayStart=midnight(day),dayEnd=midnight(next);
 const start=Math.max(dayStart,new Date(assignment.start_on).getTime()),end=Math.min(dayEnd,new Date(assignment.end_on).getTime());
 if(!(start<end))return null;
 return {start_time:start===dayStart?'00:00':swissTime(new Date(start)).slice(11),end_time:end===dayEnd?'24:00':swissTime(new Date(end)).slice(11),left:(start-dayStart)/(dayEnd-dayStart)*100,width:(end-start)/(dayEnd-dayStart)*100};
}
