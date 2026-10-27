import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../data-cleanup.js';
import {eligibleAlwaysPersonGroups,alwaysPersonContextProblem,personAffiliationProblem} from '../public/person-affiliation-rules.js';
import {validatePersonAffiliations} from '../people.js';
import {createAlwaysPerson} from '../always-planning.js';
const fixture=()=>{
 const s=emptyState();s.departments=[{id:'D',name:'Wildhüter'}];s.groups=[{id:'G1',name:'Wildhut SG',department_id:'D',geo_ids:['WH_AI_Oegg']},{id:'G2',name:'Wildhut AI',department_id:'D',geo_ids:['WH_AI_Oegg']}];s.functions=[{id:'W',name:'Wildhüter',duty_time_model:'always',geo_ids:['WH_AI_Oegg'],covers:{}}];s.regions=[{id:'WH_AI_Oegg',name:'Wildhut AI Oberegg',region_group_ids:['RG']}];s.region_groups=[{id:'RG',name:'AI',group_ids:['G2']}];return s;
};
test('New person groups reflect region-group restrictions, even within the same department',()=>{
 const s=fixture();assert.deepEqual(eligibleAlwaysPersonGroups(s,'W','WH_AI_Oegg','D').map(g=>g.id),['G2']);assert.match(alwaysPersonContextProblem(s,'W','WH_AI_Oegg','D','G1'),/Gebiet.*Abteilung, Gruppe oder Funktion/);assert.equal(alwaysPersonContextProblem(s,'W','WH_AI_Oegg','D','G2'),null);assert.ok(alwaysPersonContextProblem(s,'W','WH_AI_Oegg','D',null));
 const input={function_id:'W',geo_id:'WH_AI_Oegg',planning_department_id:'D',person:{first_name:'Test',last_name:'Pikettnummer',department_id:'D',group_ids:['G1'],contacts:[]}},before=structuredClone(s);assert.throws(()=>createAlwaysPerson(s,input,{role:'admin'}),/Gebiet „Wildhut AI Oberegg“/);assert.deepEqual(s,before);const created=createAlwaysPerson(s,{...input,person:{...input.person,group_ids:['G2']}},{role:'admin'});assert.deepEqual(created.function_regions,[{function_id:'W',geo_id:'WH_AI_Oegg',priority:0}]);
});
test('Incompatible function and region group restrictions do not suggest an invalid group',()=>{
 const s=fixture();s.functions[0].group_ids=['G1'];assert.deepEqual(eligibleAlwaysPersonGroups(s,'W','WH_AI_Oegg','D'),[]);assert.match(personAffiliationProblem(s,{department_id:'D',group_ids:['G2']},{function_id:'W',geo_id:'WH_AI_Oegg'}),/Funktion „Wildhüter“.*Gruppe/);
});
test('Unrestricted persons can omit a group, inherited group regions are accepted, and missing region choices are explained',()=>{
 const s=fixture();s.region_groups=[];s.regions[0].region_group_ids=[];assert.equal(alwaysPersonContextProblem(s,'W','WH_AI_Oegg','D',null),null);
 s.groups[0].geo_ids=[];s.region_groups=[{id:'RG',group_ids:['G1']}];s.regions[0].region_group_ids=['RG'];assert.equal(alwaysPersonContextProblem(s,'W','WH_AI_Oegg','D','G1'),null);
 s.functions[0].geo_ids=['OTHER'];assert.match(personAffiliationProblem(s,{department_id:'D',group_ids:['G1']},{function_id:'W',geo_id:'WH_AI_Oegg'}),/nicht zugeordnet/);
});
test('Detailed validation still preserves an unchanged historical affiliation',()=>{
 const s=fixture(),p={department_id:'D',group_ids:['G1'],function_regions:[{function_id:'W',geo_id:'WH_AI_Oegg',priority:2}]};assert.doesNotThrow(()=>validatePersonAffiliations(s,p,structuredClone(p)));assert.throws(()=>validatePersonAffiliations(s,p),/Gebiet „Wildhut AI Oberegg“/);
});
