import {statisticsRegions} from './public/statistics-regions.js';
import {DateTime} from 'luxon';
import {instant,merge,zone} from './domain.js';
import {personGroupIds,personDepartmentIds} from './public/organization.js';
export function planningStatistics(s,input={}){
 const current=DateTime.now().setZone(zone),date_from=input.date_from??current.startOf('year').toISODate(),date_to=input.date_to??current.endOf('year').toISODate();
 const dates=[date_from,date_to].map(value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Von und Bis als gültiges Datum eingeben');const d=DateTime.fromISO(value,{zone});if(!d.isValid)throw Error('Ungültiges Datum');return d;});
 if(dates[1]<dates[0])throw Error('Bis muss am oder nach dem Von-Datum liegen');
 for(const [key,type] of [['department_id','departments'],['group_id','groups'],['function_id','functions']])if(input[key]&&(typeof input[key]!=='string'||!s[type].some(r=>r.id===input[key])))throw Error('Ungültiger Statistikfilter: '+key);
 const group=s.groups.find(g=>g.id===input.group_id);if(group&&input.department_id&&group.department_id!==input.department_id)throw Error('Gruppe gehört nicht zur gewählten Abteilung');
 if(input.region_ids!==undefined&&input.region_id!==undefined)throw Error('Regionenfilter nicht doppelt angeben');
 const values=input.region_ids??input.region_id??[],regionIds=typeof values==='string'?(values?[values]:[]):values;
 if(!Array.isArray(regionIds)||regionIds.length>1000||regionIds.some(id=>typeof id!=='string'||!s.regions.some(r=>r.id===id)))throw Error('Ungültiger Regionenfilter');
 const selectedRegions=new Set(regionIds),allowedRegions=new Set(statisticsRegions(s,input).map(r=>r.id));
 if([...selectedRegions].some(id=>!allowedRegions.has(id)))throw Error('Region ist für die gewählte Funktion, Abteilung oder Gruppe nicht zulässig');
 const eligiblePeople=new Set(s.people.filter(p=>(!input.department_id||personDepartmentIds(p,s.groups).includes(input.department_id))&&(!input.group_id||personGroupIds(p).includes(input.group_id))).map(p=>p.employee_id));
 const start=dates[0].startOf('day').toMillis(),end=dates[1].plus({days:1}).startOf('day').toMillis(),people=new Map(s.people.map(p=>[p.employee_id,p])),functions=new Map(s.functions.map(f=>[f.id,f])),groups=new Map();let assignment_count=0;
 for(const a of s.assignments){
  const person=people.get(a.employee_id),fn=functions.get(a.function_id);if(!person||!eligiblePeople.has(a.employee_id)||!fn||fn.duty_time_model==='always')continue;
  if(input.function_id&&a.function_id!==input.function_id||selectedRegions.size&&!selectedRegions.has(a.geodependency))continue;
  const from=Math.max(start,instant(a.start_on)),until=Math.min(end,instant(a.end_on));if(from>=until)continue;
  const key=JSON.stringify([a.employee_id,a.function_id]);if(!groups.has(key))groups.set(key,{person,fn,intervals:[]});groups.get(key).intervals.push([from,until]);assignment_count++;
 }
 const rows=[...groups.values()].map(({person,fn,intervals})=>({employee_id:person.employee_id,person_name:person.last_name&&person.first_name?`${person.last_name} ${person.first_name}`:person.name||person.employee_id,person_archived:Boolean(person.deleted_at),function_id:fn.id,function_name:fn.name||fn.id,function_archived:Boolean(fn.deleted_at),hours:merge(intervals).reduce((sum,[a,b])=>sum+b-a,0)/3600000})).sort((a,b)=>b.hours-a.hours||a.person_name.localeCompare(b.person_name,'de-CH')||a.function_name.localeCompare(b.function_name,'de-CH'));
 return {date_from,date_to,rows,total_hours:rows.reduce((sum,r)=>sum+r.hours,0),people_count:new Set(rows.map(r=>r.employee_id)).size,function_count:new Set(rows.map(r=>r.function_id)).size,assignment_count};
}
