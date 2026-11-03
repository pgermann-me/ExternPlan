import {polygonId} from './region-geometry.js';
// Boundary points belong to both adjacent regions. Hole interiors are excluded.
function ringPosition([x,y],ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [ax,ay]=ring[j],[bx,by]=ring[i],dx=bx-ax,dy=by-ay;
  if(Math.abs((x-ax)*dy-(y-ay)*dx)<=1e-10*Math.max(1,Math.abs(dx),Math.abs(dy))&&x>=Math.min(ax,bx)-1e-10&&x<=Math.max(ax,bx)+1e-10&&y>=Math.min(ay,by)-1e-10&&y<=Math.max(ay,by)+1e-10)return 0;
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside?1:-1;
}
function inPolygon(point,rings){
 const outer=ringPosition(point,rings[0]);if(outer<0)return false;if(outer===0)return true;
 for(const ring of rings.slice(1)){const hole=ringPosition(point,ring);if(hole===0)return true;if(hole>0)return false;}
 return true;
}
export function geometryContains(geometry,point){
 if(geometry?.type==='Polygon')return inPolygon(point,geometry.coordinates);
 if(geometry?.type==='MultiPolygon')return geometry.coordinates.some(rings=>inPolygon(point,rings));
 return false;
}
export function regionsAtPoint(state,{layers},point){
 const polygons=new Set();
 for(const layer of layers)for(const feature of layer.geojson.features)if(geometryContains(feature.geometry,point))polygons.add(String(feature.properties.GEO_ID));
 return state.regions.filter(r=>!r.deleted_at&&polygonId(r)!==null&&polygons.has(polygonId(r)));
}
// The public map contains only polygons linked to regions visible to the current user.
export function parentRegionIds(state){
 const active=state.regions.filter(r=>!r.deleted_at),ids=new Set(active.map(r=>r.id));
 return new Set(active.filter(r=>(Object.hasOwn(r,'covered_region_ids')?r.covered_region_ids:state.functions.flatMap(f=>f.covers?.[r.id]||[])).some(id=>ids.has(id))).map(r=>r.id));
}
export function pikettRegionMap(state,{layers},{parents=parentRegionIds(state)}={}){
 const active=state.regions.filter(r=>!r.deleted_at);
 const names=new Map();for(const r of active.filter(r=>!parents.has(r.id))){const id=polygonId(r);if(id===null)continue;if(!names.has(id))names.set(id,[]);names.get(id).push({id:r.id,name:r.name});}
 return {type:'FeatureCollection',features:layers.flatMap(layer=>layer.geojson.features.filter(f=>names.has(String(f.properties.GEO_ID))).map(f=>({type:'Feature',properties:{GEO_ID:String(f.properties.GEO_ID),Beschreibung:names.get(String(f.properties.GEO_ID)).map(r=>r.name).join(', '),regions:names.get(String(f.properties.GEO_ID))},geometry:f.geometry})))};
}
