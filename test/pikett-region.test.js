import test from 'node:test';
import assert from 'node:assert/strict';
import {geometryContains,regionsAtPoint,pikettRegionMap} from '../public/region-point.js';
import {pikettByRegion} from '../public/pikett-region-data.js';
import {regionFixture} from '../scripts/fixtures/pikett-region.js';
import {publicState} from '../master-data.js';
import {scopedState} from '../access-scope.js';
const at='2026-10-22T12:00:00+02:00';
test('Point containment supports multipolygons, holes, boundaries and explicit polygon links',()=>{
 const {state,mapData}=regionFixture(),a=mapData.layers[0].geojson.features[0].geometry,b=mapData.layers[0].geojson.features[1].geometry;
 assert.equal(geometryContains(a,[9.12,47.12]),false);assert.equal(geometryContains(a,[9.1,47.12]),true);assert.equal(geometryContains(a,[9,47.2]),true);assert.equal(geometryContains(a,[8,47]),false);
 assert.equal(geometryContains(b,[9.85,47.65]),true);assert.equal(geometryContains(b,[9.75,47.65]),false);
 assert.deepEqual(regionsAtPoint(state,mapData,[9.4,47.3]).map(r=>r.id),['R1','R2']);
 assert.deepEqual(regionsAtPoint(state,mapData,[9.12,47.12]),[]);
});
test('Point list includes strictly active duties, covering regions and permanent affiliations with priority',()=>{
 const {state,mapData}=regionFixture(),before=JSON.stringify(state),result=pikettByRegion(publicState(state),mapData,at,47.3,9.4);
 assert.deepEqual(result.rows.filter(r=>r.kind==='scheduled').map(r=>r.assignment_id),['active','whole']);
 assert.equal(result.rows.find(r=>r.assignment_id==='whole').region_ids.length,2);
 assert.deepEqual(result.rows.filter(r=>r.kind==='always'&&r.region_ids.includes('R1')).map(r=>r.priority),[1,2]);
 assert.ok(result.rows.some(r=>r.kind==='always'&&r.employee_id==='HIDDEN'));assert.ok(!JSON.stringify(result).includes('hidden@example.invalid'));
 assert.equal(JSON.stringify(state),before);assert.equal(pikettByRegion(state,mapData,at,46,8).rows.length,0);
 assert.ok(!pikettByRegion(state,mapData,'2026-10-22T18:00:00+02:00',47.3,9.4).rows.some(r=>r.assignment_id==='active'));
 assert.ok(pikettByRegion(state,mapData,'2026-10-22T08:00:00+02:00',47.3,9.4).rows.some(r=>r.assignment_id==='active'));
});
test('Permanent entries respect deleted records and function/region restrictions, without generating duties',()=>{
 const {state,mapData}=regionFixture();state.people[1].deleted_at=at;state.regions[0].function_ids=['F'];
 assert.equal(pikettByRegion(state,mapData,at,47.3,9.4).rows.filter(r=>r.kind==='always').length,1);
 state.functions[1].deleted_at=at;assert.equal(pikettByRegion(state,mapData,at,47.3,9.4).rows.filter(r=>r.kind==='always').length,0);assert.equal(state.assignments.length,4);
});
test('Scoped map and point list expose only allowed polygons, affiliations and service regions',()=>{
 const {state,mapData}=regionFixture(),s=publicState(scopedState(state,{role:'user',access_scope:{department_ids:['D'],group_ids:['G'],region_ids:['R1']}}));
 const map=pikettRegionMap(s,mapData);assert.equal(map.features.length,1);assert.equal(map.features[0].properties.GEO_ID,'SHAPE-A');assert.equal(JSON.stringify(map).includes('private'),false);
 const result=pikettByRegion(s,mapData,at,47.3,9.4);assert.deepEqual(result.regions.map(r=>r.id),['R1']);assert.ok(!JSON.stringify(result).includes('HIDDEN'));assert.ok(result.rows.every(r=>r.region_ids.every(id=>id==='R1')));
});
test('Point queries retain explicit offsets at the Swiss clock change',()=>{
 const {state,mapData}=regionFixture();state.assignments=[{...state.assignments[0],start_on:'2026-10-25T02:00:00+02:00',end_on:'2026-10-25T02:00:00+01:00'}];
 assert.equal(pikettByRegion(state,mapData,'2026-10-25T02:30:00+02:00',47.3,9.4).rows.filter(r=>r.kind==='scheduled').length,1);
 assert.equal(pikettByRegion(state,mapData,'2026-10-25T02:30:00+01:00',47.3,9.4).rows.filter(r=>r.kind==='scheduled').length,0);
 assert.throws(()=>pikettByRegion(state,mapData,at,NaN,9),/Kartenpunkt/);
});
test('Permanent responsibilities also inherit regions through region groups and ignore legacy generated duties',()=>{
 const {state,mapData}=regionFixture();state.functions[1].geo_ids=[];state.region_groups=[{id:'RG',name:'Gebietsgruppe',function_ids:['W']}];state.regions[0].region_group_ids=['RG'];
 state.assignments.push({...state.assignments[0],assignment_id:'old-always',function_id:'W'});
 const result=pikettByRegion(state,mapData,at,47.3,9.4);assert.equal(result.rows.filter(r=>r.kind==='always').length,2);assert.ok(!result.rows.some(r=>r.assignment_id==='old-always'));
});
