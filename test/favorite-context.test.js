import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../domain.js';
import {favoriteMatchesContext as matches} from '../public/favorite-context.js';
const favorite=(extra={})=>({scope_type:'function',scope_id:'DEMO-KTD',function_id:'DEMO-KTD',region_ids:['NORD'],...extra});
const context=(extra={})=>({function_id:'DEMO-KTD',group_id:'demo-gruppe',region_ids:['NORD'],employee_ids:[],...extra});
test('Favoriten müssen Funktion und sämtliche gewählten Regionen erfüllen',()=>{
 const s=demo();assert.equal(matches(s,favorite(),context()),true);
 assert.equal(matches(s,favorite({region_ids:['NORD','SÜD']}),context()),false);
 assert.equal(matches(s,favorite({region_ids:['NORD','SÜD']}),context({region_ids:['NORD','SÜD']})),true);
 assert.equal(matches(s,favorite(),context({region_ids:[]})),false);
 assert.equal(matches(s,favorite(),context({function_id:'DEMO-ORT'})),false);
 assert.equal(matches(s,favorite({scope_id:'DEMO-ORT',function_id:'DEMO-ORT',region_ids:[]}),context({function_id:'DEMO-ORT',region_ids:[]})),true);
 s.groups[0].geo_ids=['SÜD'];assert.equal(matches(s,favorite(),context()),false);
});
test('Gruppen- und Abteilungsfavoriten bleiben auf ausgewählte Organisation beschränkt',()=>{
 const s=demo();s.departments.push({id:'andere',name:'Andere'});s.groups.push({id:'andere-gruppe',department_id:'andere'});
 s.people[1].group_ids=['demo-gruppe','andere-gruppe'];
 assert.equal(matches(s,favorite({scope_type:'group',scope_id:'demo-gruppe'}),context()),true);
 assert.equal(matches(s,favorite({scope_type:'group',scope_id:'andere-gruppe'}),context()),false);
 assert.equal(matches(s,favorite({scope_type:'department',scope_id:'demo-abteilung'}),context()),true);
 assert.equal(matches(s,favorite({scope_type:'department',scope_id:'andere'}),context()),false);
 const noGroup=context({group_id:'',employee_ids:['DEMO-EXT-001']});
 assert.equal(matches(s,favorite({scope_type:'group',scope_id:'andere-gruppe'}),noGroup),true);
 assert.equal(matches(s,favorite({scope_type:'department',scope_id:'andere'}),noGroup),true);
 assert.equal(matches(s,favorite({scope_type:'group',scope_id:'andere-gruppe'}),context({group_id:'',employee_ids:['DEMO-001']})),false);
 s.groups[1].deleted_at='2026-10-15';assert.equal(matches(s,favorite({scope_type:'group',scope_id:'andere-gruppe'}),noGroup),false);
});
