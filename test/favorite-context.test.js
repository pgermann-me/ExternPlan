import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../domain.js';
import {favoriteMatchesContext as matches,favoriteDefinitionMatches as definitionMatches,favoriteContextProblem} from '../public/favorite-context.js';
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
 assert.equal(matches(s,favorite({scope_type:'group',scope_id:'andere-gruppe'}),{...noGroup,department_id:'demo-abteilung'}),false);assert.equal(matches(s,favorite({scope_type:'department',scope_id:'andere'}),{...noGroup,department_id:'demo-abteilung'}),false);assert.equal(matches(s,favorite({scope_type:'department',scope_id:'andere'}),{...noGroup,department_id:'andere'}),true);
 s.groups[1].deleted_at='2026-10-15';assert.equal(matches(s,favorite({scope_type:'group',scope_id:'andere-gruppe'}),noGroup),false);
});

test('Alle Funktionen lässt passende Favoriten verschiedener Funktionen zu',()=>{
 const s=demo();assert.equal(matches(s,favorite(),context({function_id:''})),true);
 assert.equal(matches(s,favorite({scope_id:'DEMO-ORT',function_id:'DEMO-ORT',region_ids:[]}),context({function_id:''})),true);
 assert.equal(matches(s,favorite({region_ids:['SÜD']}),context({function_id:''})),false);
});

test('Favoritendefinitionen filtern Abteilung, Gruppe, Funktion und mehrere Regionen ohne geplante Dienste',()=>{
 const s=demo(),f=favorite();
 assert.equal(definitionMatches(s,f,{}),true);
 assert.equal(definitionMatches(s,f,{function_id:'DEMO-ORT'}),false);
 assert.equal(definitionMatches(s,f,{region_ids:['NORD','SÜD']}),true);
 assert.equal(definitionMatches(s,f,{region_ids:['SÜD']}),false);
 s.departments.push({id:'OTHER'});s.groups.push({id:'OTHER-GROUP',department_id:'OTHER'});s.functions[0].department_ids=['demo-abteilung'];
 assert.equal(definitionMatches(s,f,{department_id:'OTHER'}),false);
 assert.equal(definitionMatches(s,f,{department_id:'demo-abteilung'}),true);
 assert.equal(definitionMatches(s,f,{group_id:'OTHER-GROUP'}),false);
 assert.equal(definitionMatches(s,favorite({scope_type:'group',scope_id:'OTHER-GROUP'}),{department_id:'demo-abteilung'}),false);
 assert.equal(definitionMatches(s,favorite({scope_type:'department',scope_id:'OTHER'}),{group_id:'demo-gruppe'}),false);
 s.groups[0].geo_ids=['SÜD'];assert.equal(definitionMatches(s,f,{group_id:'demo-gruppe'}),false);
 assert.equal(definitionMatches(s,favorite({region_ids:['SÜD']}),{group_id:'demo-gruppe'}),true);
});

import {publicState} from '../master-data.js';
test('JUGA and Staatsanwälte can share a region group across departments without a function favorite inheriting a department',()=>{
 const s=demo();s.departments.push({id:'JUGA-D',name:'Jugendanwaltschaft'});s.groups.push({id:'JUGA-G',name:'JUGA',department_id:'JUGA-D',geo_ids:['NORD']});s.functions.push({id:'JUGA',name:'JUGA Pikett',geo_ids:[],covers:{}});s.region_groups=[{id:'UA',name:'UA-Gebiete',function_ids:['DEMO-KTD','JUGA']}];s.regions[0].region_group_ids=['UA'];
 const f={...favorite(),function_id:'JUGA',scope_id:'JUGA'},ctx={...context(),function_id:'JUGA',department_id:'JUGA-D',group_id:'JUGA-G'};
 assert.equal(matches(s,f,ctx),true);assert.equal(matches(publicState(s),f,ctx),true);
 assert.match(favoriteContextProblem(s,{...f,region_ids:[]},ctx),/gebietsabhängig.*keine Regionen/);
 assert.match(favoriteContextProblem(s,{...f,scope_type:'department',scope_id:'demo-abteilung'},ctx),/noch an die Abteilung/);
 s.region_groups[0].department_ids=['demo-abteilung'];assert.match(favoriteContextProblem(s,f,ctx),/UA-Gebiete/);assert.equal(matches(s,f,ctx),false);
 s.region_groups[0].department_ids=[];s.functions.at(-1).department_ids=['demo-abteilung'];assert.match(favoriteContextProblem(s,f,ctx),/Funktion „JUGA Pikett“.*nicht freigegeben/);
});
