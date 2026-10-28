import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../data-cleanup.js';
import {planWildhutGeoRename,wildhutGeoIds} from '../wildhut-geo-migration.js';
import {undoPlanning} from '../planning-undo.js';
function fixture(){
 const s=emptyState(),codes=Object.keys(wildhutGeoIds);
 s.regions=codes.map(id=>({id,name:'Beschreibung '+id,region_group_ids:['WH01']}));s.regions.push({id:'alias',name:'Alias',polygon_geo_id:'WH01'});
 s.departments=[{id:'D',name:'Abteilung'}];s.groups=[{id:'G',department_id:'D',geo_ids:codes}];s.region_groups=[{id:'WH01',name:'Gebietsgruppe',function_ids:['F']}];
 s.functions=[{id:'F',name:'Dienst',geo_ids:codes,covers:{WH01:['WH02','WH03']}},{id:'W',name:'Immer',duty_time_model:'always',geo_ids:codes,covers:{}},{id:'WH01',name:'Ortsunabhängig',geo_ids:[],covers:{}}];
 s.people=[{employee_id:'WH01',name:'Person WH01',department_id:'D',group_ids:['G'],contacts:[],function_regions:[{function_id:'W',geo_id:'WH01',priority:0}]}];
 const a={assignment_id:'a',employee_id:'WH01',function_id:'F',geodependency:'WH01',priority:1,start_on:'2026-10-22T08:00:00+02:00',end_on:'2026-10-22T18:00:00+02:00',revision:2};s.assignments=[a];s.outbox=[{action:'create',...a,revision:3}];s.els.assignments.a={...a,revision:4};s.exports=[{payload:{export_id:'old-file',changes:[{action:'create',...a,revision:5}]}}];
 s.assignment_styles={a:{color:'#123456'}};s.planning_undo=[{token:'undo',entries:[{key:'a',revision:5,before:{...a,geodependency:'WH02',revision:1},after:{...a},style:null,afterStyle:{color:'#123456'}}]}];
 s.rules=[{id:'WH01',function_id:'F',geo_id:'WH01',mode:'continuous',windows:[]}];s.favorites=[{id:'favorite',function_id:'F',region_ids:['WH01','WH02'],revision:2}];
 const layers=[{id:'wildhut',name:'Wildhut',geojson:{type:'FeatureCollection',features:codes.map(id=>({type:'Feature',properties:{GEO_ID:id,Beschreibung:'Fläche '+id},geometry:{type:'Polygon',coordinates:[[[9,47],[9.1,47],[9.1,47.1],[9,47.1],[9,47]]]}}))}}];
 const users=[{id:'u',revision:1,access_scope:JSON.stringify({department_ids:['WH01'],region_ids:['WH01','WH10']})},{id:'legacy',revision:7,access_scope:JSON.stringify({region_id:'WH09'})}];return {s,layers,users};
}
test('All ten Wildhut IDs and their typed references change without rewriting unrelated IDs or historic export files',()=>{
 const {s,layers,users}=fixture();s.regions[0].covered_region_ids=['WH01','WH09'];const original=JSON.stringify({s,layers,users}),plan=planWildhutGeoRename(s,layers,users);
 assert.deepEqual(plan.state.regions.slice(0,10).map(r=>r.id),Object.values(wildhutGeoIds));
 assert.equal(plan.state.regions.at(-1).polygon_geo_id,'WH_SG_1');assert.equal(plan.layers[0].geojson.features[0].properties.GEO_ID,'WH_AI_Oegg');
 assert.deepEqual(plan.state.regions[0].covered_region_ids,['WH_SG_1','WH_AI_App']);
 assert.deepEqual(plan.state.functions[0].covers,{WH_SG_1:['WH_SG_2','WH_SG_3']});assert.equal(plan.state.people[0].function_regions[0].geo_id,'WH_SG_1');assert.equal(plan.state.people[0].function_regions[0].priority,0);
 assert.equal(plan.state.people[0].employee_id,'WH01');assert.equal(plan.state.functions[2].id,'WH01');assert.equal(plan.state.region_groups[0].id,'WH01');assert.deepEqual(plan.state.regions[0].region_group_ids,['WH01']);assert.equal(plan.state.rules[0].id,'WH01');assert.equal(plan.state.rules[0].geo_id,'WH_SG_1');
 assert.deepEqual(plan.state.favorites[0].region_ids,['WH_SG_1','WH_SG_2']);assert.equal(plan.state.favorites[0].revision,3);
 assert.deepEqual(JSON.parse(plan.users[0].access_scope),{department_ids:['WH01'],region_ids:['WH_SG_1','WH_AI_Oegg']});assert.deepEqual(JSON.parse(plan.users[1].access_scope),{region_id:'WH_AI_App'});assert.equal(plan.users[1].revision,8);
 assert.equal(plan.state.assignments[0].revision,6);assert.equal(plan.state.assignments[0].geodependency,'WH_SG_1');assert.equal(plan.state.outbox.length,1);assert.equal(plan.state.outbox[0].action,'update');assert.equal(plan.state.outbox[0].revision,6);
 assert.deepEqual(plan.state.exports,s.exports);assert.deepEqual(plan.state.els,s.els);assert.deepEqual(plan.state.assignment_styles,s.assignment_styles);assert.equal(JSON.stringify({s,layers,users}),original);
 assert.equal(planWildhutGeoRename(plan.state,plan.layers,plan.users),null);
});
test('Undo remains valid after the identifier translation and never restores an old geographic ID',()=>{
 const {s,layers,users}=fixture(),plan=planWildhutGeoRename(s,layers,users);undoPlanning(plan.state,'undo');
 assert.equal(plan.state.assignments[0].geodependency,'WH_SG_2');assert.equal(plan.state.assignments[0].revision,7);
});
test('Existing target IDs, polygon collisions and conflicting affiliations are rejected without partial changes',()=>{
 for(const kind of ['region','polygon','person']){
  const {s,layers,users}=fixture();
  if(kind==='region')s.regions.push({id:'WH_SG_1',name:'Bereits vorhanden'});
  if(kind==='polygon')layers[0].geojson.features.push({...layers[0].geojson.features[0],properties:{GEO_ID:'WH_SG_1'}});
  if(kind==='person')s.people[0].function_regions.push({function_id:'W',geo_id:'WH_SG_1',priority:2});
  const before=JSON.stringify({s,layers,users});assert.throws(()=>planWildhutGeoRename(s,layers,users),/Kennungsänderung/);assert.equal(JSON.stringify({s,layers,users}),before);
 }
});
test('New ELS exports use the renamed region while historical payloads retain their original contents',async()=>{
 const {makeExport}=await import('../domain.js');const {s,layers,users}=fixture(),plan=planWildhutGeoRename(s,layers,users),historical=JSON.stringify(plan.state.exports[0]);
 const payload=makeExport(plan.state,'delta',Date.parse('2026-10-22T06:00:00Z'));
 assert.equal(payload.changes.filter(a=>a.action==='create').length,1);assert.equal(payload.changes.find(a=>a.action==='create').geodependency,'WH_SG_1');assert.equal(JSON.stringify(plan.state.exports[0]),historical);
});
