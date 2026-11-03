import test from 'node:test';
import assert from 'node:assert/strict';
import {regionCenter,searchRegions} from '../public/region-search.js';
import {geometryContains} from '../public/region-point.js';
import {regionFixture} from '../scripts/fixtures/pikett-region.js';
import {scopedState} from '../access-scope.js';
const feature=coordinates=>({geometry:{type:'Polygon',coordinates}});
test('Region search matches names/Geo IDs and returns only permitted active regions with polygons',()=>{
 const {state,mapData}=regionFixture();state.regions[0].name='Wéstgebiet';state.regions.push({id:'NONE',name:'Gebiet ohne Polygon'});
 assert.deepEqual(searchRegions(state,mapData,'WEST').map(r=>r.region_id),['R1']);
 assert.equal(searchRegions(state,mapData,'r1')[0].region_id,'R1');state.regions[0].id='J012';state.regions[0].polygon_geo_id='SHAPE-A';assert.equal(searchRegions(state,mapData,'j012')[0].region_id,'J012');
 state.regions[0].deleted_at='2026-11-01';assert.equal(searchRegions(state,mapData,'West').length,0);
 const {state:s,mapData:m}=regionFixture(),scoped=scopedState(s,{role:'user',access_scope:{region_ids:['R1']}});assert.deepEqual(searchRegions(scoped,m,'gebiet').map(r=>r.region_id),['R1']);
 for(const q of ['',null,[], 'a','x'.repeat(301)])assert.throws(()=>searchRegions(s,m,q));
});
test('Region centre stays inside rectangles, concave shapes, holes and largest multipart components',()=>{
 const box=(x,y,r)=>[[x,y],[x+r,y],[x+r,y+r],[x,y+r],[x,y]];
 assert.deepEqual(regionCenter([feature([box(9,47,1)])]),{lat:47.5,lng:9.5});
 const concave=feature([[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4],[0,0]]]);
 const hole=feature([box(0,0,4),box(1,1,2)]);
 const multi={geometry:{type:'MultiPolygon',coordinates:[[box(20,20,1)],[box(0,0,4)]]}};
 for(const f of [concave,hole,multi]){const p=regionCenter([f]);assert.ok(geometryContains(f.geometry,[p.lng,p.lat]));}
 assert.deepEqual(regionCenter([multi]),{lat:2,lng:2});assert.equal(regionCenter([]),null);
});
test('Parent regions remain searchable without adding parent polygons to the map',()=>{
 const {state,mapData}=regionFixture();Object.assign(state.regions[2],{polygon_geo_id:'SHAPE-A',covered_region_ids:['R1','R2']});
 const results=searchRegions(state,mapData,'Gesamtgebiet');assert.equal(results[0].region_id,'WHOLE');assert.ok(results[0].point);
});
