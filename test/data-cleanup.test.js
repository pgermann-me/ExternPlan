import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {demo,validateAssignment,makeExport,confirmExport} from '../domain.js';
import {saveFavorite} from '../favorites.js';
import {removeKtdAndExamplePeople,emptyState} from '../data-cleanup.js';
function fixture(){const s=demo();s.people.push({employee_id:'REAL',name:'Echte Person',contacts:[]});const add=(person,fn,extra={})=>{const a=validateAssignment(s,{employee_id:person,function_id:fn,geodependency:fn==='DEMO-KTD'?'NORD':null,priority:1,start_on:'2099-01-01T07:00',end_on:'2099-01-02T07:00',...extra}).assignment;s.assignments.push(a);s.outbox.push({action:'create',...a});s.assignment_styles??={};s.assignment_styles[a.assignment_id]={color:'#ff0000'};return a;};return {s,add};}
test('Bereinigung entfernt KTD und Original-Beispielpersonen samt Diensten, erhält andere Planungen',()=>{
 const {s,add}=fixture(),ktd=add('REAL','DEMO-KTD'),example=add('DEMO-EXT-001','DEMO-ORT'),keep=add('REAL','DEMO-ORT');
 const fav=saveFavorite(s,{name:'KTD-Vorlage',scope_type:'function',scope_id:'DEMO-KTD',function_id:'DEMO-KTD',region_ids:['NORD'],start_time:'07:00',duration_minutes:1440,priority:1});
 const existingExport=structuredClone(makeExport(s,'snapshot'));
 const result=removeKtdAndExamplePeople(s);assert.equal(result.removed_people,2);assert.equal(result.removed_assignments,2);assert.deepEqual(s.people.map(p=>p.employee_id),['REAL']);assert.deepEqual(s.assignments,[keep]);assert.ok(s.functions.find(f=>f.id==='DEMO-KTD').deleted_at);assert.ok(s.rules[0].deleted_at);assert.ok(s.favorites.find(f=>f.id===fav.id).deleted_at);assert.equal(s.functions.find(f=>f.id==='DEMO-ORT').deleted_at,undefined);assert.deepEqual(s.exports[0].payload,existingExport);
 for(const a of [ktd,example]){assert.equal(s.outbox.filter(x=>x.assignment_id===a.assignment_id).length,1);assert.equal(s.outbox.find(x=>x.assignment_id===a.assignment_id).action,'delete');assert.equal(s.assignment_styles[a.assignment_id],undefined);}
 const delta=makeExport(s,'delta');assert.equal(confirmExport(s,delta.export_id).status,'Import bestätigt');for(const a of [ktd,example])assert.equal(s.els.assignments[a.assignment_id].deleted,true);
 const before=structuredClone(s);assert.equal(removeKtdAndExamplePeople(s),null);assert.deepEqual(s,before);
});
test('Veraltete KTD-Ausgangsänderungen erhalten eine höhere Löschrevision; leere Starts bleiben ohne Beispiele',()=>{
 const {s,add}=fixture(),a=add('REAL','DEMO-KTD');s.assignments=[];s.els.assignments[a.assignment_id]={revision:9};s.outbox[0].revision=7;s.exports.push({payload:{changes:[{...a,revision:11}]}});removeKtdAndExamplePeople(s);assert.equal(s.outbox.length,1);assert.equal(s.outbox[0].action,'delete');assert.equal(s.outbox[0].revision,12);assert.deepEqual(emptyState().people,[]);assert.deepEqual(emptyState().functions,[]);
});
async function start(dir){const child=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',EXTERNPLAN_TEST_FIXTURES:'0',PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let log='';const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error(log));},10000);child.stdout.on('data',data=>{log+=data;const match=log.match(/Port (\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.stderr.on('data',data=>log+=data);child.on('exit',()=>{clearTimeout(timer);reject(Error(log));});});return {child,url:'http://127.0.0.1:'+port};}
const stop=child=>new Promise(resolve=>{child.once('exit',resolve);child.kill();});
test('Serverstart bereinigt vorhandene Daten atomar mit privater Sicherung; Neustart wiederholt nichts',async()=>{
 const dir=mkdtempSync('/tmp/cleanup-start-');let server;
 try{const {s,add}=fixture();add('REAL','DEMO-KTD');add('DEMO-001','DEMO-ORT');const db=new DatabaseSync(dir+'/externplan.sqlite');db.exec('CREATE TABLE state (id INTEGER PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(s));db.close();server=await start(dir);const state=await (await fetch(server.url+'/api/state')).json();assert.deepEqual(state.people.map(p=>p.employee_id),['REAL']);assert.equal(state.assignments.length,0);assert.equal(state.functions.some(f=>f.id==='DEMO-KTD'),false);assert.equal(state.outbox.filter(c=>c.action==='delete').length,2);const backups=()=>readdirSync(dir).filter(f=>f.startsWith('backup-before-ktd-cleanup-'));assert.equal(backups().length,1);const backup=dir+'/'+backups()[0];assert.deepEqual(JSON.parse(readFileSync(backup,'utf8')),s);assert.equal(statSync(backup).mode&0o777,0o600);await stop(server.child);server=null;server=await start(dir);assert.equal(backups().length,1);assert.deepEqual((await (await fetch(server.url+'/api/state')).json()).outbox,state.outbox);
 }finally{if(server)await stop(server.child);rmSync(dir,{recursive:true,force:true});}
});
