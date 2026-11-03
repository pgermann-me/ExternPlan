import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment} from '../domain.js';
import {withRegionGroups} from '../public/region-groups.js';
import {allowedFunctionRegions,personScopeAllows,validatePlanningGroup,controlFunctions} from '../public/organization.js';
import {scopedState} from '../access-scope.js';
import {permitted} from '../accounts.js';
import {publicState,deleteMaster} from '../master-data.js';
import {validatePersonAffiliations} from '../people.js';
const setup=()=>{
 const s=demo();s.region_groups=[{id:'RG',name:'Testgebietsgruppe',department_ids:['demo-abteilung'],group_ids:['demo-gruppe'],function_ids:['DEMO-ORT']}];
 s.regions[0].region_group_ids=['RG'];s.regions[1].region_group_ids=['RG'];
 s.departments.push({id:'D2',name:'Andere Abteilung'});s.groups.push({id:'G2',name:'Andere Gruppe',department_id:'D2'});
 return s;
};
const duty={employee_id:'DEMO-EXT-001',function_id:'DEMO-ORT',geodependency:'NORD',priority:1,start_on:'2026-10-01T07:00',end_on:'2026-10-02T07:00'};
test('Gebietsgruppen resolve regions for functions and groups without changing stored direct assignments',()=>{
 const s=setup(),before=JSON.stringify(s),view=publicState(s),fn=view.functions.find(f=>f.id==='DEMO-ORT');
 assert.deepEqual(fn.geo_ids,['NORD','SÜD']);assert.deepEqual(fn.configured_geo_ids,[]);
 assert.deepEqual(view.groups[0].geo_ids,['NORD','SÜD']);
 assert.deepEqual(allowedFunctionRegions(fn,view.groups[0],view.regions),['NORD','SÜD']);
 assert.deepEqual(allowedFunctionRegions(fn,view.groups[1],view.regions),[]);
 assert.ok(controlFunctions(view,'demo-gruppe','demo-abteilung').some(f=>f.id==='DEMO-ORT'));
 assert.equal(JSON.stringify(s),before);
 const prepared=withRegionGroups(s);assert.equal(withRegionGroups(prepared),prepared);
});
test('Group restrictions apply to assignments, affiliations and selected planning context',()=>{
 const s=setup();assert.equal(validateAssignment(s,duty).assignment.geodependency,'NORD');
 assert.throws(()=>validateAssignment(s,{...duty,employee_id:'DEMO-001'}),/Gebiet/);
 assert.throws(()=>validateAssignment(s,{...duty,function_id:'DEMO-KTD'}),/Gebiet/);
 assert.throws(()=>validatePlanningGroup(s,{...duty,planning_group_id:'G2',planning_department_id:'D2'}),/Gebiet/);
 validatePersonAffiliations(s,{...s.people[1],function_regions:[{function_id:'DEMO-ORT',geo_id:'NORD',priority:3}]});
 assert.equal(personScopeAllows(s,s.regions[0],s.people[0],'DEMO-ORT'),false);
 // Direct region restrictions remain an additional condition.
 s.regions[0].department_ids=['D2'];assert.throws(()=>validateAssignment(s,duty),/Gebiet/);
});
test('Membership changes are immediately reflected; deleted groups do not apply and used groups cannot be deleted',()=>{
 const s=setup();assert.throws(()=>deleteMaster(s,'region_groups','RG'),/verwendet/);
 s.regions[0].region_group_ids=[];s.regions[1].region_group_ids=[];deleteMaster(s,'region_groups','RG');
 assert.equal(publicState(s).region_groups.length,0);assert.equal(publicState(s).archived_master.region_groups.length,1);
 assert.deepEqual(publicState(s).functions.find(f=>f.id==='DEMO-ORT').geo_ids,[]);
});
test('Scoped API state hides unrelated group metadata and direct region IDs',()=>{
 const s=setup();s.region_groups[0].function_ids.push('DEMO-KTD');s.region_groups.push({id:'hidden',name:'Hidden group'});
 s.regions[2].region_group_ids=['hidden'];
 const view=publicState(scopedState(s,{role:'planner',access_scope:{department_ids:['demo-abteilung'],group_ids:['demo-gruppe'],region_ids:['NORD']}}));
 assert.deepEqual(view.regions.map(r=>r.id),['NORD']);assert.deepEqual(view.region_groups.map(g=>g.id),['RG']);assert.ok(view.people.some(p=>p.employee_id==='DEMO-EXT-001'));
 assert.ok(view.functions.every(f=>!f.geo_ids.includes('SÜD')&&!f.configured_geo_ids?.includes('SÜD')));
});

test('Gebietsgruppen configuration and bulk membership changes are admin-only',()=>{
 for(const role of ['user','planner'])for(const path of ['/api/regions/assign-group','/api/master/region_groups'])assert.equal(permitted(role,'POST',path),false);
 assert.equal(permitted('admin','POST','/api/regions/assign-group'),true);
});

test('A region may belong to multiple groups; compatible group assignments are alternatives',()=>{
 const s=setup();s.region_groups.push({id:'SECOND',name:'Zweite Zuordnung',department_ids:['D2'],group_ids:['G2'],function_ids:['DEMO-KTD']});
 s.regions[0].region_group_ids=['RG','SECOND'];
 const view=publicState(s),region=view.regions[0];
 assert.equal(personScopeAllows(view,region,{employee_id:'P2',department_id:'D2',group_ids:['G2']},'DEMO-KTD'),true);
 assert.equal(personScopeAllows(view,region,s.people[1],'DEMO-ORT'),true);
 assert.equal(personScopeAllows(view,region,s.people[1],'DEMO-KTD'),false);
 assert.deepEqual(view.functions.find(f=>f.id==='DEMO-ORT').geo_ids,['NORD','SÜD']);
 assert.throws(()=>deleteMaster(s,'region_groups','SECOND'),/verwendet/);
});
