import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readdirSync,readFileSync,statSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
import {emptyState} from '../data-cleanup.js';
test('Startup migrates state, imported polygons and account scope atomically, backs up privately and is repeatable',async()=>{
 const dir=mkdtempSync('/tmp/externplan-wildhut-startup-'),password='Wildhut-Test-Password-123456',salt='test-salt';let child;
 const state=emptyState();state.departments=[{id:'D',name:'D'}];state.groups=[{id:'G',department_id:'D',geo_ids:['WH01']}];
 state.regions=[{id:'WH01',name:'Gebiet eins'},{id:'WH10',name:'Gebiet zehn'}];state.functions=[{id:'W',name:'Immer',duty_time_model:'always',geo_ids:['WH01','WH10'],covers:{}},{id:'F',name:'Dienst',geo_ids:['WH01'],covers:{}}];
 state.people=[{employee_id:'P',name:'Testperson',department_id:'D',group_ids:['G'],contacts:[],function_regions:[{function_id:'W',geo_id:'WH01',priority:0}]}];
 state.assignments=[{assignment_id:'a',employee_id:'P',function_id:'F',geodependency:'WH01',priority:1,start_on:'2026-10-22T08:00:00+02:00',end_on:'2026-10-22T18:00:00+02:00',revision:2}];
 const layer={id:'imported',name:'Testkarte',geojson:{type:'FeatureCollection',features:state.regions.map(r=>({type:'Feature',properties:{GEO_ID:r.id,Beschreibung:r.name},geometry:{type:'Polygon',coordinates:[[[9,47],[9.1,47],[9.1,47.1],[9,47.1],[9,47]]]}}))}};
 const db=new DatabaseSync(dir+'/externplan.sqlite');db.exec('CREATE TABLE state(id INTEGER PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE imported_map_layers(id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE app_users(id TEXT PRIMARY KEY,email TEXT,first_name TEXT,last_name TEXT,role TEXT,active INTEGER,revision INTEGER,password_hash TEXT,password_salt TEXT,must_change_password INTEGER,access_scope TEXT)');
 db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(state));db.prepare('INSERT INTO imported_map_layers VALUES(?,?)').run(layer.id,JSON.stringify(layer));db.prepare('INSERT INTO app_users VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('user','test@wildhut.invalid','Test','User','user',1,1,scryptSync(password,salt,64).toString('hex'),salt,0,JSON.stringify({region_id:'WH01'}));db.prepare('INSERT INTO app_users VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('admin','admin@wildhut.invalid','Test','Admin','admin',1,1,scryptSync(password,salt,64).toString('hex'),salt,0,'{}');db.close();
 const start=async()=>{child=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',EXTERNPLAN_TEST_FIXTURES:'1',EXTERNPLAN_AUTH_TEST_BYPASS:'0',PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});return await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>{child.kill();reject(Error(log));},15000);child.stdout.on('data',data=>{log+=data;const m=log.match(/Port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.stderr.on('data',data=>log+=data);child.once('exit',()=>{clearTimeout(timer);reject(Error(log));});});};
 const stop=async()=>{await new Promise(resolve=>{child.once('exit',resolve);child.kill();});child=null;};
 const raw=()=>{const db=new DatabaseSync(dir+'/externplan.sqlite');const result=db.prepare('SELECT data FROM state').get().data;db.close();return result;};
 try{
  let base=await start();const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'test@wildhut.invalid',password})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
  const adminLogin=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@wildhut.invalid',password})});assert.equal(adminLogin.status,200);const adminCookie=adminLogin.headers.get('set-cookie').split(';')[0];const adminView=await (await fetch(base+'/api/state',{headers:{cookie:adminCookie}})).json();assert.equal(adminView.map_revision,'1:1');
  const view=await (await fetch(base+'/api/state',{headers:{cookie}})).json();assert.deepEqual(view.regions.map(r=>r.id),['WH_SG_1']);assert.deepEqual(view.current_user.access_scope,{region_ids:['WH_SG_1']});assert.equal(view.current_user.revision,2);assert.equal(view.assignments[0].geodependency,'WH_SG_1');assert.equal(view.assignments[0].revision,3);
  const map=await (await fetch(base+'/api/pikett-region-map',{headers:{cookie}})).json();assert.equal(map.features.length,1);assert.equal(map.features[0].properties.GEO_ID,'WH_SG_1');
  const backups=readdirSync(dir).filter(name=>name.startsWith('backup-before-wildhut-geo-rename-'));assert.equal(backups.length,1);const backup=dir+'/'+backups[0];assert.equal(statSync(backup).mode&0o777,0o600);const saved=JSON.parse(readFileSync(backup));assert.equal(saved.state.regions[0].id,'WH01');assert.equal(JSON.parse(saved.user_scopes[0].access_scope).region_id,'WH01');assert.ok(!readFileSync(backup,'utf8').includes('password_hash'));
  const migrated=raw();assert.equal(JSON.parse(migrated).outbox[0].geodependency,'WH_SG_1');await stop();base=await start();assert.equal(raw(),migrated);assert.equal(readdirSync(dir).filter(name=>name.startsWith('backup-before-wildhut-geo-rename-')).length,1);
  assert.equal((await (await fetch(base+'/api/state',{headers:{cookie:adminCookie}})).json()).map_revision,adminView.map_revision);
  assert.equal((await fetch(base+'/api/state',{headers:{cookie}})).status,200);await stop();
 }finally{if(child)await stop();rmSync(dir,{recursive:true,force:true});}
});
