const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bindPersonAffiliations(host,state,person){
 let rows=(person.function_regions||[]).map(r=>({...r}));
 const functions=[...state.functions,...(state.archived_master?.functions||[])],regions=[...state.regions,...(state.archived_master?.regions||[])];
 const read=()=>[...host.querySelectorAll('[data-affiliation-row]')].map(row=>({function_id:row.querySelector('[data-affiliation-function]').value,geo_id:row.querySelector('[data-affiliation-region]').value||null,priority:Number(row.querySelector('[data-affiliation-priority]').value)}));
 const options=(list,value)=>'<option value="">— wählen —</option>'+list.map(r=>`<option value="${esc(r.id)}" ${r.id===value?'selected':''}>${esc(r.name)}${r.deleted_at?' (gelöscht)':''}</option>`).join('');
 function render(){
 host.innerHTML=`<fieldset><legend>Funktions- und Gebietszuordnungen</legend><p class="small muted">Je Funktion und Gebiet eine eigene Priorität. Sie gilt als Vorgabe für neue Dienste und ständige Piketts. Bestehende Dienste bleiben unverändert.</p>${rows.map((r,i)=>{
  const fn=functions.find(f=>f.id===r.function_id),available=regions.filter(g=>fn?.geo_ids.includes(g.id));
  if(r.geo_id&&!available.some(g=>g.id===r.geo_id))available.push({id:r.geo_id,name:r.geo_id+' (nicht verfügbar)'});
  return `<div class="person-affiliation-row" data-affiliation-row><label>Funktion<select data-affiliation-function required>${options(functions.filter(f=>!f.deleted_at||f.id===r.function_id),r.function_id)}</select></label><label>Gebiet<select data-affiliation-region ${fn?.geo_ids.length?'required':''}>${fn&&!fn.geo_ids.length?'<option value="">Ortsunabhängig</option>':options(available,r.geo_id)}</select></label><label>Priorität<input type="number" min="1" step="1" value="${esc(r.priority)}" data-affiliation-priority required></label><button type="button" class="secondary" data-remove-affiliation="${i}">Entfernen</button></div>`;
 }).join('')||'<p class="muted">Keine Zuordnungen erfasst.</p>'}<button type="button" class="secondary" id="add-person-affiliation">+ Zuordnung</button></fieldset>`;
 host.querySelector('#add-person-affiliation').onclick=()=>{rows=read();rows.push({function_id:'',geo_id:null,priority:1});render();};
 host.querySelectorAll('[data-remove-affiliation]').forEach(b=>b.onclick=()=>{rows=read();rows.splice(Number(b.dataset.removeAffiliation),1);render();});
 host.querySelectorAll('[data-affiliation-function]').forEach((select,index)=>select.onchange=()=>{rows=read();rows[index].geo_id=null;render();});
 }
 render();return ()=>{const result=read();return person.function_regions===undefined&&!result.length?undefined:result;};
}
