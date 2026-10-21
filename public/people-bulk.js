const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bindPeopleBulk(host,{state,selected,modal,api,onSaved}){
 const table=host.querySelector('.people-list');if(!table)return;
 for(const id of selected)if(!state.people.some(p=>p.employee_id===id))selected.delete(id);
 const q=s=>host.querySelector(s),inputs=()=>[...table.querySelectorAll('[data-person-select]')];let anchor=null;
 const update=()=>{const visible=inputs(),count=visible.filter(c=>selected.has(c.dataset.personSelect)).length,all=q('#people-select-all');all.checked=!!visible.length&&count===visible.length;all.indeterminate=count>0&&count<visible.length;all.disabled=!visible.length;
 for(const c of visible){c.checked=selected.has(c.dataset.personSelect);c.closest('tr').classList.toggle('is-selected',c.checked);}
 q('#people-selected-count').textContent=`${selected.size} gewählt${selected.size>count?' · '+(selected.size-count)+' davon ausgeblendet':''}`;q('#people-bulk-edit').disabled=!selected.size;q('#people-bulk-delete').disabled=!selected.size;};
 q('#people-select-all').onchange=e=>{anchor=null;for(const c of inputs())if(e.target.checked)selected.add(c.dataset.personSelect);else selected.delete(c.dataset.personSelect);update();};
 q('#people-select-clear').onclick=()=>{selected.clear();anchor=null;update();};
 table.tBodies[0].onmousedown=e=>{if(e.shiftKey&&!e.target.closest('button,input,a'))e.preventDefault();};
 table.tBodies[0].onclick=e=>{if(e.target.closest('button,a,select,label'))return;const c=e.target.closest('tr')?.querySelector('[data-person-select]');if(!c)return;const id=c.dataset.personSelect,checked=e.target===c?c.checked:!selected.has(id),ids=inputs().map(c=>c.dataset.personSelect),from=ids.indexOf(anchor),to=ids.indexOf(id),range=e.shiftKey&&from>=0?ids.slice(Math.min(from,to),Math.max(from,to)+1):[id];for(const key of range)if(checked)selected.add(key);else selected.delete(key);anchor=id;update();};
 q('#people-bulk-delete').onclick=()=>{const ids=[...selected];modal(`<h2>${ids.length} Personen löschen</h2><p>Auch ausgeblendete ausgewählte Personen sind betroffen. Personen mit laufenden oder zukünftigen Diensten können nicht gelöscht werden. Sobald eine Person geschützt ist, wird die gesamte Auswahl beibehalten. Vergangene Dienste bleiben erhalten.</p>`,async()=>{const result=await api('/people/delete-many','POST',{employee_ids:ids});selected.clear();await onSaved({updated:result.deleted,selected:result.deleted,deleted:result.deleted});});document.querySelector('#form button[type=submit]').textContent='Personen löschen';};
 q('#people-bulk-edit').onclick=()=>{
 const people=state.people.filter(p=>selected.has(p.employee_id)),expected=people.map(p=>({employee_id:p.employee_id,department_id:p.department_id||null,group_ids:[...(p.group_ids||(p.group_id?[p.group_id]:[]))].sort()}));
 modal(`<h2>Zuordnungen für ${people.length} Personen</h2><p>Die Änderungen gelten für alle ausgewählten Personen, auch für momentan ausgeblendete. Vorhandene Gruppen bleiben beim Ergänzen erhalten. Dienste und weitere Personendaten bleiben unverändert.</p><label>Abteilung<select name="bulk_department"><option value="keep">Unverändert</option><option value="clear">Keine direkte Abteilung</option>${state.departments.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></label><label>Gruppen<select name="bulk_group_mode"><option value="keep">Unverändert</option><option value="add">Ergänzen</option><option value="replace">Ersetzen</option><option value="clear">Alle Gruppenzuordnungen entfernen</option></select></label><fieldset id="people-bulk-groups"><legend>Gruppen auswählen</legend><div id="people-bulk-group-options"></div></fieldset>`,async d=>{
 const department=d.bulk_department==='keep'?{mode:'keep'}:d.bulk_department==='clear'?{mode:'clear'}:{mode:'set',id:d.bulk_department};
 const groups={mode:d.bulk_group_mode,ids:[...document.querySelectorAll('[name=bulk_group_ids]:checked')].map(c=>c.value)};
 const result=await api('/people/bulk-organization','POST',{expected,department,groups});selected.clear();await onSaved(result);
 });
 const renderGroups=()=>{const current=new Set([...document.querySelectorAll('[name=bulk_group_ids]:checked')].map(c=>c.value)),department=document.querySelector('[name=bulk_department]').value,groups=state.groups.filter(g=>['keep','clear'].includes(department)||g.department_id===department);
 document.querySelector('#people-bulk-group-options').innerHTML=groups.map(g=>`<label class="check-option"><input type="checkbox" name="bulk_group_ids" value="${esc(g.id)}" ${current.has(g.id)?'checked':''}>${esc(g.name)}</label>`).join('')||'<p>Keine Gruppen vorhanden.</p>';toggle();};
 const toggle=()=>{document.querySelector('#people-bulk-groups').disabled=!['add','replace'].includes(document.querySelector('[name=bulk_group_mode]').value);};
 document.querySelector('[name=bulk_department]').onchange=renderGroups;document.querySelector('[name=bulk_group_mode]').onchange=toggle;renderGroups();
 };
 update();
}
