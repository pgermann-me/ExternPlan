import {swissTime,swissDate,localDate,localDateTime,displayTimes} from './time.js';
const $=s=>document.querySelector(s);const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,view='planning',month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit'}).format(new Date()),department='',group='',functionFilter='',planningGroup='',personFunction='',personRegions=null,personPlanningMonth=month,importRows=[];
const api=async(path,method='GET',body)=>{const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
function message(text,error=false){$('#message').textContent=text;$('#message').className=error?'error':'';}
const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){message(e.message,true);}};
const options=(rows,key='id',label='name',selected='',blank=true)=>(blank?'<option value="">— wählen —</option>':'')+rows.map(x=>`<option value="${esc(x[key])}" ${x[key]===selected?'selected':''}>${esc(x[label])}</option>`).join('');
const label=(text,html)=>`<label>${text}</label>${html}`;const input=(name,value='',type='text',required=true)=>`<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}>`;
const masterRecord=(type,id)=>state[type].find(x=>x.id===id)||state.archived_master?.[type]?.find(x=>x.id===id);
const functionName=id=>masterRecord('functions',id)?.name||id;
const groupRecord=id=>masterRecord('groups',id);
const groupName=id=>{const g=groupRecord(id);return g?g.name+(g.deleted_at?' (gelöscht)':''):'';};
const name=id=>state.people.find(p=>p.employee_id===id)?.name||id;
const cls=status=>({'vollständig besetzt':'full','teilweise besetzt':'partial','unbesetzt':'empty','kein Pikett erforderlich':'none'}[status]);
function modal(html,handler){$('#form footer button[type=submit]').hidden=false;$('#fields').innerHTML=html;$('#dialog').showModal();$('#form').onsubmit=safe(async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));await handler(data);$('#dialog').close();await refresh();});}
$('#cancel').onclick=()=>$('#dialog').close();
async function refresh(){state=await api('/state');if(planningGroup&&!state.groups.some(g=>g.id===planningGroup))planningGroup='';if(group&&!state.groups.some(g=>g.id===group))group='';if(functionFilter&&!state.functions.some(f=>f.id===functionFilter))functionFilter='';const board=$('.board'),scroll=board?{left:board.scrollLeft,top:board.scrollTop}:null;await render();if(scroll&&$('.board')){$('.board').scrollLeft=scroll.left;$('.board').scrollTop=scroll.top;}}
function assignmentTime(value,fallback){
 if(!value)return fallback;
 if(/[Zz]|[+-]\d{2}:\d{2}$/.test(value))return swissTime(value);
 const [date,time]=value.split('T');return swissDate(date)+' '+time.slice(0,5);
}
function assignmentDialog(a={},defaults={}){
 a={...defaults,...a};
 if(a.assignment_id&&(masterRecord('functions',a.function_id)?.deleted_at||a.geodependency&&masterRecord('regions',a.geodependency)?.deleted_at)){
   modal(`<h2>Vergangener Pikettdienst</h2><p>${esc(name(a.employee_id))} · ${esc(functionName(a.function_id))} · ${esc(a.geodependency?regionName(a.geodependency):'Ortsunabhängig')} · P${a.priority}</p><p>${swissTime(a.start_on)} → ${swissTime(a.end_on)}</p><p class="muted">Zugehörige Stammdaten wurden gelöscht. Dieser Dienst bleibt als unveränderte Historie erhalten.</p>`,async()=>{});$('#form footer button[type=submit]').hidden=true;return;
 }
 const f=state.functions.find(f=>f.id===a.function_id)||state.functions[0];
 const people=view==='planning'&&planningGroup?state.people.filter(p=>p.group_id===planningGroup):state.people;
 const timeField=(field,text,fallback)=>label(text,input(field,assignmentTime(a[field],fallback)))+
 label('Zeitumstellung: doppelte Uhrzeit',`<select name="${field}_offset"><option value="">Automatisch · eindeutige Schweizer Zeit</option><option value="+02:00">Sommerzeit (erste doppelte Uhrzeit)</option><option value="+01:00">Winterzeit (zweite doppelte Uhrzeit)</option></select>`);
 modal(`<h2>${a.assignment_id?'Zuteilung bearbeiten':'Pikett zuteilen'}</h2>`+(a.assignment_id?label('Kennung',`<input name="assignment_id" value="${esc(a.assignment_id)}" readonly>`):'')+
 label('Person',`<select name="employee_id" required>${options(people,'employee_id','name',a.employee_id)}</select>`)+
 label('Funktion',`<select name="function_id" required>${options(state.functions,'id','name',f?.id,false)}</select>`)+`<div id="geo-field"></div>`+
 timeField('start_on','Beginn · Schweizer Zeit',swissDate(month+'-01')+' 07:00')+
 timeField('end_on','Ende · exklusiv',swissDate(month+'-02')+' 07:00')+
 `<p class="small muted">Format: 19.04.1972 13:40. Bei einer doppelten Uhrzeit im Herbst die gewünschte Sommer- oder Winterzeit auswählen.</p>`+
 label('Kontaktpriorität dieser Zuteilung',input('priority',a.priority||1,'number'))+
 (a.assignment_id?'<button type="button" class="danger" id="delete-assignment">Löschen</button>':''),async d=>{
   for(const field of ['start_on','end_on']){
     const local=localDateTime(d[field]);const chosen=d[field+'_offset'];if(chosen&&swissTime(local+chosen)!==d[field].trim())throw Error('Die gewählte Sommer-/Winterzeit passt nicht zur Schweizer Uhrzeit');
     // Keep an existing precise instant when its displayed local time has not changed.
     d[field]=!chosen&&a.assignment_id&&swissTime(a[field])===d[field].trim()?a[field]:local+chosen;
     delete d[field+'_offset'];
   }
   delete d.assignment_id;d.priority=Number(d.priority);d.geodependency=d.geodependency||null;if(a.assignment_id)d.revision=a.revision;
   const r=await api('/assignments'+(a.assignment_id?'/'+a.assignment_id:''),a.assignment_id?'PUT':'POST',d);
   message(r.warnings.length?r.warnings.join(' · '):'Zuteilung gespeichert');
 });
 const geo=()=>{const selected=state.functions.find(f=>f.id===$('[name=function_id]').value);$('#geo-field').innerHTML=selected?.geo_ids.length?label('Pflichtgebiet',`<select name="geodependency" required>${options(state.regions.filter(r=>selected.geo_ids.includes(r.id)),'id','name',a.geodependency)}</select>`):'<p class="muted">Ortsunabhängig</p>';};geo();$('[name=function_id]').onchange=geo;
 if(a.assignment_id)$('#delete-assignment').onclick=safe(async()=>{await api(`/assignments/${a.assignment_id}?revision=${a.revision}`,'DELETE');$('#dialog').close();message('Löschung gespeichert; ELS-Bestätigung ausstehend');await refresh();});
}
async function render(){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const c=$('#content');
 if(view==='planning'){const result=await api('/month?month='+month+(planningGroup?'&group_id='+encodeURIComponent(planningGroup):''));c.innerHTML=`<h1>Pikettübersicht</h1><p class="muted">Funktionen und Gebiete · Zeiten in Europe/Zurich · Ende exklusiv</p><div class="toolbar"><input id="month" type="month" value="${month}"><select id="function-filter">${options(state.functions,'id','name',functionFilter).replace('— wählen —','Alle Funktionen')}</select><select id="planning-group" aria-label="Gruppe filtern">${options(state.groups,'id','name',planningGroup).replace('— wählen —','Alle Gruppen')}</select><button id="new-assignment">+ Zuteilung</button></div>${planningGroup?'<p class="muted">Besetzungsstatus und Lücken beziehen sich auf die ausgewählte Gruppe. Andere Gruppen bleiben in der Planung erhalten.</p>':''}<div class="legend">${['vollständig besetzt','teilweise besetzt','unbesetzt','kein Pikett erforderlich'].map(x=>`<span class="status ${cls(x)}">${x}</span>`).join('')}</div><div class="board"><table class="month"><thead><tr><th>Funktion / Gebiet</th>${result.days.map(d=>`<th>${swissDate(d)} <span class="muted">${new Intl.DateTimeFormat('de-CH',{weekday:'short',timeZone:'Europe/Zurich'}).format(new Date(d+'T12:00:00Z'))}</span></th>`).join('')}</tr></thead><tbody>${result.rows.filter(r=>!functionFilter||r.function_id===functionFilter).map((row,i)=>`<tr><td><b>${esc(state.functions.find(f=>f.id===row.function_id)?.name)}</b><p class="muted">${esc(row.geo_id?regionName(row.geo_id):'Ortsunabhängig')}</p></td>${row.cells.map((cell,j)=>`<td data-function="${esc(row.function_id)}" data-geo="${esc(row.geo_id||'')}" data-day="${result.days[j]}"><span class="status ${cls(cell.status)}">${cell.status}</span>${cell.assignments.map(a=>`<div class="chip">${esc(name(a.employee_id))} · P${a.priority}</div>`).join('')}${cell.gaps.length?`<span class="small muted">${cell.gaps.length} offene Zeitabschnitte · Details</span>`:''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 $('#month').onchange=safe(async e=>{month=e.target.value;await render();});$('#function-filter').onchange=safe(async e=>{functionFilter=e.target.value;await render();});$('#planning-group').onchange=safe(async e=>{planningGroup=e.target.value;await refresh();});$('#new-assignment').onclick=()=>assignmentDialog();
 document.querySelectorAll('td[data-day]').forEach(td=>td.onclick=()=>{const row=result.rows.find(r=>r.function_id===td.dataset.function&&(r.geo_id||'')===td.dataset.geo);const cell=row.cells[result.days.indexOf(td.dataset.day)];modal(`<h2>${esc(swissDate(td.dataset.day))} · ${esc(td.dataset.geo?regionName(td.dataset.geo):'Ortsunabhängig')}</h2><span class="status ${cls(cell.status)}">${cell.status}</span><h3>Offene Zeitabschnitte</h3>${cell.gaps.map(g=>`<p>${esc(swissTime(g.start_on))} → ${esc(swissTime(g.end_on))}</p>`).join('')||'<p>Keine Lücken</p>'}<h3>Zuteilungen</h3>${cell.assignments.map(a=>`<p><button type="button" data-edit="${a.assignment_id}">${esc(name(a.employee_id))} · P${a.priority}</button><br><span class="small">${esc(swissTime(a.start_on))} → ${esc(swissTime(a.end_on))}</span></p>`).join('')}<button type="button" id="cell-new">+ Zuteilung</button>`,async()=>{});$('#form footer button[type=submit]').hidden=true;const open=a=>{$('#dialog').close();$('#form footer button[type=submit]').hidden=false;assignmentDialog(a,{function_id:td.dataset.function,geodependency:td.dataset.geo||null,start_on:td.dataset.day+'T07:00',end_on:td.dataset.day+'T19:00'});};$('#cell-new').onclick=()=>open({});document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>open(state.assignments.find(a=>a.assignment_id===b.dataset.edit)));});
 }
 if(view==='person-planning'){
   if(!state.functions.length){c.innerHTML='<h1>Personen-Pikettübersicht</h1><p>Zuerst eine Funktion anlegen.</p>';return;}
   const f=state.functions.find(f=>f.id===personFunction)||state.functions[0];
   if(personFunction!==f.id||personRegions===null){personFunction=f.id;personRegions=f.geo_ids.filter(g=>state.regions.some(r=>r.id===g));}
   personRegions=personRegions.filter(g=>f.geo_ids.includes(g)&&state.regions.some(r=>r.id===g));
   const params=new URLSearchParams({month:personPlanningMonth,function_id:f.id});
   if(personRegions.length)personRegions.forEach(g=>params.append('region_id',g));else params.append('region_id','');
   const result=await api('/person-month?'+params);
   const geos=state.regions.filter(r=>f.geo_ids.includes(r.id));
   c.innerHTML=`<h1>Personen-Pikettübersicht</h1><p class="muted">Personen mit passenden Pikettdiensten im ausgewählten Monat · Schweizer Zeit · Ende exklusiv</p>
   <div class="toolbar"><input type="month" id="person-month" value="${personPlanningMonth}" aria-label="Monat"><select id="person-function" aria-label="Funktion">${options(state.functions,'id','name',f.id,false)}</select>
   ${f.geo_ids.length?`<details class="region-filter"><summary>Regionen: ${personRegions.length} von ${geos.length}</summary><div><div class="actions"><button type="button" id="all-person-regions" class="secondary">Alle wählen</button><button type="button" id="no-person-regions" class="secondary">Auswahl leeren</button></div>${geos.map(g=>`<label class="check-option"><input type="checkbox" data-person-region="${esc(g.id)}" ${personRegions.includes(g.id)?'checked':''}>${esc(g.name)}</label>`).join('')}</div></details>`:'<span class="muted">Ortsunabhängige Funktion · keine Region erforderlich</span>'}
   <span>${result.rows.length} Personen</span><button id="add-person-duty">+ Zuteilung</button></div>
   <p class="small muted">Gesamtgebiets-Dienste werden bei ausdrücklich abgedeckten Teilregionen ebenfalls angezeigt, jeweils einmal. Jede Zelle enthält die tatsächlichen Zuteilungen; leere Zellen bedeuten keinen geplanten Dienst dieser Person.</p>
   ${result.rows.length?`<div class="board"><table class="month person-month"><thead><tr><th>Person</th>${result.days.map(d=>`<th>${swissDate(d)} <span class="muted">${new Intl.DateTimeFormat('de-CH',{weekday:'short',timeZone:'Europe/Zurich'}).format(new Date(d+'T12:00:00Z'))}</span></th>`).join('')}</tr></thead><tbody>${result.rows.map(row=>`<tr><td><b>${esc(row.name)}</b><p class="small muted">${esc(state.groups.find(g=>g.id===row.group_id)?.name||'Ohne Gruppe')}</p></td>${row.cells.map((cell,i)=>`<td data-person-day="${result.days[i]}" data-employee="${esc(row.employee_id)}">${cell.assignments.map(a=>`<div class="chip"><b>${esc(a.geodependency?regionName(a.geodependency):'Ortsunabhängig')} · P${a.priority}</b><br>${esc(swissTime(a.start_on))}<br>→ ${esc(swissTime(a.end_on))}</div>`).join('')||'<span class="small muted">Kein Dienst</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<div class="card">${f.geo_ids.length&&!personRegions.length?'Bitte mindestens eine Region wählen.':'Keine passenden Pikettdienste im ausgewählten Monat.'}</div>`}`;
   $('#add-person-duty').onclick=()=>assignmentDialog({},{function_id:f.id,geodependency:personRegions.length===1?personRegions[0]:null,start_on:personPlanningMonth+'-01T07:00',end_on:personPlanningMonth+'-02T07:00'});
   $('#person-month').onchange=safe(async e=>{personPlanningMonth=e.target.value;await refresh();});
   $('#person-function').onchange=safe(async e=>{personFunction=e.target.value;personRegions=null;await refresh();});
   document.querySelectorAll('[data-person-region]').forEach(x=>x.onchange=safe(async()=>{personRegions=[...document.querySelectorAll('[data-person-region]:checked')].map(x=>x.dataset.personRegion);await refresh();$('.region-filter').open=true;}));
   if(f.geo_ids.length){$('#all-person-regions').onclick=safe(async()=>{personRegions=f.geo_ids.filter(g=>state.regions.some(r=>r.id===g));await refresh();$('.region-filter').open=true;});$('#no-person-regions').onclick=safe(async()=>{personRegions=[];await refresh();$('.region-filter').open=true;});}
   document.querySelectorAll('[data-person-day]').forEach(td=>td.onclick=()=>{
     const row=result.rows.find(r=>r.employee_id===td.dataset.employee),cell=row.cells[result.days.indexOf(td.dataset.personDay)];
     modal(`<h2>${esc(row.name)} · ${swissDate(td.dataset.personDay)}</h2>${cell.assignments.map(a=>`<p><button type="button" data-person-edit="${a.assignment_id}">${esc(a.geodependency?regionName(a.geodependency):'Ortsunabhängig')} · P${a.priority}</button><br>${esc(swissTime(a.start_on))} → ${esc(swissTime(a.end_on))}</p>`).join('')||'<p>Kein Dienst an diesem Tag</p>'}<button type="button" id="new-person-duty">+ Zuteilung</button>`,async()=>{});
     $('#form footer button[type=submit]').hidden=true;
     const open=a=>{$('#dialog').close();assignmentDialog(a,{employee_id:row.employee_id,function_id:f.id,geodependency:personRegions.length===1?personRegions[0]:null,start_on:td.dataset.personDay+'T07:00',end_on:td.dataset.personDay+'T19:00'});};
     $('#new-person-duty').onclick=()=>open({});document.querySelectorAll('[data-person-edit]').forEach(b=>b.onclick=()=>open(state.assignments.find(a=>a.assignment_id===b.dataset.personEdit)));
   });
 }
 if(view==='people'){const people=state.people.filter(p=>(!department||p.department_id===department||groupRecord(p.group_id)?.department_id===department)&&(!group||p.group_id===group));c.innerHTML=`<h1>Organisation & Personen</h1><div class="toolbar"><select id="department">${options(state.departments,'id','name',department).replace('— wählen —','Alle Abteilungen')}</select><select id="group">${options(state.groups,'id','name',group).replace('— wählen —','Alle Gruppen')}</select><span>${people.length} Personen</span><button id="new-department" class="secondary">+ Abteilung</button><button id="new-person">+ Externe Person</button></div><div class="cards">${people.map(p=>`<article class="card"><h2>${esc(p.name)}</h2>${p.first_name||p.last_name?`<dl class="person-names"><dt>Name</dt><dd>${esc(p.last_name)}</dd><dt>Vorname</dt><dd>${esc(p.first_name)}</dd></dl>`:`<p class="small muted">Bisheriger vollständiger Name: ${esc(p.name)}</p>`}<p class="muted">${p.source==='SAP'?'SAP-Import (simuliert)':'Extern / manuell'}</p><p>${esc(state.departments.find(d=>d.id===p.department_id)?.name||groupName(p.group_id)||'Keine Organisation')}</p>${p.contacts.map(x=>`<p class="small">Kontakt P${x.priority}: ${esc(contactName(x.type))} · ${esc(x.value)}</p>`).join('')}<div class="actions"><button data-add="${esc(p.employee_id)}">+ Pikett</button>${p.source==='manual'?`<button class="secondary" data-person="${esc(p.employee_id)}">Bearbeiten</button>`:''}</div>${state.assignments.filter(a=>a.employee_id===p.employee_id).map(a=>`<p><a href="#" data-assignment="${a.assignment_id}">${esc(functionName(a.function_id))} · ${esc(a.geodependency?regionName(a.geodependency):'Ortsunabhängig')} · P${a.priority}</a><br><span class="small">${esc(swissTime(a.start_on))} → ${esc(swissTime(a.end_on))}</span></p>`).join('')}</article>`).join('')}</div>`;
 $('#department').onchange=safe(async e=>{department=e.target.value;await render();});$('#group').onchange=safe(async e=>{group=e.target.value;await render();});$('#new-department').onclick=()=>departmentDialog();$('#new-person').onclick=()=>personDialog();document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>personDialog(state.people.find(p=>p.employee_id===b.dataset.person)));document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>assignmentDialog({employee_id:b.dataset.add}));document.querySelectorAll('[data-assignment]').forEach(b=>b.onclick=e=>{e.preventDefault();assignmentDialog(state.assignments.find(a=>a.assignment_id===b.dataset.assignment));});
 }
 if(view==='master'){
 c.innerHTML=`<h1>Stammdaten & Soll-Abdeckung</h1><p class="muted">Gebietsbeziehungen ausdrücklich festlegen. Die GANZ-Beziehung im Startbestand ist nur ein Beispiel. UA_SG bedeutet keinen gesamten Kanton.</p>${['functions','regions','departments','groups','rules'].map(type=>`<article class="card"><div class="toolbar"><h2>${masterTitles[type]}</h2><button data-master-new="${type}">+ Anlegen</button></div><table><thead><tr><th>Name</th><th>Konfiguration</th><th></th></tr></thead><tbody>${state[type].map(x=>`<tr><td>${esc(x.name||state.functions.find(f=>f.id===x.function_id)?.name)}</td><td>${masterSummary(type,x)}</td><td><button data-master="${type}" data-id="${esc(x.id)}">Bearbeiten</button></td></tr>`).join('')}</tbody></table></article>`).join('')}`;
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
   if(['id','assignment_id','export_id','external_id'].includes(key))continue;
   if(key==='employee_id'){out.Person=name(item);continue;}
   if(key==='function_id'){out.Funktion=functionName(item);continue;}
   if(key==='group_id'){out.Gruppe=groupName(item)||'Keine Gruppe';continue;}
   if(key==='department_id'){out.Abteilung=state.departments.find(d=>d.id===item)?.name||'Keine Abteilung';continue;}
   if(key==='geodependency'||key==='geo_id'){out.Gebiet=item?regionName(item):'Ortsunabhängig / allgemein';continue;}
   if(key==='geo_ids'){out.Gebiete=item.map(regionName);continue;}
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
 label('Gruppe',`<select name="group_id">${options([...state.groups,...(state.archived_master?.groups||[]).filter(g=>g.id===p.group_id).map(g=>({...g,name:g.name+' (gelöscht)'}))],'id','name',p.group_id)}</select>`)+
 label('Externe Kennung',input('external_id',p.external_id||'','text',false))+
 '<h3>Kommunikation</h3><p class="small muted">Kontaktprioritäten sind unabhängig von Pikett-Zuteilungen. Standard: 0.</p>'+
 contactFields.map((f,i)=>contactRow(f.type,f.label,values[i],f.input)).join('')+
 (remaining.length?'<h3>Weitere bestehende Kontakte</h3>'+remaining.map((c,i)=>contactRow('extra_'+i,c.type,c,'text')).join(''):'')+
 '',async d=>{
   const contacts=[];
   for(const f of contactFields){const value=d[f.type].trim();if(value)contacts.push({type:f.type,value,priority:Number(d[f.type+'_priority'])});}
   remaining.forEach((c,i)=>{const value=d['extra_'+i].trim();if(value)contacts.push({...c,value,priority:Number(d['extra_'+i+'_priority'])});});
   const person={first_name:d.first_name,last_name:d.last_name,group_id:d.group_id||null,department_id:d.department_id||null,external_id:d.external_id||null,contacts};
   const saved=await api('/people'+(p.employee_id?'/'+encodeURIComponent(p.employee_id):''),p.employee_id?'PUT':'POST',person);
   message('Person gespeichert');
 });
 const departmentSelect=$('[name=department_id]'),groupSelect=$('[name=group_id]');
 const updateGroups=()=>{const selected=groupSelect.value;groupSelect.innerHTML=options([...state.groups,...(state.archived_master?.groups||[]).filter(g=>g.id===p.group_id).map(g=>({...g,name:g.name+' (gelöscht)'}))].filter(g=>!departmentSelect.value||g.department_id===departmentSelect.value),'id','name',selected);};
 updateGroups();departmentSelect.onchange=updateGroups;
 groupSelect.onchange=()=>{const selected=state.groups.find(g=>g.id===groupSelect.value);if(selected?.department_id)departmentSelect.value=selected.department_id;};
}
const masterTitles={functions:'Funktionen',regions:'Gebiete',departments:'Abteilungen',groups:'Gruppen',rules:'Soll-Abdeckung'};
const weekdays=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const regionName=id=>masterRecord('regions',id)?.name||id;
function masterSummary(type,p){
 if(type==='functions')return `<p>${p.geo_ids.length?'Gebiete: '+p.geo_ids.map(g=>esc(regionName(g))).join(', '):'Ortsunabhängig'}</p>${Object.entries(p.covers).map(([whole,parts])=>`<p>${esc(regionName(whole))} deckt ab: ${parts.map(g=>esc(regionName(g))).join(', ')||'keine Teilgebiete'}</p>`).join('')}`;
 if(type==='groups')return esc(state.departments.find(d=>d.id===p.department_id)?.name||'Keine Abteilung');
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
 if(type==='functions')fields+=`<label class="check-option"><input type="checkbox" id="independent" ${!p?.geo_ids?.length?'checked':''}>Ortsunabhängige Funktion</label><fieldset id="geo-options"><legend>Zulässige Gebiete</legend>${checkList([...state.regions,...(state.archived_master?.regions||[]).filter(r=>p?.geo_ids?.includes(r.id)).map(r=>({...r,name:r.name+' (gelöscht)'}))],p?.geo_ids||[],'geo_ids')||'<p>Zuerst Gebiete anlegen.</p>'}</fieldset><h3>Gesamtgebiet und abgedeckte Teilgebiete</h3><p class="small muted">Diese Beziehungen gelten nur für diese Funktion. Sie werden nicht aus Namen abgeleitet.</p><div id="cover-rows"></div><button type="button" id="add-cover" class="secondary">+ Gesamtgebiet-Beziehung</button>`;
 if(type==='rules')fields+=label('Funktion',`<select name="function_id" required>${options(state.functions,'id','name',p?.function_id||state.functions[0]?.id,false)}</select>`)+label('Gebiet / allgemeine Vorgabe','<select name="geo_id" id="rule-geo"></select>')+
 label('Abdeckung',`<select name="mode"><option value="continuous" ${p?.mode==='continuous'?'selected':''}>Durchgehend rund um die Uhr</option><option value="weekly" ${p?.mode!=='continuous'?'selected':''}>Wiederkehrende Wochenzeitfenster</option></select>`)+
 '<div id="weekly-fields"><div id="window-rows"></div><button type="button" id="add-window" class="secondary">+ Zeitfenster</button></div>'+
 label('Gültig ab · TT.MM.JJJJ (optional)',input('valid_from',swissDate(current.valid_from),'text',false))+label('Gültig bis · exklusiv · TT.MM.JJJJ (optional)',input('valid_until',swissDate(current.valid_until),'text',false))+
 '<p class="small muted">Eine gebietsspezifische Vorgabe ersetzt die allgemeine Vorgabe. Ein Zeitfenster mit gleichem Wochentag und gleicher Uhrzeit umfasst eine ganze Woche.</p>';
 modal(`<h2>${masterTitles[type]} ${p?'bearbeiten':'anlegen'}</h2>`+fields+(p?'<p class="small muted">Funktionen, Gebiete und Gruppen können nur ohne laufende oder zukünftige Pikettdienste gelöscht werden. Vergangene Dienste bleiben erhalten.</p><button type="button" id="delete-master" class="danger">Löschen</button>':''),async d=>{
   const next={...current,id:p?.id||d.id.trim()};
   if(type!=='rules')next.name=d.name.trim();
   if(type==='groups')next.department_id=d.department_id||null;
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
document.querySelectorAll('nav button').forEach(b=>b.onclick=safe(async()=>{view=b.dataset.view;await render();}));
await safe(refresh)();
