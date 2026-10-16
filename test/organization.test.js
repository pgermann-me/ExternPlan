import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment} from '../domain.js';
import {manualPerson} from '../people.js';
import {personMonth} from '../person-planning.js';
import {deleteMaster} from '../master-data.js';
import {favoriteForPerson,validateFavorite} from '../favorites.js';
import {personGroupIds,allowedFunctionRegions,validatePlanningGroup,planningPeople} from '../public/organization.js';
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
