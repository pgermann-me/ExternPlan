import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir=mkdtempSync('/tmp/externplan-busy-ui-'),server=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',EXTERNPLAN_TEST_FIXTURES:'1',PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let browser;
try{
 const port=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error(log)),15000);server.stdout.on('data',data=>{log+=data;const match=log.match(/Port (\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});server.stderr.on('data',data=>log+=data);server.once('exit',()=>{clearTimeout(timer);reject(Error(log));});});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));const base='http://127.0.0.1:'+port;
 // Control the response rather than relying on a particular server speed.
 let release,started;const gate=new Promise(resolve=>release=resolve),requestStarted=new Promise(resolve=>started=resolve);
 await page.route('**/api/state',async route=>{started();await gate;await route.continue();});
 await page.goto(base,{waitUntil:'domcontentloaded'});await requestStarted;
 assert.equal(await page.locator('#busy-indicator:visible').count(),0);
 await page.locator('#busy-indicator').waitFor({state:'visible'});assert.match(await page.locator('#busy-indicator').innerText(),/Bitte warten/);release();
 await page.locator('.month').waitFor();await page.locator('#busy-indicator').waitFor({state:'hidden'});await page.unroute('**/api/state');
 // The status must appear in the top layer over a modal, without taking focus or clicks.
 await page.evaluate(async()=>{
  const {withBusy}=await import('/busy.js');const dialog=document.createElement('dialog');dialog.id='busy-test-dialog';dialog.innerHTML='<button id="busy-test-button">Bedienbar</button>';document.body.append(dialog);dialog.showModal();dialog.querySelector('button').focus();
  window.busyFirst=withBusy(()=>new Promise(resolve=>window.finishBusyFirst=resolve));window.busySecond=withBusy(()=>new Promise(resolve=>window.finishBusySecond=resolve));
 });
 await page.locator('#busy-indicator').waitFor({state:'visible'});assert.equal(await page.locator('#busy-indicator').evaluate(e=>e.matches(':popover-open')),true);assert.equal(await page.locator('#busy-test-button').evaluate(e=>document.activeElement===e),true);await page.locator('#busy-test-button').click();
 await page.evaluate(async()=>{window.finishBusyFirst();await window.busyFirst;});assert.equal(await page.locator('#busy-indicator').isVisible(),true);
 await page.evaluate(async()=>{window.finishBusySecond();await window.busySecond;document.querySelector('#busy-test-dialog').remove();});await page.locator('#busy-indicator').waitFor({state:'hidden'});
 // A delayed server error must clear the status and preserve the usual error message.
 let finishError;const errorGate=new Promise(resolve=>finishError=resolve);
 await page.route('**/api/person-month?**',async route=>{await errorGate;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Testfehler der Abfrage'})});});
 await page.getByRole('button',{name:'Planung',exact:true}).click();await page.locator('#busy-indicator').waitFor({state:'visible'});finishError();await page.locator('#message').filter({hasText:'Testfehler der Abfrage'}).waitFor();await page.locator('#busy-indicator').waitFor({state:'hidden'});
 // The shared status is also active in the separate person services window and on login.
 const calendar=await browser.newPage();let finishCalendar;const calendarGate=new Promise(resolve=>finishCalendar=resolve);
 await calendar.route('**/api/state',async route=>{await calendarGate;await route.continue();});await calendar.goto(base+'/person-calendar.html?employee_id=DEMO-001',{waitUntil:'domcontentloaded'});await calendar.locator('#busy-indicator').waitFor({state:'visible'});finishCalendar();await calendar.locator('#busy-indicator').waitFor({state:'hidden'});await calendar.close();
 const login=await browser.newPage();let finishLogin;const loginGate=new Promise(resolve=>finishLogin=resolve);
 await login.route('**/api/auth/session',async route=>{await loginGate;await route.fulfill({contentType:'application/json',body:JSON.stringify({user:null,needs_setup:false})});});await login.goto(base+'/login.html',{waitUntil:'domcontentloaded'});await login.locator('#busy-indicator').waitFor({state:'visible'});finishLogin();await login.locator('#busy-indicator').waitFor({state:'hidden'});await login.close();
 await page.emulateMedia({media:'print'});await page.evaluate(async()=>{window.printBusy=(await import('/busy.js')).withBusy(()=>new Promise(resolve=>window.finishPrintBusy=resolve));});
 await page.waitForFunction(()=>document.querySelector('#busy-indicator').matches(':popover-open'));assert.equal(await page.locator('#busy-indicator').isVisible(),false);await page.evaluate(async()=>{window.finishPrintBusy();await window.printBusy;});
 assert.deepEqual(errors,[]);console.log('Ladeanzeige-Browserprüfung bestanden: Verzögerung, parallele Vorgänge, Dialoge, Fehler, Personenfenster, Anmeldung und Druck.');
}finally{await browser?.close();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);server.kill();});rmSync(dir,{recursive:true,force:true});}
