import {swissTime,localDateTime} from './time.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Group labels by function and actual region IDs; every person's original entry remains.
function dutyTableRows(rows){
 const groups=new Map();
 for(const row of rows){
  const key=JSON.stringify([row.kind,row.function_id]),regionKey=JSON.stringify([...row.region_ids].sort());
  if(!groups.has(key))groups.set(key,{name:row.function_name,regions:new Map(),count:0});const group=groups.get(key);
  if(!group.regions.has(regionKey))group.regions.set(regionKey,{name:row.region_name,rows:[]});group.regions.get(regionKey).rows.push(row);group.count++;
 }
 return [...groups.values()].map(group=>{let first=true;return `<tbody>${[...group.regions.values()].map(region=>region.rows.map((row,i)=>{
  const functionCell=first?`<td class="region-duty-function" rowspan="${group.count}">${esc(group.name)}</td>`:'';first=false;
  return `<tr data-region-duty="${esc(row.kind)}">${functionCell}${i===0?`<td class="region-duty-region" rowspan="${region.rows.length}">${esc(region.name)}</td>`:''}<td>${esc(row.person_name)}</td><td class="region-duty-priority" title="${row.priority?'Priorität '+esc(row.priority):'Keine Priorität (0)'}">${row.priority?esc(row.priority):'—'}</td><td>${row.kind==='always'?'<span class="badge">Immer</span>':esc(swissTime(row.start_on))+' → '+esc(swissTime(row.end_on))}</td><td>${row.contacts.map(esc).join('<br>')||'—'}</td></tr>`;
 }).join('')).join('')}</tbody>`;}).join('');
}
export async function renderPikettRegion(root,{api,safe,registerDispose}){
 root.innerHTML=`<form id="pikett-region-filter" class="toolbar"><label for="pikett-region-at">Datum / Uhrzeit</label><input id="pikett-region-at" type="text" value="${esc(swissTime(new Date()))}" placeholder="TT.MM.JJJJ HH:mm" data-time-format="datetime" inputmode="numeric" required><button type="submit">Anzeigen</button><button type="button" id="pikett-region-now" class="secondary">Jetzt</button><button type="button" id="pikett-region-reset" class="secondary">Kanton anzeigen</button></form><form id="pikett-region-search" class="toolbar"><label for="pikett-region-query">Adresse suchen</label><input id="pikett-region-query" type="search" minlength="3" maxlength="300" required placeholder="Strasse, Hausnummer, Ort"><button type="submit">Adresse suchen</button></form><div id="pikett-region-search-results" aria-live="polite"></div><p class="small muted">Eine Adresse suchen oder einen Punkt auf der Karte anklicken. Angezeigt werden laufende Pikettdienste und zuständige Personen mit Zeitbereich Immer.</p><p id="pikett-region-address" class="small" role="status">Adresse: Bitte einen Kartenpunkt wählen.</p><button type="button" id="pikett-region-address-retry" class="secondary small" hidden>Adresse erneut suchen</button><div class="pikett-region-layout"><div><div id="pikett-region-map" role="region" aria-label="Karte Kanton St. Gallen"></div><div id="pikett-region-legend" class="pikett-region-legend" aria-label="Gebietslegende"></div><p id="pikett-region-map-status" class="small muted" role="status">Gebiete werden geladen …</p></div><section id="pikett-region-results" aria-live="polite"><p>Bitte einen Punkt auf der Karte wählen.</p></section></div>`;
 const q=id=>root.querySelector('#'+id),L=window.L;if(!L)throw Error('Die Kartenbibliothek konnte nicht geladen werden');
 const map=L.map(q('pikett-region-map'),{zoomControl:false,fadeAnimation:false});
 L.control.zoom({zoomInTitle:'Vergrössern',zoomOutTitle:'Verkleinern'}).addTo(map);
 const background=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
 let disposed=false,sequence=0,addressSequence=0,searchSequence=0,point=null,marker,polygons,mapData=null,lastResult=null,colors=new Map(),backgroundUnavailable=false,at=new Date().toISOString();
 const fit=()=>map.fitBounds([[46.85,8.78],[47.60,9.70]],{padding:[12,12],animate:false});fit();
 background.on('tileerror',()=>{backgroundUnavailable=true;if(!disposed)q('pikett-region-map-status').textContent='OpenStreetMap ist nicht erreichbar. Gebietsflächen und Ortsabfrage bleiben verfügbar.';});
 const style=feature=>({color:colors.get(String(feature.properties.GEO_ID)),fillColor:colors.get(String(feature.properties.GEO_ID)),weight:3,fillOpacity:.045,opacity:1});
 const drawPolygons=()=>{
  if(!mapData)return;
  if(!lastResult){if(polygons){map.removeLayer(polygons);polygons=null;}q('pikett-region-legend').innerHTML='';if(!backgroundUnavailable)q('pikett-region-map-status').textContent='Eine Adresse suchen oder einen Kartenpunkt wählen, um die betroffenen Gebiete anzuzeigen.';return;}
  const affected=lastResult?new Set(lastResult.map_region_ids||lastResult.rows.flatMap(row=>row.region_ids)):null;
  const visible=mapData.features.map(feature=>{
   const regions=feature.properties.regions.filter(r=>!affected||affected.has(r.id));
   return regions.length?{...feature,properties:{...feature.properties,regions,Beschreibung:regions.map(r=>r.name).join(', ')}}:null;
  }).filter(Boolean);
  const ids=[...new Set(visible.map(f=>String(f.properties.GEO_ID)))].sort();colors=new Map(ids.map((id,index)=>[id,`hsl(${20+index*360/Math.max(1,ids.length)}, 80%, 38%)`]));
  if(polygons)map.removeLayer(polygons);
  polygons=L.geoJSON({type:'FeatureCollection',features:visible},{interactive:false,style,onEachFeature:(feature,layer)=>layer.on('add',()=>{const node=layer.getElement();if(node){node.setAttribute('data-region-polygon',String(feature.properties.GEO_ID));node.setAttribute('role','img');node.setAttribute('aria-label',feature.properties.Beschreibung);}})}).addTo(map);
  const legend=[...new Map(visible.map(feature=>[String(feature.properties.GEO_ID),feature.properties])).values()].sort((a,b)=>a.Beschreibung.localeCompare(b.Beschreibung,'de-CH'));
  q('pikett-region-legend').innerHTML='<h3>Gebiete</h3>'+(legend.length?`<ul>${legend.map(region=>`<li data-region-legend="${esc(region.GEO_ID)}"><span class="map-color" style="background:${colors.get(region.GEO_ID)}" aria-hidden="true"></span><span>${esc(region.Beschreibung)}</span></li>`).join('')}</ul>`:`<p class="small muted">${lastResult?'Keine betroffenen Gebiete mit Kartenpolygon und zuständigem Pikett.':'Keine verfügbaren Teilgebiete mit Kartenpolygon.'}</p>`);
  if(!backgroundUnavailable)q('pikett-region-map-status').textContent=lastResult?'Nur betroffene Teilgebiete mit Zuständigkeit am gewählten Punkt und Zeitpunkt.':'Teilgebiete mit unterschiedlichen Farben. Einen Punkt wählen, um die betroffenen Gebiete anzuzeigen.';
 };

 const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe(q('pikett-region-map'));
 registerDispose(()=>{disposed=true;sequence++;addressSequence++;searchSequence++;observer.disconnect();map.remove();});
 const draw=data=>{
  at=data.at;lastResult=data;drawPolygons();
  q('pikett-region-at').value=swissTime(data.at);
  const drawn=new Set((mapData?.features||[]).flatMap(f=>f.properties.regions.map(r=>r.id))),affected=new Set(data.map_region_ids||data.rows.flatMap(r=>r.region_ids)),visibleRegions=data.regions.filter(r=>drawn.has(r.id)&&affected.has(r.id));
  q('pikett-region-results').innerHTML=`<h2>Pikett nach Region</h2><p>${esc(swissTime(data.at))} · Schweizer Zeit</p><p class="small">Kartenpunkt: ${data.point.lat.toFixed(5)}, ${data.point.lng.toFixed(5)}</p><p>${visibleRegions.length?'Angezeigte Gebiete: '+visibleRegions.map(r=>esc(r.name)).join(', '):'Keine betroffenen Teilgebiete mit Kartenpolygon.'}</p>${data.rows.length?`<p role="status">${data.rows.length} zuständige Einträge</p><p class="small muted">Sortierung: Zeitbereich vor Immer; jeweils Funktion A–Z, Region gruppiert, dann Priorität (1 zuerst; 0 = keine Priorität am Schluss).</p><div class="pikett-list-board"><table class="pikett-list"><thead><tr><th>Pikett</th><th>Region</th><th>Name</th><th>Prio</th><th>Dienstzeit</th><th>Kontaktdaten</th></tr></thead>${dutyTableRows(data.rows)}</table></div>`:'<p>Keine zuständigen Pikettdienste für diesen Punkt und Zeitpunkt gefunden.</p>'}`;
 };
 const load=async()=>{
  if(!point)return;const request=++sequence;
  q('pikett-region-results').innerHTML='<p role="status">Pikettdienste werden geladen …</p>';
  try{const data=await api('/pikett-by-region?'+new URLSearchParams({at,lat:point.lat,lng:point.lng}));if(disposed||request!==sequence)return;draw(data);}
  catch(error){if(disposed||request!==sequence)return;q('pikett-region-results').textContent=error.message;throw error;}
 };
 const showAddress=result=>{q('pikett-region-address').textContent=result.label?`${result.kind==='address'?'Nächstgelegene Adresse':'Ortsangabe'}: ${result.label} · ${result.attribution||'© OpenStreetMap contributors'} (Nominatim)`:'Für diesen Kartenpunkt ist keine Adresse oder Ortsangabe in OpenStreetMap hinterlegt.';q('pikett-region-address-retry').hidden=true;};
 const loadAddress=async()=>{
  if(!point)return;const request=++addressSequence,current={...point};
  q('pikett-region-address').textContent='Adresse wird ermittelt …';q('pikett-region-address-retry').hidden=true;
  try{
   const result=await api('/reverse-address?'+new URLSearchParams(current));if(disposed||request!==addressSequence)return;
   showAddress(result);
  }catch(error){if(disposed||request!==addressSequence)return;q('pikett-region-address').textContent=error.message;q('pikett-region-address-retry').hidden=false;}
 };
 q('pikett-region-address-retry').onclick=safe(loadAddress);
 const selectPoint=async(next,address=null,zoom=false)=>{
  at=q('pikett-region-at').value===swissTime(at)?at:localDateTime(q('pikett-region-at').value);point={...next};addressSequence++;lastResult=null;drawPolygons();
  if(marker)map.removeLayer(marker);marker=L.circleMarker(point,{radius:7,color:'#b91c1c',fillColor:'#fff',fillOpacity:1,weight:3,interactive:false}).addTo(map);
  if(zoom)map.setView(point,16,{animate:false});
  if(address)showAddress(address);await Promise.all([load(),address?Promise.resolve():loadAddress()]);
 };
 map.on('click',safe(async event=>{searchSequence++;q('pikett-region-search-results').innerHTML='';await selectPoint({lat:event.latlng.lat,lng:event.latlng.lng});}));
 q('pikett-region-search').onsubmit=safe(async event=>{
  event.preventDefault();const request=++searchSequence;q('pikett-region-search-results').textContent='Adresse wird gesucht …';
  try{
   const data=await api('/search-address?'+new URLSearchParams({q:q('pikett-region-query').value}));if(disposed||request!==searchSequence)return;
   if(!data.results.length){q('pikett-region-search-results').textContent='Keine passende Adresse gefunden. Bitte Strasse und Ort präzisieren.';return;}
   const choose=async result=>{q('pikett-region-search-results').innerHTML='';await selectPoint(result.point,{...result,attribution:data.attribution},true);};
   if(data.results.length===1){await choose(data.results[0]);return;}
   q('pikett-region-search-results').innerHTML=`<p>Adresse auswählen:</p><ul class="address-search-results">${data.results.map((result,index)=>`<li><button type="button" class="secondary" data-address-result="${index}">${esc(result.label)}</button></li>`).join('')}</ul>`;
   q('pikett-region-search-results').querySelectorAll('[data-address-result]').forEach(button=>button.onclick=safe(()=>choose(data.results[Number(button.dataset.addressResult)])));
  }catch(error){if(!disposed&&request===searchSequence)q('pikett-region-search-results').textContent=error.message;}
 });
 q('pikett-region-filter').onsubmit=safe(async event=>{event.preventDefault();at=localDateTime(q('pikett-region-at').value);await load();});
 q('pikett-region-now').onclick=safe(async()=>{at=new Date().toISOString();q('pikett-region-at').value=swissTime(at);await load();});
 q('pikett-region-reset').onclick=fit;
 let data;try{data=await api('/pikett-region-map');}catch(error){if(disposed)return;throw error;}if(disposed)return;
 mapData=data;if(lastResult)draw(lastResult);else drawPolygons();

}
