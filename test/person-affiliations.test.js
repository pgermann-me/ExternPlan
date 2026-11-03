import test from 'node:test';
import assert from 'node:assert/strict';
import {manualPerson,personDetails,validatePersonAffiliations} from '../people.js';
import {scopedPersonInput,accessPolicy} from '../access-scope.js';
const fixture=()=>({people:[],groups:[],departments:[],functions:[{id:'F',geo_ids:['N','S'],covers:{}},{id:'I',geo_ids:[],covers:{}}],regions:[{id:'N'},{id:'S'}],assignments:[],favorites:[]});
test('Alle Personen können Geburtsdatum und mehrere priorisierte Funktions-/Gebietszuordnungen erhalten',()=>{
 const input={first_name:'Anna',last_name:'Test',birth_date:'1972-04-19',function_regions:[{function_id:'F',geo_id:'N',priority:3},{function_id:'F',geo_id:'S',priority:2},{function_id:'I',geo_id:null,priority:1}]};const p=manualPerson(input,null,'P');validatePersonAffiliations(fixture(),p);assert.deepEqual(p.function_regions,input.function_regions);const changed=manualPerson({...input,function_regions:input.function_regions.slice(1)},p);assert.equal(changed.function_regions.length,2);
 const sap={employee_id:'SAP',source:'SAP',name:'Bestand',external_id:'KEEP'};const updated={...sap,...personDetails(input,sap)};assert.equal(updated.source,'SAP');assert.equal(updated.external_id,'KEEP');assert.equal(updated.birth_date,'1972-04-19');assert.equal(updated.function_regions.length,3);
 assert.equal(manualPerson({first_name:'A',last_name:'B'},{...p,external_id:'KEEP'}).external_id,'KEEP');
});
test('Duplikate, unbekannte Gebiete, falsche Prioritäten und unzulässige Kombinationen abweisen',()=>{
 const valid={function_id:'F',geo_id:'N',priority:1};for(const rows of [[valid,valid],[{...valid,priority:-1}],[{...valid,priority:1.5}],[{...valid,function_id:''}]])assert.throws(()=>personDetails({function_regions:rows}));
 for(const row of [{...valid,geo_id:'X'},{...valid,function_id:'UNKNOWN'},{...valid,geo_id:null}])assert.throws(()=>validatePersonAffiliations(fixture(),{function_regions:[row]}));
 const s=fixture();s.functions[0].department_ids=['ONLY'];assert.throws(()=>validatePersonAffiliations(s,{function_regions:[valid]}));
});
test('Eingeschränkte Planer erhalten verborgene Zuordnungen und dürfen keine fremden hinzufügen',()=>{
 const s=fixture(),user={role:'planner',access_scope:{region_ids:['N']}},p={employee_id:'P',group_ids:[],function_regions:[{function_id:'F',geo_id:'N',priority:1},{function_id:'F',geo_id:'S',priority:2}]};s.people.push(p);
 const policy=accessPolicy(s,user);assert.equal(policy.projectPerson(p).function_regions.length,1);
 const input=scopedPersonInput(s,user,{group_ids:[],function_regions:[{function_id:'F',geo_id:'N',priority:3}]},p);assert.deepEqual(input.function_regions,[{function_id:'F',geo_id:'N',priority:3},{function_id:'F',geo_id:'S',priority:2}]);
 assert.throws(()=>scopedPersonInput(s,user,{group_ids:[],function_regions:[{function_id:'F',geo_id:'S',priority:1}]},p),{status:403});
});

test('Priority zero and omitted priority mean no rank; regular services retain their positive default',async()=>{
 const {personRegionPriority}=await import('../public/organization.js');
 const details=personDetails({function_regions:[{function_id:'F',geo_id:'N'},{function_id:'F',geo_id:'S',priority:0}]});
 assert.deepEqual(details.function_regions.map(r=>r.priority),[0,0]);assert.equal(personRegionPriority(details,'F','N',3),3);
});
