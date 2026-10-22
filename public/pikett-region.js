import {swissTime,localDateTime} from './time.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderPikettRegion(root,{api,safe,registerDispose}){
 root.innerHTML=`<form id="pikett-region-filter" class="toolbar"><label for="pikett-region-at">Datum / Uhrzeit</label><input id="pikett-region-at" type="text" value="${esc(swissTime(new Date()))}" placeholder="TT.MM.JJJJ HH:mm" required><button type="submit">Anzeigen</button><button type="button" id="pikett-region-now" class="secondary">Jetzt</button><button type="button" id="pikett-region-reset" class="secondary">Kanton anzeigen</button></form><p class="small muted">Einen Punkt auf der Karte anklicken. Angezeigt werden laufende Pikettdienste und zuständige Personen mit Zeitbereich Immer.</p><div class="pikett-region-layout"><div><div id="pikett-region-map" role="region" aria-label="Karte Kanton St. Gallen"></div><p id="pikett-region-map-status" class="small muted" role="status">Gebiete werden geladen …</p></div><section id="pikett-region-results" aria-live="polite"><p>Bitte einen Punkt auf der Karte wählen.</p></section></div>`;
 const q=id=>root.querySelector('#'+id),L=window.L;if(!L)throw Error('Die Kartenbibliothek konnte nicht geladen werden');
 const map=L.map(q('pikett-region-map'),{zoomControl:false,fadeAnimation:false});
 L.control.zoom({zoomInTitle:'Vergrössern',zoomOutTitle:'Verkleinern'}).addTo(map);
 const background=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
 let disposed=false,sequence=0,point=null,marker,polygons,selected=new Set(),at=new Date().toISOString();
 const fit=()=>map.fitBounds([[46.85,8.78],[47.60,9.70]],{padding:[12,12],animate:false});fit();
 background.on('tileerror',()=>{if(!disposed)q('pikett-region-map-status').textContent='OpenStreetMap ist nicht erreichbar. Gebietsflächen und Ortsabfrage bleiben verfügbar.';});
 const style=feature=>({color:selected.has(String(feature.properties.GEO_ID))?'#126a8b':'#557d8b',weight:selected.has(String(feature.properties.GEO_ID))?3:1,fillOpacity:selected.has(String(feature.properties.GEO_ID))?.2:.035});
 const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe(q('pikett-region-map'));
 registerDispose(()=>{disposed=true;sequence++;observer.disconnect();map.remove();});
 const draw=data=>{
  at=data.at;selected=new Set(data.regions.map(r=>r.polygon_geo_id));polygons?.setStyle(style);
  q('pikett-region-at').value=swissTime(data.at);
  q('pikett-region-results').innerHTML=`<h2>Pikett nach Region</h2><p>${esc(swissTime(data.at))} · Schweizer Zeit</p><p class="small">Kartenpunkt: ${data.point.lat.toFixed(5)}, ${data.point.lng.toFixed(5)}</p><p>${data.regions.length?'Gebiete: '+data.regions.map(r=>esc(r.name)).join(', '):'Für diesen Punkt sind keine verknüpften Gebiete vorhanden.'}</p>${data.rows.length?`<p role="status">${data.rows.length} zuständige Einträge</p><p class="small muted">Sortierung: Funktion A–Z, dann Priorität (1 zuerst; 0 = keine Priorität am Schluss).</p><div class="pikett-list-board"><table class="pikett-list"><thead><tr><th>Pikett</th><th>Region</th><th>Name</th><th>Prio</th><th>Dienstzeit</th><th>Kontaktdaten</th></tr></thead><tbody>${data.rows.map(row=>`<tr data-region-duty="${esc(row.kind)}"><td>${esc(row.function_name)}</td><td>${esc(row.region_name)}</td><td>${esc(row.person_name)}</td><td title="${row.priority?'Priorität '+esc(row.priority):'Keine Priorität (0)'}">${row.priority?esc(row.priority):'—'}</td><td>${row.kind==='always'?'<span class="badge">Immer</span>':esc(swissTime(row.start_on))+' → '+esc(swissTime(row.end_on))}</td><td>${row.contacts.map(esc).join('<br>')||'—'}</td></tr>`).join('')}</tbody></table></div>`:'<p>Keine zuständigen Pikettdienste für diesen Punkt und Zeitpunkt gefunden.</p>'}`;
 };
 const load=async()=>{
  if(!point)return;const request=++sequence;
  q('pikett-region-results').innerHTML='<p role="status">Pikettdienste werden geladen …</p>';
  try{const data=await api('/pikett-by-region?'+new URLSearchParams({at,lat:point.lat,lng:point.lng}));if(disposed||request!==sequence)return;draw(data);}
  catch(error){if(disposed||request!==sequence)return;q('pikett-region-results').textContent=error.message;throw error;}
 };
 map.on('click',safe(async event=>{
  at=q('pikett-region-at').value===swissTime(at)?at:localDateTime(q('pikett-region-at').value);point={lat:event.latlng.lat,lng:event.latlng.lng};
  if(marker)map.removeLayer(marker);marker=L.circleMarker(point,{radius:7,color:'#b91c1c',fillColor:'#fff',fillOpacity:1,weight:3,interactive:false}).addTo(map);
  selected=new Set();polygons?.setStyle(style);await load();
 }));
 q('pikett-region-filter').onsubmit=safe(async event=>{event.preventDefault();at=localDateTime(q('pikett-region-at').value);await load();});
 q('pikett-region-now').onclick=safe(async()=>{at=new Date().toISOString();q('pikett-region-at').value=swissTime(at);await load();});
 q('pikett-region-reset').onclick=fit;
 let data;try{data=await api('/pikett-region-map');}catch(error){if(disposed)return;throw error;}if(disposed)return;
 polygons=L.geoJSON(data,{interactive:false,style}).addTo(map);
 if(!q('pikett-region-map-status').textContent.startsWith('OpenStreetMap'))q('pikett-region-map-status').textContent=data.features.length?'Gebietsflächen aus den verknüpften Stammdaten. Hintergrund: OpenStreetMap.':'Noch keine sichtbaren Gebiete mit Kartenpolygon verknüpft.';
}
