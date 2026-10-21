import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validateAssignment,instant} from '../domain.js';
import {deleteMaster,publicState} from '../master-data.js';
import {personMonth} from '../person-planning.js';
const now=instant('2026-10-14T12:00+02:00');
const duty=(s,start,end,extra={})=>{const a=validateAssignment(s,{employee_id:'DEMO-EXT-001',function_id:'DEMO-KTD',geodependency:'NORD',priority:1,start_on:start,end_on:end,...extra}).assignment;s.assignments.push(a);return a;};
for(const type of ['functions','regions','groups']){
 const key={functions:'DEMO-KTD',regions:'NORD',groups:'demo-gruppe'}[type];
 test(type+(type==='regions'?': auch vergangene Dienste verhindern die Löschung':': vergangene Dienste erlauben Löschung; Historie und Exportdaten bleiben unverändert'),()=>{
   const s=demo();duty(s,'2026-10-12T07:00','2026-10-13T07:00');const history=structuredClone(s.assignments);const before=s[type].find(x=>x.id===key);
   if(type==='regions'){const snapshot=structuredClone(s);assert.throws(()=>deleteMaster(s,type,key,now),/verweist/);assert.deepEqual(s,snapshot);return;}
   deleteMaster(s,type,key,now);assert.equal(publicState(s)[type].some(x=>x.id===key),false);assert.equal(publicState(s).archived_master[type].find(x=>x.id===key).name,before.name);assert.deepEqual(s.assignments,history);assert.ok(s.audit.some(a=>a.entity===type&&a.action==='delete'));
 });
 for(const [name,start,end] of [['laufend','2026-10-14T07:00','2026-10-15T07:00'],['zukünftig','2026-10-20T07:00','2026-10-21T07:00']]){
   test(type+': '+name+' verhindert Löschung ohne Änderungen',()=>{const s=demo();duty(s,start,end);const before=structuredClone(s);assert.throws(()=>deleteMaster(s,type,key,now),type==='regions'?/verweist/:/laufender oder zukünftiger/);assert.deepEqual(s,before);});
 }
 test(type+(type==='regions'?': abgeschlossene Dienste bleiben ein Verweis':': exakt abgeschlossenes Ende ist nicht laufend'),()=>{const s=demo();duty(s,'2026-10-14T07:00','2026-10-14T12:00');if(type==='regions')assert.throws(()=>deleteMaster(s,type,key,now),/verweist/);else assert.equal(deleteMaster(s,type,key,now).ok,true);});
}
test('Region unter einem zugeordneten Gesamtgebiet ist durch dessen künftigen Dienst geschützt',()=>{const s=demo();duty(s,'2026-10-20T07:00','2026-10-21T07:00',{geodependency:'GANZ'});assert.throws(()=>deleteMaster(s,'regions','NORD',now));s.functions[0].covers={};assert.equal(deleteMaster(s,'regions','NORD',now).ok,true);});
test('Ungenutzte Stammdaten-Beziehungen und Gruppenmitglieder blockieren keine Löschung',()=>{const s=demo();s.rules.push({id:'NORD-REGEL',function_id:'DEMO-KTD',geo_id:'NORD',mode:'continuous',windows:[]});deleteMaster(s,'regions','NORD',now);assert.equal(s.rules.find(r=>r.id==='NORD-REGEL').deleted_at!==undefined,true);assert.equal(publicState(s).rules.some(r=>r.id==='NORD-REGEL'),false);assert.deepEqual(s.functions[0].geo_ids,['NORD','SÜD','GANZ']);deleteMaster(s,'groups','demo-gruppe',now);assert.equal(s.people[1].group_id,'demo-gruppe');deleteMaster(s,'functions','DEMO-KTD',now);assert.equal(publicState(s).rules.some(r=>r.function_id==='DEMO-KTD'),false);});
test('Gelöschte Funktionen/Gebiete können nicht erneut in Dienste eingesetzt werden',()=>{const s=demo();deleteMaster(s,'regions','NORD',now);assert.throws(()=>duty(s,'2026-10-20T07:00','2026-10-21T07:00'),/gelöscht/);assert.equal(personMonth(s,'2026-10','DEMO-KTD').region_ids.includes('NORD'),false);deleteMaster(s,'functions','DEMO-ORT',now);assert.throws(()=>duty(s,'2026-10-20T07:00','2026-10-21T07:00',{function_id:'DEMO-ORT',geodependency:null}));assert.throws(()=>personMonth(s,'2026-10','DEMO-ORT'));});
test('Dienste anderer Personen/Gebiete verhindern die Löschung nicht',()=>{const s=demo();duty(s,'2026-10-20T07:00','2026-10-21T07:00',{employee_id:'DEMO-001',geodependency:'SÜD'});assert.equal(deleteMaster(s,'groups','demo-gruppe',now).ok,true);assert.equal(deleteMaster(s,'regions','NORD',now).ok,true);assert.equal(s.assignments.length,1);});
