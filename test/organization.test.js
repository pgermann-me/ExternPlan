import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment} from '../domain.js';
import {manualPerson} from '../people.js';
import {personMonth} from '../person-planning.js';
import {deleteMaster} from '../master-data.js';
import {favoriteForPerson,validateFavorite} from '../favorites.js';
import {personGroupIds,allowedFunctionRegions,validatePlanningGroup,planningPeople,controlFunctions} from '../public/organization.js';
test('Mehrere Gruppen erhalten alte Zuordnungen und erscheinen in jedem Gruppenraster',()=>{
 const s=demo();s.groups.push({id:'zweite',name:'Zweite Gruppe',department_id:'andere',geo_ids:['NORD']});
 const old=s.people[1];assert.deepEqual(personGroupIds(old),['demo-gruppe']);
 const p=manualPerson({group_ids:['demo-gruppe','zweite']},old);s.people[1]=p;
 assert.deepEqual(personGroupIds(manualPerson({},p)),['demo-gruppe','zweite']);
 assert.throws(()=>manualPerson({group_ids:['zweite','zweite']},p));
 for(const group of ['demo-gruppe','zweite'])assert.equal(personMonth(s,'2026-11','DEMO-KTD',undefined,group).rows[0].employee_id,p.employee_id);
 assert.equal(favoriteForPerson(s,{scope_type:'group',scope_id:'zweite'},p),true);
 assert.equal(favoriteForPerson(s,{scope_type:'department',scope_id:'andere'},p),true);
 const a=validateAssignment(s,{employee_id:p.employee_id,function_id:'DEMO-KTD',geodependency:'NORD',priority:1,start_on:'2099-01-01T07:00',end_on:'2099-01-02T07:00'}).assignment;s.assignments.push(a);
 assert.throws(()=>deleteMaster(s,'groups','zweite'),/Löschen nicht möglich/);
});
test('Gruppenregionen begrenzen Raster und Planung; keine Beschränkung bleibt rückwärtskompatibel',()=>{
 const s=demo(),g=s.groups[0],fn=s.functions[0];
 assert.deepEqual(allowedFunctionRegions(fn,g,s.regions),fn.geo_ids);
 g.geo_ids=['NORD'];assert.deepEqual(personMonth(s,'2026-11',fn.id,undefined,g.id).region_ids,['NORD']);
 assert.throws(()=>personMonth(s,'2026-11',fn.id,['SÜD'],g.id));
 const input={employee_id:s.people[1].employee_id,function_id:fn.id,planning_group_id:g.id,geodependency:'NORD'};
 validatePlanningGroup(s,input);assert.throws(()=>validatePlanningGroup(s,{...input,geodependency:'SÜD'}));assert.throws(()=>validatePlanningGroup(s,{...input,employee_id:s.people[0].employee_id}));
 const f={name:'Test',scope_type:'group',scope_id:g.id,function_id:fn.id,region_ids:['SÜD'],duration_minutes:60,start_time:'07:00',priority:1,color:'#2563eb'};
 assert.throws(()=>validateFavorite(s,f),/Gruppe/);validateFavorite(s,{...f,region_ids:['NORD']});
 g.geo_ids=[];assert.deepEqual(allowedFunctionRegions(fn,g,s.regions),[]);assert.equal(personMonth(s,'2026-11',fn.id,undefined,g.id).rows.length,1);
 validatePlanningGroup(s,{...input,function_id:'DEMO-ORT',geodependency:null});
});

test('Abteilungsfilter berücksichtigt Hauptabteilung und Mehrfachgruppen und lehnt fremde Gruppen ab',()=>{
 const s=demo();s.departments.push({id:'D2',name:'Zweite Abteilung'},{id:'EMPTY',name:'Leer'});s.groups.push({id:'G2',name:'Zweite Gruppe',department_id:'D2'});s.people[1].group_ids=['demo-gruppe','G2'];
 assert.deepEqual(planningPeople(s,null,'D2').map(p=>p.employee_id),['DEMO-EXT-001']);assert.equal(planningPeople(s,null,'demo-abteilung').length,2);assert.equal(planningPeople(s,null,'EMPTY').length,0);
 assert.throws(()=>planningPeople(s,'demo-gruppe','D2'),/Gruppe gehört nicht/);assert.throws(()=>planningPeople(s,null,'UNKNOWN'),/Abteilung unbekannt/);
 validatePlanningGroup(s,{employee_id:'DEMO-EXT-001',planning_department_id:'D2'});assert.throws(()=>validatePlanningGroup(s,{employee_id:'DEMO-001',planning_department_id:'D2'}),/Person gehört nicht/);
 for(const employee_id of ['DEMO-001','DEMO-EXT-001'])s.assignments.push(validateAssignment(s,{employee_id,function_id:'DEMO-KTD',geodependency:'NORD',priority:1,start_on:'2026-10-01T07:00',end_on:'2026-10-02T07:00'}).assignment);
 const r=personMonth(s,'2026-10','DEMO-KTD',['NORD'],null,'D2');assert.deepEqual(r.rows.map(p=>p.employee_id),['DEMO-EXT-001']);assert.equal(r.department_id,'D2');assert.equal(r.rows[0].bars.length,1);
 assert.throws(()=>personMonth(s,'2026-10','DEMO-KTD',undefined,'demo-gruppe','D2'),/Gruppe gehört nicht/);
});

test('Kontrollansicht zeigt nur Funktionen aus Diensten der gefilterten Mitglieder, unabhängig vom angezeigten Monat',()=>{
 const s=demo();s.departments.push({id:'OTHER',name:'Andere Abteilung'});s.groups.push({id:'OTHER-GROUP',name:'Andere Gruppe',department_id:'OTHER'});s.people.push({employee_id:'OTHER',name:'Andere Person',department_id:'OTHER',group_ids:['OTHER-GROUP']});
 const duty=(employee_id,function_id,geodependency,start_on='2020-01-01T07:00',end_on='2020-01-02T07:00')=>s.assignments.push(validateAssignment(s,{employee_id,function_id,geodependency,start_on,end_on,priority:1}).assignment);
 duty('DEMO-EXT-001','DEMO-KTD','NORD');duty('OTHER','DEMO-ORT',null,'2099-01-01T07:00','2099-01-02T07:00');
 assert.deepEqual(controlFunctions(s,'demo-gruppe','demo-abteilung').map(f=>f.id),['DEMO-KTD']);assert.deepEqual(controlFunctions(s,null,'OTHER').map(f=>f.id),['DEMO-ORT']);assert.equal(controlFunctions(s).length,2);
 s.people[2].group_ids.push('demo-gruppe');assert.equal(controlFunctions(s,'demo-gruppe','demo-abteilung').length,2);s.people[2].deleted_at='2026-01-01';assert.deepEqual(controlFunctions(s,'demo-gruppe','demo-abteilung').map(f=>f.id),['DEMO-KTD']);
 s.functions[0].deleted_at='2026-01-01';assert.deepEqual(controlFunctions(s,'demo-gruppe','demo-abteilung'),[]);
});

test('Duty editor candidates match exact function and region via affiliations or existing duties',async()=>{
 const {assignmentPeople}=await import('../public/organization.js');const s=demo();s.people=[
 {employee_id:'CURRENT',name:'Current',department_id:'demo-abteilung',group_ids:['demo-gruppe'],contacts:[]},
 {employee_id:'AFFILIATED',name:'Affiliated',department_id:'demo-abteilung',group_ids:['demo-gruppe'],function_regions:[{function_id:'DEMO-KTD',geo_id:'NORD',priority:0}]},
 {employee_id:'OTHER-REGION',name:'Other region',group_ids:['demo-gruppe'],function_regions:[{function_id:'DEMO-KTD',geo_id:'SÜD',priority:1}]},
 {employee_id:'PARENT',name:'Whole region',group_ids:['demo-gruppe'],function_regions:[{function_id:'DEMO-KTD',geo_id:'GANZ',priority:1}]},
 {employee_id:'OTHER-FUNCTION',name:'Other function',group_ids:['demo-gruppe'],function_regions:[{function_id:'DEMO-ORT',geo_id:null,priority:1}]},
 {employee_id:'NO-MEMBERSHIP',name:'No membership',group_ids:['demo-gruppe'],function_regions:[]},
 {employee_id:'ARCHIVED',name:'Archived',deleted_at:'2026-01-01',function_regions:[{function_id:'DEMO-KTD',geo_id:'NORD',priority:1}]},
 {employee_id:'OTHER-GROUP',name:'Other group',department_id:'OTHER',group_ids:['OTHER-G'],function_regions:[{function_id:'DEMO-KTD',geo_id:'NORD',priority:1}]}
 ];s.departments.push({id:'OTHER'});s.groups.push({id:'OTHER-G',department_id:'OTHER'});s.assignments=[{employee_id:'CURRENT',function_id:'DEMO-KTD',geodependency:'NORD'}];const before=structuredClone(s);
 assert.deepEqual(assignmentPeople(s,'DEMO-KTD','NORD','demo-gruppe','demo-abteilung').map(p=>p.employee_id),['CURRENT','AFFILIATED']);assert.deepEqual(s,before);
 assert.deepEqual(assignmentPeople(s,'DEMO-KTD','SÜD','demo-gruppe').map(p=>p.employee_id),['OTHER-REGION']);assert.deepEqual(assignmentPeople(s,'DEMO-ORT',null,'demo-gruppe').map(p=>p.employee_id),['OTHER-FUNCTION']);assert.deepEqual(assignmentPeople(s,'DEMO-KTD',null),[]);
 s.regions[0].group_ids=['OTHER-G'];assert.deepEqual(assignmentPeople(s,'DEMO-KTD','NORD','demo-gruppe'),[]);
});
