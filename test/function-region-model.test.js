import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../data-cleanup.js';
import {normalizeFunctionRegionModel,assignImportedFunctionRegions} from '../function-region-migration.js';
import {withRegionGroups} from '../public/region-groups.js';
import {coveredRegionIds,validateRegionCoverage} from '../public/coverage-regions.js';
import {coverage,prepareCoverage,instant,makeExport} from '../domain.js';
import {personMonth} from '../person-planning.js';
import {pikettByRegion} from '../public/pikett-region-data.js';
import {publicState} from '../master-data.js';
const fixture=()=>{
 const s=emptyState();s.departments=[{id:'D',name:'Untersuchungsamt'}];s.groups=[{id:'G',name:'JUGA',department_id:'D'}];s.region_groups=[{id:'RG',name:'UA-Gebiete',function_ids:['F']}];s.regions=['ALL','N1','N2','EXTRA'].map(id=>({id,name:id,region_group_ids:id==='EXTRA'?[]:['RG']}));s.functions=[{id:'F',name:'JUGA Pikett',geo_ids:['ALL','N1','N2','EXTRA'],covers:{ALL:['N1','N2']}},{id:'LOCAL',name:'Ohne Gebietsgruppe',geo_ids:['EXTRA'],covers:{}}];s.people=[{employee_id:'P',name:'Testperson',source:'manual',department_id:'D',group_ids:['G'],contacts:[]}];s.assignments=[{assignment_id:'A',employee_id:'P',function_id:'F',geodependency:'ALL',priority:1,start_on:'2026-10-27T00:00:00+01:00',end_on:'2026-10-28T00:00:00+01:00',revision:1}];s.rules=[{id:'R',function_id:'F',geo_id:'N1',mode:'continuous',windows:[]}];return s;
};
test('Migration removes individual function regions, preserves duties and moves coverage into the region definition',()=>{
 const s=fixture(),duties=structuredClone(s.assignments),people=structuredClone(s.people);assert.ok(normalizeFunctionRegionModel(s));assert.deepEqual(s.functions[0].geo_ids,[]);assert.deepEqual(s.functions[0].covers,{});assert.deepEqual(s.regions[0].covered_region_ids,['N1','N2']);assert.deepEqual(s.assignments,duties);assert.deepEqual(s.people,people);assert.equal(s.outbox.length,0);
 const view=withRegionGroups(s);assert.deepEqual(view.functions[0].geo_ids,['ALL','N1','N2']);assert.deepEqual(view.functions[1].geo_ids,[]);s.assignments.push({...duties[0],assignment_id:'OLD-LOCAL',function_id:'LOCAL',geodependency:'EXTRA'});assert.equal(personMonth(s,'2026-10','LOCAL').rows[0].bars[0].assignment_id,'OLD-LOCAL');
 const saved=JSON.stringify(s);assert.equal(normalizeFunctionRegionModel(s),null);assert.equal(JSON.stringify(s),saved);
});
test('Whole region covers parts exclusively in control coverage; planning, map list and ELS retain the actual region',()=>{
 const s=fixture();normalizeFunctionRegionModel(s);const at=instant('2026-10-27T00:00:00+01:00'),end=instant('2026-10-28T00:00:00+01:00');assert.equal(coverage(prepareCoverage(s,at,end),'F','N1',at,end).status,'vollständig besetzt');
 assert.equal(coverage(prepareCoverage(s,at,end,{includeCoveredRegions:false}),'F','N1',at,end).status,'unbesetzt');const planning=personMonth(s,'2026-10','F',['N1']);assert.ok(planning.rows.every(r=>r.bars.length===0));assert.equal(planning.coverage_statuses[26],'unbesetzt');assert.equal(personMonth(s,'2026-10','F',['ALL']).rows[0].bars.length,1);
 const map={layers:[{geojson:{features:[{properties:{GEO_ID:'N1'},geometry:{type:'Polygon',coordinates:[[[9,47],[10,47],[10,48],[9,47]]]}}]}}]};assert.equal(pikettByRegion(publicState(s),map,'2026-10-27T12:00:00+01:00',47.2,9.5).rows.length,0);
 const exported=makeExport(s,'snapshot',at);assert.ok(exported.changes.length>0);assert.ok(exported.changes.every(a=>a.geodependency==='ALL'));assert.equal(s.assignments[0].geodependency,'ALL');
});
test('Nested whole regions resolve safely, and invalid or cyclic definitions are rejected',()=>{
 const s=fixture();s.regions[0].covered_region_ids=['N1'];s.regions[1].covered_region_ids=['N2'];assert.deepEqual(coveredRegionIds(s,'F','ALL'),['N1','N2']);assert.throws(()=>validateRegionCoverage(s,{...s.regions[2],covered_region_ids:['ALL']}),/Kreis/);assert.throws(()=>validateRegionCoverage(s,{...s.regions[0],covered_region_ids:['ALL']}),/selbst/);assert.throws(()=>validateRegionCoverage(s,{...s.regions[0],covered_region_ids:['MISSING']}),/bestehende/);
});
test('An imported geographic function receives a visible region group instead of individual region settings',()=>{
 const s=fixture();normalizeFunctionRegionModel(s);const fn=s.functions[1];assignImportedFunctionRegions(s,fn,['EXTRA']);assert.deepEqual(fn.geo_ids,[]);assert.deepEqual(withRegionGroups(s).functions[1].geo_ids,['EXTRA']);assert.ok(s.region_groups.some(g=>g.import_function_id==='LOCAL'));const count=s.region_groups.length;assignImportedFunctionRegions(s,fn,['EXTRA']);assert.equal(s.region_groups.length,count);
});

test('Control drilldown includes all active parent regions without selecting siblings or changing duties',async()=>{
 const {regionIdsWithParents}=await import('../public/coverage-regions.js');const s=fixture();normalizeFunctionRegionModel(s);
 s.regions.push({id:'OUTER',covered_region_ids:['ALL']},{id:'SECOND',covered_region_ids:['N1']},{id:'ARCHIVED',covered_region_ids:['N1'],deleted_at:'2026-01-01'});
 const before=structuredClone(s);assert.deepEqual(regionIdsWithParents(s,'F','N1'),['N1','ALL','SECOND','OUTER']);assert.deepEqual(regionIdsWithParents(s,'F','ALL'),['ALL','OUTER']);assert.deepEqual(regionIdsWithParents(s,'F','EXTRA'),['EXTRA']);assert.deepEqual(regionIdsWithParents(s,'F',null),[]);assert.deepEqual(regionIdsWithParents(s,'F','missing'),[]);assert.deepEqual(s,before);
 s.regions.find(r=>r.id==='OUTER').covered_region_ids.push('OUTER');assert.deepEqual(regionIdsWithParents(s,'F','N1'),['N1','ALL','SECOND','OUTER']);
 const legacy=fixture();assert.deepEqual(regionIdsWithParents(legacy,'F','N1'),['N1','ALL']);
});

test('Control hides whole-region rows only when a child row of the same function is displayed',async()=>{
 const {controlRowsWithoutParents}=await import('../public/coverage-regions.js');const s=fixture();normalizeFunctionRegionModel(s);s.regions.push({id:'OUTER',covered_region_ids:['ALL']});
 const rows=[{function_id:'F',geo_id:'OUTER'},{function_id:'F',geo_id:'ALL'},{function_id:'F',geo_id:'N1'},{function_id:'F',geo_id:'EXTRA'},{function_id:'LOCAL',geo_id:'ALL'},{function_id:'LOCAL',geo_id:null}];
 const before=structuredClone(rows);assert.deepEqual(controlRowsWithoutParents(s,rows),rows.slice(2));assert.deepEqual(rows,before);
 assert.deepEqual(controlRowsWithoutParents(s,rows.slice(0,1)),rows.slice(0,1));
 assert.deepEqual(controlRowsWithoutParents(s,[rows[1],{function_id:'LOCAL',geo_id:'N1'}]),[rows[1],{function_id:'LOCAL',geo_id:'N1'}]);
 assert.deepEqual(controlRowsWithoutParents(s,[]),[]);
});
