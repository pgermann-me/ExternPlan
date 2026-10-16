import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,instant,makeExport} from '../domain.js';
import {saveFavorite,previewFavorite,applyFavorite,removeFavorite} from '../favorites.js';
import {deleteMaster,publicState} from '../master-data.js';
const now=instant('2026-10-14T12:00+02:00');
const template=(extra={})=>({name:'Tagdienst',scope_type:'function',scope_id:'DEMO-KTD',function_id:'DEMO-KTD',region_ids:['NORD','SÜD'],duration_minutes:1500,start_time:'07:00',priority:2,...extra});
const request=f=>({employee_id:'DEMO-EXT-001',date:'2026-10-14',revision:f.revision});
test('Bestehende Daten benötigen keine Migration; Favoritendienste werden validiert und versioniert',()=>{
 const s=demo();assert.deepEqual(publicState(s).favorites,[]);const f=saveFavorite(s,template());assert.equal(s.favorites.length,1);assert.equal(s.audit.at(-1).entity,'favorite');
 assert.throws(()=>saveFavorite(s,{...f,revision:99}));assert.equal(saveFavorite(s,{...f,name:'Neuer Name'}).revision,2);
 for(const bad of [{duration_minutes:0},{duration_minutes:1.5},{start_time:'24:00'},{priority:0},{region_ids:[]},{region_ids:['NORD','NORD']},{region_ids:['UA_SG']},{scope_id:'unbekannt'}])assert.throws(()=>saveFavorite(s,template(bad)));
});
test('Mehrregionen-Vorschau schreibt nichts; Anwendung erzeugt getrennte Zuteilungen, Audit und ELS-Änderungen',()=>{
 const s=demo(),f=saveFavorite(s,template());const before=structuredClone(s);const preview=previewFavorite(s,f.id,request(f),now);assert.equal(preview.assignments.length,4);assert.deepEqual(s,before);
 const result=applyFavorite(s,f.id,request(f),now);assert.deepEqual(result.assignments.map(a=>a.geodependency),['NORD','NORD','SÜD','SÜD']);assert.equal(s.assignments.length,4);assert.equal(s.outbox.length,4);assert.equal(result.assignments[0].priority,2);assert.notEqual(result.assignments[0].assignment_id,result.assignments[1].assignment_id);assert.equal(result.assignments[0].end_on,'2026-10-15T07:00:00+02:00');assert.equal(result.assignments[1].end_on,'2026-10-15T08:00:00+02:00');
 const applied=structuredClone(s);assert.throws(()=>applyFavorite(s,f.id,request(f),now),/Doppel/);assert.deepEqual(s,applied);
});
test('Wenn nur eine Region doppelt ist, wird kein Teil des Favoriten geplant',()=>{
 const s=demo(),single=saveFavorite(s,template({region_ids:['SÜD']}));applyFavorite(s,single.id,request(single),now);
 const multi=saveFavorite(s,template());const before=structuredClone(s);assert.throws(()=>applyFavorite(s,multi.id,request(multi),now),/Doppel/);assert.deepEqual(s,before);
});
test('Abteilungs- und Gruppenfavoriten berücksichtigen Organisation, nicht Qualifikationen',()=>{
 const s=demo();const f=saveFavorite(s,template({scope_type:'group',scope_id:'demo-gruppe'}));assert.throws(()=>applyFavorite(s,f.id,{...request(f),employee_id:'DEMO-001'},now),/Bereich/);
 assert.equal(previewFavorite(s,f.id,request(f),now).assignments.length,4);
 const d=saveFavorite(s,template({scope_type:'department',scope_id:'demo-abteilung'}));assert.equal(previewFavorite(s,d.id,request(d),now).assignments.length,4);assert.equal(previewFavorite(s,d.id,{...request(d),employee_id:'DEMO-001'},now).assignments.length,4);
});
test('Ortsunabhängige Vorlagen und Planung auch an vergangenen Schweizer Daten',()=>{
 const s=demo(),f=saveFavorite(s,template({scope_id:'DEMO-ORT',function_id:'DEMO-ORT',region_ids:[],duration_minutes:45}));const a=applyFavorite(s,f.id,request(f),now).assignments[0];assert.equal(a.geodependency,null);assert.equal(a.end_on,'2026-10-14T07:45:00+02:00');
 const past=applyFavorite(s,f.id,{...request(f),date:'2026-10-13'},now).assignments[0];assert.equal(past.start_on,'2026-10-13T07:00:00+02:00');assert.equal(past.end_on,'2026-10-13T07:45:00+02:00');assert.ok(s.assignments.some(a=>a.assignment_id===past.assignment_id));assert.throws(()=>previewFavorite(s,f.id,{...request(f),date:'2026-02-30'},now));assert.throws(()=>previewFavorite(s,f.id,{...request(f),revision:99},now));
 const midnight=instant('2026-10-13T22:30:00Z');assert.equal(previewFavorite(s,f.id,{...request(f),date:'2026-10-12'},midnight).assignments[0].start_on,'2026-10-12T07:00:00+02:00');
});
test('Feste Schweizer Enduhrzeit über Sommer-/Winterwechsel bei bestehenden und neuen Favoriten',()=>{
 const s=demo(),f=saveFavorite(s,template({duration_minutes:1440,region_ids:['NORD']}));
 const spring=previewFavorite(s,f.id,{...request(f),date:'2026-03-28'},instant('2026-03-01T00:00'));assert.equal(spring.assignments[0].end_on,'2026-03-29T07:00:00+02:00');
 assert.equal((instant(spring.assignments[0].end_on)-instant(spring.assignments[0].start_on))/3600000,23);assert.equal(f.end_time,'07:00');assert.equal(f.end_day_offset,1);delete f.end_time;delete f.end_day_offset;
 const autumn=previewFavorite(s,f.id,{...request(f),date:'2026-10-24'},now);assert.equal(autumn.end_on,'2026-10-25T07:00:00+01:00');assert.equal(autumn.assignments.length,2);assert.equal(autumn.assignments[0].end_on,autumn.assignments[1].start_on);
 assert.deepEqual(autumn.assignments.map(a=>(instant(a.end_on)-instant(a.start_on))/3600000),[24,1]);
 assert.throws(()=>previewFavorite(s,f.id,{...request(f),date:'2026-10-25',start_time:'02:30'},now),/Mehrdeutig/);
 assert.equal(previewFavorite(s,f.id,{...request(f),date:'2026-10-25',start_time:'02:30',start_offset:'+01:00'},now).assignments[0].start_on,'2026-10-25T02:30:00+01:00');
});
test('Favorit löschen ändert keine Dienste; Stammdatenlöschung deaktiviert ungenutzte Favoriten',()=>{
 const s=demo(),f=saveFavorite(s,template());applyFavorite(s,f.id,request(f),now);const planned=structuredClone(s.assignments);removeFavorite(s,f.id,f.revision);assert.deepEqual(s.assignments,planned);assert.equal(publicState(s).favorites.length,0);
 const clean=demo(),unused=saveFavorite(clean,template());deleteMaster(clean,'regions','NORD',now);assert.equal(publicState(clean).favorites.length,0);assert.throws(()=>applyFavorite(clean,unused.id,request(unused),now));
});
test('Favoritenreihenfolge bleibt gespeichert; Bearbeitung erhält Position und Dienste bleiben unverändert',async()=>{
 const {orderedFavorites,reorderFavorites}=await import('../favorites.js');const s=demo();const a=saveFavorite(s,template({name:'A'})),b=saveFavorite(s,template({name:'B'})),c=saveFavorite(s,template({name:'C'}));
 const original=orderedFavorites(s).map(f=>f.id);reorderFavorites(s,[c.id,a.id,b.id],original);assert.deepEqual(publicState(s).favorites.map(f=>f.name),['C','A','B']);
 saveFavorite(s,{...s.favorites.find(f=>f.id===a.id),name:'A bearbeitet'});assert.deepEqual(publicState(s).favorites.map(f=>f.name),['C','A bearbeitet','B']);assert.deepEqual(s.assignments,[]);
 assert.throws(()=>reorderFavorites(s,[a.id,b.id,c.id],original),/inzwischen/);assert.throws(()=>reorderFavorites(s,[c.id,c.id,b.id],[c.id,a.id,b.id]));
});

test('Feste Endzeiten bei Tagesdiensten, Nachtdiensten und mehrtägigen Favoriten',()=>{
 const s=demo();for(const [start,duration,date,end] of [['07:00',720,'2026-10-24','2026-10-24T19:00:00+02:00'],['19:00',720,'2026-10-24','2026-10-25T07:00:00+01:00'],['19:00',720,'2026-03-28','2026-03-29T07:00:00+02:00'],['07:00',2880,'2026-10-24','2026-10-26T07:00:00+01:00']]){const f=saveFavorite(s,template({start_time:start,duration_minutes:duration}));assert.equal(previewFavorite(s,f.id,{...request(f),date},now).end_on,end);}
});
test('Nicht existente und doppelte Schweizer Endzeiten werden nicht still verschoben',()=>{
 const s=demo(),f=saveFavorite(s,template({start_time:'19:00',duration_minutes:450}));
 assert.throws(()=>previewFavorite(s,f.id,{...request(f),date:'2026-03-28'},now),/Dienstende:.*existiert/);
 assert.throws(()=>previewFavorite(s,f.id,{...request(f),date:'2026-10-24'},now),/Dienstende:.*Mehrdeutig/);
 for(const end_offset of ['+02:00','+01:00'])assert.equal(previewFavorite(s,f.id,{...request(f),date:'2026-10-24',end_offset},now).assignments[0].end_on,'2026-10-25T02:30:00'+end_offset);
 assert.throws(()=>previewFavorite(s,f.id,{...request(f),date:'2026-10-26',end_offset:'+02:00'},now),/Endzeit/);
});

test('Wildhüter Freitag 16:00 bis Sonntag 24:00 wird atomar in 24/24/8 Stunden pro Region geplant und exportiert',()=>{
 const s=demo(),f=saveFavorite(s,template({name:'Wildhüter Wochenende',start_weekday:5,start_time:'16:00',duration_minutes:56*60,color:'#a4470c'}));const input={...request(f),date:'2026-10-16'};
 const before=structuredClone(s),preview=previewFavorite(s,f.id,input,now);assert.deepEqual(s,before);assert.equal(preview.segments_per_region,3);assert.equal(preview.assignments.length,6);assert.equal(preview.end_on,'2026-10-19T00:00:00+02:00');
 const result=applyFavorite(s,f.id,input,now),north=result.assignments.filter(a=>a.geodependency==='NORD');assert.deepEqual(north.map(a=>[a.start_on,a.end_on]),[['2026-10-16T16:00:00+02:00','2026-10-17T16:00:00+02:00'],['2026-10-17T16:00:00+02:00','2026-10-18T16:00:00+02:00'],['2026-10-18T16:00:00+02:00','2026-10-19T00:00:00+02:00']]);
 for(const a of result.assignments){assert.ok(instant(a.end_on)-instant(a.start_on)<=86400000);assert.equal(s.assignment_styles[a.assignment_id].color,'#a4470c');}
 assert.equal(new Set(result.assignments.map(a=>a.assignment_id)).size,6);
 for(const mode of ['delta','snapshot']){const exported=makeExport(s,mode);assert.equal(exported.changes.length,6);assert.deepEqual(exported.changes.map(a=>a.assignment_id),result.assignments.map(a=>a.assignment_id));assert.ok(exported.changes.every(a=>instant(a.end_on)-instant(a.start_on)<=86400000));}
 assert.equal(s.audit.findLast(a=>a.entity==='favorite'&&a.action==='apply').after.end_on,'2026-10-19T00:00:00+02:00');
 const applied=structuredClone(s);assert.throws(()=>applyFavorite(s,f.id,input,now),/Doppel/);assert.deepEqual(s,applied);assert.throws(()=>previewFavorite(s,f.id,{...input,date:'2026-10-17'},now),/Freitag/);
});
test('Mehrtagessplitting deckt Zeitumstellungen lückenlos ab und verwirft alle Teilstücke bei einem Konflikt',()=>{
 const s=demo(),f=saveFavorite(s,template({region_ids:['NORD'],start_time:'16:00',duration_minutes:56*60}));
 for(const date of ['2026-03-27','2026-10-23']){const r=previewFavorite(s,f.id,{...request(f),date},now);assert.equal(r.assignments.length,3);assert.ok(r.assignments.every(a=>instant(a.end_on)-instant(a.start_on)<=86400000));assert.equal(r.assignments[0].start_on,r.start_on);assert.equal(r.assignments.at(-1).end_on,r.end_on);for(let i=1;i<r.assignments.length;i++)assert.equal(r.assignments[i-1].end_on,r.assignments[i].start_on);}
 const conflict=saveFavorite(s,template({region_ids:['NORD'],start_time:'16:00',duration_minutes:1440}));applyFavorite(s,conflict.id,{...request(conflict),date:'2026-10-17'},now);const before=structuredClone(s);assert.throws(()=>applyFavorite(s,f.id,{...request(f),date:'2026-10-16'},now),/Doppel/);assert.deepEqual(s,before);
});

const weeklyWindows=[{weekdays:[1,2,3,4,5],start_time:'12:00',end_time:'14:00',end_day_offset:0},{weekdays:[1,2,3,4,5],start_time:'17:00',end_time:'08:00',end_day_offset:1},{weekdays:[6,7],start_time:'08:00',end_time:'08:00',end_day_offset:1}];
test('Wochenfavorit plant nur die Zeitfenster des geklickten Tages mit echten Pausen, ohne Vorschau-Mutation',()=>{
 const s=demo(),f=saveFavorite(s,template({schedule_mode:'weekly',weekly_windows:weeklyWindows}));assert.equal(f.weekly_windows.length,3);assert.equal(f.start_weekday,null);const before=structuredClone(s);
 const monday=previewFavorite(s,f.id,{...request(f),date:'2026-10-19'},now);assert.deepEqual(s,before);assert.equal(monday.assignments.length,4);assert.deepEqual(monday.assignments.filter(a=>a.geodependency==='NORD').map(a=>[a.start_on,a.end_on]),[['2026-10-19T12:00:00+02:00','2026-10-19T14:00:00+02:00'],['2026-10-19T17:00:00+02:00','2026-10-20T08:00:00+02:00']]);
 for(const [date,count,start,end] of [['2026-10-23',2,'2026-10-23T12:00:00+02:00','2026-10-24T08:00:00+02:00'],['2026-10-17',1,'2026-10-17T08:00:00+02:00','2026-10-18T08:00:00+02:00'],['2026-10-24',2,'2026-10-24T08:00:00+02:00','2026-10-25T08:00:00+01:00'],['2026-03-28',1,'2026-03-28T08:00:00+01:00','2026-03-29T08:00:00+02:00'],['2026-10-25',1,'2026-10-25T08:00:00+01:00','2026-10-26T08:00:00+01:00']]){
  const r=previewFavorite(s,f.id,{...request(f),date},now);assert.equal(r.segments_per_region,count);assert.equal(r.start_on,start);assert.equal(r.end_on,end);assert.ok(r.assignments.every(a=>instant(a.end_on)-instant(a.start_on)<=86400000));
 }
 const applied=applyFavorite(s,f.id,{...request(f),date:'2026-10-19'},now);assert.equal(applied.assignments.length,4);const saved=structuredClone(s);assert.throws(()=>applyFavorite(s,f.id,{...request(f),date:'2026-10-19'},now),/Doppel/);assert.deepEqual(s,saved);assert.equal(makeExport(s).changes.length,4);
});
test('Wochenfenster prüfen Pflichtfelder und Überschneidungen einschliesslich Sonntag/Montag; Änderungen bleiben atomar',()=>{
 for(const windows of [[],[{...weeklyWindows[0],weekdays:[]}],[{...weeklyWindows[0],weekdays:[0]}],[{...weeklyWindows[0],end_time:'12:00'}],[weeklyWindows[0],{...weeklyWindows[0],start_time:'13:00',end_time:'15:00'}],[{weekdays:[7],start_time:'17:00',end_time:'08:00',end_day_offset:1},{weekdays:[1],start_time:'07:00',end_time:'09:00',end_day_offset:0}]]){const s=demo();assert.throws(()=>saveFavorite(s,template({schedule_mode:'weekly',weekly_windows:windows})));assert.equal((s.favorites||[]).length,0);}
 const s=demo(),f=saveFavorite(s,template({schedule_mode:'weekly',weekly_windows:[weeklyWindows[0]],region_ids:['NORD']}));assert.throws(()=>previewFavorite(s,f.id,{...request(f),date:'2026-10-17'},now),/kein Zeitfenster/);
 const single=saveFavorite(s,template({start_time:'17:00',duration_minutes:900,region_ids:['NORD']}));applyFavorite(s,single.id,{...request(single),date:'2026-10-19'},now);const before=structuredClone(s),multi=saveFavorite(s,template({schedule_mode:'weekly',weekly_windows:weeklyWindows,region_ids:['NORD']}));const withTemplate=structuredClone(s);assert.throws(()=>applyFavorite(s,multi.id,{...request(multi),date:'2026-10-19'},now),/Doppel/);assert.deepEqual(s,withTemplate);assert.equal(s.assignments.length,before.assignments.length);
});
