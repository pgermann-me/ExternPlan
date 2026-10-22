import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {regionFixture} from '../scripts/fixtures/pikett-region.js';
test('HTTP point queries and polygon map enforce authentication, roles, scopes and Swiss time',async()=>{
 const dir=mkdtempSync('/tmp/externplan-point-api-'),{state,mapData}=regionFixture(),db=new DatabaseSync(dir+'/externplan.sqlite');
 db.exec('CREATE TABLE state (id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE imported_map_layers (id TEXT PRIMARY KEY, data TEXT NOT NULL)');db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(state));db.prepare('INSERT INTO imported_map_layers VALUES(?,?)').run('test-map',JSON.stringify(mapData.layers[0]));db.close();
 const secret='Point-Setup-123456789',password='Point-Password-123456789',server=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',EXTERNPLAN_TEST_FIXTURES:'1',EXTERNPLAN_AUTH_TEST_BYPASS:'0',APP_PASSWORD:secret,PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error(log)),15000);server.stdout.on('data',data=>{log+=data;const m=log.match(/Port (\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});server.stderr.on('data',data=>log+=data);server.once('exit',()=>{clearTimeout(timer);reject(Error(log));});});
  const call=async(path,method='GET',body,cookie='')=>{const r=await fetch(`http://127.0.0.1:${port}/api`+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const ok=async(...args)=>{const r=await call(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r;};
  const point='/pikett-by-region?lat=47.3&lng=9.4&at=2026-10-22T12:00';
  assert.equal((await call(point)).status,401);assert.equal((await call('/pikett-region-map')).status,401);
  const admin=(await ok('/auth/setup','POST',{setup_secret:secret,first_name:'Admin',last_name:'Test',email:'admin@point.invalid',password})).cookie;
  assert.equal((await ok('/pikett-region-map','GET',undefined,admin)).data.features.length,2);
  assert.ok((await ok(point,'GET',undefined,admin)).data.rows.some(r=>r.employee_id==='HIDDEN'));
  await ok('/users','POST',{first_name:'User',last_name:'Test',email:'user@point.invalid',role:'user',password,access_scope:{department_ids:['D'],group_ids:['G'],region_ids:['R1']}},admin);
  let cookie=(await ok('/auth/login','POST',{email:'user@point.invalid',password})).cookie;
  cookie=(await ok('/auth/password','POST',{current_password:password,password:password+'-Neu'},cookie)).cookie;
  const map=(await ok('/pikett-region-map','GET',undefined,cookie)).data;assert.equal(map.features.length,1);assert.equal(map.features[0].properties.GEO_ID,'SHAPE-A');assert.ok(!JSON.stringify(map).includes('private'));
  assert.equal((await call('/region-map','GET',undefined,cookie)).status,403);
  const result=(await ok(point,'GET',undefined,cookie)).data;assert.deepEqual(result.regions.map(r=>r.id),['R1']);assert.ok(result.rows.some(r=>r.kind==='always'));assert.ok(!JSON.stringify(result).includes('HIDDEN'));
  assert.equal((await ok('/pikett-by-region?lat=47.65&lng=9.85','GET',undefined,cookie)).data.rows.length,0);
  for(const url of ['/pikett-by-region','/pikett-by-region?lat=abc&lng=9','/pikett-by-region?lat=91&lng=9','/pikett-by-region?lat=47&lng=9&at=2026-03-29T02:30'])assert.equal((await call(url,'GET',undefined,cookie)).status,400);
  assert.equal((await ok('/pikett-by-region?lat=47&lng=9&at=2026-10-25T02:30','GET',undefined,cookie)).data.at,'2026-10-25T00:30:00.000Z');
  const beforeDuties=(await ok('/state','GET',undefined,cookie)).data.assignments;
  await ok('/planning/always','POST',{employee_id:'P',function_id:'W',geo_id:'R1',action:'update',priority:0,expected_priority:2},cookie);
  assert.deepEqual((await ok(point,'GET',undefined,cookie)).data.rows.filter(r=>r.kind==='always').map(r=>r.priority),[1,0]);
  assert.equal((await call('/planning/always','POST',{employee_id:'P',function_id:'W',geo_id:'R2',action:'add'},cookie)).status,403);
  assert.equal((await call('/planning/always','POST',{employee_id:'HIDDEN',function_id:'W',geo_id:'R1',action:'add'},cookie)).status,403);
  assert.equal((await call('/people/P','PUT',{first_name:'Fremde Änderung'},cookie)).status,403);
  await ok('/planning/always','POST',{employee_id:'P2',function_id:'W',geo_id:'R1',action:'remove',expected_priority:1},cookie);
  const after=(await ok('/state','GET',undefined,cookie)).data;assert.ok(!after.people.some(p=>p.employee_id==='P2'));assert.deepEqual(after.assignments,beforeDuties);
 }finally{await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);server.kill();});rmSync(dir,{recursive:true,force:true});}
});
