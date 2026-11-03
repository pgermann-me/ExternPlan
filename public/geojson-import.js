const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function geojsonImportPanel(container,file,{api,onImported,isCurrent}){
 if(file.size>8*1024*1024)throw Error('GeoJSON-Datei zu gross (maximal 8 MB)');
 let geojson;try{geojson=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw Error('Die Datei enthält kein gültiges JSON');}
 const inspection=await api('/geojson/preview','POST',{geojson});if(!isCurrent())return;
 const pick=patterns=>inspection.headers.find(h=>patterns.includes(h.toLowerCase()))||'';
 const options=selected=>'<option value="">— wählen —</option>'+inspection.headers.map(h=>`<option value="${esc(h)}" ${h===selected?'selected':''}>${esc(h)}</option>`).join('');
 const cell=value=>value!==null&&typeof value==='object'?JSON.stringify(value):String(value??'');
 container.innerHTML=`<h2>GeoJSON importieren</h2><p>${inspection.polygon_count} Teilflächen · ${esc(file.name)}</p><p>Koordinaten: WGS84 (Längen-/Breitengrad). Geo-ID und Beschreibung werden aus den Eigenschaften jeder Fläche übernommen.</p><label>Name der Gebietskarte<input id="geojson-name" maxlength="150" value="${esc(file.name.replace(/\.(geojson|json)$/i,''))}"></label><div class="form-pair"><div><label for="geojson-id-field">Feld für Geo-ID</label><select id="geojson-id-field">${options(pick(['geo_id','geo-id','geoid','id']))}</select></div><div><label for="geojson-description-field">Feld für Beschreibung</label><select id="geojson-description-field">${options(pick(['beschreibung','description','name']))}</select></div></div><label class="check-option"><input type="checkbox" id="geojson-create-regions" checked>Neue Gebiete in den Stammdaten anlegen</label><p class="small muted">Bestehende Gebiete bleiben unverändert. Identische Geo-IDs werden automatisch mit den neuen Polygonen verbunden, sofern keine andere Zuordnung gespeichert ist.</p><details><summary>Eigenschaften der ersten ${inspection.rows.length} Flächen</summary><div class="board"><table><thead><tr>${inspection.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${inspection.rows.map(r=>`<tr>${inspection.headers.map(h=>`<td>${esc(cell(r[h]).slice(0,200))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details><p><button type="button" id="geojson-check">Vorschau prüfen</button></p><div id="geojson-result" aria-live="polite"></div><p id="geojson-error" role="alert" class="error"></p>`;
 const q=id=>container.querySelector('#'+id),mapping=()=>({geo_id:q('geojson-id-field').value,description:q('geojson-description-field').value});let generation=0;
 const invalidate=()=>{generation++;q('geojson-result').innerHTML='';q('geojson-error').textContent='';};
 for(const id of ['geojson-id-field','geojson-description-field','geojson-name','geojson-create-regions'])q(id).oninput=invalidate;
 q('geojson-check').onclick=async()=>{
  const current=++generation;q('geojson-error').textContent='';q('geojson-result').innerHTML='';q('geojson-check').disabled=true;
  try{
   const chosen=mapping(),preview=await api('/geojson/preview','POST',{geojson,mapping:chosen});if(!isCurrent()||current!==generation)return;
   const conflicts=preview.conflicts;
   q('geojson-result').innerHTML=`<h3>Importvorschau</h3><p>${preview.regions.length} Gebiete · ${preview.polygon_count} Teilflächen</p><ul>${preview.regions.slice(0,20).map(r=>`<li>${esc(r.id)}: ${esc(r.name)} · ${r.parts} Teilfläche${r.parts===1?'':'n'}</li>`).join('')}</ul>${preview.regions.length>20?`<p>Weitere ${preview.regions.length-20} Gebiete</p>`:''}${conflicts.length?`<p class="error">Bereits vorhandene Polygone: ${conflicts.slice(0,20).map(esc).join(', ')}. Bestehende Polygone werden nicht überschrieben.</p>`:'<button type="button" id="geojson-commit">GeoJSON importieren</button>'}`;
   if(!conflicts.length)q('geojson-commit').onclick=async()=>{const button=q('geojson-commit');button.disabled=true;q('geojson-error').textContent='';try{const result=await api('/geojson/import','POST',{geojson,mapping:chosen,name:q('geojson-name').value,filename:file.name,create_regions:q('geojson-create-regions').checked});await onImported(result);}catch(error){if(isCurrent()){q('geojson-error').textContent=error.message;button.disabled=false;}}};
  }catch(error){if(isCurrent()&&current===generation)q('geojson-error').textContent=error.message;}
  finally{if(isCurrent())q('geojson-check').disabled=false;}
 };
}
