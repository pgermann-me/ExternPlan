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

test('Conversion can also consolidate an already regional function into the chosen target group',()=>{
 const s=setup();s.region_groups.push({id:'OLD-GROUP',name:'Bisherige Gebiete',function_ids:['F']});s.regions.push({id:'OLD-REGION',name:'Bisheriges Gebiet',region_group_ids:['OLD-GROUP']});s.assignments[0].geodependency='OLD-REGION';s.people[0].function_regions[0].geo_id='OLD-REGION';s.favorites[0].region_ids=['OLD-REGION'];const before=structuredClone(s);
 const result=prepareFunctionRegionConversion(s,'F',input);assert.deepEqual(s,before);assert.deepEqual(withRegionGroups(result.state).functions[0].geo_ids,['UA']);assert.equal(result.state.assignments[0].geodependency,'UA');assert.deepEqual(result.state.region_groups.find(g=>g.id==='OLD-GROUP').function_ids,[]);
});

test('Explicit geographic access extension resolves restrictive target/group permissions and previews every change',()=>{
 const s=setup();s.departments.push({id:'D2',name:'Andere Abteilung'});s.groups.push({id:'G2',name:'Andere Gruppe',department_id:'D2'});s.functions.push({id:'X',name:'Andere Funktion',geo_ids:[]});
 Object.assign(s.regions[0],{department_ids:['D2'],group_ids:['G2'],function_ids:['X']});Object.assign(s.region_groups[0],{department_ids:['D2'],group_ids:['G2'],function_ids:['X']});s.groups[0].geo_ids=[];
 const before=structuredClone(s);assert.throws(()=>prepareFunctionRegionConversion(s,'F',input),/Test Person.*nicht.*freigegeben/);
 const request={...input,extend_region_access:true},r=prepareFunctionRegionConversion(s,'F',request);assert.deepEqual(s,before);
 assert.equal(r.state.assignments[0].geodependency,'UA');assert.deepEqual(r.state.regions[0].department_ids,['D2','D']);assert.deepEqual(r.state.regions[0].group_ids,['G2','G']);assert.deepEqual(r.state.regions[0].function_ids,['X','F']);assert.deepEqual(r.state.region_groups[0].department_ids,['D2','D']);assert.deepEqual(r.state.region_groups[0].function_ids,['X','F']);assert.deepEqual(r.state.groups[0].geo_ids,['UA']);
 assert.deepEqual(r.summary.access_changes.map(c=>c.type),['regions','region_groups','groups']);assert.ok(r.summary.access_changes.every(c=>c.details.length));assert.ok(r.state.audit.some(a=>a.entity==='regions'));
 assert.notEqual(regionConversionToken(s,'F',input),regionConversionToken(s,'F',request));const token=regionConversionToken(s,'F',request);s.groups[0].geo_ids=['UA'];assert.notEqual(regionConversionToken(s,'F',request),token);
 s.favorites[0].color='invalid';const bad=structuredClone(s);assert.throws(()=>prepareFunctionRegionConversion(s,'F',request),/farbe/i);assert.deepEqual(s,bad);
});
test('Access extension explicitly reports unrestricted geographic scopes for people without organization memberships',()=>{
 const s=setup();s.people[0].department_id=null;s.people[0].group_ids=[];s.region_groups[0].group_ids=['G'];s.regions[0].department_ids=['D'];
 const r=prepareFunctionRegionConversion(s,'F',{...input,extend_region_access:true});assert.deepEqual(r.state.region_groups[0].department_ids,[]);assert.deepEqual(r.state.region_groups[0].group_ids,[]);assert.deepEqual(r.state.regions[0].department_ids,[]);assert.match(JSON.stringify(r.summary.access_changes),/alle.*ohne entsprechende Zuordnung/);
});
