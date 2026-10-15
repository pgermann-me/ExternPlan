import {swissTime} from './time.js';
const text=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const localDay=value=>swissTime(value).slice(0,10).split('.').reverse().join('-');
// RFC 5545: physical lines are at most 75 UTF-8 octets, including continuation space.
function fold(line){let result='',current='',bytes=0;for(const c of line){const size=new TextEncoder().encode(c).length;if(bytes+size>75){result+=current+'\r\n';current=' ';bytes=1;}current+=c;bytes+=size;}return result+current;}
export function personIcal(state,employeeId,month,now=new Date()){
 const person=state.people.find(p=>p.employee_id===employeeId);if(!person)throw Error('Person nicht gefunden');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Ungültiger Monat');
 const first=month+'-01',last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
 const assignments=state.assignments.filter(a=>a.employee_id===employeeId&&localDay(a.start_on)<=last&&localDay(new Date(new Date(a.end_on).getTime()-1))>=first).sort((a,b)=>new Date(a.start_on)-new Date(b.start_on)||a.assignment_id.localeCompare(b.assignment_id));
 const name=(type,id)=>state[type].find(x=>x.id===id)?.name||state.archived_master?.[type]?.find(x=>x.id===id)?.name||'Unbekannt';
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ExternPlan//Personenkalender//DE','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+text(`${person.name} · ${month}`)];
 for(const a of assignments){const region=a.geodependency?name('regions',a.geodependency):'Ortsunabhängig';lines.push('BEGIN:VEVENT','UID:'+text(a.assignment_id+'@externplan'),'DTSTAMP:'+stamp(now),'SEQUENCE:'+Math.max(0,(a.revision||1)-1),'DTSTART:'+stamp(a.start_on),'DTEND:'+stamp(a.end_on),'SUMMARY:'+text(name('functions',a.function_id)+' · '+region),'LOCATION:'+text(region),'DESCRIPTION:'+text(`${person.name}\nPriorität ${a.priority}`),'END:VEVENT');}
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
