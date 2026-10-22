import {linkRegionPolygons} from './region-recovery.js';
import {id,audit} from './domain.js';
const fail=message=>{throw Error(message);};
export function inspectGeojson(input){
 if(!input||input.type!=='FeatureCollection'||!Array.isArray(input.features)||!input.features.length||input.features.length>10000)fail('GeoJSON benötigt eine FeatureCollection mit 1 bis 10 000 Flächen');
 if(input.crs&&!['urn:ogc:def:crs:OGC:1.3:CRS84','urn:ogc:def:crs:EPSG::4326','EPSG:4326'].includes(input.crs?.properties?.name))fail('Die Datei muss WGS84-Längen-/Breitengrade (CRS84 oder EPSG:4326) verwenden');
 let vertices=0,polygon_count=0;
 for(const [index,f] of input.features.entries()){
  const label='Fläche '+(index+1);if(f?.type!=='Feature'||!f.properties||typeof f.properties!=='object'||Array.isArray(f.properties))fail(label+': Eigenschaften fehlen');
  const g=f.geometry;if(!g||!['Polygon','MultiPolygon'].includes(g.type))fail(label+': Nur Polygon oder MultiPolygon ist zulässig');
  const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;if(!Array.isArray(polygons)||!polygons.length)fail(label+': Koordinaten fehlen');
  polygon_count+=polygons.length;for(const polygon of polygons){if(!Array.isArray(polygon)||!polygon.length)fail(label+': Polygonringe fehlen');for(const ring of polygon){
   if(!Array.isArray(ring)||ring.length<4)fail(label+': Ein Ring benötigt mindestens vier Punkte');
   vertices+=ring.length;if(vertices>500000)fail('Maximal 500 000 Koordinatenpunkte pro Datei');
   for(const point of ring)if(!Array.isArray(point)||point.length<2||point.length>3||point.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(point[0])>180||Math.abs(point[1])>90)fail(label+': Ungültige WGS84-Koordinaten');
   if(ring[0].length!==ring.at(-1).length||ring[0].some((n,i)=>n!==ring.at(-1)[i]))fail(label+': Polygonring ist nicht geschlossen');
  }}
 }
 const headers=[...new Set(input.features.flatMap(f=>Object.keys(f.properties)))];if(!headers.length)fail('Keine Eigenschaftsfelder zur Auswahl vorhanden');
 return {headers,feature_count:input.features.length,polygon_count,rows:input.features.slice(0,5).map(f=>f.properties)};
}
export function mapGeojson(input,mapping){
 const inspection=inspectGeojson(input);if(!mapping||![mapping.geo_id,mapping.description].every(k=>typeof k==='string'&&inspection.headers.includes(k)))fail('Felder für Geo-ID und Beschreibung wählen');
 const regions=new Map();const features=input.features.map((f,index)=>{
  const raw=f.properties[mapping.geo_id],description=f.properties[mapping.description];
  if(!['string','number'].includes(typeof raw)||typeof raw==='number'&&!Number.isFinite(raw)||!String(raw).trim()||String(raw).length>200)fail('Fläche '+(index+1)+': Geo-ID fehlt oder ist ungültig');
  if(typeof description!=='string'||!description.trim()||description.length>500)fail('Fläche '+(index+1)+': Beschreibung fehlt oder ist ungültig');
  const key=String(raw).trim(),name=description.trim();if(regions.has(key)&&regions.get(key).name!==name)fail('Unterschiedliche Beschreibungen für dieselbe Geo-ID: '+key);
  if(!regions.has(key))regions.set(key,{id:key,name,parts:0});regions.get(key).parts+=f.geometry.type==='MultiPolygon'?f.geometry.coordinates.length:1;
  return {type:'Feature',properties:{GEO_ID:key,Beschreibung:name},geometry:{type:f.geometry.type,coordinates:f.geometry.coordinates}};
 });return {...inspection,regions:[...regions.values()],geojson:{type:'FeatureCollection',features}};
}
export function geojsonConflicts(layers,result){const known=new Set(layers.flatMap(l=>l.geojson.features.map(f=>String(f.properties.GEO_ID))));return result.regions.filter(r=>known.has(r.id)).map(r=>r.id);}
export function prepareGeojsonImport(state,layers,input){
 const result=mapGeojson(input.geojson,input.mapping),conflicts=geojsonConflicts(layers,result);if(conflicts.length)fail('Diese Geo-IDs besitzen bereits Polygone: '+conflicts.slice(0,20).join(', ')+'. Bestehende Polygone werden nicht überschrieben.');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>150)fail('Name der Gebietskarte erforderlich (maximal 150 Zeichen)');
 if(typeof input.filename!=='string'||!input.filename.trim()||input.filename.length>255)fail('Dateiname fehlt');
 if(typeof input.create_regions!=='boolean')fail('Auswahl für das Anlegen neuer Gebiete fehlt');
 const filename=input.filename.split(/[\\/]/).at(-1);let created=0,existing=0;
 for(const r of result.regions){const previous=state.regions.find(x=>x.id===r.id);if(previous){existing++;continue;}if(input.create_regions){const region={id:r.id,name:r.name};state.regions.push(region);audit(state,'regions','create',null,region);created++;}}
 const layer={id:'imported-'+id(),name:input.name.trim(),filename,geojson:result.geojson};
 linkRegionPolygons(state,[...layers,layer]);
 const summary={layer_id:layer.id,name:layer.name,filename,feature_count:result.feature_count,polygon_count:result.polygon_count,region_count:result.regions.length,created,existing};audit(state,'geojson','import',null,summary);return {layer,summary};
}
