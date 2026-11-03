import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {gzipSync,deflateSync,brotliCompressSync} from 'node:zlib';

test('Compressed JSON is rejected before parsing; malformed streams cannot stop the server or create an account',async()=>{
 const dir=mkdtempSync('/tmp/externplan-request-security-'),secret='Security-Test-Bootstrap-123456789';
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',EXTERNPLAN_TEST_FIXTURES:'1',EXTERNPLAN_AUTH_TEST_BYPASS:'0',APP_PASSWORD:secret,DATA_DIR:dir,PORT:'0'},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>{child.kill();reject(Error(log));},15000);child.stdout.on('data',d=>{log+=d;const m=log.match(/Port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.stderr.on('data',d=>log+=d);child.once('exit',()=>{clearTimeout(timer);reject(Error(log));});});
  const setup={setup_secret:secret,first_name:'Security',last_name:'Test',email:'security@example.invalid',password:'Security-Test-Password-123456789'},plain=Buffer.from(JSON.stringify(setup));
  for(const [encoding,compress] of [['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]]){
   for(const body of [compress(plain),Buffer.concat([compress(plain),Buffer.from('invalid trailing bytes')]),Buffer.from('invalid compressed body')]){
    const response=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':encoding},body});assert.equal(response.status,415);await response.json();
    assert.equal((await fetch(base+'/api/health')).status,200);
   }
  }
  assert.equal((await (await fetch(base+'/api/auth/session')).json()).needs_setup,true);
  const created=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:plain});assert.equal(created.status,200);const cookie=created.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/api/state',{headers:{cookie}})).status,200);
 }finally{if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});rmSync(dir,{recursive:true,force:true});}
});
