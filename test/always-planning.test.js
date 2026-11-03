import test from 'node:test';
import assert from 'node:assert/strict';
import {changeAlwaysAffiliation} from '../always-planning.js';
import {assertScopedMutation,scopedState} from '../access-scope.js';
import {pikettByRegion} from '../public/pikett-region-data.js';
import {regionFixture} from '../scripts/fixtures/pikett-region.js';
const admin={role:'admin'},input={employee_id:'P',function_id:'W',geo_id:'R2',action:'add'};
test('Permanent planning adds zero-priority affiliations, updates and removes without creating duties',()=>{
 const {state}=regionFixture(),assignments=structuredClone(state.assignments);state.people[0].function_regions.push({function_id:'F',geo_id:'R1',priority:4});
 assert.equal(changeAlwaysAffiliation(state,input,admin).affiliation.priority,0);
 assert.throws(()=>changeAlwaysAffiliation(state,input,admin),{status:409});
 changeAlwaysAffiliation(state,{...input,action:'update',priority:3,expected_priority:0},admin);
 assert.throws(()=>changeAlwaysAffiliation(state,{...input,action:'remove',expected_priority:0},admin),{status:409});
 changeAlwaysAffiliation(state,{...input,action:'remove',expected_priority:3},admin);
 assert.deepEqual(state.assignments,assignments);assert.equal(state.outbox.length,0);assert.equal(state.people[0].contacts.length,2);assert.equal(state.people[0].function_regions.find(r=>r.function_id==='F').priority,4);assert.equal(state.audit.length,3);
});
test('Validation rejects negative priorities, non-permanent functions, invalid regions and people outside the selected group',()=>{
 for(const patch of [{priority:-1},{priority:10},{priority:1.5},{function_id:'F'},{geo_id:'UNKNOWN'},{employee_id:'HIDDEN',planning_group_id:'G'}]){
  const {state}=regionFixture(),before=structuredClone(state);assert.throws(()=>changeAlwaysAffiliation(state,{...input,...patch},admin));assert.deepEqual(state,before);
 }
});
test('A scoped planning user may change visible affiliations and remove their last one, preserving hidden affiliations',()=>{
 const {state}=regionFixture(),user={role:'user',access_scope:{department_ids:['D'],group_ids:['G'],region_ids:['R1']}};
 state.people[0].function_regions.push({function_id:'W',geo_id:'R2',priority:3});
 let before=structuredClone(state);
 changeAlwaysAffiliation(state,{employee_id:'P',function_id:'W',geo_id:'R1',action:'update',priority:0,expected_priority:2},user);assertScopedMutation(before,state,user);
 assert.equal(state.people[0].function_regions.find(r=>r.geo_id==='R2').priority,3);
 before=structuredClone(state);changeAlwaysAffiliation(state,{employee_id:'P2',function_id:'W',geo_id:'R1',action:'remove',expected_priority:1},user);assertScopedMutation(before,state,user);assert.ok(!scopedState(state,user).people.some(p=>p.employee_id==='P2'));
 for(const patch of [{...input,action:'update',priority:1,expected_priority:3},{...input,employee_id:'HIDDEN'}])assert.throws(()=>changeAlwaysAffiliation(state,patch,user),{status:403});
 before=structuredClone(state);state.people[0].function_regions=[];assert.throws(()=>assertScopedMutation(before,state,user),{status:403});
});
test('Zero priority does not outrank explicit priority in the regional on-call list',()=>{
 const {state,mapData}=regionFixture();state.people[0].function_regions[0].priority=0;
 const rows=pikettByRegion(state,mapData,'2026-10-22T12:00:00+02:00',47.3,9.4).rows.filter(r=>r.kind==='always'&&r.region_ids.includes('R1'));
 assert.deepEqual(rows.map(r=>r.priority),[1,0]);
});

import {createAlwaysPerson} from '../always-planning.js';
test('Replacing a permanent responsibility is atomic, preserves priority and unrelated data, and detects conflicts',()=>{
 const {state}=regionFixture();state.people[1].function_regions=[];const assignments=structuredClone(state.assignments);
 const input={action:'replace',employee_id:'P',replacement_employee_id:'P2',function_id:'W',geo_id:'R1',expected_priority:2,planning_department_id:'D',planning_group_id:'G'};
 let before=structuredClone(state);changeAlwaysAffiliation(state,input,admin);assert.equal(state.people[0].function_regions.length,0);assert.deepEqual(state.people[1].function_regions,[{function_id:'W',geo_id:'R1',priority:2}]);assert.deepEqual(state.assignments,assignments);assert.equal(state.people[0].contacts.length,2);assert.equal(state.outbox.length,0);
 before=structuredClone(state);assert.throws(()=>changeAlwaysAffiliation(state,input,admin),{status:409});assert.deepEqual(state,before);
 for(const patch of [{employee_id:'P2',replacement_employee_id:'HIDDEN',expected_priority:2},{employee_id:'P2',replacement_employee_id:'P2',expected_priority:2}]){assert.throws(()=>changeAlwaysAffiliation(state,{...input,...patch},admin));assert.deepEqual(state,before);}
});
const createInput={function_id:'W',geo_id:'R1',priority:0,planning_department_id:'D',planning_group_id:'G',person:{first_name:'Neue',last_name:'Testperson',department_id:'D',group_ids:['G'],contacts:[{type:'phone_mobile',value:'+41790000000',priority:0}]}};
test('New permanent planning person receives context and affiliation and is scoped even for planning users',()=>{
 const {state}=regionFixture(),before=structuredClone(state),user={role:'user',access_scope:{department_ids:['D'],group_ids:['G'],region_ids:['R1']}};
 const p=createAlwaysPerson(state,createInput,user);assert.match(p.employee_id,/^EXT-/);assert.equal(p.department_id,'D');assert.deepEqual(p.group_ids,['G']);assert.deepEqual(p.function_regions,[{function_id:'W',geo_id:'R1',priority:0}]);assert.equal(p.contacts[0].value,'+41790000000');assertScopedMutation(before,state,user);assert.deepEqual(state.assignments,before.assignments);assert.equal(state.outbox.length,0);
 const prior=structuredClone(state);const replaced=createAlwaysPerson(state,{...createInput,priority:2,replace_employee_id:'P',expected_priority:2},user);assert.equal(state.people.find(p=>p.employee_id==='P').function_regions.length,0);assert.equal(replaced.function_regions[0].priority,2);assertScopedMutation(prior,state,user);
});
test('Creation and create-and-replace validate all inputs before changing either person',()=>{
 const user={role:'user',access_scope:{department_ids:['D'],group_ids:['G'],region_ids:['R1']}};
 for(const patch of [{function_id:'F'},{geo_id:'R2'},{priority:10},{replace_employee_id:'P',expected_priority:9},{person:{...createInput.person,department_id:'OTHER'}},{person:{...createInput.person,group_ids:[]}},{person:{...createInput.person,function_regions:[{function_id:'F',geo_id:'R1',priority:1}]}},{person:{...createInput.person,contacts:[{type:'phone_mobile',value:'x',priority:-1}]}}]){const {state}=regionFixture(),before=structuredClone(state);assert.throws(()=>createAlwaysPerson(state,{...createInput,...patch},user));assert.deepEqual(state,before);}
});
