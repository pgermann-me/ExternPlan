import {downloadPersonPdf} from './person-pdf.js';
import {personIcal} from './person-ical.js';
import {groupDayDuties} from './group-day-duties.js';
import {swissTime,swissDate} from './time.js';
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDay=instant=>swissTime(instant).slice(0,10).split('.').reverse().join('-');
const employeeId=new URLSearchParams(location.search).get('employee_id');
let state,sequence=0,listView=false,displayedMonth;try{listView=localStorage.getItem('externplan.personCalendarView')==='list';}catch{}
$('#calendar-month').value=localDay(new Date()).slice(0,7);
const record=(type,id)=>state[type].find(x=>x.id===id)||state.archived_master?.[type]?.find(x=>x.id===id);
const title=a=>`${record('functions',a.function_id)?.name||'Unbekannte Funktion'} · ${a.geodependency?(record('regions',a.geodependency)?.name||'Unbekanntes Gebiet'):'Ortsunabhängig'}`;
function listDuty(group,compact=false){
 const chosen=state.assignment_styles?.[group.color_assignment_id]?.color||'#2563eb',color=/^#[0-9a-f]{6}$/i.test(chosen)?chosen:'#2563eb';
 const region=group.geodependency===null?'Ortsunabhängig':record('regions',group.geodependency)?.name||'Unbekanntes Gebiet';
 return `<button class="person-calendar-duty" data-duty="${esc(group.assignments[0].assignment_id)}" data-duty-ids="${esc(JSON.stringify(group.assignments.map(a=>a.assignment_id)))}" style="border-left-color:${color};background:${color}1a"><span class="duty-mainline"><b title="${esc(record('functions',group.function_id)?.name||'Unbekannte Funktion')}">${esc(record('functions',group.function_id)?.name||'Unbekannte Funktion')}</b> <span class="duty-times">${group.segments.map(segment=>`${segment.start_time} → ${segment.end_time}`).join(', ')}</span></span>${compact?'':`<small class="duty-region">${esc(region)}</small>`}<span class="daily-hours-track" aria-hidden="true">${group.segments.map(segment=>`<span class="daily-hours-bar" style="left:${segment.left}%;width:${segment.width}%;background:${color}"></span>`).join('')}</span></button>`;
}
function listTable(assignments,days,inDay){
 const matching=assignments.filter(a=>days.some(day=>inDay(a,day)));
 const regionName=id=>id===null?'Ortsunabhängig':record('regions',id)?.name||'Unbekanntes Gebiet';
 const regions=[...new Set(matching.map(a=>a.geodependency??null))].sort((a,b)=>regionName(a).localeCompare(regionName(b),'de-CH'));
 return `<table class="person-duty-list"><thead><tr><th scope="col">Tag</th>${regions.map(id=>`<th scope="col">${esc(regionName(id))}</th>`).join('')}</tr></thead><tbody>${days.map(day=>{const weekday=new Date(day+'T12:00:00Z').getUTCDay();return `<tr class="${weekday===0||weekday===6?'calendar-weekend':''}"><th scope="row">${['So','Mo','Di','Mi','Do','Fr','Sa'][weekday]}, ${swissDate(day).slice(0,6)}</th>${regions.map(region=>`<td>${groupDayDuties(matching.filter(a=>(a.geodependency??null)===region&&inDay(a,day)),day).map(group=>listDuty(group,true)).join('')}</td>`).join('')}</tr>`;}).join('')}</tbody></table>`;
}
async function load(){
 const request=++sequence;$('#print-calendar').disabled=true;$('#export-ical').disabled=true;
 try{
  const month=$('#calendar-month').value;if(!/^\d{4}-\d{2}$/.test(month))throw Error('Bitte einen Monat wählen');
  const response=await fetch('/api/state');if(!response.ok)throw Error('Kalender konnte nicht geladen werden');const nextState=await response.json();if(request!==sequence)return;state=nextState;
  const person=[...state.people,...(state.archived_people||[])].find(p=>p.employee_id===employeeId);if(!person)throw Error('Person nicht gefunden');
  const viewName=listView?'Listenansicht':'Kalenderansicht';$('#person-name').textContent=viewName+' Pikettdienste: '+person.name;document.title=viewName+' Pikettdienste: '+person.name+' · ExternPlan';document.querySelector('main').dataset.view=listView?'list':'calendar';document.body.classList.toggle('person-list-mode',listView);let printPage=$('#print-page');if(!printPage){printPage=document.createElement('style');printPage.id='print-page';document.head.append(printPage);}printPage.textContent='@page{size:A4 '+(listView?'portrait':'landscape')+';margin:8mm}';
  const first=new Date(month+'-01T12:00:00Z'),year=first.getUTCFullYear(),monthIndex=first.getUTCMonth();
  const count=new Date(Date.UTC(year,monthIndex+1,0)).getUTCDate(),offset=(first.getUTCDay()+6)%7;
  const assignments=state.assignments.filter(a=>a.employee_id===employeeId).sort((a,b)=>new Date(a.start_on)-new Date(b.start_on)||a.priority-b.priority);
  const days=Array.from({length:count},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
  const inDay=(a,day)=>localDay(a.start_on)<=day&&localDay(new Date(new Date(a.end_on).getTime()-1))>=day;
  $('#calendar-view').textContent='Ansicht ändern';$('#calendar-view').setAttribute('aria-pressed',String(listView));$('#person-calendar').setAttribute('aria-label',listView?'Pikettdienste nach Tag und Region':'Pikettdienste im Monatskalender');
  $('#person-calendar').innerHTML=listView?listTable(assignments,days,inDay):'<div class="person-calendar-grid">'+['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'].map(d=>`<div class="calendar-weekday">${d}</div>`).join('')+Array.from({length:offset},()=>'<div class="calendar-outside" aria-hidden="true"></div>').join('')+days.map((day,i)=>`<section class="calendar-date ${(offset+i)%7>=5?'calendar-weekend':''}" aria-label="${swissDate(day)}"><h2>${i+1}</h2>${groupDayDuties(assignments.filter(a=>inDay(a,day)),day).map(group=>listDuty(group)).join('')}</section>`).join('')+'</div>';
  displayedMonth=month;$('#calendar-period').textContent=new Intl.DateTimeFormat('de-CH',{month:'long',year:'numeric',timeZone:'Europe/Zurich'}).format(first);$('#print-calendar').disabled=false;$('#export-ical').disabled=false;
  const matching=assignments.filter(a=>days.some(day=>inDay(a,day)));$('#calendar-message').textContent=matching.length?`${matching.length} Pikettdienste im gewählten Monat`:'Keine Pikettdienste im gewählten Monat.';
  document.querySelectorAll('[data-duty]').forEach(button=>button.onclick=()=>{const ids=button.dataset.dutyIds?JSON.parse(button.dataset.dutyIds):[button.dataset.duty],originals=assignments.filter(a=>ids.includes(a.assignment_id));$('#duty-content').innerHTML=`<h2>${esc(title(originals[0]))}</h2><p>${esc(person.name)}</p>${originals.map(a=>`<section class="original-duty"><p>${esc(swissTime(a.start_on))} → ${esc(swissTime(a.end_on))}</p><p>Priorität ${a.priority}</p></section>`).join('')}`;$('#duty-details').showModal();});
 }catch(error){if(request===sequence){$('#calendar-message').textContent=error.message;$('#person-calendar').replaceChildren();}}
}
function moveMonth(delta){const date=new Date($('#calendar-month').value+'-01T12:00:00Z');if(!Number.isFinite(date.getTime()))return;date.setUTCMonth(date.getUTCMonth()+delta);$('#calendar-month').value=date.toISOString().slice(0,7);load();}
$('#print-calendar').onclick=async()=>{
 const controls=[...document.querySelectorAll('.toolbar button,.toolbar input')].map(element=>({element,disabled:element.disabled})),message=$('#calendar-message').textContent;
 controls.forEach(({element})=>element.disabled=true);$('#calendar-message').textContent='PDF wird erstellt …';
 try{await downloadPersonPdf(document.querySelector('main'),`pikett-${listView?'listenansicht':'kalenderansicht'}-${displayedMonth}.pdf`);$('#calendar-message').textContent=message;}catch(error){$('#calendar-message').textContent='PDF konnte nicht erstellt werden: '+error.message;}finally{controls.forEach(({element,disabled})=>element.disabled=disabled);}
};
$('#export-ical').onclick=()=>{try{const file=new Blob([personIcal(state,employeeId,displayedMonth)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=`pikett-${displayedMonth}.ics`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){$('#calendar-message').textContent=error.message;}};
$('#calendar-view').onclick=()=>{listView=!listView;try{localStorage.setItem('externplan.personCalendarView',listView?'list':'calendar');}catch{}load();};
$('#previous').onclick=()=>moveMonth(-1);$('#next').onclick=()=>moveMonth(1);$('#calendar-month').onchange=load;$('#reload').onclick=load;$('#close-details').onclick=()=>$('#duty-details').close();
await load();
