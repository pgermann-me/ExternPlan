import {statisticsRegions} from './statistics-regions.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2});
export function mountStatistics(root,{api,safe,state,filters}){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 filters.date_from||=today.slice(0,4)+'-01-01';filters.date_to||=today.slice(0,4)+'-12-31';
 for(const [key,type] of [['department_id','departments'],['group_id','groups'],['function_id','functions']])if(filters[key]&&![...state[type],...(state.archived_master?.[type]||[])].some(r=>r.id===filters[key]))filters[key]='';
 if(!Array.isArray(filters.region_ids))filters.region_ids=filters.region_id?[filters.region_id]:[];delete filters.region_id;
 const options=(rows,selected,all)=>`<option value="">${all}</option>`+[...rows].sort((a,b)=>a.name.localeCompare(b.name,'de-CH')).map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.name)}${r.deleted_at?' (archiviert)':''}</option>`).join('');
 const groups=()=>state.groups.filter(g=>!filters.department_id||g.department_id===filters.department_id);
 if(filters.group_id&&!groups().some(g=>g.id===filters.group_id))filters.group_id='';
 root.innerHTML=`<h1>Statistik</h1><form id="statistics-filters" class="toolbar"><label>Von<input name="date_from" type="date" value="${esc(filters.date_from)}" required></label><label>Bis · einschliesslich<input name="date_to" type="date" value="${esc(filters.date_to)}" required></label><label>Abteilung<select name="department_id">${options(state.departments,filters.department_id,'Alle Abteilungen')}</select></label><label>Gruppe<select name="group_id">${options(groups(),filters.group_id,'Alle Gruppen')}</select></label><label>Funktion<select name="function_id">${options([...state.functions,...(state.archived_master?.functions||[])].filter(f=>f.duty_time_model!=='always'),filters.function_id,'Alle Funktionen')}</select></label><div class="statistics-region-control"><span>Regionen</span><details id="statistics-regions" class="region-filter"><summary></summary><div id="statistics-region-options"></div></details></div><button type="submit">Auswerten</button><button type="button" id="statistics-month" class="secondary">Dieser Monat</button><button type="button" id="statistics-year" class="secondary">Dieses Jahr</button></form><p class="small muted">Geplante Stunden je Person und Funktion im gewählten Zeitraum. Überschneidungen derselben Person/Funktion zählen einmal, auch über mehrere Regionen. Angefangene Dienste werden auf den Zeitraum begrenzt. Berechnet wird die tatsächliche Dauer einschliesslich Schweizer Zeitumstellungen. Immer-Zuordnungen ohne Dienste ergeben keine Stunden.</p><div id="statistics-results" aria-live="polite"></div>`;
 let disposed=false,sequence=0;const form=root.querySelector('#statistics-filters'),results=root.querySelector('#statistics-results');
 const load=async()=>{
  const request=++sequence;Object.assign(filters,Object.fromEntries(new FormData(form)));results.innerHTML='<p role="status">Statistik wird berechnet …</p>';
  try{const {region_ids,...selection}=filters,params=new URLSearchParams(selection);for(const id of region_ids)params.append('region_id',id);const data=await api('/statistics?'+params);if(disposed||request!==sequence)return;
   results.innerHTML=`<p id="statistics-summary"><b>${number.format(data.total_hours)} Funktionsstunden</b> · ${data.people_count} Personen · ${data.function_count} Funktionen</p>${data.rows.length?`<div class="board"><table class="statistics-table"><thead><tr><th scope="col">Person</th><th scope="col">Funktion</th><th scope="col">Geplante Stunden</th></tr></thead><tbody>${data.rows.map(row=>`<tr data-stat-person="${esc(row.employee_id)}" data-stat-function="${esc(row.function_id)}"><th scope="row">${esc(row.person_name)}${row.person_archived?' <span class="muted">(archiviert)</span>':''}</th><td>${esc(row.function_name)}${row.function_archived?' <span class="muted">(archiviert)</span>':''}</td><td class="stat-hours">${number.format(row.hours)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">Gesamtsumme der Funktionsstunden</th><td class="stat-hours">${number.format(data.total_hours)}</td></tr></tfoot></table></div>`:'<p role="status">Keine geplanten Dienste für diesen Zeitraum und diese Filter.</p>'}`;
  }catch(error){if(!disposed&&request===sequence)results.textContent=error.message;}
 };
 const renderRegions=()=>{
  const available=statisticsRegions(state,{department_id:form.elements.department_id.value,group_id:form.elements.group_id.value,function_id:form.elements.function_id.value});
  filters.region_ids=filters.region_ids.filter(id=>available.some(r=>r.id===id));
  const summary=root.querySelector('#statistics-regions summary'),host=root.querySelector('#statistics-region-options');
  const title=()=>{summary.textContent=!available.length?'Keine Regionen':filters.region_ids.length?'Regionen: '+filters.region_ids.length:'Alle Regionen';};title();
  host.innerHTML=available.length?`<button type="button" id="statistics-all-regions" class="secondary">Alle Regionen</button>${available.map(r=>`<label class="check-option"><input type="checkbox" data-stat-region="${esc(r.id)}" ${filters.region_ids.includes(r.id)?'checked':''}>${esc(r.name)}</label>`).join('')}`:'<p>Keine zulässigen Regionen für diese Filter.</p>';
  host.querySelectorAll('[data-stat-region]').forEach(input=>input.onchange=()=>{filters.region_ids=[...host.querySelectorAll('[data-stat-region]:checked')].map(input=>input.dataset.statRegion);title();});
  if(host.querySelector('#statistics-all-regions'))host.querySelector('#statistics-all-regions').onclick=()=>{filters.region_ids=[];host.querySelectorAll('[data-stat-region]').forEach(input=>input.checked=false);title();};
 };
 form.elements.function_id.onchange=renderRegions;form.elements.group_id.onchange=renderRegions;renderRegions();
 form.onsubmit=safe(async e=>{e.preventDefault();await load();});
 form.elements.department_id.onchange=()=>{filters.department_id=form.elements.department_id.value;filters.group_id='';form.elements.group_id.innerHTML=options(groups(),'','Alle Gruppen');renderRegions();};
 root.querySelector('#statistics-month').onclick=safe(async()=>{form.elements.date_from.value=today.slice(0,7)+'-01';const date=new Date(today.slice(0,7)+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);form.elements.date_to.value=date.toISOString().slice(0,10);await load();});
 root.querySelector('#statistics-year').onclick=safe(async()=>{form.elements.date_from.value=today.slice(0,4)+'-01-01';form.elements.date_to.value=today.slice(0,4)+'-12-31';await load();});
 safe(load)();return ()=>{disposed=true;sequence++;};
}
