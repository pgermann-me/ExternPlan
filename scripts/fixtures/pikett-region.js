import {emptyState} from '../../data-cleanup.js';
export function regionFixture(){
 const state=emptyState();
 state.departments=[{id:'D',name:'Abteilung'},{id:'OTHER',name:'Andere Abteilung'}];
 state.groups=[{id:'G',name:'Gruppe',department_id:'D',geo_ids:['R1','R2','WHOLE']},{id:'OTHER-G',name:'Andere Gruppe',department_id:'OTHER',geo_ids:['R2']}];
 state.regions=[{id:'R1',name:'Westgebiet',polygon_geo_id:'SHAPE-A'},{id:'R2',name:'Ostgebiet',polygon_geo_id:'SHAPE-B'},{id:'WHOLE',name:'Gesamtgebiet',polygon_geo_id:null}];
 state.functions=[{id:'F',name:'Geplantes Pikett',geo_ids:['R1','R2','WHOLE'],covers:{WHOLE:['R1','R2']}},{id:'W',name:'Jäger Immer',duty_time_model:'always',geo_ids:['R1','R2'],covers:{}}];
 state.people=[
 {employee_id:'P',first_name:'Anna',last_name:'Test',name:'Anna Test',department_id:'D',group_ids:['G'],source:'manual',contacts:[{type:'phone_mobile',value:'+41790000001',priority:1},{type:'email',value:'hidden@example.invalid',priority:0}],function_regions:[{function_id:'W',geo_id:'R1',priority:2}]},
 {employee_id:'P2',first_name:'Berta',last_name:'Test',name:'Berta Test',department_id:'D',group_ids:['G'],source:'manual',contacts:[],function_regions:[{function_id:'W',geo_id:'R1',priority:1}]},
 {employee_id:'HIDDEN',first_name:'Andere',last_name:'Person',name:'Andere Person',department_id:'OTHER',group_ids:['OTHER-G'],source:'manual',contacts:[],function_regions:[{function_id:'W',geo_id:'R2',priority:1}]}];
 const assignment=(id,geo,start='2026-10-22T08:00:00+02:00',end='2026-10-22T18:00:00+02:00')=>({assignment_id:id,function_id:'F',employee_id:'P',geodependency:geo,priority:1,start_on:start,end_on:end,revision:1});
 state.assignments=[assignment('active','R1'),assignment('whole','WHOLE'),assignment('later','R1','2026-10-22T18:00:00+02:00','2026-10-23T08:00:00+02:00'),assignment('ended','R1','2026-10-21T18:00:00+02:00','2026-10-22T08:00:00+02:00')];
 const box=(x,y,r=.3)=>[[x,y],[x+r,y],[x+r,y+r],[x,y+r],[x,y]];
 const features=[{type:'Feature',properties:{GEO_ID:'SHAPE-A',Beschreibung:'Original A',private:'must not leak'},geometry:{type:'Polygon',coordinates:[box(9,47,.6),box(9.1,47.1,.05)]}},{type:'Feature',properties:{GEO_ID:'SHAPE-B',Beschreibung:'Original B'},geometry:{type:'MultiPolygon',coordinates:[[box(9.3,47.2,.4)],[box(9.8,47.6,.1)]]}}];
 return {state,mapData:{layers:[{id:'test-map',name:'Testkarte',filename:'private.geojson',geojson:{type:'FeatureCollection',features}}]}};
}
