import {swissTime} from './time.js';
const contactTypes=[['phone_mobile','Telefon Mobil','mobile'],['phone_business','Telefon Geschäft','business'],['phone_private','Telefon Privat','private'],['email','E-Mail','Email']];
export function listContacts(contacts=[]){
 const rank=c=>{const i=contactTypes.findIndex(types=>types.includes(c.type));return i<0?contactTypes.length:i;};
 const priority=c=>Number(c.priority)>0?Number(c.priority):Infinity;
 return [...contacts].sort((a,b)=>priority(a)-priority(b)||rank(a)-rank(b)).map(c=>`${Number(c.priority)?'('+c.priority+') ':''}${contactTypes[rank(c)]?.[1]||c.type}: ${c.value}`);
}
// End is exclusive. Later duties are shown only if they start on the selected Swiss calendar day.
export function pikettList(state,at){
 const time=new Date(at).getTime();if(!Number.isFinite(time))throw Error('Ungültiger Zeitpunkt');
 const day=swissTime(at).slice(0,10),people=[...state.people,...(state.archived_people||[])];
 const record=(type,id)=>state[type].find(r=>r.id===id)||state.archived_master?.[type]?.find(r=>r.id===id);
 const rows=state.assignments.filter(a=>new Date(a.end_on).getTime()>time&&(new Date(a.start_on).getTime()<=time||swissTime(a.start_on).slice(0,10)===day)).map(a=>{
  const p=people.find(p=>p.employee_id===a.employee_id);
  return {assignment_id:a.assignment_id,function_id:a.function_id,function_name:record('functions',a.function_id)?.name||'Unbekannte Funktion',region_name:a.geodependency?(record('regions',a.geodependency)?.name||'Unbekanntes Gebiet'):'Ortsunabhängig',person_name:p?.last_name&&p?.first_name?`${p.last_name} ${p.first_name}`:p?.name||'Unbekannte Person',start_on:a.start_on,end_on:a.end_on,contacts:listContacts(p?.contacts),future:new Date(a.start_on).getTime()>time};
 }).sort((a,b)=>a.function_name.localeCompare(b.function_name,'de-CH')||a.region_name.localeCompare(b.region_name,'de-CH')||Number(a.future)-Number(b.future)||new Date(a.start_on)-new Date(b.start_on)||a.person_name.localeCompare(b.person_name,'de-CH'));
 return {at:new Date(time).toISOString(),rows};
}
