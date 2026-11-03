import {polygonId} from './region-geometry.js';
import {geometryContains} from './region-point.js';
// Use the centre of the largest polygon component, never an empty gap or a hole.
export function regionCenter(features){
 const parts=features.flatMap(f=>f.geometry?.type==='Polygon'?[f.geometry.coordinates]:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates:[]);
 const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
 parts.sort((a,b)=>area(b[0])-area(a[0]));
 for(const rings of parts){
  const outer=rings[0];if(!outer?.length)continue;
  const bounds=outer.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]),ys=outer.map(p=>p[1]),cx=(bounds[0]+bounds[2])/2,cy=(bounds[1]+bounds[3])/2,geometry={type:'Polygon',coordinates:rings};
  if(geometryContains(geometry,[cx,cy]))return {lat:cy,lng:cx};
  // Concave shapes and holes: find a central interior horizontal segment.
  const levels=[...new Set(ys)].sort((a,b)=>a-b),scan=[cy,...levels.slice(1).map((y,i)=>(levels[i]+y)/2)];
  for(const y of scan){
   const cuts=[];for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];if((a[1]>y)!==(b[1]>y))cuts.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
   }
   cuts.sort((a,b)=>a-b);const candidates=[];
   for(let i=1;i<cuts.length;i++){const x=(cuts[i-1]+cuts[i])/2;if(cuts[i]>cuts[i-1]&&geometryContains(geometry,[x,y]))candidates.push(x);}
   if(candidates.length){candidates.sort((a,b)=>Math.abs(a-cx)-Math.abs(b-cx));return {lat:y,lng:candidates[0]};}
  }
 }
 return null;
}
export function searchRegions(state,{layers},query){
 if(typeof query!=='string'||query.trim().length<2||query.trim().length>300)throw Error('Suchbegriff mit 2 bis 300 Zeichen eingeben');
 const normal=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('de-CH'),words=normal(query.trim()).split(/\s+/);
 const features=new Map();for(const layer of layers)for(const f of layer.geojson.features){const id=String(f.properties.GEO_ID);if(!features.has(id))features.set(id,[]);features.get(id).push(f);}
 return state.regions.filter(r=>!r.deleted_at&&words.every(w=>normal((r.name||'')+' '+r.id).includes(w))).sort((a,b)=>a.name.localeCompare(b.name,'de-CH')).flatMap(region=>{
  const point=regionCenter(features.get(polygonId(region))||[]);return point?[{kind:'region',label:region.name,region_id:region.id,point}]:[];
 }).slice(0,30);
}
