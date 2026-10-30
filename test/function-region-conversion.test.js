import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../data-cleanup.js';
import {prepareFunctionRegionConversion,regionConversionToken} from '../function-region-conversion.js';
import {saveFavorite} from '../favorites.js';
import {withRegionGroups} from '../public/region-groups.js';
import {permitted} from '../accounts.js';
const setup=()=>{
 const s=emptyState();s.departments=[{id:'D',name:'Untersuchungsamt'}];s.groups=[{id:'G',name:'Gericht',department_id:'D',geo_ids:null}];s.region_groups=[{id:'RG',name:'Untersuchungsämter SG',function_ids:[],department_ids:['D']}];s.regions=[{id:'UA',name:'UA Kanton SG',region_group_ids:['RG'],covered_region_ids:[]}];s.functions=[{id:'F',name:'Haftrichter Pikett',geo_ids:[],covers:{},region_assignment_mode:'groups'}];s.people=[{employee_id:'P',name:'Test Person',department_id:'D',group_ids:['G'],function_regions:[{function_id:'F',geo_id:null,priority:3}]},{employee_id:'OLD',name:'Archiv',department_id:'OLD-D',deleted_at:'2026-01-01',function_regions:[{function_id:'F',geo_id:null,priority:4}]}];
 s.assignments=[{assignment_id:'A',employee_id:'P',function_id:'F',geodependency:null,priority:1,revision:7,start_on:'2099-10-01T07:00:00+02:00',end_on:'2099-10-02T07:00:00+02:00'},{assignment_id:'B',employee_id:'OLD',function_id:'F',geodependency:null,priority:2,revision:1,start_on:'2025-10-01T07:00:00+02:00',end_on:'2025-10-02T07:00:00+02:00'}];s.assignment_styles={A:{color:'#123abc',favorite_id:'existing'}};saveFavorite(s,{name:'Haftrichter',function_id:'F',scope_id:'F',scope_type:'function',region_ids:[],duration_minutes:1440,start_time:'07:00',priority:1,color:'#123abc'});return s;
};
const input={region_group_ids:['RG'],geo_id:'UA'};
test('Preview prepares one consistent conversion without changing stored duties, people or favorites',()=>{
 const s=setup(),before=structuredClone(s),result=prepareFunctionRegionConversion(s,'F',input);assert.deepEqual(s,before);const n=result.state;assert.deepEqual(withRegionGroups(n).functions[0].geo_ids,['UA']);assert.equal(result.summary.assignments,2);assert.equal(result.summary.past_assignments,1);assert.equal(result.summary.favorites,1);assert.equal(result.summary.people,2);
 for(let i=0;i<2;i++)assert.deepEqual(n.assignments[i],{...before.assignments[i],geodependency:'UA',revision:before.assignments[i].revision+1});assert.deepEqual(n.assignment_styles,before.assignment_styles);assert.equal(n.people[1].deleted_at,'2026-01-01');assert.deepEqual(n.people.map(p=>p.function_regions[0]),[{function_id:'F',geo_id:'UA',priority:3},{function_id:'F',geo_id:'UA',priority:4}]);assert.deepEqual(n.favorites[0].region_ids,['UA']);assert.equal(n.favorites[0].revision,before.favorites[0].revision+1);assert.deepEqual(n.rules,before.rules);assert.equal(n.outbox.length,2);assert.ok(n.outbox.every(c=>c.action==='update'));
});
test('Stale inputs and different targets have different tokens; invalid conversions leave all originals intact',()=>{
 const s=setup(),token=regionConversionToken(s,'F',input);assert.notEqual(token,regionConversionToken(s,'F',{...input,geo_id:'OTHER'}));s.assignments[0].revision++;assert.notEqual(token,regionConversionToken(s,'F',input));
 for(const patch of [{geo_id:'missing'},{region_group_ids:[]},{region_group_ids:['missing']}]){const before=structuredClone(s);assert.throws(()=>prepareFunctionRegionConversion(s,'F',{...input,...patch}));assert.deepEqual(s,before);}
 s.people[0].department_id='OTHER';s.people[0].group_ids=[];const before=structuredClone(s);assert.throws(()=>prepareFunctionRegionConversion(s,'F',input),/nicht.*freigegeben|nicht zulässig/);assert.deepEqual(s,before);
});
test('Only admins can preview/apply geographic function conversion',()=>{
 for(const role of ['user','planner'])for(const action of ['preview','apply'])assert.equal(permitted(role,'POST','/api/functions/F/region-conversion/'+action),false);assert.equal(permitted('admin','POST','/api/functions/F/region-conversion/apply'),true);
});

test('A conflict discovered after preparing services or favorites never changes the original state',()=>{
 const s=setup();s.favorites[0].color='invalid';let before=structuredClone(s);assert.throws(()=>prepareFunctionRegionConversion(s,'F',input),/farbe/i);assert.deepEqual(s,before);
 s.favorites[0].color='#123abc';s.assignments.push({...s.assignments[0],assignment_id:'DUPLICATE',geodependency:'old-region'});before=structuredClone(s);assert.throws(()=>prepareFunctionRegionConversion(s,'F',input),/Doppel/);assert.deepEqual(s,before);
});
