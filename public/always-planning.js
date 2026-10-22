import {planningPeople,personGroupIds,allowedFunctionRegions,scopeAllows,personScopeAllows} from './organization.js';
import {priorityRank} from './priority.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(rows,selected,blank)=>`<option value="">${blank}</option>`+rows.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.name)}</option>`).join('');
export function renderAlwaysPlanning(root,{state,filters,monthPicker,api,safe,modal,onFilter,onSaved}){
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
 const entries=[];
 root.innerHTML=`<div class="toolbar">${monthPicker}<select id="person-department" aria-label="Abteilung">${options(state.departments,department,'Alle Abteilungen')}</select><select id="person-group" aria-label="Gruppe">${options(state.groups.filter(g=>!department||g.department_id===department),groupId,'Alle Gruppen')}</select><select id="person-function" aria-label="Funktion">${options(functions,functionId,'Alle Funktionen')}</select>${allowed.length?`<details class="region-filter"><summary>Regionen: ${regions.length} von ${allowed.length}</summary><div><div class="actions"><button type="button" id="all-person-regions" class="secondary">Alle wählen</button><button type="button" id="no-person-regions" class="secondary">Auswahl leeren</button></div>${state.regions.filter(r=>allowed.includes(r.id)).map(r=>`<label class="check-option"><input type="checkbox" data-person-region="${esc(r.id)}" ${regions.includes(r.id)?'checked':''}>${esc(r.name)}</label>`).join('')}</div></details>`:''}<span id="person-count">${people.length} Personen</span></div><p class="small muted">Immer-Zuordnungen gelten dauerhaft und unabhängig vom gewählten Monat. Priorität 0 bedeutet keine Priorität; positive Prioritäten werden ab 1 berücksichtigt.</p>${!functions.length?'<p>Keine Immer-Funktionen für diese Filter vorhanden. Den Zeitbereich können Admins unter Stammdaten → Funktionen festlegen.</p>':''}<div class="board"><table class="always-planning-table"><thead><tr><th>Name</th><th>Gruppe</th><th>Immer-Zuordnungen</th><th>Aktionen</th></tr></thead><tbody>${people.map(person=>{
  const rows=visibleRows(person);
  return `<tr data-always-person="${esc(person.employee_id)}"><th scope="row">${esc(name(person))}</th><td>${personGroupIds(person).map(id=>esc(state.groups.find(g=>g.id===id)?.name||id)).join(', ')||'—'}</td><td>${rows.length?`<table class="always-affiliations"><thead><tr><th>Funktion</th><th>Region</th><th>Priorität</th><th></th></tr></thead><tbody>${rows.map(r=>{const index=entries.push({person,affiliation:r})-1;return `<tr><td>${esc(state.functions.find(f=>f.id===r.function_id)?.name||r.function_id)}</td><td>${esc(regionName(r.geo_id))}</td><td>${r.priority?esc(r.priority):'<span title="Keine Priorität (0)">—</span>'}</td><td><div class="actions"><button type="button" class="secondary" data-always-edit="${index}">Bearbeiten</button><button type="button" class="danger" data-always-remove="${index}">Entfernen</button></div></td></tr>`;}).join('')}</tbody></table>`:'<span class="muted">Keine Zuordnung für diese Filter.</span>'}</td><td><button type="button" data-always-add="${esc(person.employee_id)}" ${functions.length?'':'disabled'}>+ Funktion</button></td></tr>`;
 }).join('')||'<tr><td colspan="4">Keine Personen für die gewählten Filter.</td></tr>'}</tbody></table></div>`;
 const q=selector=>root.querySelector(selector);
 q('#person-department').onchange=safe(e=>onFilter({department_id:e.target.value,region_ids:null}));
 q('#person-group').onchange=safe(e=>onFilter({group_id:e.target.value,region_ids:null}));
 q('#person-function').onchange=safe(e=>onFilter({function_id:e.target.value,region_ids:null}));
 root.querySelectorAll('[data-person-region]').forEach(input=>input.onchange=safe(async()=>{await onFilter({region_ids:[...root.querySelectorAll('[data-person-region]:checked')].map(r=>r.dataset.personRegion)});document.querySelector('.region-filter')?.setAttribute('open','');}));
 if(allowed.length){q('#all-person-regions').onclick=safe(()=>onFilter({region_ids:[...allowed]}));q('#no-person-regions').onclick=safe(()=>onFilter({region_ids:[]}));}
 const context={planning_department_id:department||null,planning_group_id:groupId||null};
 function edit(person,affiliation){
  const eligible=selectedFunctions.filter(f=>personScopeAllows(state,f,person,f.id));
  const selected=affiliation?.function_id||functionId||(eligible.length===1?eligible[0].id:'');
  modal(`<h2>Immer-Zuordnung ${affiliation?'bearbeiten':'hinzufügen'}: ${esc(name(person))}</h2>${affiliation?`<p>${esc(state.functions.find(f=>f.id===selected)?.name||selected)} · ${esc(regionName(affiliation.geo_id))}</p>`:`<label>Funktion<select name="always_function_id" required>${options(eligible,selected,'— wählen —')}</select></label><div id="always-region-field"></div>`}<label>Priorität<input name="always_priority" type="number" min="0" step="1" value="${affiliation?.priority??0}" required></label><p class="small muted">0 = keine Priorität. 1 ist die höchste Priorität.</p>`,async data=>{
   const result=await api('/planning/always','POST',{...context,action:affiliation?'update':'add',employee_id:person.employee_id,function_id:affiliation?.function_id||data.always_function_id,geo_id:affiliation?affiliation.geo_id:(data.always_geo_id||null),priority:Number(data.always_priority),...(affiliation?{expected_priority:affiliation.priority??0}:{})});onSaved(result);
  });
  if(affiliation)return;
  const updateRegions=()=>{
   const fn=eligible.find(f=>f.id===document.querySelector('[name=always_function_id]').value),host=document.querySelector('#always-region-field');
   if(!fn){host.innerHTML='';return;}
   const choices=state.regions.filter(r=>regions.includes(r.id)&&allowedFunctionRegions(fn,group,state.regions,department,state.groups).includes(r.id)&&personScopeAllows(state,r,person,fn.id));
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
 return {function_id:functionId,region_ids:regions};
}
