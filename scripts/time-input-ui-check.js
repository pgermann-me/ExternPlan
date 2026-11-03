import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir=mkdtempSync('/tmp/externplan-time-input-'),server=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',EXTERNPLAN_TEST_FIXTURES:'1',DATA_DIR:dir,PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
try{
 const port=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error(log)),15000);server.stdout.on('data',data=>{log+=data;const m=log.match(/Port (\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});server.stderr.on('data',d=>log+=d);server.once('exit',()=>{clearTimeout(timer);reject(Error(log));});});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://tile.openstreetmap.org/**',r=>r.abort());await page.goto('http://127.0.0.1:'+port);
 await page.getByRole('button',{name:'Pikettliste',exact:true}).click();const field=page.locator('#pikett-list-at');await field.waitFor();await field.fill('');await field.pressSequentially('27');assert.equal(await field.inputValue(),'27.');await field.press('Backspace');assert.equal(await field.inputValue(),'2');await field.pressSequentially('71020261340');assert.equal(await field.inputValue(),'27.10.2026 13:40');
 const response=page.waitForResponse(r=>r.url().includes('/api/pikett-list?'));await page.getByRole('button',{name:'Anzeigen',exact:true}).click();assert.equal((await (await response).json()).at,'2026-10-27T12:40:00.000Z');
 // Replacing a middle part keeps the rest of the timestamp and caret usable.
 await field.evaluate(input=>{input.focus();input.setSelectionRange(3,5);});await field.pressSequentially('11');assert.equal(await field.inputValue(),'27.11.2026 13:40');
 await field.evaluate(input=>{input.value='191019721340';input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));});assert.equal(await field.inputValue(),'19.10.1972 13:40');
 await field.press('ControlOrMeta+a');await field.press('Backspace');assert.equal(await field.inputValue(),'');
 // Dynamically mounted views share the same formatter.
 await page.getByRole('tab',{name:'Pikett nach Region',exact:true}).click();const point=page.locator('#pikett-region-at');await point.fill('271020261340');assert.equal(await point.inputValue(),'27.10.2026 13:40');
 await page.getByRole('button',{name:'Kontrollansicht',exact:true}).click();await page.locator('#new-assignment').click();const start=page.locator('[name=start_on]');await start.fill('271020260700');assert.equal(await start.inputValue(),'27.10.2026 07:00');assert.equal(await start.getAttribute('inputmode'),'numeric');await page.locator('#cancel').click();
 await page.getByRole('button',{name:'Favoritendienste',exact:true}).click();await page.locator('#new-favorite').click();const time=page.locator('[name=start_time]');await time.fill('0745');assert.equal(await time.inputValue(),'07:45');await time.fill('07');await time.press('Backspace');assert.equal(await time.inputValue(),'0');await page.locator('#cancel').click();
 assert.deepEqual(errors,[]);console.log('Datum-/Zeit-Browserprüfung bestanden: Trennzeichen, Einfügen, Rücktaste, Korrektur in der Mitte, Schweizer Zeit und dynamische Dialoge.');
}finally{await browser?.close();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);server.kill();});rmSync(dir,{recursive:true,force:true});}
