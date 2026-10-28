import {swissTime} from './time.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const swissDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'});
export function assignmentsInRange(assignments,{employee_id,date_from,date_to,match='start'}){
 for(const date of [date_from,date_to])if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Gültiges Von- und Bis-Datum erforderlich');
 if(date_from>date_to)throw Error('Bis-Datum muss am oder nach dem Von-Datum liegen');
 return assignments.filter(a=>{
  if(a.employee_id!==employee_id||a.access_read_only)return false;
  const start=swissDay.format(new Date(a.start_on));
  // Subtract one millisecond: a service ending at 00:00 does not overlap that day.
  const end=swissDay.format(new Date(new Date(a.end_on).getTime()-1));
  return match==='overlap'?start<=date_to&&end>=date_from:start>=date_from&&start<=date_to;
 });
}
export function planningRangeDialog({state,people,favorites,selectedFavoriteId,days,context,remove=false,modal,api,onSaved}){
 const sorted=people.filter(p=>!p.deleted_at).map(p=>({...p,label:[p.last_name,p.first_name].filter(Boolean).join(' ')||p.name})).sort((a,b)=>a.label.localeCompare(b.label,'de-CH'));
 const options=(rows,selected,key='id',label='name')=>rows.map(r=>`<option value="${esc(r[key])}" ${r[key]===selected?'selected':''}>${esc(r[label])}</option>`).join('');
 let confirmed=null;
 modal(`<h2>${remove?'Dienste im Zeitraum löschen':'Favorit für Zeitraum eintragen'}</h2><label>Person<select name="employee_id" required>${options(sorted,null,'employee_id','label')}</select></label>`+
 (remove?'':`<label>Favoritendienst<select name="favorite_id" required>${options(favorites,selectedFavoriteId)}</select></label>`)+
 `<div class="form-pair"><label>Von<input name="date_from" type="date" value="${esc(days[0])}" required></label><label>Bis · einschliesslich<input name="date_to" type="date" value="${esc(days.at(-1))}" required></label></div>`+
 (remove?'<label>Auswahl<select name="match"><option value="start">Dienste mit Beginn im Zeitraum</option><option value="overlap">Alle Dienste, die den Zeitraum berühren</option></select></label><p class="small muted">Alle für dich bearbeitbaren Funktionen und Regionen dieser Person werden berücksichtigt, unabhängig vom Funktion-/Regionenfilter. Die ausgewählten Dienste werden vollständig gelöscht, auch über den Zeitraum hinaus. Dienste ausserhalb der Auswahl bleiben erhalten.</p>':'<p class="small muted">Bis-Datum eingeschlossen · höchstens 366 Tage. Ohne festen Wochentag wird täglich geplant, sonst nur an den definierten Wochentagen. Die Dienste dürfen über das Bis-Datum hinaus enden. Beim Zeitmodell „Immer“ gilt der hier gewählte Zeitraum von 00:00 bis 23:59. Bereits identische Dienste werden übersprungen.</p>')+
 '<button type="button" id="range-preview" class="secondary">Vorschau anzeigen</button><div id="range-result" aria-live="polite"></div><p class="small muted">Diese Aktion kann anschliessend mit „Rückgängig“ zurückgenommen werden.</p>',async()=>{
  if(!confirmed)throw Error('Zuerst die Vorschau anzeigen');
  const result=remove?await api('/assignments/delete-many','POST',{assignments:confirmed.entries}):await api('/favorites/'+confirmed.input.favorite_id+'/apply','POST',confirmed.input);
  onSaved(result);
 });
 const form=document.querySelector('#form'),submit=form.querySelector('button[type=submit]'),preview=form.querySelector('#range-preview'),result=form.querySelector('#range-result');
 submit.textContent=remove?'Angezeigte Dienste löschen':'Dienste eintragen';submit.disabled=true;
 let sequence=0;document.querySelector('#dialog').addEventListener('close',()=>{sequence++;confirmed=null;},{once:true});const invalidate=()=>{sequence++;confirmed=null;submit.disabled=true;result.textContent='Auswahl geändert. Bitte Vorschau erneut anzeigen.';};form.querySelectorAll('input,select').forEach(field=>{field.oninput=invalidate;field.onchange=invalidate;});
 preview.disabled=!sorted.length||!remove&&!favorites.length;
 if(preview.disabled)result.textContent=!sorted.length?'Keine Personen für die gewählten Filter vorhanden.':'Keine passenden Favoritendienste für die gewählten Filter vorhanden.';
 preview.onclick=async()=>{
  const current=++sequence;confirmed=null;submit.disabled=true;
  try{
   const input={...Object.fromEntries(new FormData(form)),...context};
   // Validate dates for both operations before requesting the preview.
   assignmentsInRange([],input);
   if(remove){
    const latest=await api('/state');if(current!==sequence)return;
    const entries=assignmentsInRange(latest.assignments,input);
    result.innerHTML=`<p><b>${entries.length} Dienste werden vollständig gelöscht.</b></p>`+(entries.length?`<ul>${entries.slice(0,100).map(a=>`<li>${esc(latest.functions.find(f=>f.id===a.function_id)?.name||a.function_id)} · ${esc(a.geodependency?latest.regions.find(r=>r.id===a.geodependency)?.name||a.geodependency:'Ortsunabhängig')} · ${swissTime(a.start_on)} – ${swissTime(a.end_on)}</li>`).join('')}</ul>${entries.length>100?'<p>Weitere Dienste sind in der Anzahl enthalten.</p>':''}`:'');
    if(entries.length>1000){result.innerHTML+='<p>Höchstens 1000 Dienste auf einmal löschen. Bitte Zeitraum verkleinern.</p>';return;}
    if(entries.length)confirmed={entries:entries.map(a=>({assignment_id:a.assignment_id,revision:a.revision}))};
   }else{
    const favorite=favorites.find(f=>f.id===input.favorite_id);if(!favorite)throw Error('Favorit wählen');input.revision=favorite.revision;
    const data=await api('/favorites/'+favorite.id+'/preview','POST',input);if(current!==sequence)return;
    result.innerHTML=`<p><b>${data.assignments.length} neue Dienste</b> · ${data.already_planned} bereits vorhanden</p>`+(data.start_on?`<p>${swissTime(data.start_on)} – ${swissTime(data.end_on)}</p>`:'<p>Keine passenden Wochentage im gewählten Zeitraum.</p>')+(data.warnings?.length?`<p>${data.warnings.map(esc).join(' · ')}</p>`:'');
    if(data.assignments.length)confirmed={input};
   }
   submit.disabled=!confirmed;
  }catch(error){if(current===sequence)result.textContent=error.message;}
 };
}
