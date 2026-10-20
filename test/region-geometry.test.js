import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {polygonId,polygonCatalog,regionPolygonLayers} from '../public/region-geometry.js';
const data={layers:[['Amtsarzt_Gebiete.geojson','Amtsarzt'],['UA_Regionen.geojson','Untersuchungsämter'],['Wildhut_Kanton_SG.geojson','Wildhut']].map(([filename,name])=>({name,filename,geojson:JSON.parse(readFileSync(new URL('../map-data/'+filename,import.meta.url)))}))};
test('Gebiete werden per Geo-ID automatisch oder explizit verknüpft, ohne falsche Namenszuordnung',()=>{
 assert.equal(regionPolygonLayers(data,{id:'AMA89'})[0].geojson.features[0].properties.Beschreibung,'Region Wil/Uzwil/Gossau');
 assert.equal(regionPolygonLayers(data,{id:'alias',polygon_geo_id:'UA_AI'})[0].geojson.features.length,3);
 assert.equal(regionPolygonLayers(data,{id:'AMA89',polygon_geo_id:null}).length,0);
 assert.equal(regionPolygonLayers(data,{id:'unbekannt',name:'Region Rheintal'}).length,0);
 assert.equal(polygonId({id:'alias',polygon_geo_id:'AMA03'}),'AMA03');assert.equal(polygonCatalog(data).length,15);
});
