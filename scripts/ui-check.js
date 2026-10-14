import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'externplan-ui-'));
const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3109',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{let output='';server.stdout.on('data',d=>{output+=d;if(output.includes('Port 3109'))resolve();});server.on('exit',code=>reject(Error('Server exit '+code)));});
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3109');await page.locator('.month').waitFor();
 await page.locator('#month').fill('2026-10');await page.locator('#month').dispatchEvent('change');
 await page.locator('#function-filter').selectOption('DEMO-KTD');await page.waitForTimeout(100);
 await page.locator('.board').evaluate(e=>e.scrollLeft=600);
 await page.locator('#new-assignment').click();await page.locator('[name=employee_id]').selectOption('DEMO-001');await page.locator('[name=geodependency]').selectOption('NORD');await page.locator('[name=start_on]').fill('2026-10-07T07:00');await page.locator('[name=end_on]').fill('2026-10-08T07:00');await page.locator('#form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);await page.waitForTimeout(100);
 assert.equal(await page.locator('#function-filter').inputValue(),'DEMO-KTD');assert.equal(await page.locator('.board').evaluate(e=>e.scrollLeft),600);
 await page.locator('td[data-geo=NORD][data-day="2026-10-07"]').click();await page.getByRole('heading',{name:'Offene Zeitabschnitte'}).waitFor();await page.locator('[data-edit]').click();await page.locator('[name=priority]').fill('4');await page.locator('#form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
 await page.getByRole('button',{name:'Organisation / Personen',exact:true}).click();await page.locator('#new-person').click();await page.locator('[name=employee_id]').fill('BROWSER-EXT');await page.locator('[name=name]').fill('Browser Test');await page.locator('[name=group_id]').selectOption('demo-gruppe');await page.locator('#form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);await page.getByRole('heading',{name:'Browser Test',exact:true}).waitFor();
 await page.getByRole('button',{name:'ELS-Schnittstelle',exact:true}).click();await page.locator('#delta').click();await page.locator('[data-confirm]').click();await page.getByText('delta · Import bestätigt',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Stammdaten & Soll-Abdeckung',exact:true}).click();await page.locator('[data-master-new=rules]').click();await page.locator('[name=json]').fill(JSON.stringify({id:'BROWSER-RULE',function_id:'DEMO-ORT',geo_id:null,mode:'continuous',windows:[],valid_from:null,valid_until:null}));await page.locator('#form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
 await page.getByRole('button',{name:'Funktion / Gebiet',exact:true}).click();await page.locator('.month').waitFor();await page.screenshot({path:'/tmp/externplan-ui.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Browserprüfung bestanden: Planung, Zellenbearbeitung, Scroll-/Filtererhalt, Personenanlage, ELS-Bestätigung, Abdeckungsvorgaben.');
}finally{if(browser)await browser.close();await new Promise(r=>{server.on('exit',r);server.kill();});rmSync(dir,{recursive:true,force:true});}
