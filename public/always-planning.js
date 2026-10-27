import {planningPeople,personGroupIds,allowedFunctionRegions,scopeAllows,personScopeAllows} from './organization.js';
import {priorityRank} from './priority.js';
import {listContacts} from './pikett-list-data.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byRegionName=(a,b)=>a.name.localeCompare(b.name,'de-CH',{sensitivity:'base',numeric:true});
const options=(rows,selected,blank)=>`<option value="">${blank}</option>`+rows.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.name)}</option>`).join('');
export function renderAlwaysPlanning(root,{state,filters,monthPicker,api,safe,modal,onFilter,onSaved,view='targets',onView}){
 const {department_id:department='',group_id:groupId=''}=filters,group=state.groups.find(g=>g.id===groupId);
 const functions=state.functions.filter(f=>!f.deleted_at&&f.duty_time_model==='always'&&scopeAllows(f,{department_id:department,group_id:groupId},state.groups));
 const functionId=functions.some(f=>f.id===filters.function_id)?filters.function_id:'';
 const selectedFunctions=functionId?functions.filter(f=>f.id===functionId):functions;
 const allowed=[...new Set(selectedFunctions.flatMap(f=>allowedFunctionRegions(f,group,state.regions,department,state.groups)))];
 const regions=filters.region_ids===null?allowed:filters.region_ids.filter(id=>allowed.includes(id));
 const people=planningPeople(state,groupId,department).filter(p=>!p.deleted_at).sort((a,b)=>(a.last_name||a.name).localeCompare(b.last_name||b.name,'de-CH')||(a.first_name||'').localeCompare(b.first_name||'','de-CH'));
 const name=p=>p.first_name&&p.last_name?`${p.last_name} ${p.first_name}`:p.name;
 const regionName=id=>id===null?'Ortsunabhängig':state.regions.find(r=>r.id===id)?.name||id;
 const visibleRows=p=>(p.function_regions||[]).filter(r=>selectedFunctions.some(f=>f.id===r.function_id)&&(r.geo_id===null||regions.includes(r.geo_id))).sort((a,b)=>priorityRank(a.priority)-priorityRank(b.priority)||a.function_id.localeCompare(b.function_id)||String(a.geo_id).localeCompare(String(b.geo_id)));
 const entries=[],targets=[];
 const phones=p=>listContacts(p.contacts).map(esc).join('<br>')||'—';
 function targetTable(){
  const assigned=new Map();for(const person of people)for(const affiliation of visibleRows(person)){const key=JSON.stringify([affiliation.function_id,affiliation.geo_id]);if(!assigned.has(key))assigned.set(key,[]);assigned.get(key).push({person,affiliation});}
  for(const fn of [...selectedFunctions].sort(byRegionName))for(const geo of fn.geo_ids.length?state.regions.filter(r=>regions.includes(r.id)&&allowedFunctionRegions(fn,group,state.regions,department,state.groups).includes(r.id)).sort(byRegionName):[null]){
   const geoId=geo?.id??null,rows=(assigned.get(JSON.stringify([fn.id,geoId]))||[]).sort((a,b)=>priorityRank(a.affiliation.priority)-priorityRank(b.affiliation.priority)||name(a.person).localeCompare(name(b.person),'de-CH'));targets.push({fn,geo_id:geoId,rows});
  }
  return `<div class="board"><table class="always-targets-table"><thead><tr><th>Funktion</th><th>Region</th><th>Zugewiesene Personen · Telefonnummern · Priorität</th><th>Aktionen</th></tr></thead><tbody>${targets.map((target,i)=>`<tr data-always-target="${i}"><th scope="row">${esc(target.fn.name)}</th><td>${esc(regionName(target.geo_id))}</td><td>${target.rows.map(({person,affiliation})=>{const index=entries.push({person,affiliation})-1;return `<div class="always-target-person" data-always-target-person="${esc(person.employee_id)}"><span>${esc(name(person))}</span><span class="small">${phones(person)}</span><span title="${affiliation.priority?'Priorität':'Keine Priorität'}">${affiliation.priority??0}</span><div class="actions"><button type="button" class="secondary" data-always-edit="${index}">Prio</button><button type="button" class="secondary" data-always-replace="${index}">Ersetzen</button><button type="button" class="danger" data-always-remove="${index}" aria-label="${esc(name(person))} entfernen">Entfernen</button></div></div>`;}).join('')||'<span class="muted">Keine Person zugewiesen</span>'}</td><td><div class="always-target-actions"><button type="button" data-always-target-add="${i}">Person hinzufügen</button><button type="button" class="secondary" data-always-create="${i}">Person erstellen</button></div></td></tr>`).join('')||'<tr><td colspan="4">Keine Funktionen und Regionen für diese Filter.</td></tr>'}</tbody></table></div>`;
 }

 root.innerHTML=`<div class="toolbar">${monthPicker}<select id="person-department" aria-label="Abteilung">${options(state.departments,department,'Alle Abteilungen')}</select><select id="person-group" aria-label="Gruppe">${options(state.groups.filter(g=>!department||g.department_id===department),groupId,'Alle Gruppen')}</select><select id="person-function" aria-label="Funktion">${options(functions,functionId,'Alle Funktionen')}</select>${allowed.length?`<details class="region-filter"><summary>Regionen: ${regions.length} von ${allowed.length}</summary><div><div class="actions"><button type="button" id="all-person-regions" class="secondary">Alle wählen</button><button type="button" id="no-person-regions" class="secondary">Auswahl leeren</button></div>${state.regions.filter(r=>allowed.includes(r.id)).sort(byRegionName).map(r=>`<label class="check-option"><input type="checkbox" data-person-region="${esc(r.id)}" ${regions.includes(r.id)?'checked':''}>${esc(r.name)}</label>`).join('')}</div></details>`:''}<span id="person-count">${people.length} Personen</span><div class="people-view-toggle" role="group" aria-label="Immer-Darstellung"><button type="button" class="secondary" data-always-view="targets" aria-pressed="${view==='targets'}">Funktionen / Regionen</button><button type="button" class="secondary" data-always-view="people" aria-pressed="${view==='people'}">Personen</button></div></div><p class="small muted">Immer-Zuordnungen gelten dauerhaft und unabhängig vom gewählten Monat. Priorität 0 bedeutet gleichrangig / keine Priorität. 1 ist die höchste, 9 die tiefste Priorität.</p>${!functions.length?'<p>Keine Immer-Funktionen für diese Filter vorhanden. Den Zeitbereich können Admins unter Stammdaten → Funktionen festlegen.</p>':''}${view==='people'?`<div class="board"><table class="always-planning-table"><thead><tr><th>Name</th><th>Gruppe</th><th>Immer-Zuordnungen</th><th>Aktionen</th></tr></thead><tbody>${people.map(person=>{
  const rows=visibleRows(person);
  return `<tr data-always-person="${esc(person.employee_id)}"><th scope="row">${esc(name(person))}</th><td>${personGroupIds(person).map(id=>esc(state.groups.find(g=>g.id===id)?.name||id)).join(', ')||'—'}</td><td>${rows.length?`<table class="always-affiliations"><thead><tr><th>Funktion</th><th>Region</th><th>Priorität</th><th></th></tr></thead><tbody>${rows.map(r=>{const index=entries.push({person,affiliation:r})-1;return `<tr><td>${esc(state.functions.find(f=>f.id===r.function_id)?.name||r.function_id)}</td><td>${esc(regionName(r.geo_id))}</td><td>${r.priority?esc(r.priority):'<span title="Keine Priorität (0)">—</span>'}</td><td><div class="actions"><button type="button" class="secondary" data-always-edit="${index}">Bearbeiten</button><button type="button" class="danger" data-always-remove="${index}">Entfernen</button></div></td></tr>`;}).join('')}</tbody></table>`:'<span class="muted">Keine Zuordnung für diese Filter.</span>'}</td><td><button type="button" data-always-add="${esc(person.employee_id)}" ${functions.length?'':'disabled'}>+ Funktion</button></td></tr>`;
 }).join('')||'<tr><td colspan="4">Keine Personen für die gewählten Filter.</td></tr>'}</tbody></table></div>`:targetTable()}`;
 const q=selector=>root.querySelector(selector);
 q('#person-department').onchange=safe(e=>onFilter({department_id:e.target.value,region_ids:null}));
 q('#person-group').onchange=safe(e=>onFilter({group_id:e.target.value,region_ids:null}));
 q('#person-function').onchange=safe(e=>onFilter({function_id:e.target.value,region_ids:null}));
 root.querySelectorAll('[data-person-region]').forEach(input=>input.onchange=safe(async()=>{await onFilter({region_ids:[...root.querySelectorAll('[data-person-region]:checked')].map(r=>r.dataset.personRegion)});document.querySelector('.region-filter')?.setAttribute('open','');}));
 if(allowed.length){q('#all-person-regions').onclick=safe(()=>onFilter({region_ids:[...allowed]}));q('#no-person-regions').onclick=safe(()=>onFilter({region_ids:[]}));}
 const context={planning_department_id:department||null,planning_group_id:groupId||null};
 root.querySelectorAll('[data-always-view]').forEach(b=>b.onclick=safe(()=>onView(b.dataset.alwaysView)));
 function edit(person,affiliation){
  const eligible=selectedFunctions.filter(f=>personScopeAllows(state,f,person,f.id));
  const selected=affiliation?.function_id||functionId||(eligible.length===1?eligible[0].id:'');
  modal(`<h2>Immer-Zuordnung ${affiliation?'bearbeiten':'hinzufügen'}: ${esc(name(person))}</h2>${affiliation?`<p>${esc(state.functions.find(f=>f.id===selected)?.name||selected)} · ${esc(regionName(affiliation.geo_id))}</p>`:`<label>Funktion<select name="always_function_id" required>${options(eligible,selected,'— wählen —')}</select></label><div id="always-region-field"></div>`}<label>Priorität<input name="always_priority" type="number" min="0" max="9" step="1" value="${affiliation?.priority??0}" required></label><p class="small muted">0 = gleichrangig / keine Priorität. 1 = höchste Priorität, 9 = tiefste Priorität.</p>`,async data=>{
   const result=await api('/planning/always','POST',{...context,action:affiliation?'update':'add',employee_id:person.employee_id,function_id:affiliation?.function_id||data.always_function_id,geo_id:affiliation?affiliation.geo_id:(data.always_geo_id||null),priority:Number(data.always_priority),...(affiliation?{expected_priority:affiliation.priority??0}:{})});onSaved(result);
  });
  if(affiliation)return;
  const updateRegions=()=>{
   const fn=eligible.find(f=>f.id===document.querySelector('[name=always_function_id]').value),host=document.querySelector('#always-region-field');
   if(!fn){host.innerHTML='';return;}
   const choices=state.regions.filter(r=>regions.includes(r.id)&&allowedFunctionRegions(fn,group,state.regions,department,state.groups).includes(r.id)&&personScopeAllows(state,r,person,fn.id)).sort(byRegionName);
   host.innerHTML=fn.geo_ids.length?`<label>Region<select name="always_geo_id" required>${options(choices,choices.length===1?choices[0].id:regions.length===1?regions[0]:'','— wählen —')}</select></label>`:'<p>Ortsunabhängige Funktion</p>';
  };
  document.querySelector('[name=always_function_id]').onchange=updateRegions;updateRegions();
 }
 root.querySelectorAll('[data-always-add]').forEach(button=>button.onclick=()=>edit(people.find(p=>p.employee_id===button.dataset.alwaysAdd)));
 root.querySelectorAll('[data-always-edit]').forEach(button=>button.onclick=()=>{const {person,affiliation}=entries[Number(button.dataset.alwaysEdit)];edit(person,affiliation);});
 root.querySelectorAll('[data-always-remove]').forEach(button=>button.onclick=()=>{
  const {person,affiliation}=entries[Number(button.dataset.alwaysRemove)];
  modal(`<h2>Immer-Zuordnung entfernen</h2><p>${esc(name(person))} · ${esc(state.functions.find(f=>f.id===affiliation.function_id)?.name||affiliation.function_id)} · ${esc(regionName(affiliation.geo_id))}</p>`,async()=>{await api('/planning/always','POST',{...context,action:'remove',employee_id:person.employee_id,function_id:affiliation.function_id,geo_id:affiliation.geo_id,expected_priority:affiliation.priority??0});onSaved();});
  document.querySelector('#form button[type=submit]').textContent='Entfernen';
 });

 function assign(target,existing){
  const eligible=people.filter(p=>personScopeAllows(state,target.fn,p,target.fn.id)&&(target.geo_id===null||personScopeAllows(state,state.regions.find(r=>r.id===target.geo_id),p,target.fn.id))&&!p.function_regions?.some(r=>r.function_id===target.fn.id&&r.geo_id===target.geo_id));
  modal(`<h2>Person ${existing?'ersetzen':'hinzufügen'}</h2><p>${esc(target.fn.name)} · ${esc(regionName(target.geo_id))}${existing?' · bisher: '+esc(name(existing.person)):''}</p><label>Person suchen<input id="always-person-search" type="search" placeholder="Name oder Telefonnummer"></label><label>Person<select name="always_employee_id" required>${options(eligible.map(p=>({id:p.employee_id,name:name(p)})),'','— wählen —')}</select></label><label>Priorität<input name="always_priority" type="number" min="0" max="9" step="1" value="${existing?.affiliation.priority??0}" required></label>${existing?'<button type="button" class="secondary" id="always-create-replacement">Person erstellen und ersetzen</button>':''}${eligible.length?'':'<p>Keine weitere passende Person vorhanden. Über „Person erstellen“ kann eine neue Person erfasst werden.</p>'}`,async data=>{
   await api('/planning/always','POST',{...context,action:existing?'replace':'add',employee_id:existing?.person.employee_id||data.always_employee_id,...(existing?{replacement_employee_id:data.always_employee_id,expected_priority:existing.affiliation.priority??0}:{}),function_id:target.fn.id,geo_id:target.geo_id,priority:Number(data.always_priority)});onSaved();
  });
  const search=document.querySelector('#always-person-search'),select=document.querySelector('[name=always_employee_id]');search.oninput=()=>{const term=search.value.toLocaleLowerCase('de-CH'),chosen=select.value;select.innerHTML=options(eligible.filter(p=>(name(p)+' '+listContacts(p.contacts).join(' ')).toLocaleLowerCase('de-CH').includes(term)).map(p=>({id:p.employee_id,name:name(p)})),chosen,'— wählen —');};
  if(existing)document.querySelector('#always-create-replacement').onclick=()=>create(target,existing);
 }
 root.querySelectorAll('[data-always-target-add]').forEach(b=>b.onclick=()=>assign(targets[Number(b.dataset.alwaysTargetAdd)]));
 root.querySelectorAll('[data-always-replace]').forEach(b=>b.onclick=()=>{const existing=entries[Number(b.dataset.alwaysReplace)];assign({fn:state.functions.find(f=>f.id===existing.affiliation.function_id),geo_id:existing.affiliation.geo_id},existing);});
 function create(target,replacing){
  const defaultDepartment=department||group?.department_id||'';
  modal(`<h2>Person erstellen${replacing?' und ersetzen':''}</h2><p>${esc(target.fn.name)} · ${esc(regionName(target.geo_id))}</p><div class="name-fields"><label>Name<input name="new_last_name" required></label><label>Vorname<input name="new_first_name" required></label></div><label>Abteilung<select name="new_department_id" ${defaultDepartment&&(department||groupId)?'disabled':''}>${options(state.departments,defaultDepartment,'— keine —')}</select></label><label>Gruppe<select name="new_group_id" ${groupId?'disabled':''}></select></label><div class="form-pair">${[['phone_mobile','Telefon Mobil'],['phone_business','Telefon Geschäft'],['phone_private','Telefon Privat'],['email','E-Mail']].map(([key,title])=>`<label>${title}<input name="new_${key}" type="${key==='email'?'email':'tel'}"></label>`).join('')}</div><label>Priorität<input name="always_priority" type="number" min="0" max="9" step="1" value="${replacing?.affiliation.priority??0}" required></label>`,async data=>{
   const dep=defaultDepartment||data.new_department_id||null,selectedGroup=groupId||data.new_group_id||null;
   await api('/planning/always/person','POST',{...context,...(replacing?{replace_employee_id:replacing.person.employee_id,expected_priority:replacing.affiliation.priority??0}:{}),function_id:target.fn.id,geo_id:target.geo_id,priority:Number(data.always_priority),person:{first_name:data.new_first_name,last_name:data.new_last_name,department_id:dep,group_ids:selectedGroup?[selectedGroup]:[],contacts:['phone_mobile','phone_business','phone_private','email'].flatMap(type=>data['new_'+type]?.trim()?[{type,value:data['new_'+type].trim(),priority:0}]:[])}});onSaved();
  });
  const dep=document.querySelector('[name=new_department_id]'),groups=document.querySelector('[name=new_group_id]');
  const updateGroups=()=>{groups.innerHTML=options(state.groups.filter(g=>!dep.value||g.department_id===dep.value),groupId,'— keine —');};dep.onchange=updateGroups;updateGroups();
 }
 root.querySelectorAll('[data-always-create]').forEach(b=>b.onclick=()=>create(targets[Number(b.dataset.alwaysCreate)]));
 return {function_id:functionId,region_ids:regions};
}
