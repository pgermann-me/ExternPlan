import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,instant} from '../domain.js';
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
 const s=demo(),f=saveFavorite(s,template());const before=structuredClone(s);const preview=previewFavorite(s,f.id,request(f),now);assert.equal(preview.assignments.length,2);assert.deepEqual(s,before);
 const result=applyFavorite(s,f.id,request(f),now);assert.deepEqual(result.assignments.map(a=>a.geodependency),['NORD','SÜD']);assert.equal(s.assignments.length,2);assert.equal(s.outbox.length,2);assert.equal(result.assignments[0].priority,2);assert.notEqual(result.assignments[0].assignment_id,result.assignments[1].assignment_id);assert.equal(result.assignments[0].end_on,'2026-10-15T08:00:00+02:00');
 const applied=structuredClone(s);assert.throws(()=>applyFavorite(s,f.id,request(f),now),/Doppel/);assert.deepEqual(s,applied);
});
test('Wenn nur eine Region doppelt ist, wird kein Teil des Favoriten geplant',()=>{
 const s=demo(),single=saveFavorite(s,template({region_ids:['SÜD']}));applyFavorite(s,single.id,request(single),now);
 const multi=saveFavorite(s,template());const before=structuredClone(s);assert.throws(()=>applyFavorite(s,multi.id,request(multi),now),/Doppel/);assert.deepEqual(s,before);
});
test('Abteilungs- und Gruppenfavoriten berücksichtigen Organisation, nicht Qualifikationen',()=>{
 const s=demo();const f=saveFavorite(s,template({scope_type:'group',scope_id:'demo-gruppe'}));assert.throws(()=>applyFavorite(s,f.id,{...request(f),employee_id:'DEMO-001'},now),/Bereich/);
 assert.equal(previewFavorite(s,f.id,request(f),now).assignments.length,2);
 const d=saveFavorite(s,template({scope_type:'department',scope_id:'demo-abteilung'}));assert.equal(previewFavorite(s,d.id,request(d),now).assignments.length,2);assert.equal(previewFavorite(s,d.id,{...request(d),employee_id:'DEMO-001'},now).assignments.length,2);
});
test('Ortsunabhängige Vorlagen und Planung auch an vergangenen Schweizer Daten',()=>{
 const s=demo(),f=saveFavorite(s,template({scope_id:'DEMO-ORT',function_id:'DEMO-ORT',region_ids:[],duration_minutes:45}));const a=applyFavorite(s,f.id,request(f),now).assignments[0];assert.equal(a.geodependency,null);assert.equal(a.end_on,'2026-10-14T07:45:00+02:00');
 const past=applyFavorite(s,f.id,{...request(f),date:'2026-10-13'},now).assignments[0];assert.equal(past.start_on,'2026-10-13T07:00:00+02:00');assert.equal(past.end_on,'2026-10-13T07:45:00+02:00');assert.ok(s.assignments.some(a=>a.assignment_id===past.assignment_id));assert.throws(()=>previewFavorite(s,f.id,{...request(f),date:'2026-02-30'},now));assert.throws(()=>previewFavorite(s,f.id,{...request(f),revision:99},now));
 const midnight=instant('2026-10-13T22:30:00Z');assert.equal(previewFavorite(s,f.id,{...request(f),date:'2026-10-12'},midnight).assignments[0].start_on,'2026-10-12T07:00:00+02:00');
});
test('Dauer in Stunden/Minuten ist verstrichene Zeit, einschliesslich Sommer-/Winterwechsel',()=>{
 const s=demo(),f=saveFavorite(s,template({duration_minutes:1440,region_ids:['NORD']}));
 const spring=previewFavorite(s,f.id,{...request(f),date:'2026-03-28'},instant('2026-03-01T00:00'));assert.equal(spring.assignments[0].end_on,'2026-03-29T08:00:00+02:00');
 const autumn=previewFavorite(s,f.id,{...request(f),date:'2026-10-24'},now);assert.equal(autumn.assignments[0].end_on,'2026-10-25T06:00:00+01:00');
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
