import {masterReferences} from './master-references.js';
import {favoriteTimeLabel} from './favorite-time.js';
import {dayBars} from './day-bars.js';
import {bindSplitPanel} from './split-panel.js';
import {favoriteMatchesContext} from './favorite-context.js';
import {personGroupIds,personDepartmentIds,allowedFunctionRegions} from './organization.js';
import {swissTime,swissDate,localDate,localDateTime,displayTimes} from './time.js';
const $=s=>document.querySelector(s);const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let masterTab='departments';
let state,view='planning',month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit'}).format(new Date()),department='',group='',personSearch='',functionFilter='',planningGroup='',personFunction='',personGroup='',selectedFavoriteId='',personRegions=null,personPlanningMonth=month,importRows=[];
let peopleList=false;try{peopleList=localStorage.getItem('externplan.peopleView')==='list';}catch{}
let favoritesHidden=false;try{favoritesHidden=localStorage.getItem('externplan.personFavoritesHidden')==='true';}catch{}
let coarseMode=false;try{coarseMode=localStorage.getItem('externplan.coarseCalendar')==='true';}catch{}
const calendarModeToggle=()=>`<button id="calendar-mode" class="secondary" role="switch" aria-checked="${coarseMode}" aria-label="Grobe Tagesansicht">${coarseMode?'Grobe Tagesansicht':'Zeitgenaue Ansicht'}</button>`;
function bindCalendarMode(){$('#calendar-mode').onclick=safe(async()=>{coarseMode=!coarseMode;try{localStorage.setItem('externplan.coarseCalendar',String(coarseMode));}catch{}await refresh();});}
const pendingFavoritePlans=new Set();
let personPlanningEmployeeIds=[],disposeSplitPanel=()=>{};
const personFavoriteMatches=f=>favoriteMatchesContext(state,f,{function_id:personFunction,group_id:personGroup,region_ids:personRegions||[],employee_ids:personPlanningEmployeeIds});
const api=async(path,method='GET',body)=>{const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
function message(text,error=false){$('#message').textContent=text;$('#message').className=error?'error':'';}
const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){message(e.message,true);}};
const options=(rows,key='id',label='name',selected='',blank=true)=>(blank?'<option value="">— wählen —</option>':'')+rows.map(x=>`<option value="${esc(x[key])}" ${x[key]===selected?'selected':''}>${esc(x[label])}</option>`).join('');
const label=(text,html)=>`<label>${text}</label>${html}`;const input=(name,value='',type='text',required=true)=>`<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}>`;
const masterRecord=(type,id)=>state[type].find(x=>x.id===id)||state.archived_master?.[type]?.find(x=>x.id===id);
const functionName=id=>masterRecord('functions',id)?.name||id;
const groupRecord=id=>masterRecord('groups',id);
const groupName=id=>{const g=groupRecord(id);return g?g.name+(g.deleted_at?' (gelöscht)':''):'';};
const name=id=>[...state.people,...(state.archived_people||[])].find(p=>p.employee_id===id)?.name||id;
const normalizedName=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('de-CH').replace(/ß/g,'ss');
const matchesPersonSearch=p=>normalizedName(personSearch).trim().split(/\s+/).filter(Boolean).every(part=>normalizedName([p.name,p.first_name,p.last_name].filter(Boolean).join(' ')).includes(part));
const cls=status=>({'vollständig besetzt':'full','teilweise besetzt':'partial','unbesetzt':'empty','kein Pikett erforderlich':'none'}[status]);
function modal(html,handler){$('#form footer button[type=submit]').hidden=false;$('#form footer button[type=submit]').disabled=false;$('#form footer button[type=submit]').textContent='Speichern';$('#fields').innerHTML=html;$('#dialog').showModal();$('#form').onsubmit=safe(async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));await handler(data);$('#dialog').close();await refresh();});}
$('#cancel').onclick=()=>$('#dialog').close();
async function refresh(){state=await api('/state');if(planningGroup&&!state.groups.some(g=>g.id===planningGroup))planningGroup='';if(group&&!state.groups.some(g=>g.id===group))group='';if(personGroup&&!state.groups.some(g=>g.id===personGroup))personGroup='';if(selectedFavoriteId&&!state.favorites.some(f=>f.id===selectedFavoriteId))selectedFavoriteId='';if(functionFilter&&!state.functions.some(f=>f.id===functionFilter))functionFilter='';const board=$('.board'),scroll=board?{left:board.scrollLeft,top:board.scrollTop}:null;await render();if(scroll&&$('.board')){$('.board').scrollLeft=scroll.left;$('.board').scrollTop=scroll.top;}}
function personAffiliationValues(p){
 return {Abteilung:personDepartmentIds(p,state.groups).map(id=>state.departments.find(d=>d.id===id)?.name).filter(Boolean),Gruppe:personGroupIds(p).map(groupName).filter(Boolean),Funktion:[...new Set(state.assignments.filter(a=>a.employee_id===p.employee_id).map(a=>functionName(a.function_id)))].sort((a,b)=>a.localeCompare(b,'de-CH'))};
}
function personAffiliations(p){return `<dl class="person-affiliations">${Object.entries(personAffiliationValues(p)).map(([title,values])=>`<div><dt>${title}</dt><dd>${values.map(esc).join(', ')||'—'}</dd></div>`).join('')}</dl>`;}
function personContacts(p){return sortedContacts(p.contacts).map(x=>`<p class="small person-contact">${Number(x.priority)?'('+esc(x.priority)+') ':''}${esc(contactName(x.type))}: ${esc(x.value)}</p>`).join('');}
function personActions(p){return `<div class="actions"><button class="secondary" data-person-calendar="${esc(p.employee_id)}">Dienste</button>${p.source==='manual'?`<button class="secondary" data-person="${esc(p.employee_id)}">Bearbeiten</button>`:`<button class="secondary" data-person-groups="${esc(p.employee_id)}">Gruppen bearbeiten</button>`}</div>`;}
function peopleTable(people){
 const rows=[...people].sort((a,b)=>(a.last_name||a.name).localeCompare(b.last_name||b.name,'de-CH')||(a.first_name||'').localeCompare(b.first_name||'','de-CH'));
 return `<div class="people-list-wrapper"><table class="people-list"><thead><tr>${['Name','Vorname','Abteilung','Gruppe','Funktion','Kommunikation','Aktionen'].map(t=>`<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${rows.map(p=>`<tr><th scope="row">${esc(p.last_name||p.name)}${p.source==='SAP'?'<small class="muted">SAP-Import (simuliert)</small>':''}</th><td>${esc(p.first_name)||'—'}</td>${Object.values(personAffiliationValues(p)).map(values=>`<td>${values.map(esc).join(', ')||'—'}</td>`).join('')}<td>${personContacts(p)||'—'}</td><td>${personActions(p)}</td></tr>`).join('')}</tbody></table></div>`;
}
function assignmentTime(value,fallback){
 if(!value)return fallback;
 if(/[Zz]|[+-]\d{2}:\d{2}$/.test(value))return swissTime(value);
 const [date,time]=value.split('T');return swissDate(date)+' '+time.slice(0,5);
}
function assignmentDialog(a={},defaults={}){
 a={...defaults,...a};
 if(a.assignment_id&&((state.archived_people||[]).some(p=>p.employee_id===a.employee_id)||masterRecord('functions',a.function_id)?.deleted_at||a.geodependency&&masterRecord('regions',a.geodependency)?.deleted_at)){
   modal(`<h2>Vergangener Pikettdienst</h2><p>${esc(name(a.employee_id))} · ${esc(functionName(a.function_id))} · ${esc(a.geodependency?regionName(a.geodependency):'Ortsunabhängig')} · P${a.priority}</p><p>${swissTime(a.start_on)} → ${swissTime(a.end_on)}</p><p class="muted">Zugehörige Personen oder Stammdaten wurden gelöscht. Dieser Dienst bleibt als unveränderte Historie erhalten.</p>`,async()=>{});$('#form footer button[type=submit]').hidden=true;return;
 }
 const f=state.functions.find(f=>f.id===a.function_id)||state.functions[0];
 const filteredGroup=view==='planning'?planningGroup:view==='person-planning'?personGroup:'';const people=filteredGroup?state.people.filter(p=>personGroupIds(p).includes(filteredGroup)):state.people;
 const timeField=(field,text,fallback)=>label(text,input(field,assignmentTime(a[field],fallback)))+
 label('Zeitumstellung: doppelte Uhrzeit',`<select name="${field}_offset"><option value="">Automatisch · eindeutige Schweizer Zeit</option><option value="+02:00">Sommerzeit (erste doppelte Uhrzeit)</option><option value="+01:00">Winterzeit (zweite doppelte Uhrzeit)</option></select>`);
 modal(`<h2>${a.assignment_id?'Zuteilung bearbeiten':'Pikett zuteilen'}</h2>`+(a.assignment_id?label('Kennung',`<input name="assignment_id" value="${esc(a.assignment_id)}" readonly>`):'')+
 label('Person',`<select name="employee_id" required>${options(people.map(p=>({...p,display_name:p.last_name&&p.first_name?`${p.last_name} ${p.first_name}`:p.name})).sort((a,b)=>a.display_name.localeCompare(b.display_name,'de-CH')),'employee_id','display_name',a.employee_id)}</select>`)+
 label('Funktion',`<select name="function_id" required>${options(state.functions,'id','name',f?.id,false)}</select>`)+`<div id="geo-field"></div>`+
 timeField('start_on','Beginn · Schweizer Zeit',swissDate(month+'-01')+' 07:00')+
 timeField('end_on','Ende · exklusiv',swissDate(month+'-02')+' 07:00')+
 `<p class="small muted">Format: 19.04.1972 13:40. Bei einer doppelten Uhrzeit im Herbst die gewünschte Sommer- oder Winterzeit auswählen.</p>`+
 label('Kontaktpriorität dieser Zuteilung',input('priority',a.priority||1,'number'))+
 (a.assignment_id?'<button type="button" class="danger" id="delete-assignment">Löschen</button>':'<button type="button" id="assignment-favorite" class="secondary">★ Favorit verwenden</button>'),async d=>{
   for(const field of ['start_on','end_on']){
     const local=localDateTime(d[field]);const chosen=d[field+'_offset'];if(chosen&&swissTime(local+chosen)!==d[field].trim())throw Error('Die gewählte Sommer-/Winterzeit passt nicht zur Schweizer Uhrzeit');
     // Keep an existing precise instant when its displayed local time has not changed.
     d[field]=!chosen&&a.assignment_id&&swissTime(a[field])===d[field].trim()?a[field]:local+chosen;
     delete d[field+'_offset'];
   }
   if(filteredGroup)d.planning_group_id=filteredGroup;delete d.assignment_id;d.priority=Number(d.priority);d.geodependency=d.geodependency||null;if(a.assignment_id)d.revision=a.revision;
   const r=await api('/assignments'+(a.assignment_id?'/'+a.assignment_id:''),a.assignment_id?'PUT':'POST',d);
   message(r.warnings.length?r.warnings.join(' · '):'Zuteilung gespeichert');
 });
 const geo=()=>{const selected=state.functions.find(f=>f.id===$('[name=function_id]').value);$('#geo-field').innerHTML=selected?.geo_ids.length?label('Pflichtgebiet',`<select name="geodependency" required>${options(state.regions.filter(r=>allowedFunctionRegions(selected,state.groups.find(g=>g.id===filteredGroup),state.regions).includes(r.id)),'id','name',a.geodependency)}</select>`):'<p class="muted">Ortsunabhängig</p>';};geo();$('[name=function_id]').onchange=geo;
 if(!a.assignment_id)$('#assignment-favorite').onclick=()=>{$('#dialog').close();favoriteApplyDialog({employee_id:a.employee_id,function_id:f?.id,date:a.start_on?.slice(0,10)||today()});};
 if(a.assignment_id)$('#delete-assignment').onclick=safe(async()=>{await api(`/assignments/${a.assignment_id}?revision=${a.revision}`,'DELETE');$('#dialog').close();message('Löschung gespeichert; ELS-Bestätigung ausstehend');await refresh();});
}
async function render(){disposeSplitPanel();document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const c=$('#content');
 if(view==='planning'){const result=await api('/month?month='+month+(planningGroup?'&group_id='+encodeURIComponent(planningGroup):''));c.innerHTML=`<h1>Kontrollansicht</h1><p class="muted">Funktionen und Gebiete · Zeiten in Europe/Zurich · Ende exklusiv${coarseMode?' · Dienste nur am Starttag; Abdeckungsstatus weiterhin zeitgenau':''}</p><div class="toolbar"><input id="month" type="month" value="${month}"><select id="function-filter">${options(state.functions,'id','name',functionFilter).replace('— wählen —','Alle Funktionen')}</select><select id="planning-group" aria-label="Gruppe filtern">${options(state.groups,'id','name',planningGroup).replace('— wählen —','Alle Gruppen')}</select>${calendarModeToggle()}<button id="new-assignment">+ Zuteilung</button></div>${planningGroup?'<p class="muted">Besetzungsstatus und Lücken beziehen sich auf die ausgewählte Gruppe. Andere Gruppen bleiben in der Planung erhalten.</p>':''}<div class="legend">${['vollständig besetzt','teilweise besetzt','unbesetzt'].map(x=>`<span class="status ${cls(x)}">${x}</span>`).join('')}</div><div class="function-calendar"><div class="board"><table class="month" style="--days:${result.days.length}"><colgroup><col class="function-label-width">${result.days.map(()=>'<col>').join('')}</colgroup><thead><tr><th>Funktion / Gebiet</th>${result.days.map(d=>`<th title="${swissDate(d)}">${Number(d.slice(-2))}<span class="muted">${new Intl.DateTimeFormat('de-CH',{weekday:'short',timeZone:'Europe/Zurich'}).format(new Date(d+'T12:00:00Z'))}</span></th>`).join('')}</tr></thead><tbody>${result.rows.filter(r=>!functionFilter||r.function_id===functionFilter).map((row,i)=>`<tr><td data-open-person-function="${esc(row.function_id)}" data-open-person-region="${esc(row.geo_id||'')}"><button type="button" class="function-person-link" title="Planung für diese Funktion und dieses Gebiet öffnen"><b>${esc(state.functions.find(f=>f.id===row.function_id)?.name)}</b><span class="muted">${esc(row.geo_id?regionName(row.geo_id):'Ortsunabhängig')}</span></button></td>${row.cells.map((cell,j)=>`<td ${coverageCellAttributes(cell)} data-function="${esc(row.function_id)}" data-geo="${esc(row.geo_id||'')}" data-day="${result.days[j]}">${functionCellBars(cell,result.days[j],row,j)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
 bindCalendarMode();
 $('#month').onchange=safe(async e=>{if(month===e.target.value)return;month=e.target.value;await render();});$('#function-filter').onchange=safe(async e=>{if(functionFilter===e.target.value)return;functionFilter=e.target.value;await render();});$('#planning-group').onchange=safe(async e=>{planningGroup=e.target.value;await refresh();});$('#new-assignment').onclick=()=>assignmentDialog();
 document.querySelectorAll('[data-open-person-function]').forEach(td=>td.onclick=safe(async()=>{personFunction=td.dataset.openPersonFunction;personRegions=td.dataset.openPersonRegion?[td.dataset.openPersonRegion]:[];personPlanningMonth=month;personGroup=planningGroup;view='person-planning';await render();}));
 document.querySelectorAll('[data-function-assignment]').forEach(b=>b.onclick=e=>{e.stopPropagation();assignmentDialog(state.assignments.find(a=>a.assignment_id===b.dataset.functionAssignment));});
 document.querySelectorAll('td[data-day]').forEach(td=>td.onclick=()=>{const row=result.rows.find(r=>r.function_id===td.dataset.function&&(r.geo_id||'')===td.dataset.geo);const cell=row.cells[result.days.indexOf(td.dataset.day)];modal(`<h2>${esc(swissDate(td.dataset.day))} · ${esc(td.dataset.geo?regionName(td.dataset.geo):'Ortsunabhängig')}</h2>${cell.status!=='kein Pikett erforderlich'?`<span class="status ${cls(cell.status)}">${cell.status}</span>`:''}<h3>Offene Zeitabschnitte</h3>${cell.gaps.map(g=>`<p>${esc(swissTime(g.start_on))} → ${esc(swissTime(g.end_on))}</p>`).join('')||'<p>Keine Lücken</p>'}<h3>Zuteilungen</h3>${cell.assignments.map(a=>`<p><button type="button" data-edit="${a.assignment_id}">${esc(name(a.employee_id))} · P${a.priority}</button><br><span class="small">${esc(swissTime(a.start_on))} → ${esc(swissTime(a.end_on))}</span></p>`).join('')}<button type="button" id="cell-new">+ Zuteilung</button>`,async()=>{});$('#form footer button[type=submit]').hidden=true;const open=a=>{$('#dialog').close();$('#form footer button[type=submit]').hidden=false;assignmentDialog(a,{function_id:td.dataset.function,geodependency:td.dataset.geo||null,start_on:td.dataset.day+'T07:00',end_on:td.dataset.day+'T19:00'});};$('#cell-new').onclick=()=>open({});document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>open(state.assignments.find(a=>a.assignment_id===b.dataset.edit)));});
 }
 if(view==='person-planning'){
   if(!state.functions.length){c.innerHTML='<h1>Planung</h1><p>Zuerst eine Funktion anlegen.</p>';return;}
   const f=state.functions.find(f=>f.id===personFunction)||state.functions[0];
   if(personFunction!==f.id||personRegions===null){personFunction=f.id;personRegions=allowedFunctionRegions(f,state.groups.find(g=>g.id===personGroup),state.regions);}
   personRegions=personRegions.filter(g=>allowedFunctionRegions(f,state.groups.find(g=>g.id===personGroup),state.regions).includes(g));
   const params=new URLSearchParams({month:personPlanningMonth,function_id:f.id,...(personGroup?{group_id:personGroup}:{})});
   if(personRegions.length)personRegions.forEach(g=>params.append('region_id',g));else params.append('region_id','');
   const result=await api('/person-month?'+params);
   personPlanningEmployeeIds=result.rows.map(p=>p.employee_id);
   if(selectedFavoriteId&&!state.favorites.some(f=>f.id===selectedFavoriteId&&personFavoriteMatches(f)))selectedFavoriteId='';
   const geos=state.regions.filter(r=>allowedFunctionRegions(f,state.groups.find(g=>g.id===personGroup),state.regions).includes(r.id));
   c.innerHTML=`<h1>Planung</h1><p class="muted">${personGroup?'Alle Mitglieder der gewählten Gruppe, auch ohne Pikettdienst':'Personen mit passenden Pikettdiensten im ausgewählten Monat'} · Schweizer Zeit · Ende exklusiv</p>
   <div class="toolbar"><input type="month" id="person-month" value="${personPlanningMonth}" aria-label="Monat"><select id="person-function" aria-label="Funktion">${options(state.functions,'id','name',f.id,false)}</select><select id="person-group" aria-label="Gruppe">${options(state.groups,'id','name',personGroup).replace('— wählen —','Alle Gruppen')}</select>
   ${f.geo_ids.length?`<details class="region-filter"><summary>Regionen: ${personRegions.length} von ${geos.length}</summary><div><div class="actions"><button type="button" id="all-person-regions" class="secondary">Alle wählen</button><button type="button" id="no-person-regions" class="secondary">Auswahl leeren</button></div>${geos.map(g=>`<label class="check-option"><input type="checkbox" data-person-region="${esc(g.id)}" ${personRegions.includes(g.id)?'checked':''}>${esc(g.name)}</label>`).join('')}</div></details>`:'<span class="muted">Ortsunabhängige Funktion · keine Region erforderlich</span>'}
   ${calendarModeToggle()}<span>${result.rows.length} Personen</span><button id="toggle-person-favorites" class="secondary" aria-expanded="${!favoritesHidden}" aria-controls="person-favorites">Favoriten ${favoritesHidden?'einblenden':'ausblenden'}</button><button id="add-person-duty">+ Zuteilung</button></div>
   <p class="small muted">${coarseMode?'Grobe Tagesansicht: Dienste nur am Starttag, gleichmässig auf das Tagesfeld verteilt. ':''}Gesamtgebiets-Dienste werden bei ausdrücklich abgedeckten Teilregionen ebenfalls angezeigt, jeweils einmal. Jede Zelle enthält die tatsächlichen Zuteilungen; Unbeschriftete Balken zeigen den zeitlichen Verlauf. Details erscheinen per Klick oder beim Darüberfahren.</p>
   <div class="calendar-with-favorites resizable-calendar ${favoritesHidden?'favorites-hidden':''}">${favoritesHidden?'':'<div id="person-favorites">'+favoriteTree(f.id,personGroup)+'</div><div class="favorites-splitter" role="separator" tabindex="0" aria-label="Breite der Favoritendienste" aria-orientation="vertical" aria-controls="person-favorites" title="Ziehen, um die Breite anzupassen"></div>'}${result.rows.length?timelineTable(result):`<div class="card">${f.geo_ids.length&&!personRegions.length?'Bitte mindestens eine Region wählen.':'Keine passenden Pikettdienste im ausgewählten Monat.'}</div>`}</div>`;
   bindCalendarMode();
   if(!favoritesHidden){bindFavoriteTree();disposeSplitPanel=bindSplitPanel($('.resizable-calendar'));}
   $('#toggle-person-favorites').onclick=safe(async()=>{favoritesHidden=!favoritesHidden;try{localStorage.setItem('externplan.personFavoritesHidden',String(favoritesHidden));}catch{}await refresh();});
   document.querySelectorAll('[data-bar-assignment]').forEach(b=>b.onclick=safe(async e=>{
     const a=state.assignments.find(a=>a.assignment_id===b.dataset.barAssignment);
     if(!favoritesHidden&&selectedFavoriteId){const track=b.closest('.timeline-track'),rect=track.getBoundingClientRect();const x=e.detail===0?b.offsetLeft:e.clientX-rect.left;const day=Math.max(0,Math.min(result.days.length-1,Math.floor(x/(rect.width/result.days.length))));await planSelectedPersonFavorite(a.employee_id,result.days[day],f.id);return;}
     assignmentDialog(a);
   }));
   $('#add-person-duty').onclick=()=>assignmentDialog({},{function_id:f.id,geodependency:personRegions.length===1?personRegions[0]:null,start_on:personPlanningMonth+'-01T07:00',end_on:personPlanningMonth+'-02T07:00'});
   $('#person-month').onchange=safe(async e=>{if(personPlanningMonth===e.target.value)return;personPlanningMonth=e.target.value;await refresh();});
   $('#person-group').onchange=safe(async e=>{personGroup=e.target.value;personRegions=null;await refresh();});
   $('#person-function').onchange=safe(async e=>{if(personFunction===e.target.value)return;personFunction=e.target.value;personRegions=null;await refresh();});
   document.querySelectorAll('[data-person-region]').forEach(x=>x.onchange=safe(async()=>{personRegions=[...document.querySelectorAll('[data-person-region]:checked')].map(x=>x.dataset.personRegion);await refresh();$('.region-filter').open=true;}));
   if(f.geo_ids.length){$('#all-person-regions').onclick=safe(async()=>{personRegions=allowedFunctionRegions(f,state.groups.find(g=>g.id===personGroup),state.regions);await refresh();$('.region-filter').open=true;});$('#no-person-regions').onclick=safe(async()=>{personRegions=[];await refresh();$('.region-filter').open=true;});}
   document.querySelectorAll('[data-person-day]').forEach(td=>td.onclick=safe(async()=>{
     const row=result.rows.find(r=>r.employee_id===td.dataset.employee),cell=row.cells[result.days.indexOf(td.dataset.personDay)];if(!favoritesHidden&&selectedFavoriteId){await planSelectedPersonFavorite(row.employee_id,td.dataset.personDay,f.id);return;}
     modal(`<h2>${esc(row.name)} · ${swissDate(td.dataset.personDay)}</h2>${cell.assignments.map(a=>`<p><button type="button" data-person-edit="${a.assignment_id}">${esc(a.geodependency?regionName(a.geodependency):'Ortsunabhängig')} · P${a.priority}</button><br>${esc(swissTime(a.start_on))} → ${esc(swissTime(a.end_on))}</p>`).join('')||'<p>Kein Dienst an diesem Tag</p>'}<button type="button" id="new-person-duty">+ Zuteilung</button>`,async()=>{});
     $('#form footer button[type=submit]').hidden=true;
     const open=a=>{$('#dialog').close();assignmentDialog(a,{employee_id:row.employee_id,function_id:f.id,geodependency:personRegions.length===1?personRegions[0]:null,start_on:td.dataset.personDay+'T07:00',end_on:td.dataset.personDay+'T19:00'});};
     $('#new-person-duty').onclick=()=>open({});document.querySelectorAll('[data-person-edit]').forEach(b=>b.onclick=()=>open(state.assignments.find(a=>a.assignment_id===b.dataset.personEdit)));
   }));
 }
 if(view==='people'){const availableGroups=state.groups.filter(g=>!department||g.department_id===department);if(group&&!availableGroups.some(g=>g.id===group))group='';const people=state.people.filter(p=>(!department||personDepartmentIds(p,state.groups).includes(department))&&(!group||personGroupIds(p).includes(group))&&matchesPersonSearch(p));c.innerHTML=`<h1>Organisation & Personen</h1><div class="toolbar"><input id="person-search" type="search" value="${esc(personSearch)}" placeholder="Name oder Vorname suchen …" aria-label="Personen nach Namen suchen"><select id="department">${options(state.departments,'id','name',department).replace('— wählen —','Alle Abteilungen')}</select><select id="group">${options(availableGroups,'id','name',group).replace('— wählen —','Alle Gruppen')}</select><span>${people.length} Personen</span><div class="people-view-toggle" role="group" aria-label="Personendarstellung"><button class="secondary" data-people-view="cards" aria-pressed="${!peopleList}">Kartenansicht</button><button class="secondary" data-people-view="list" aria-pressed="${peopleList}">Listenansicht</button></div><button id="new-department" class="secondary">+ Abteilung</button><button id="new-person">+ Externe Person</button></div>${peopleList&&people.length?peopleTable(people):`<div class="cards">${people.map(p=>`<article class="card"><h2>${esc(p.name)}</h2>${p.first_name||p.last_name?`<dl class="person-names"><dt>Name</dt><dd>${esc(p.last_name)}</dd><dt>Vorname</dt><dd>${esc(p.first_name)}</dd></dl>`:`<p class="small muted">Bisheriger vollständiger Name: ${esc(p.name)}</p>`}${p.source==='SAP'?'<p class="muted">SAP-Import (simuliert)</p>':''}${personAffiliations(p)}${personContacts(p)}${personActions(p)}</article>`).join('')||'<p class="muted" role="status">Keine Personen für diese Suche und Filter gefunden.</p>'}</div>`}`;
 document.querySelectorAll('[data-people-view]').forEach(b=>b.onclick=safe(async()=>{peopleList=b.dataset.peopleView==='list';try{localStorage.setItem('externplan.peopleView',peopleList?'list':'cards');}catch{}await render();}));
 $('#person-search').oninput=safe(async e=>{personSearch=e.target.value;const caret=e.target.selectionStart;await render();$('#person-search').focus();if(caret!==null)$('#person-search').setSelectionRange(caret,caret);});
 document.querySelectorAll('[data-person-groups]').forEach(b=>b.onclick=()=>personGroupsDialog(state.people.find(p=>p.employee_id===b.dataset.personGroups)));
 $('#department').onchange=safe(async e=>{department=e.target.value;await render();});$('#group').onchange=safe(async e=>{group=e.target.value;await render();});$('#new-department').onclick=()=>departmentDialog();$('#new-person').onclick=()=>personDialog();document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>personDialog(state.people.find(p=>p.employee_id===b.dataset.person)));document.querySelectorAll('[data-person-calendar]').forEach(b=>b.onclick=()=>{window.open('/person-calendar.html?'+new URLSearchParams({employee_id:b.dataset.personCalendar}),'_blank','popup,width=1100,height=800,noopener');});
 }
 if(view==='master'){
 c.innerHTML=`<h1>Stammdaten & Soll-Abdeckung</h1><div class="master-tabs" role="tablist" aria-label="Stammdaten">${['departments','groups','functions','regions','rules','favorites'].map(type=>`<button id="master-tab-${type}" data-master-tab="${type}" role="tab" aria-controls="master-panel-${type}">${masterTitles[type]||'Favoritendienste'}</button>`).join('')}</div>${['departments','groups','functions','regions','rules'].map(type=>`<article class="card" id="master-panel-${type}" data-master-panel="${type}" role="tabpanel" aria-labelledby="master-tab-${type}"><div class="toolbar"><h2>${masterTitles[type]}</h2><button data-master-new="${type}">+ Anlegen</button></div><table><thead><tr><th>Name</th><th>Konfiguration</th><th></th></tr></thead><tbody>${state[type].map(x=>`<tr><td>${esc(x.name||state.functions.find(f=>f.id===x.function_id)?.name)}</td><td>${masterSummary(type,x)}</td><td><button data-master="${type}" data-id="${esc(x.id)}">Bearbeiten</button>${type!=='rules'?` <button class="secondary" data-references="${type}" data-id="${esc(x.id)}">Referenzen</button>`:''}</td></tr>`).join('')}</tbody></table></article>`).join('')}`;
 c.innerHTML+=`<article class="card" id="master-panel-favorites" data-master-panel="favorites" role="tabpanel" aria-labelledby="master-tab-favorites"><div class="toolbar"><h2>Favoritendienste</h2><button id="new-favorite">+ Favoritendienst</button></div>${state.favorites.map(f=>favoriteMasterRow(f,state.favorites,'data-edit-favorite')).join('')||'<p>Noch keine Favoritendienste.</p>'}</article>`;
 const selectTab=type=>{masterTab=type;document.querySelectorAll('[data-master-tab]').forEach(b=>{const active=b.dataset.masterTab===type;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});document.querySelectorAll('[data-master-panel]').forEach(p=>p.hidden=p.dataset.masterPanel!==type);};
 const tabs=[...document.querySelectorAll('[data-master-tab]')];tabs.forEach((b,i)=>{b.onclick=()=>selectTab(b.dataset.masterTab);b.onkeydown=e=>{const next=e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;if(next!==null){e.preventDefault();tabs[next].click();tabs[next].focus();}};});selectTab(masterTab);
 document.querySelectorAll('[data-references]').forEach(b=>b.onclick=()=>{const type=b.dataset.references,record=masterRecord(type,b.dataset.id),refs=masterReferences(state,type,record.id);const list=rows=>rows.length?`<ul>${rows.map(x=>`<li>${esc(x.name)}</li>`).join('')}</ul>`:'<p class="muted">Keine Referenzen vorhanden.</p>';modal(`<h2>Referenzen: ${esc(record.name)}</h2><h3>Personen</h3>${type==='functions'||type==='regions'?'<p class="small muted">Personen mit Pikettdiensten, einschliesslich vergangener Dienste.</p>':''}${list(refs.people)}${type!=='functions'?`<h3>Funktionen</h3><p class="small muted">${type==='regions'?'Über Gebietszuordnung oder Gebietsabdeckung verbunden.':'Aus den Pikettdiensten der zugehörigen Personen, einschliesslich vergangener Dienste.'}</p>${list(refs.functions)}`:''}`,async()=>{});$('#form footer button[type=submit]').hidden=true;});
 bindFavoriteOrdering();$('#new-favorite').onclick=()=>favoriteEditor();document.querySelectorAll('[data-edit-favorite]').forEach(b=>b.onclick=()=>favoriteEditor(state.favorites.find(f=>f.id===b.dataset.editFavorite)));
 document.querySelectorAll('[data-master-new]').forEach(b=>b.onclick=()=>masterDialog(b.dataset.masterNew));document.querySelectorAll('[data-master]').forEach(b=>b.onclick=()=>masterDialog(b.dataset.master,state[b.dataset.master].find(x=>x.id===b.dataset.id)));
 }
 if(view==='imports'){c.innerHTML=`<h1>Quelldaten importieren</h1><p>Die Dateien Funktionen(1).xlsx, Regionen.xlsx, Personen.json und E3_Planning_23052025x.json fehlen. Prüfen Sie Dateien und Spalten vor der Übernahme. Die E3-Referenz kann lokal als JSON eingesehen werden, wird aber nicht ungeprüft als Planung übernommen.</p><article class="card"><label>Importtyp</label><select id="import-type"><option value="sap">Personen / simulierter SAP-Import</option><option value="regions">Regionen.xlsx</option><option value="functions">Funktionen(1).xlsx</option><option value="reference">E3-Exportreferenz ansehen</option></select><label>Datei (JSON oder XLSX)</label><input type="file" id="file" accept=".json,.xlsx"><div id="preview"></div></article>`;$('#file').onchange=safe(async e=>{const file=e.target.files[0];if(!file)return;if(file.size>5e6)throw Error('Datei zu gross (maximal 5 MB)');if($('#import-type').value==='reference'){$('#preview').innerHTML='<pre>'+esc(JSON.stringify(displayTimes(JSON.parse(await file.text())),null,2))+'</pre>';return;}const buffer=await file.arrayBuffer();const format=file.name.endsWith('.xlsx')?'xlsx':'json';const content=format==='xlsx'?btoa(Array.from(new Uint8Array(buffer),b=>String.fromCharCode(b)).join('')):new TextDecoder().decode(buffer);const p=await api('/import/preview','POST',{format,content});importRows=p.rows;const type=$('#import-type').value,keys=type==='sap'?['employee_id','name','first_name','last_name','department_id','external_id','contacts']:type==='regions'?['id','name']:['id','name','geo_ids'];$('#preview').innerHTML=`<h2>${p.count} Datensätze · Vorschau</h2><pre>${esc(JSON.stringify(displayTimes(p.rows.slice(0,5)),null,2))}</pre><p>Ordnen Sie die tatsächlichen Spalten explizit zu. employee_id entspricht persID. Leere Geo-Zuordnung bedeutet ortsunabhängig. Kontakte müssen ein Array aus type, value und priority sein.</p>${keys.map(k=>label(esc(k),`<select data-map="${k}">${options(p.headers.map(h=>({id:h,name:h})),'id','name',p.headers.includes(k)?k:k==='employee_id'&&p.headers.includes('persID')?'persID':'')}</select>`)).join('')}<p><button id="commit-import">Import übernehmen</button></p>`;$('#commit-import').onclick=safe(async()=>{const mapping={};document.querySelectorAll('[data-map]').forEach(x=>mapping[x.dataset.map]=x.value);const r=await api('/import/commit','POST',{type,rows:importRows,mapping});message(`${r.imported} importiert, ${r.skipped} manuelle Personen geschützt / übersprungen`);await refresh();});});}
 if(view==='exports'){c.innerHTML=`<h1>ELS-Schnittstelle</h1><p class="muted">${state.outbox.length} ausstehende Änderungen · Datei erzeugt und Import bestätigt sind getrennte Zustände.</p><div class="toolbar"><button id="delta">Delta-Datei erzeugen</button><button id="snapshot" class="secondary">Snapshot · alle Zuteilungen</button><button id="sync-people" class="secondary">Personen im ELS simuliert anlegen</button></div><div class="cards"><article class="card"><h2>Personenstatus</h2>${state.people.map(p=>`<p>${esc(p.name)} · ${state.els.people[p.employee_id]?.status||'Ausstehend'}</p>`).join('')}</article><article class="card"><h2>Zuteilungsstatus</h2>${state.assignments.map(a=>`<p>${esc(name(a.employee_id))} · Revision ${a.revision} · ${state.els.assignments[a.assignment_id]?.revision===a.revision?'Import bestätigt':'Ausstehend'}</p>`).join('')||'Keine Zuteilungen'}<p>${state.outbox.filter(x=>x.action==='delete').length} ausstehende Löschungen</p></article></div>${state.exports.slice().reverse().map(e=>`<article class="card"><b>${e.payload.export_mode} · ${esc(e.status)}</b><p>${esc(swissTime(e.created_at))} · ${e.payload.changes.length} Änderungen</p><div class="actions"><a href="/api/exports/${e.payload.export_id}">JSON herunterladen</a><button data-confirm="${e.payload.export_id}">Import im Simulator bestätigen</button></div>${e.errors.length?`<pre>${esc(JSON.stringify(auditPresentation(e.errors),null,2))}</pre>`:''}</article>`).join('')}`;for(const mode of ['delta','snapshot'])$('#'+mode).onclick=safe(async()=>{await api('/exports','POST',{mode});message('Datei erzeugt; Import noch nicht bestätigt');await refresh();});$('#sync-people').onclick=safe(async()=>{await api('/els/people','POST',{});await refresh();});document.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=safe(async()=>{const e=await api(`/exports/${b.dataset.confirm}/confirm`,'POST',{});message(e.status);await refresh();}));}
 if(view==='audit'){c.innerHTML=`<h1>Änderungsprotokoll</h1><p class="muted">Lokaler Planer · keine produktive Benutzeridentität</p>${state.audit.slice().reverse().map(a=>`<details class="card"><summary>${esc(swissTime(a.at))} · ${esc(a.entity)} · ${esc(a.action)} · ${esc(a.actor)}</summary><pre>${esc(JSON.stringify(auditPresentation(displayTimes({before:a.before,after:a.after})),null,2))}</pre></details>`).join('')||'<p>Noch keine Änderungen</p>'}`;}
}
function auditPresentation(value){
 if(Array.isArray(value))return value.map(auditPresentation);
 if(!value||typeof value!=='object')return value;
 const out={};
 for(const [key,item] of Object.entries(value)){
   if(['id','assignment_id','export_id','external_id','scope_id','favorite_id'].includes(key))continue;
   if(key==='employee_id'){out.Person=name(item);continue;}
   if(key==='function_id'){out.Funktion=functionName(item);continue;}
   if(key==='group_ids'){out.Gruppen=item.map(groupName);continue;}
   if(key==='group_id'){out.Gruppe=groupName(item)||'Keine Gruppe';continue;}
   if(key==='department_id'){out.Abteilung=state.departments.find(d=>d.id===item)?.name||'Keine Abteilung';continue;}
   if(key==='geodependency'||key==='geo_id'){out.Gebiet=item?regionName(item):'Ortsunabhängig / allgemein';continue;}
   if(key==='geo_ids'||key==='region_ids'){out.Gebiete=Array.isArray(item)?item.map(regionName):'Alle Regionen';continue;}
   if(key==='covers'){out.Gebietsabdeckung=Object.fromEntries(Object.entries(item).map(([whole,parts])=>[regionName(whole),parts.map(regionName)]));continue;}
   out[key]=auditPresentation(item);
 }
 return out;
}
const contactFields=[
 {type:'phone_mobile',label:'Telefon Mobil',input:'tel',aliases:['phone_mobile','Telefon Mobil','mobile']},
 {type:'phone_business',label:'Telefon Geschäft',input:'tel',aliases:['phone_business','Telefon Geschäft','business']},
 {type:'phone_private',label:'Telefon Privat',input:'tel',aliases:['phone_private','Telefon Privat','private']},
 {type:'email',label:'E-Mail',input:'email',aliases:['email','E-Mail','Email']}
];
function sortedContacts(contacts){
 const rank=c=>{const i=contactFields.findIndex(f=>f.aliases.includes(c.type));return i<0?contactFields.length:i;};
 const priority=c=>Number(c.priority)>0?Number(c.priority):Infinity;
 return [...contacts].sort((a,b)=>(priority(a)-priority(b)||rank(a)-rank(b)));
}
function contactName(type){return contactFields.find(f=>f.aliases.includes(type))?.label||type;}
function departmentDialog(){
 modal('<h2>Neue Abteilung</h2>'+label('Abteilungsname',input('name')),async d=>{
   const name=d.name.trim();if(!name)throw Error('Abteilungsname erforderlich');
   const created=await api('/master/departments','POST',{name});department=created.id;group='';message('Abteilung angelegt');
 });
}
function personDialog(p={}){
 const remaining=[...(p.contacts||[])];
 const values=contactFields.map(f=>{const i=remaining.findIndex(c=>f.aliases.includes(c.type));return i<0?null:remaining.splice(i,1)[0];});
 const legacy=p.employee_id&&!p.first_name&&!p.last_name;
 const contactRow=(key,text,c,type='tel')=>`<div class="contact-row">${label(text,input(key,c?.value||'',type,false))}${label('Prio',`<input name="${key}_priority" type="number" min="0" step="1" value="${esc(c?.priority??0)}" required aria-label="Priorität ${esc(text)}">`)}</div>`;
 modal('<h2>Externe Person</h2>'+ (p.employee_id?`<p class="small muted">employee_id: ${esc(p.employee_id)}</p>`:'<p class="muted">Die employee_id wird beim Speichern automatisch erzeugt.</p>')+
 (legacy?`<p class="small muted">Bisheriger vollständiger Name: ${esc(p.name)}. Für getrennte Namen beide Felder ausfüllen; andernfalls bleibt dieser Name erhalten.</p>`:'')+
 '<div class="name-fields">'+label('Name',input('last_name',p.last_name||'','text',!legacy))+label('Vorname',input('first_name',p.first_name||'','text',!legacy))+'</div>'+
 label('Abteilung',`<select name="department_id">${options(state.departments,'id','name',p.department_id||groupRecord(p.group_id)?.department_id||department)}</select>`)+
 groupFields(p)+
 label('Externe Kennung',input('external_id',p.external_id||'','text',false))+
 '<h3>Kommunikation</h3><p class="small muted">Kontaktprioritäten sind unabhängig von Pikett-Zuteilungen. Standard: 0.</p>'+
 contactFields.map((f,i)=>contactRow(f.type,f.label,values[i],f.input)).join('')+
 (remaining.length?'<h3>Weitere bestehende Kontakte</h3>'+remaining.map((c,i)=>contactRow('extra_'+i,c.type,c,'text')).join(''):'')+
 (p.employee_id?personDeleteButton():''),async d=>{
   const contacts=[];
   for(const f of contactFields){const value=d[f.type].trim();if(value)contacts.push({type:f.type,value,priority:Number(d[f.type+'_priority'])});}
   remaining.forEach((c,i)=>{const value=d['extra_'+i].trim();if(value)contacts.push({...c,value,priority:Number(d['extra_'+i+'_priority'])});});
   const person={first_name:d.first_name,last_name:d.last_name,group_ids:selectedGroups(),department_id:d.department_id||null,external_id:d.external_id||null,contacts};
   const saved=await api('/people'+(p.employee_id?'/'+encodeURIComponent(p.employee_id):''),p.employee_id?'PUT':'POST',person);
   message('Person gespeichert');
 });
 if(p.employee_id)bindPersonDelete(p);
}
function groupFields(p){return '<fieldset><legend>Gruppen (Mehrfachauswahl)</legend>'+[...state.groups,...(state.archived_master?.groups||[]).filter(g=>personGroupIds(p).includes(g.id))].map(g=>`<label class="check-option"><input type="checkbox" name="group_ids" value="${esc(g.id)}" ${personGroupIds(p).includes(g.id)?'checked':''}>${esc(g.name)}${g.deleted_at?' (gelöscht)':''}</label>`).join('')+'</fieldset>'; }
const selectedGroups=()=>[...document.querySelectorAll('#fields [name=group_ids]:checked')].map(x=>x.value);
function personDeleteButton(){return '<p class="small muted">Löschen ist nur ohne laufende oder zukünftige Dienste möglich. Vergangene Dienste bleiben erhalten.</p><button type="button" id="delete-person" class="danger">Löschen</button>';}
function bindPersonDelete(p){$('#delete-person').onclick=safe(async()=>{await api('/people/'+encodeURIComponent(p.employee_id),'DELETE');$('#dialog').close();message('Person gelöscht; vergangene Dienste bleiben erhalten');await refresh();});}
function personGroupsDialog(p){modal(`<h2>Gruppen: ${esc(p.name)}</h2><p class="small muted">employee_id: ${esc(p.employee_id)}</p>`+groupFields(p)+personDeleteButton(),async()=>{await api('/people/'+encodeURIComponent(p.employee_id)+'/groups','PUT',{group_ids:selectedGroups()});message('Gruppen gespeichert');});bindPersonDelete(p);}
const masterTitles={functions:'Funktionen',regions:'Gebiete',departments:'Abteilungen',groups:'Gruppen',rules:'Soll-Abdeckung'};
const weekdays=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const regionName=id=>masterRecord('regions',id)?.name||id;
function masterSummary(type,p){
 if(type==='functions')return `<p>${p.geo_ids.length?'Gebiete: '+p.geo_ids.map(g=>esc(regionName(g))).join(', '):'Ortsunabhängig'}</p>${Object.entries(p.covers).map(([whole,parts])=>`<p>${esc(regionName(whole))} deckt ab: ${parts.map(g=>esc(regionName(g))).join(', ')||'keine Teilgebiete'}</p>`).join('')}`;
 if(type==='departments')return `<p>Abteilung: ${esc(p.name)}</p>`;
 if(type==='groups')return `<p>Abteilung: ${esc(state.departments.find(d=>d.id===p.department_id)?.name||'Keine Abteilung')}</p>`+`<p>Regionen: ${Array.isArray(p.geo_ids)?p.geo_ids.map(g=>esc(regionName(g))).join(', ')||'Keine regionalen Dienste':'Alle Regionen'}</p>`;
 if(type==='rules')return `<p>${p.geo_id?esc(regionName(p.geo_id)):'Allgemeine Vorgabe'} · ${p.mode==='continuous'?'Durchgehend rund um die Uhr':'Wiederkehrende Wochenzeitfenster'}</p>${p.windows.map(w=>`<p>${weekdays[w.start_day-1]} ${esc(w.start_time)} → ${weekdays[w.end_day-1]} ${esc(w.end_time)}</p>`).join('')}<p class="small">Gültig ab: ${swissDate(p.valid_from)||'unbegrenzt'} · Gültig bis (exklusiv): ${swissDate(p.valid_until)||'unbegrenzt'}</p>`;
 return esc(p.name);
}
function masterDialog(type,p){
 const current=p||{};
 let windows=(p?.windows?.length?p.windows:[{start_day:5,start_time:'07:00',end_day:1,end_time:'07:00'}]).map(w=>({...w}));
 let covers=Object.entries(p?.covers||{}).map(([whole,parts])=>({whole,parts:[...parts]}));
 const checkList=(rows,selected,name)=>rows.map(r=>`<label class="check-option"><input type="checkbox" name="${name}" value="${esc(r.id)}" ${selected.includes(r.id)?'checked':''}>${esc(r.name)} <small>${esc(r.id)}</small></label>`).join('');
 let fields=label(type==='regions'?'Geo_ID':'Kennung'+(p?'':' (optional, sonst automatisch)'),`<input name="id" value="${esc(current.id||'')}" ${p?'readonly':''} ${type==='regions'?'required':''}>`);
 if(type!=='rules')fields+=label(type==='regions'?'Beschreibung':'Name',input('name',current.name||''));
 if(type==='groups')fields+=label('Abteilung',`<select name="department_id">${options(state.departments,'id','name',current.department_id)}</select>`);
 if(type==='groups')fields+=`<label class="check-option"><input type="checkbox" id="group-all-regions" ${!Array.isArray(p?.geo_ids)?'checked':''}>Alle Regionen zulassen</label><fieldset><legend>Zulässige Regionen bei eingeschränkter Auswahl</legend>${checkList([...state.regions,...(state.archived_master?.regions||[]).filter(r=>p?.geo_ids?.includes(r.id))],p?.geo_ids||[],'group_geo_ids')}</fieldset>`;
 if(type==='functions')fields+=`<label class="check-option"><input type="checkbox" id="independent" ${!p?.geo_ids?.length?'checked':''}>Ortsunabhängige Funktion</label><fieldset id="geo-options"><legend>Zulässige Gebiete</legend>${checkList([...state.regions,...(state.archived_master?.regions||[]).filter(r=>p?.geo_ids?.includes(r.id)).map(r=>({...r,name:r.name+' (gelöscht)'}))],p?.geo_ids||[],'geo_ids')||'<p>Zuerst Gebiete anlegen.</p>'}</fieldset><h3>Gesamtgebiet und abgedeckte Teilgebiete</h3><p class="small muted">Diese Beziehungen gelten nur für diese Funktion. Sie werden nicht aus Namen abgeleitet.</p><div id="cover-rows"></div><button type="button" id="add-cover" class="secondary">+ Gesamtgebiet-Beziehung</button>`;
 if(type==='rules')fields+=label('Funktion',`<select name="function_id" required>${options(state.functions,'id','name',p?.function_id||state.functions[0]?.id,false)}</select>`)+label('Gebiet / allgemeine Vorgabe','<select name="geo_id" id="rule-geo"></select>')+
 label('Abdeckung',`<select name="mode"><option value="continuous" ${p?.mode==='continuous'?'selected':''}>Durchgehend rund um die Uhr</option><option value="weekly" ${p?.mode!=='continuous'?'selected':''}>Wiederkehrende Wochenzeitfenster</option></select>`)+
 '<div id="weekly-fields"><div id="window-rows"></div><button type="button" id="add-window" class="secondary">+ Zeitfenster</button></div>'+
 label('Gültig ab · TT.MM.JJJJ (optional)',input('valid_from',swissDate(current.valid_from),'text',false))+label('Gültig bis · exklusiv · TT.MM.JJJJ (optional)',input('valid_until',swissDate(current.valid_until),'text',false))+
 '<p class="small muted">Eine gebietsspezifische Vorgabe ersetzt die allgemeine Vorgabe. Ein Zeitfenster mit gleichem Wochentag und gleicher Uhrzeit umfasst eine ganze Woche.</p>';
 modal(`<h2>${masterTitles[type]} ${p?'bearbeiten':'anlegen'}</h2>`+fields+(p?'<p class="small muted">Funktionen, Gebiete und Gruppen können nur ohne laufende oder zukünftige Pikettdienste gelöscht werden. Vergangene Dienste bleiben erhalten.</p><button type="button" id="delete-master" class="danger">Löschen</button>':''),async d=>{
   const next={...current,id:p?.id||d.id.trim()};
   if(type!=='rules')next.name=d.name.trim();
   if(type==='groups'){next.department_id=d.department_id||null;next.geo_ids=$('#group-all-regions').checked?null:[...document.querySelectorAll('[name=group_geo_ids]:checked')].map(x=>x.value);}
   if(type==='functions'){
     next.geo_ids=$('#independent').checked?[]:[...document.querySelectorAll('[name=geo_ids]:checked')].map(x=>x.value);
     if(!$('#independent').checked&&!next.geo_ids.length)throw Error('Gebiete wählen oder die Funktion als ortsunabhängig markieren');
     readCovers();next.covers={};if(next.geo_ids.length)for(const r of covers){if(!r.whole||!r.parts.length)throw Error('Gesamtgebiet und mindestens ein Teilgebiet wählen');if(next.covers[r.whole])throw Error('Ein Gesamtgebiet nur einmal konfigurieren');next.covers[r.whole]=r.parts;}
   }
   if(type==='rules'){
     readWindows();next.function_id=d.function_id;next.geo_id=d.geo_id||null;next.mode=d.mode;next.windows=d.mode==='weekly'?windows:[];
     if(d.mode==='weekly'&&!windows.length)throw Error('Mindestens ein Wochenzeitfenster anlegen');
     next.valid_from=d.valid_from.trim()?localDate(d.valid_from):null;next.valid_until=d.valid_until.trim()?localDate(d.valid_until):null;
   }
   await api('/master/'+type,'POST',next);message('Konfiguration gespeichert');
 });
 function readWindows(){windows=[...document.querySelectorAll('[data-window]')].map(row=>({start_day:Number(row.querySelector('[data-field=start_day]').value),start_time:row.querySelector('[data-field=start_time]').value,end_day:Number(row.querySelector('[data-field=end_day]').value),end_time:row.querySelector('[data-field=end_time]').value}));}
 function renderWindows(){
   const control=(text,html)=>'<div>'+label(text,html)+'</div>';
   const days=selected=>weekdays.map((day,i)=>`<option value="${i+1}" ${i+1===selected?'selected':''}>${day}</option>`).join('');
   $('#window-rows').innerHTML=windows.map((w,i)=>`<fieldset data-window><legend>Zeitfenster ${i+1}</legend><div class="form-pair">${control('Beginn: Wochentag',`<select data-field="start_day">${days(w.start_day)}</select>`)}${control('Beginn: Uhrzeit',`<input type="text" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" data-field="start_time" value="${esc(w.start_time)}" required>`)}${control('Ende: Wochentag',`<select data-field="end_day">${days(w.end_day)}</select>`)}${control('Ende: Uhrzeit',`<input type="text" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" data-field="end_time" value="${esc(w.end_time)}" required>`)}</div><button type="button" class="secondary" data-remove-window="${i}">Zeitfenster entfernen</button></fieldset>`).join('');
   document.querySelectorAll('[data-remove-window]').forEach(b=>b.onclick=()=>{readWindows();windows.splice(Number(b.dataset.removeWindow),1);renderWindows();});
 }
 function readCovers(){covers=[...document.querySelectorAll('[data-cover]')].map(row=>({whole:row.querySelector('[data-whole]').value,parts:[...row.querySelectorAll('[data-part]:checked')].map(x=>x.value)}));}
 function renderCovers(){
   const geos=$('#independent').checked?[]:[...document.querySelectorAll('[name=geo_ids]:checked')].map(x=>x.value);const regions=[...state.regions,...(state.archived_master?.regions||[]).filter(r=>geos.includes(r.id)).map(r=>({...r,name:r.name+' (gelöscht)'}))].filter(r=>geos.includes(r.id));
   $('#cover-rows').innerHTML=covers.map((r,i)=>`<fieldset data-cover><legend>Beziehung ${i+1}</legend>${label('Gesamtgebiet',`<select data-whole>${options(regions,'id','name',r.whole)}</select>`)}<p>Abgedeckte Teilgebiete</p>${regions.filter(g=>g.id!==r.whole).map(g=>`<label class="check-option"><input type="checkbox" data-part value="${esc(g.id)}" ${r.parts.includes(g.id)?'checked':''}>${esc(g.name)}</label>`).join('')}<button type="button" class="secondary" data-remove-cover="${i}">Beziehung entfernen</button></fieldset>`).join('');
   document.querySelectorAll('[data-whole]').forEach(x=>x.onchange=()=>{readCovers();renderCovers();});document.querySelectorAll('[data-remove-cover]').forEach(b=>b.onclick=()=>{readCovers();covers.splice(Number(b.dataset.removeCover),1);renderCovers();});
   $('#geo-options').disabled=$('#independent').checked;$('#add-cover').disabled=$('#independent').checked||!regions.length;$('#cover-rows').hidden=$('#independent').checked;
 }
 if(type==='functions'){
   renderCovers();$('#independent').onchange=()=>{readCovers();renderCovers();};document.querySelectorAll('[name=geo_ids]').forEach(x=>x.onchange=()=>{readCovers();renderCovers();});$('#add-cover').onclick=()=>{readCovers();covers.push({whole:'',parts:[]});renderCovers();};
 }
 if(type==='rules'){
   const geo=()=>{const f=state.functions.find(f=>f.id===$('[name=function_id]').value);const selected=$('#rule-geo').value||p?.geo_id;$('#rule-geo').innerHTML='<option value="">Allgemeine Vorgabe</option>'+options(state.regions.filter(r=>f?.geo_ids.includes(r.id)),'id','name',selected,false);};
   geo();$('[name=function_id]').onchange=geo;renderWindows();$('#add-window').onclick=()=>{readWindows();windows.push({start_day:1,start_time:'07:00',end_day:1,end_time:'19:00'});renderWindows();};
   const mode=()=>{$('#weekly-fields').hidden=$('[name=mode]').value!=='weekly';document.querySelectorAll('#weekly-fields input').forEach(x=>x.disabled=$('[name=mode]').value!=='weekly');};mode();$('[name=mode]').onchange=mode;
 }
 if(p)$('#delete-master').onclick=safe(async()=>{await api(`/master/${type}/${encodeURIComponent(p.id)}`,'DELETE');$('#dialog').close();await refresh();});
}
function favoriteOrderButtons(f,list){
 const index=list.findIndex(x=>x.id===f.id);
 return `<button type="button" class="favorite-move secondary" data-favorite-move="${f.id}" data-neighbor="${list[index-1]?.id||''}" title="Nach oben" aria-label="${esc(f.name)} nach oben" ${index===0?'disabled':''}>↑</button><button type="button" class="favorite-move secondary" data-favorite-move="${f.id}" data-neighbor="${list[index+1]?.id||''}" title="Nach unten" aria-label="${esc(f.name)} nach unten" ${index===list.length-1?'disabled':''}>↓</button>`;
}
function bindFavoriteOrdering(reopen){
 const root=reopen?$('#fields'):$('#content');root.querySelectorAll('[data-favorite-move]').forEach(b=>b.onclick=safe(async()=>{
   const expected=state.favorites.map(f=>f.id),ids=[...expected];const from=ids.indexOf(b.dataset.favoriteMove),to=ids.indexOf(b.dataset.neighbor);if(from<0||to<0)return;
   [ids[from],ids[to]]=[ids[to],ids[from]];b.disabled=true;
   try{await api('/favorites/order','POST',{ids,expected});if(reopen)$('#dialog').close();message('Favoritenreihenfolge gespeichert');await refresh();if(reopen)reopen();}catch(error){b.disabled=false;throw error;}
 }));
}
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const scopeCollections={function:'functions',department:'departments',group:'groups'};
const scopeLabels={function:'Funktion',department:'Abteilung',group:'Gruppe'};
function favoriteScopeName(f){return scopeLabels[f.scope_type]+': '+(masterRecord(scopeCollections[f.scope_type],f.scope_id)?.name||'Gelöschter Bereich');}
function favoritePersonMatches(f,p){
 if(f.scope_type==='function')return true;if(f.scope_type==='group')return personGroupIds(p).includes(f.scope_id);
 return personDepartmentIds(p,state.groups).includes(f.scope_id);
}
function favoriteAvailable(f,contextGroup){
 const fn=state.functions.find(x=>x.id===f.function_id);
 return !!fn&&!!state[scopeCollections[f.scope_type]]?.some(x=>x.id===f.scope_id)&&
 (fn.geo_ids.length?f.region_ids.length>0&&f.region_ids.every(g=>allowedFunctionRegions(fn,contextGroup|| (f.scope_type==='group'?state.groups.find(g=>g.id===f.scope_id):null),state.regions).includes(g)):!f.region_ids.length);
}
function favoriteSummary(f){return `${esc(functionName(f.function_id))} · ${f.region_ids.length?f.region_ids.map(g=>esc(regionName(g))).join(', '):'Ortsunabhängig'}<br>${esc(favoriteTimeLabel(f))} · P${f.priority}`;}
function favoriteMasterRow(f,list,editAttribute){
 const color=/^#[0-9a-f]{6}$/i.test(f.color||'')?f.color:'#2563eb';
 return `<article class="master-favorite-row"><span class="color-dot" style="background:${color}" role="img" aria-label="Favoritenfarbe ${color}"></span><div class="favorite-row-name"><b>${esc(f.name)}</b><small class="muted">${esc(favoriteScopeName(f))}</small></div><div class="favorite-row-details">${favoriteSummary(f).replace('<br>',' · ')}${!favoriteAvailable(f)?'<p class="small">Vorlage vor Verwendung aktualisieren.</p>':''}</div><div class="actions"><button type="button" ${editAttribute}="${f.id}">Bearbeiten</button>${favoriteOrderButtons(f,list)}</div></article>`;
}
function favoriteEditor(f={},defaults={}){
 f={...defaults,...f};let selectedRegions=[...(f.region_ids||[])];
 modal(`<h2>Favoritendienst ${f.id?'bearbeiten':'anlegen'}</h2>`+(f.id?label('Kennung',`<input name="id" value="${esc(f.id)}" readonly>`):'')+
 label('Name',input('name',f.name||''))+label('Farbe',input('color',f.color||'#2563eb','color'))+
 label('Favorit für',`<select name="scope_type" id="favorite-scope-type">${options(Object.entries(scopeLabels).map(([id,name])=>({id,name})),'id','name',f.scope_type||'function',false)}</select>`)+
 label('Bereich','<select name="scope_id" id="favorite-scope" required></select>')+
 label('Pikett-Funktion','<select name="function_id" id="favorite-function" required></select>')+
 '<fieldset><legend>Regionen</legend><div id="favorite-regions"></div></fieldset>'+
 '<div class="form-pair"><div>'+label('Dauer: Stunden',`<input name="duration_hours" type="number" min="0" step="1" value="${Math.floor((f.duration_minutes??1440)/60)}" required>`)+
 '</div><div>'+label('Dauer: Minuten',`<input name="duration_minutes" type="number" min="0" max="59" step="1" value="${(f.duration_minutes??1440)%60}" required>`)+
 '</div></div>'+label('Vordefinierter Beginn · HH:mm',input('start_time',f.start_time||'07:00'))+'<p id="favorite-time-conversion" class="small" aria-live="polite"></p>'+
 label('Pikett-Priorität',`<input name="priority" type="number" min="1" step="1" value="${f.priority||1}" required>`)+
 '<p class="small muted">Startzeit und Dauer werden in feste Schweizer Uhrzeiten umgerechnet: ↓ Starttag, → Folgetag. Bei Zeitumstellungen bleibt die Enduhrzeit gleich. Jede gewählte Region erzeugt eine eigene Zuteilung. Die Vorlage kann auch für vergangene Tage im Kalender verwendet werden.</p>'+
 (f.id?'<button type="button" id="delete-favorite" class="danger">Favorit löschen</button>':''),async d=>{
   const hours=Number(d.duration_hours),minutes=Number(d.duration_minutes);if(!Number.isSafeInteger(hours)||hours<0||!Number.isInteger(minutes)||minutes<0||minutes>59)throw Error('Dauer als ganze Stunden und Minuten (0–59) eingeben');
   const payload={name:d.name,color:d.color,scope_type:d.scope_type,scope_id:d.scope_id,function_id:$('#favorite-function').value,region_ids:[...document.querySelectorAll('[data-favorite-region]:checked')].map(x=>x.dataset.favoriteRegion),duration_minutes:hours*60+minutes,start_time:d.start_time,priority:Number(d.priority),...(f.id?{id:f.id,revision:f.revision}:{})};
   await api('/favorites','POST',payload);message('Favoritendienst gespeichert');
 });
 const showTimes=()=>{try{const schedule={start_time:$('[name=start_time]').value,duration_minutes:Number($('[name=duration_hours]').value)*60+Number($('[name=duration_minutes]').value)};$('#favorite-time-conversion').textContent=favoriteTimeLabel(schedule);}catch{$('#favorite-time-conversion').textContent='Startzeit und Dauer eingeben';}};for(const field of ['start_time','duration_hours','duration_minutes'])$('[name='+field+']').oninput=showTimes;showTimes();
 const scopeType=$('#favorite-scope-type'),scope=$('#favorite-scope'),fn=$('#favorite-function');
 const renderRegions=()=>{const selected=state.functions.find(x=>x.id===fn.value);const geos=state.regions.filter(g=>selected&&allowedFunctionRegions(selected,scopeType.value==='group'?state.groups.find(g=>g.id===scope.value):null,state.regions).includes(g.id));$('#favorite-regions').innerHTML=selected?.geo_ids.length?geos.map(g=>`<label class="check-option"><input type="checkbox" data-favorite-region="${esc(g.id)}" ${selectedRegions.includes(g.id)?'checked':''}>${esc(g.name)}</label>`).join('')||'<p>Keine aktiven Regionen; Funktion zuerst konfigurieren.</p>':'Ortsunabhängig · keine Region erforderlich';};
 const renderFunction=()=>{const previous=fn.value||f.function_id;const list=scopeType.value==='function'?state.functions.filter(x=>x.id===scope.value):state.functions;fn.innerHTML=options(list,'id','name',previous,false);fn.disabled=scopeType.value==='function';renderRegions();};
 const renderScope=()=>{scope.innerHTML=options(state[scopeCollections[scopeType.value]],'id','name',f.scope_type===scopeType.value?f.scope_id:'',false);renderFunction();};
 renderScope();scopeType.onchange=()=>{selectedRegions=[];renderScope();};scope.onchange=()=>{selectedRegions=[];renderFunction();};fn.onchange=()=>{selectedRegions=[];renderRegions();};
 if(f.id)$('#delete-favorite').onclick=safe(async()=>{await api('/favorites/'+f.id+'?revision='+f.revision,'DELETE');$('#dialog').close();message('Favorit gelöscht; geplante Dienste bleiben erhalten');await refresh();});
}
function favoriteApplyDialog(defaults={}){
 if(defaults.favorite_id){selectedFavoriteId=defaults.favorite_id;document.querySelectorAll('[data-favorite-choice]').forEach(x=>x.checked=x.dataset.favoriteChoice===selectedFavoriteId);}
 const currentDay=today(),chosenDay=defaults.date||defaults.start_on?.slice(0,10)||currentDay;
 const filteredGroup=view==='planning'?planningGroup:view==='person-planning'?personGroup:'';const people=filteredGroup?state.people.filter(p=>personGroupIds(p).includes(filteredGroup)):state.people;
 const choices=()=>{const contextGroup=state.groups.find(g=>g.id===filteredGroup);const base=state.favorites.filter(f=>(view!=='person-planning'||personFavoriteMatches(f))&&favoriteAvailable(f,contextGroup)&&(!defaults.function_id||f.function_id===defaults.function_id)&&(!contextGroup||f.scope_type==='function'||f.scope_type==='group'&&f.scope_id===contextGroup.id||f.scope_type==='department'&&f.scope_id===contextGroup.department_id));if(defaults.favorite_id)return base.filter(f=>f.id===defaults.favorite_id);const selected=base.filter(f=>f.id===selectedFavoriteId);return selected.length?selected:base;};
 if(!choices().length){modal('<h2>Favorit planen</h2><p>Keine passenden Favoritendienste vorhanden. Lege sie unter Stammdaten & Soll-Abdeckung für eine Funktion, Abteilung oder Gruppe an.</p>',async()=>{});$('#form footer button[type=submit]').hidden=true;return;}
 modal('<h2>Favorit planen</h2>'+label('Person',`<select name="employee_id" id="favorite-person" required>${options(people,'employee_id','name',defaults.employee_id)}</select>`)+
 label('Favoritendienst','<select name="favorite_id" id="apply-favorite" required></select>')+
 label('Dienst-Datum · TT.MM.JJJJ',input('date',swissDate(chosenDay)))+
 label('Beginn · Schweizer Zeit · HH:mm',input('start_time','07:00'))+
 label('Zeitumstellung: doppelte Uhrzeit','<select name="start_offset"><option value="">Automatisch · eindeutige Schweizer Zeit</option><option value="+02:00">Sommerzeit</option><option value="+01:00">Winterzeit</option></select>')+
 label('Zeitumstellung am Dienstende: doppelte Uhrzeit','<select name="end_offset"><option value="">Automatisch · eindeutige Schweizer Zeit</option><option value="+02:00">Sommerzeit</option><option value="+01:00">Winterzeit</option></select>')+
 '<div id="favorite-preview" class="card" aria-live="polite"></div>',async d=>{
   const f=state.favorites.find(f=>f.id===d.favorite_id);if(!f)throw Error('Favorit wählen');
   const result=await api('/favorites/'+f.id+'/apply','POST',{planning_group_id:filteredGroup||null,employee_id:d.employee_id,date:localDate(d.date),start_time:d.start_time,start_offset:d.start_offset,end_offset:d.end_offset,revision:f.revision});
   message(`${result.assignments.length} Pikettdienste über Favorit geplant`+(result.warnings.length?' · '+result.warnings.join(' · '):''));
 });
 const submit=$('#form button[type=submit]');submit.textContent='Favorit planen';submit.disabled=true;
 const person=$('#favorite-person'),favorite=$('#apply-favorite');let previewSequence=0,lastPreviewKey='';
 const preview=async()=>{const key=JSON.stringify([person.value,favorite.value,$('[name=date]').value,$('[name=start_time]').value,$('[name=start_offset]').value,$('[name=end_offset]').value]);if(key===lastPreviewKey)return;lastPreviewKey=key;const sequence=++previewSequence;submit.disabled=true;const f=state.favorites.find(f=>f.id===favorite.value);if(!f||!person.value){$('#favorite-preview').textContent='Person und passenden Favorit wählen.';return;}
   try{const result=await api('/favorites/'+f.id+'/preview','POST',{planning_group_id:filteredGroup||null,employee_id:person.value,date:localDate($('[name=date]').value),start_time:$('[name=start_time]').value,start_offset:$('[name=start_offset]').value,end_offset:$('[name=end_offset]').value,revision:f.revision});if(sequence!==previewSequence)return;
     $('#favorite-preview').innerHTML=`<b>${esc(f.name)}</b><p>${esc(favoriteTimeLabel({...f,start_time:$('[name=start_time]').value}))} · ${result.assignments.length} Zuteilungen</p><p>${swissTime(result.assignments[0].start_on)} → ${swissTime(result.assignments[0].end_on)}</p><p>${f.region_ids.length?f.region_ids.map(g=>esc(regionName(g))).join(', '):'Ortsunabhängig'} · P${f.priority}</p>${result.warnings.map(w=>`<p class="small">${esc(w)}</p>`).join('')}`;submit.disabled=false;
   }catch(error){if(sequence===previewSequence)$('#favorite-preview').textContent=error.message;}
 };
 const selectFavorite=()=>{const p=state.people.find(p=>p.employee_id===person.value);const previous=favorite.value||defaults.favorite_id;const list=choices().filter(f=>!p||favoritePersonMatches(f,p));favorite.innerHTML=options(list.map(f=>({...f,label:f.name+' · '+favoriteScopeName(f)})),'id','label',previous,false);const f=state.favorites.find(f=>f.id===favorite.value);$('[name=start_time]').value=f?.start_time||'07:00';preview();};
 selectFavorite();person.onchange=selectFavorite;favorite.onchange=()=>{$('[name=start_time]').value=state.favorites.find(f=>f.id===favorite.value)?.start_time||'07:00';preview();};
 for(const field of ['date','start_time','start_offset','end_offset'])$('[name='+field+']').onchange=preview;for(const field of ['date','start_time'])$('[name='+field+']').oninput=preview;
}

async function planSelectedPersonFavorite(employeeId,date,functionId){
 const f=state.favorites.find(f=>f.id===selectedFavoriteId),p=state.people.find(p=>p.employee_id===employeeId),g=state.groups.find(g=>g.id===personGroup);
 if(!f||!personFavoriteMatches(f)||f.function_id!==functionId||!favoriteAvailable(f,g)||!p||!favoritePersonMatches(f,p))throw Error('Der gewählte Favorit passt nicht zu dieser Person oder Gruppenauswahl. Bitte einen passenden Favoriten wählen.');
 const key=[f.id,employeeId,date].join('/');if(pendingFavoritePlans.has(key))return;pendingFavoritePlans.add(key);
 try{const result=await api('/favorites/'+f.id+'/apply','POST',{employee_id:employeeId,date,revision:f.revision,planning_group_id:personGroup||null});message(`${result.assignments.length} Pikettdienste über Favorit geplant`+(result.warnings.length?' · '+result.warnings.join(' · '):''));await refresh();}finally{pendingFavoritePlans.delete(key);}
}
function coverageCellAttributes(cell){return cell.status==='kein Pikett erforderlich'?'class="coverage-cell"':`class="coverage-cell ${cls(cell.status)}" title="${esc(cell.status)}" aria-label="${esc(cell.status)}"`;}
function barHours(a){
 return `<span class="bar-hour" aria-hidden="true">${swissTime(a.start_on).slice(11,13)}</span><span class="bar-hour" aria-hidden="true">${swissTime(a.end_on).slice(11,13)}</span>`;
}
function barInk(color){const rgb=/^#[0-9a-f]{6}$/i.test(color||'')?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)):[];return rgb.length&&(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000>150?'#172b3a':'#fff';}
function functionCellBars(cell,day,row,index){
 if(coarseMode)cell={...cell,...dayBars(cell.bars,[day])};
 else cell={...cell,lanes:row.lanes,bars:row.bars.filter(a=>Math.floor(a.left)===index).map(a=>({...a,left:a.left-index}))};
 return `<div class="function-duty-track" style="height:${Math.max(26,cell.lanes*22+4)}px">${cell.bars.map(a=>{const description=`${name(a.employee_id)} · Priorität ${a.priority} · ${swissTime(a.start_on)} → ${swissTime(a.end_on)}`;return `<button type="button" class="duty-bar ${coarseMode?'coarse-duty':''}" data-function-assignment="${esc(a.assignment_id)}" style="left:${a.left*100}%;width:${a.width*100}%;top:${a.lane*22+4}px;background:${a.color};color:${barInk(a.color)}" title="${esc(description)}" aria-label="${esc(description)}">${barHours(a)}</button>`;}).join('')}</div>`;
}
function timelineTable(result){
 const rows=coarseMode?result.rows.map(row=>({...row,...dayBars(row.bars,result.days)})):result.rows;
 const weeks=[];for(const d of result.day_meta){const key=d.week_year+'-'+d.week_number;if(weeks.at(-1)?.key===key)weeks.at(-1).count++;else weeks.push({key,count:1,number:d.week_number});}
 const monthName=new Intl.DateTimeFormat('de-CH',{month:'long',year:'numeric',timeZone:'Europe/Zurich'}).format(new Date(result.days[0]+'T12:00:00Z'));
 return `<div class="board timeline-board"><table class="person-month timeline" style="--days:${result.days.length}"><colgroup><col class="name-width"><col class="group-width">${result.days.map(()=>'<col class="day-width">').join('')}</colgroup><thead><tr class="month-heading"><th class="person-column" rowspan="3">Name</th><th class="group-column" rowspan="3">Gruppe</th><th colspan="${result.days.length}">${esc(monthName)}</th></tr><tr class="week-heading">${weeks.map(w=>`<th colspan="${w.count}">W. ${w.number}</th>`).join('')}</tr><tr class="day-heading">${result.day_meta.map(d=>`<th class="${d.weekday>=6?'weekend':''}" title="${swissDate(d.date)}">${['Mo','Di','Mi','Do','Fr','Sa','So'][d.weekday-1]}<br>${Number(d.date.slice(-2))}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><td class="person-column" title="${esc(row.name)}">${esc(row.name)}</td><td class="group-column" title="${esc((result.group_id?groupName(result.group_id):personGroupIds(row).map(groupName).join(', '))||'Ohne Gruppe')}">${esc((result.group_id?groupName(result.group_id):personGroupIds(row).map(groupName).join(', '))||'Ohne Gruppe')}</td><td class="timeline-cell" colspan="${result.days.length}"><div class="timeline-track" style="height:${Math.max(32,row.lanes*24+8)}px">${result.day_meta.map((d,i)=>`<button type="button" class="timeline-day ${d.weekday>=6?'weekend':''}" style="left:calc(${i} * var(--day-width))" data-person-day="${d.date}" data-employee="${esc(row.employee_id)}" aria-label="${esc(row.name)} · ${swissDate(d.date)}"></button>`).join('')}${row.bars.map(a=>{const description=`${row.name} · ${a.geodependency?regionName(a.geodependency):'Ortsunabhängig'} · Priorität ${a.priority} · ${swissTime(a.start_on)} → ${swissTime(a.end_on)}`;return `<button type="button" class="duty-bar ${coarseMode?'coarse-duty':''}" data-bar-assignment="${a.assignment_id}" style="left:calc(${a.left} * var(--day-width));width:calc(${a.width} * var(--day-width));top:${a.lane*24+7}px;background:${a.color};color:${barInk(a.color)}" title="${esc(description)}" aria-label="${esc(description)}">${barHours(a)}</button>`;}).join('')}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function favoriteTree(functionId,filteredGroup=''){
 const group=state.groups.find(g=>g.id===filteredGroup);const favorites=state.favorites.filter(f=>(view!=='person-planning'||personFavoriteMatches(f))&&favoriteAvailable(f,group)&&(!functionId||f.function_id===functionId)&&(!group||f.scope_type==='function'||f.scope_type==='group'&&f.scope_id===group.id||f.scope_type==='department'&&f.scope_id===group.department_id));
 const folders=new Map();for(const f of favorites){const key=f.scope_type+':'+f.scope_id;if(!folders.has(key))folders.set(key,[]);folders.get(key).push(f);}
 return `<aside class="favorite-sidebar"><h2>Favoritendienste</h2><button type="button" id="clear-favorite-selection" class="secondary small">Auswahl aufheben</button><p class="small muted">Einen Favoriten auswählen und per Klick auf einen Tag direkt hinzufügen, auch bei vorhandenen Diensten. Zum Bearbeiten Auswahl aufheben.</p>${[...folders.entries()].map(([key,list])=>`<details class="favorite-folder" open><summary><span aria-hidden="true">📁</span> ${esc(favoriteScopeName(list[0]))}</summary>${list.map(f=>`<div class="favorite-tree-item"><label><input type="radio" name="calendar-favorite" data-favorite-choice="${f.id}" ${selectedFavoriteId===f.id?'checked':''}><span class="color-dot" style="background:${f.color||'#2563eb'}" aria-hidden="true"></span><span>${esc(f.name)}<small>${esc(favoriteTimeLabel(f))}</small></span></label>${favoriteOrderButtons(f,list)}</div>`).join('')}</details>`).join('')||'<p class="small muted">Noch keine passenden Favoriten. Unter Stammdaten anlegen.</p>'}</aside>`;
}
function bindFavoriteTree(){
 bindFavoriteOrdering();
 document.querySelectorAll('[data-favorite-choice]').forEach(x=>x.onchange=()=>{if(x.checked)selectedFavoriteId=x.dataset.favoriteChoice;});
 $('#clear-favorite-selection').onclick=()=>{selectedFavoriteId='';document.querySelectorAll('[data-favorite-choice]').forEach(x=>x.checked=false);};
}

document.querySelectorAll('nav button').forEach(b=>b.onclick=safe(async()=>{view=b.dataset.view;await render();}));
await safe(refresh)();
