import {polygonId} from './region-geometry.js';
const palette=['#2563eb','#b45309','#15803d','#9333ea','#be123c','#0e7490','#6d5700','#475569'];
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderRegionMap(container,{layers},masterRegions=[],options={}){
 const L=window.L;if(!L)throw Error('Die Kartenbibliothek konnte nicht geladen werden');
 container.innerHTML=`<h1>${escape(options.heading||'Regionenkarte')}</h1><p class="muted">Gebiete auswählen oder eine Fläche anklicken. Zoomen mit den Schaltflächen oder dem Mausrad, Verschieben mit der Maus.</p><div class="toolbar"><label>Gebietskarte <select id="region-map-layer" aria-label="Gebietskarte">${layers.map(l=>`<option value="${escape(l.id)}">${escape(l.name)}</option>`).join('')}</select></label><label>Region <select id="region-map-region" aria-label="Region auf der Karte"></select></label><button id="region-map-reset" class="secondary">Alle Gebiete</button><label class="check-option"><input id="region-map-background" type="checkbox" checked>Hintergrundkarte</label></div><div class="region-map-layout"><div id="region-map-canvas" role="region" aria-label="Interaktive Regionenkarte"></div><aside class="region-map-sidebar"><div id="region-map-details" aria-live="polite"></div><h2>Regionen</h2><div id="region-map-legend"></div></aside></div><p id="region-map-source" class="small muted"></p><p id="region-map-status" class="small muted" role="status"></p>`;
 const query=id=>container.querySelector('#'+id),layerSelect=query('region-map-layer'),regionSelect=query('region-map-region');
 const map=L.map(query('region-map-canvas'),{zoomControl:false,scrollWheelZoom:true,fadeAnimation:false});
 L.control.zoom({zoomInTitle:'Vergrössern',zoomOutTitle:'Verkleinern'}).addTo(map);
 const background=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
 background.on('tileerror',()=>{const status=query('region-map-status');if(status)status.textContent='Hintergrundkarte nicht erreichbar. Die Gebietsflächen bleiben verfügbar.';});
 let polygons,current,regions,selected='';
 const key=feature=>String(feature.properties.GEO_ID),title=feature=>String(feature.properties.Beschreibung||feature.properties.GEO_ID);
 const style=feature=>({color:regions.get(key(feature)).color,weight:selected===key(feature)?4:2,fillColor:regions.get(key(feature)).color,fillOpacity:selected===key(feature)?.45:.18,opacity:1});
 function bounds(id){const result=L.latLngBounds([]);polygons.eachLayer(layer=>{if(!id||key(layer.feature)===id)result.extend(layer.getBounds());});return result;}
 function details(){
  const region=regions.get(selected),record=masterRegions.find(r=>polygonId(r)===selected);
  query('region-map-details').innerHTML=region?`<h2>${escape(region.name)}</h2><dl><dt>Geo-ID</dt><dd>${escape(selected)}</dd><dt>Teilflächen</dt><dd>${region.count}</dd>${record?`<dt>Stammdaten</dt><dd>${escape(record.name)}</dd>`:''}</dl>`:`<h2>${escape(current.name)}</h2><p>${regions.size} Regionen · ${current.geojson.features.length} Teilflächen</p><p class="small muted">Eine Region auswählen, um ihre Details anzuzeigen.</p>`;
  for(const button of query('region-map-legend').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.geoId===selected));
 }
 function choose(id,fit=true,popupAt){
  selected=id;regionSelect.value=id;map.closePopup();polygons.setStyle(style);
  if(id)polygons.eachLayer(layer=>{if(key(layer.feature)===id)layer.bringToFront();});
  const box=bounds(id);if(fit&&box.isValid())map.fitBounds(box,{padding:[24,24],maxZoom:12,animate:false});
  if(id){const region=regions.get(id);L.popup().setLatLng(popupAt||box.getCenter()).setContent(`<b>${escape(region.name)}</b><br>${escape(id)}`).openOn(map);}
  details();
 }
 function showLayer(){
  if(polygons)map.removeLayer(polygons);map.closePopup();selected='';current=layers.find(l=>l.id===layerSelect.value);regions=new Map();
  for(const feature of current.geojson.features){const id=key(feature);if(!regions.has(id))regions.set(id,{name:title(feature),count:0,color:palette[regions.size%palette.length]});regions.get(id).count++;}
  regionSelect.innerHTML='<option value="">Alle Regionen</option>'+[...regions].map(([id,r])=>`<option value="${escape(id)}">${escape(r.name)} (${escape(id)})</option>`).join('');
  query('region-map-legend').innerHTML=[...regions].map(([id,r])=>`<button type="button" data-geo-id="${escape(id)}" aria-pressed="false"><span class="map-color" style="background:${r.color}" aria-hidden="true"></span><span>${escape(r.name)}<small>${escape(id)}</small></span></button>`).join('');
  for(const button of query('region-map-legend').querySelectorAll('button'))button.onclick=()=>choose(button.dataset.geoId);
  polygons=L.geoJSON(current.geojson,{style,onEachFeature:(feature,layer)=>{
   layer.bindTooltip(()=>{const node=document.createElement('span');node.textContent=title(feature)+' · '+key(feature);return node;},{sticky:true});
   layer.on('click',event=>choose(key(feature),true,event.latlng));
   layer.on('mouseover',()=>layer.setStyle({weight:4,fillOpacity:.4}));layer.on('mouseout',()=>polygons.resetStyle(layer));
   layer.on('add',()=>{const node=layer.getElement();if(!node)return;node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',title(feature)+' · '+key(feature));node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(key(feature));}});});
  }}).addTo(map);
  query('region-map-source').textContent='Quelle: '+current.filename;choose('');
 }
 layerSelect.onchange=showLayer;regionSelect.onchange=()=>choose(regionSelect.value);query('region-map-reset').onclick=()=>choose('');
 query('region-map-background').onchange=event=>{if(event.target.checked)background.addTo(map);else{map.removeLayer(background);query('region-map-status').textContent='';}};
 showLayer();if(options.selectedRegionId&&regions.has(options.selectedRegionId))choose(options.selectedRegionId);const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe(query('region-map-canvas'));
 return ()=>{observer.disconnect();map.remove();};
}

// Lazy previews keep long master-data tables from requesting every map tile at once.
export function bindRegionPreviews(container,data,regions,polygonLayers){
 let disposed=false;const maps=[],observer=new IntersectionObserver(entries=>{if(disposed)return;for(const entry of entries){if(!entry.isIntersecting)continue;const node=entry.target;observer.unobserve(node);const region=regions.find(r=>r.id===node.dataset.regionPreview),layers=polygonLayers(data,region),features=layers.flatMap(l=>l.geojson.features);if(!features.length)continue;
  const L=window.L,map=L.map(node,{attributionControl:true,zoomControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false,fadeAnimation:false});maps.push(map);map.attributionControl.setPrefix('');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
  const shape=L.geoJSON({type:'FeatureCollection',features},{interactive:false,style:{color:'#0e7490',weight:2,fillOpacity:.2}}).addTo(map);map.fitBounds(shape.getBounds(),{padding:[5,5],animate:false});
 }},{rootMargin:'100px'});
 container.querySelectorAll('[data-region-preview]').forEach(node=>observer.observe(node));return ()=>{disposed=true;observer.disconnect();maps.forEach(map=>map.remove());};
}
