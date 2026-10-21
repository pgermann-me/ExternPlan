import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGeojson,mapGeojson,geojsonConflicts,prepareGeojsonImport} from '../geojson-import.js';
const ring=[[9,47],[9.1,47],[9.1,47.1],[9,47]];
const feature=(id='G1',name='Gebiet Eins',geometry={type:'Polygon',coordinates:[ring]})=>({type:'Feature',properties:{kennung:id,titel:name,unused:'nicht übernehmen'},geometry});
const collection=(features=[feature()])=>({type:'FeatureCollection',features});
const mapping={geo_id:'kennung',description:'titel'};
test('GeoJSON-Felder werden explizit zugeordnet; mehrere Teilflächen und MultiPolygone bleiben erhalten',()=>{
 const data=collection([feature(),feature(),feature(0,'Null',{type:'MultiPolygon',coordinates:[[ring],[ring]]})]);
 assert.deepEqual(inspectGeojson(data).headers,['kennung','titel','unused']);const mapped=mapGeojson(data,mapping);assert.deepEqual(mapped.regions,[{id:'G1',name:'Gebiet Eins',parts:2},{id:'0',name:'Null',parts:2}]);assert.deepEqual(mapped.geojson.features[0].properties,{GEO_ID:'G1',Beschreibung:'Gebiet Eins'});assert.equal(mapped.geojson.features[2].geometry.coordinates.length,2);
 assert.deepEqual(geojsonConflicts([{geojson:mapped.geojson}],mapped),['G1','0']);
});
test('Ungültige Geometrie, Projektion und fehlende Werte verhindern den Import',()=>{
 for(const data of [collection([]),collection([feature('A','A',{type:'Point',coordinates:[9,47]})]),collection([feature('A','A',{type:'Polygon',coordinates:[ring.slice(0,-1)]})]),collection([feature('A','A',{type:'Polygon',coordinates:[[[2600000,1200000],[9,47],[9,48],[2600000,1200000]]]})]),{...collection(),crs:{properties:{name:'EPSG:2056'}}}])assert.throws(()=>inspectGeojson(data));
 assert.throws(()=>mapGeojson(collection(),{geo_id:'missing',description:'titel'}));assert.throws(()=>mapGeojson(collection([feature('','Name')]),mapping));assert.throws(()=>mapGeojson(collection([feature('A',null)]),mapping));assert.throws(()=>mapGeojson(collection([feature('A','Eins'),feature('A','Zwei')]),mapping));
});
test('Neue Gebiete sind optional; bestehende Stammdaten bleiben erhalten und Polygone werden nicht überschrieben',()=>{
 const state={regions:[{id:'G1',name:'Eigener Name',polygon_geo_id:null}],audit:[]},input={geojson:collection([feature(),feature('G2','Zwei')]),mapping,name:'Neue Karte',filename:'regionen.geojson',create_regions:true};
 const result=prepareGeojsonImport(state,[],input);assert.equal(result.summary.created,1);assert.equal(result.summary.existing,1);assert.equal(state.regions[0].name,'Eigener Name');assert.equal(state.regions[0].polygon_geo_id,null);assert.equal(state.regions[1].id,'G2');assert(!JSON.stringify(state.audit).includes('coordinates'));
 assert.throws(()=>prepareGeojsonImport(state,[result.layer],input),/bereits Polygone/);const separate={regions:[],audit:[]};prepareGeojsonImport(separate,[],{...input,create_regions:false});assert.equal(separate.regions.length,0);
});
