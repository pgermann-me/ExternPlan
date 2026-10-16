import {personMonth} from '../person-planning.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment} from '../domain.js';
import {availableFunctions,allowedFunctionRegions,validateScopeRestrictions,validatePlanningGroup,personScopeAllows,controlFunctions} from '../public/organization.js';
const setup=()=>{const s=demo();s.departments.push({id:'D2',name:'Andere Abteilung'});s.groups.push({id:'G2',name:'Andere Gruppe',department_id:'D2'});return s;};
const duty={employee_id:'DEMO-EXT-001',function_id:'DEMO-KTD',geodependency:'NORD',priority:1,start_on:'2027-01-01T07:00',end_on:'2027-01-01T19:00'};
test('Functions allow multiple departments and groups; unconfigured records remain unrestricted',()=>{
 const s=setup(),f=s.functions[0];assert.equal(availableFunctions(s,'G2','D2').length,2);Object.assign(f,{department_ids:['demo-abteilung'],group_ids:['demo-gruppe']});
 assert.equal(availableFunctions(s,'G2','D2').length,1);assert.ok(availableFunctions(s,'demo-gruppe','demo-abteilung').includes(f));assert.ok(controlFunctions(s,'demo-gruppe','demo-abteilung').includes(f));
 assert.throws(()=>validatePlanningGroup(s,{...duty,planning_department_id:'D2'}),/Funktion/);assert.throws(()=>validateAssignment(s,{...duty,employee_id:'DEMO-001'}),/Funktion/);validateAssignment(s,duty);
 f.department_ids.push('D2');f.group_ids.push('G2');validateScopeRestrictions(s,'functions',f);assert.ok(availableFunctions(s,'G2','D2').includes(f));
});
test('Regions combine organization and function restrictions and the existing group region list',()=>{
 const s=setup(),r=s.regions[0],f=s.functions[0];Object.assign(r,{department_ids:['D2'],group_ids:['G2'],function_ids:['DEMO-KTD']});
 assert.deepEqual(allowedFunctionRegions(f,s.groups[0],s.regions),['SÜD','GANZ']);assert.deepEqual(allowedFunctionRegions(f,s.groups[1],s.regions),['NORD','SÜD','GANZ']);
 assert.throws(()=>validateAssignment(s,duty),/Gebiet/);s.people[1].group_ids=['demo-gruppe','G2'];validateAssignment(s,duty);
 r.function_ids=['DEMO-ORT'];assert.throws(()=>validateAssignment(s,duty),/Gebiet/);r.function_ids=[];validateAssignment(s,duty);
});
test('Selected restrictions are validated and must use groups from selected departments',()=>{
 const s=setup();for(const p of [{department_ids:['missing']},{group_ids:['G2','G2']},{department_ids:['demo-abteilung'],group_ids:['G2']},{function_ids:['missing']}])assert.throws(()=>validateScopeRestrictions(s,'regions',p));
 validateScopeRestrictions(s,'regions',{department_ids:[],group_ids:['G2'],function_ids:[]});
 s.groups[1].deleted_at='2026-10-16';assert.throws(()=>validateScopeRestrictions(s,'functions',{group_ids:['G2']}));
});
test('Multi-group people must match a selected group and its department together',()=>{
 const s=setup(),p=s.people[1];p.group_ids=['demo-gruppe','G2'];
 assert.equal(personScopeAllows(s,{department_ids:['D2'],group_ids:['demo-gruppe']},p,'DEMO-KTD'),false);assert.equal(personScopeAllows(s,{department_ids:['D2'],group_ids:['G2']},p,'DEMO-KTD'),true);
});

test('Planungsraster wendet Abteilung, Gruppe, Funktion und Gebiet gemeinsam auf Personen an, auch ohne Dienste',()=>{
 const s=setup();s.groups.push({id:'SAME-DEPT',name:'Weitere Gruppe',department_id:'demo-abteilung'});s.people.push({employee_id:'IDLE',name:'Ohne Dienst',department_id:'demo-abteilung',group_ids:['demo-gruppe']},{employee_id:'OTHER',name:'Andere Abteilung',department_id:'D2',group_ids:['G2']},{employee_id:'OTHER-GROUP',name:'Andere Gruppe',department_id:'demo-abteilung',group_ids:['SAME-DEPT']});
 Object.assign(s.functions[0],{department_ids:['demo-abteilung'],group_ids:['demo-gruppe','SAME-DEPT']});Object.assign(s.regions[0],{department_ids:['demo-abteilung'],group_ids:['demo-gruppe'],function_ids:['DEMO-KTD']});
 const rows=personMonth(s,'2026-10','DEMO-KTD',['NORD']).rows;assert.deepEqual(new Set(rows.map(p=>p.employee_id)),new Set(['DEMO-EXT-001','IDLE']));assert.ok(rows.every(p=>!p.bars.length));
 assert.deepEqual(new Set(personMonth(s,'2026-10','DEMO-KTD',['NORD'],'demo-gruppe','demo-abteilung').rows.map(p=>p.employee_id)),new Set(['DEMO-EXT-001','IDLE']));
 assert.ok(personMonth(s,'2026-10','DEMO-KTD',['SÜD']).rows.some(p=>p.employee_id==='OTHER-GROUP'));assert.equal(personMonth(s,'2026-10','DEMO-KTD',['SÜD'],'G2','D2').rows.length,0);
});
