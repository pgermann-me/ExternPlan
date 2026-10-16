import {planningChange,undoPlanning} from './planning-undo.js';
import {emptyState,cleanupNeeded,removeKtdAndExamplePeople} from './data-cleanup.js';
import {resolve} from 'node:path';
import {timelineBars} from './timeline.js';
import {personGroupIds,allowedFunctionRegions,validatePlanningGroup,planningPeople,controlFunctions,validateScopeRestrictions} from './public/organization.js';
import express from 'express';
import { authentication } from './auth.js';
import { manualPerson,deletePerson } from './people.js';
import { personMonth } from './person-planning.js';
import {active,publicState,deleteMaster} from './master-data.js';
import {saveFavorite,removeFavorite,previewFavorite,applyFavorite,reorderFavorites} from './favorites.js';
import ExcelJS from 'exceljs';
import { normalizeSapPerson } from './adapters/sap.js';
import { simulatedElsAdapter } from './adapters/els.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import {demo,id,audit,change,validateAssignment,coverage,makeExport,confirmExport,zone} from './domain.js';
const dataDir=process.env.DATA_DIR||'data';mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(`${dataDir}/externplan.sqlite`);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
const testFixtures=process.env.NODE_ENV==='test'&&process.env.EXTERNPLAN_TEST_FIXTURES==='1';
if(!db.prepare('SELECT id FROM state').get())db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(testFixtures?demo():emptyState()));
const read=()=>JSON.parse(db.prepare('SELECT data FROM state WHERE id=1').get().data);
function mutate(fn){db.exec('BEGIN IMMEDIATE');try{const s=read();const result=fn(s);db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(s));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
if(!testFixtures&&cleanupNeeded(read()))mutate(s=>{
 if(!cleanupNeeded(s))return null;
 const backup=resolve(dataDir,'backup-before-ktd-cleanup-'+id()+'.json');writeFileSync(backup,JSON.stringify(s),{mode:0o600,flag:'wx'});
 const result=removeKtdAndExamplePeople(s);console.log('KTD-/Beispielbereinigung abgeschlossen; Sicherung: '+backup);return result;
});
const app=express();if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);app.disable('x-powered-by');app.use(authentication());app.use(express.json({limit:'10mb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`${req.protocol}://${req.headers.host}`)return res.status(403).json({error:'Fremder Ursprung nicht zugelassen'});next();});
app.post('/api/planning/undo',(req,res)=>res.json(mutate(s=>undoPlanning(s,req.body.token))));
app.get('/api/state',(req,res)=>res.json(publicState(read())));
app.get('/api/health',(req,res)=>res.json({status:'ok',database:!!read(),timezone:zone}));
app.post('/api/assignments',(req,res)=>res.json(mutate(s=>planningChange(s,()=>{validatePlanningGroup(s,req.body);const r=validateAssignment(s,req.body);s.assignments.push(r.assignment);change(s,'create',r.assignment);audit(s,'assignment','create',null,r.assignment);return r;}))));
app.put('/api/assignments/:id',(req,res)=>res.json(mutate(s=>planningChange(s,()=>{const index=s.assignments.findIndex(x=>x.assignment_id===req.params.id);if(index<0)throw Error('Zuteilung nicht gefunden');const before=s.assignments[index];if(req.body.revision!==before.revision)throw Error('Zuteilung wurde inzwischen geändert. Neu laden.');validatePlanningGroup(s,req.body);const r=validateAssignment(s,req.body,before);s.assignments[index]=r.assignment;change(s,'update',r.assignment);audit(s,'assignment','update',before,r.assignment);return r;}))));
app.delete('/api/assignments/:id',(req,res)=>res.json(mutate(s=>planningChange(s,()=>{const index=s.assignments.findIndex(x=>x.assignment_id===req.params.id);if(index<0)throw Error('Zuteilung nicht gefunden');const before=s.assignments[index];if(Number(req.query.revision)!==before.revision)throw Error('Revision stimmt nicht überein');s.assignments.splice(index,1);change(s,'delete',{...before,revision:before.revision+1});audit(s,'assignment','delete',before,null);return {ok:true};}))));
function validPerson(s,p,previous){if(!p.employee_id||!p.name)throw Error('employee_id und Name erforderlich');if(p.department_id&&!s.departments.some(x=>x.id===p.department_id))throw Error('Abteilung unbekannt');if(personGroupIds(p).some(g=>!s.groups.some(x=>x.id===g&&(active(x)||personGroupIds(previous).includes(g)))))throw Error('Gruppe unbekannt');if(!Array.isArray(p.contacts)||p.contacts.some(c=>!c.type||!c.value||!Number.isInteger(c.priority)||c.priority<0))throw Error('Kontakte benötigen Typ, Wert und eine ganzzahlige Priorität ab 0');}
app.post('/api/people',(req,res)=>res.json(mutate(s=>{
 let employeeId;do{employeeId='EXT-'+id();}while(s.people.some(p=>p.employee_id===employeeId));
 const p=manualPerson(req.body,null,employeeId);validPerson(s,p);s.people.push(p);audit(s,'person','create',null,p);return p;
})));
app.delete('/api/people/:id',(req,res)=>res.json(mutate(s=>deletePerson(s,req.params.id))));
app.put('/api/people/:id',(req,res)=>res.json(mutate(s=>{
 const i=s.people.findIndex(p=>p.employee_id===req.params.id&&!p.deleted_at);if(i<0||s.people[i].source!=='manual')throw Error('Nur externe manuelle Personen sind bearbeitbar');
 const before=s.people[i];const p=manualPerson(req.body,before);validPerson(s,p,before);s.people[i]=p;audit(s,'person','update',before,p);return p;
})));
app.put('/api/people/:id/groups',(req,res)=>res.json(mutate(s=>{const before=s.people.find(p=>p.employee_id===req.params.id&&!p.deleted_at);if(!before)throw Error('Person unbekannt');const ids=req.body.group_ids;if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('Eindeutige Gruppen wählen');const p={...before,group_ids:ids,group_id:ids[0]||null};validPerson(s,p,before);s.people[s.people.indexOf(before)]=p;audit(s,'person','update',before,p);return p;})));
const allowed=['functions','regions','departments','groups','rules'];
function validMaster(s,type,p){if(typeof p.id!=='string'||!p.id.trim()||p.id==='undefined')throw Error('ID erforderlich');if(type!=='rules'&&!p.name)throw Error('Name erforderlich');
 if(['functions','regions'].includes(type))validateScopeRestrictions(s,type,p);
 if(type==='groups'&&p.department_id&&!s.departments.some(d=>d.id===p.department_id))throw Error('Abteilung unbekannt');
 if(type==='groups'&&p.geo_ids!=null&&(!Array.isArray(p.geo_ids)||new Set(p.geo_ids).size!==p.geo_ids.length||p.geo_ids.some(g=>!s.regions.some(r=>r.id===g&&(active(r)||s.groups.find(x=>x.id===p.id)?.geo_ids?.includes(g))))))throw Error('Gruppenregionen enthalten unbekannte oder doppelte Kennungen');
 if(type==='functions'){if(!Array.isArray(p.geo_ids)||new Set(p.geo_ids).size!==p.geo_ids.length||p.geo_ids.some(g=>!s.regions.some(r=>r.id===g&&(active(r)||s.functions.find(f=>f.id===p.id)?.geo_ids.includes(g)))))throw Error('Gebietszuordnung enthält unbekannte oder doppelte IDs');const counterpart=s.functions.find(f=>active(f)&&f.id!==p.id&&f.name===(p.name==='Notfallarzt'?'Notfallzahnarzt':p.name==='Notfallzahnarzt'?'Notfallarzt':null));if(counterpart&&JSON.stringify([...counterpart.geo_ids].sort())!==JSON.stringify([...p.geo_ids].sort()))throw Error('Notfallarzt und Notfallzahnarzt benötigen dieselbe Gebietsauswahl');for(const r of s.rules.filter(r=>active(r)&&r.function_id===p.id))if(r.geo_id!==null&&!p.geo_ids.includes(r.geo_id))throw Error('Bestehende Abdeckungsvorgabe widerspricht der Gebietszuordnung');if(!p.covers||typeof p.covers!=='object')throw Error('covers muss ein Objekt sein');if(p.name==='KTD Pikett'&&(p.geo_ids.length!==3||!['NORD','SÜD','GANZ'].every(x=>p.geo_ids.includes(x))))throw Error('KTD Pikett benötigt exakt NORD, SÜD und GANZ');for(const [whole,parts] of Object.entries(p.covers)){if(!p.geo_ids.includes(whole)||!Array.isArray(parts)||parts.includes(whole)||parts.some(g=>!p.geo_ids.includes(g)))throw Error('Gesamtgebiet und Teilgebiete müssen ausdrücklich zugeordnet sein');}for(const a of s.assignments.filter(a=>a.function_id===p.id))if(p.geo_ids.length?!p.geo_ids.includes(a.geodependency):a.geodependency!==null)throw Error('Bestehende Zuteilung widerspricht neuer Gebietszuordnung');}
 if(type==='rules'){const f=s.functions.find(f=>f.id===p.function_id&&active(f));if(!f||p.geo_id!==null&&(!f.geo_ids.includes(p.geo_id)||!s.regions.some(g=>g.id===p.geo_id&&active(g))))throw Error('Funktion/Gebiet unbekannt');if(!['continuous','weekly'].includes(p.mode))throw Error('Modus continuous oder weekly erforderlich');for(const key of ['valid_from','valid_until'])if(p[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(p[key])||!DateTime.fromISO(p[key],{zone}).isValid))throw Error('Gültigkeit als YYYY-MM-DD');if(p.valid_from&&p.valid_until&&p.valid_until<=p.valid_from)throw Error('Gültig bis muss nach gültig ab liegen (Ende exklusiv)');if(!Array.isArray(p.windows)||p.mode==='weekly'&&!p.windows.length)throw Error('Wochenzeitfenster fehlen');for(const w of p.windows)if(![w.start_day,w.end_day].every(d=>Number.isInteger(d)&&d>=1&&d<=7)||![w.start_time,w.end_time].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw Error('Wochentage 1–7 und Uhrzeiten HH:mm erforderlich');}
}
app.post('/api/master/:type',(req,res)=>res.json(mutate(s=>{const type=req.params.type;if(!allowed.includes(type))throw Error('Unbekannte Stammdaten');const p={...req.body,id:req.body.id||id()};if(s[type].some(x=>x.id===p.id&&!active(x)))throw Error('Diese Kennung wurde gelöscht und bleibt für die Historie reserviert');delete p.deleted_at;validMaster(s,type,p);const i=s[type].findIndex(x=>x.id===p.id);const before=i<0?null:s[type][i];if(i<0)s[type].push(p);else s[type][i]=p;audit(s,type,before?'update':'create',before,p);return p;})));
app.delete('/api/master/:type/:id',(req,res)=>res.json(mutate(s=>deleteMaster(s,req.params.type,req.params.id))));
app.get('/api/month',(req,res)=>{const s=publicState(read());if(!/^\d{4}-\d{2}$/.test(req.query.month||''))throw Error('Monat als YYYY-MM');const start=DateTime.fromISO(`${req.query.month}-01`,{zone});if(!start.isValid)throw Error('Ungültiger Monat');const selectedGroup=req.query.group_id;if(selectedGroup&&!s.groups.some(g=>g.id===selectedGroup))throw Error('Gruppe unbekannt');const selectedDepartment=req.query.department_id,eligible=new Set(planningPeople(s,selectedGroup,selectedDepartment).map(p=>p.employee_id));const planningState=selectedGroup||selectedDepartment?{...s,assignments:s.assignments.filter(a=>eligible.has(a.employee_id))}:s;const days=Array.from({length:start.daysInMonth},(_,i)=>start.plus({days:i}));res.json({days:days.map(d=>d.toISODate()),rows:controlFunctions(s,selectedGroup,selectedDepartment).flatMap(f=>(f.geo_ids.length?allowedFunctionRegions(f,s.groups.find(g=>g.id===selectedGroup),s.regions,selectedDepartment,s.groups):[null]).map(geo=>({function_id:f.id,geo_id:geo,...timelineBars(coverage(planningState,f.id,geo,start.toMillis(),start.plus({months:1}).toMillis()).assignments,days.map(d=>({start_on:d.toISO(),end_on:d.plus({days:1}).toISO()})),s.assignment_styles||{}),cells:days.map(d=>{const cell=coverage(planningState,f.id,geo,d.toMillis(),d.plus({days:1}).toMillis());return {...cell,...timelineBars(cell.assignments,[{start_on:d.toISO(),end_on:d.plus({days:1}).toISO()}],s.assignment_styles||{})};})}))) });});
app.get('/api/person-month',(req,res)=>{const regions=Object.hasOwn(req.query,'region_id')?[].concat(req.query.region_id).filter(Boolean):undefined;res.json(personMonth(read(),req.query.month,req.query.function_id,regions,req.query.group_id,req.query.department_id));});
app.post('/api/favorites/order',(req,res)=>res.json(mutate(s=>reorderFavorites(s,req.body.ids,req.body.expected))));
app.post('/api/favorites',(req,res)=>res.json(mutate(s=>saveFavorite(s,req.body))));
app.delete('/api/favorites/:id',(req,res)=>res.json(mutate(s=>removeFavorite(s,req.params.id,req.query.revision))));
app.post('/api/favorites/:id/preview',(req,res)=>res.json(previewFavorite(read(),req.params.id,req.body)));
app.post('/api/favorites/:id/apply',(req,res)=>res.json(mutate(s=>planningChange(s,()=>applyFavorite(s,req.params.id,req.body)))));
app.post('/api/exports',(req,res)=>res.json(mutate(s=>makeExport(s,req.body.mode||'delta'))));
app.post('/api/exports/:id/confirm',(req,res)=>res.json(mutate(s=>confirmExport(s,req.params.id))));
app.post('/api/els/people',(req,res)=>res.json(mutate(s=>{for(const p of s.people)simulatedElsAdapter.syncPerson(s.els,p);return {confirmed:s.people.length};})));
app.get('/api/exports/:id',(req,res)=>{const e=read().exports.find(x=>x.payload.export_id===req.params.id);if(!e)return res.status(404).json({error:'Nicht gefunden'});res.setHeader('Content-Disposition',`attachment; filename="els-${e.payload.export_id}.json"`);res.json(e.payload);});
// Import is two-stage: parse and inspect headers, then explicitly map columns and commit atomically.
app.post('/api/import/preview',async(req,res)=>{const {format,content}=req.body;let rows;if(format==='xlsx'){const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(content,'base64'));const sheet=workbook.worksheets[0];if(!sheet)throw Error('Leere Arbeitsmappe');const headers=sheet.getRow(1).values.slice(1).map(v=>String(v??''));rows=[];sheet.eachRow((row,n)=>{if(n>1){const r={};headers.forEach((h,i)=>{const v=row.getCell(i+1).value;r[h]=typeof v==='object'&&v!==null?(v.text??v.result??String(v)):v;});rows.push(r);}});}else{const parsed=JSON.parse(content);rows=Array.isArray(parsed)?parsed:Array.isArray(parsed.people)?parsed.people:Array.isArray(parsed.persons)?parsed.persons:null;if(!rows)throw Error('JSON benötigt ein Array oder people/persons; Struktur zuerst prüfen');}res.json({rows,headers:[...new Set(rows.flatMap(r=>Object.keys(r)))],count:rows.length});});
app.post('/api/import/commit',(req,res)=>res.json(mutate(s=>{const {type,rows,mapping}=req.body;if(!Array.isArray(rows)||rows.length>10000)throw Error('Import erwartet maximal 10 000 Datensätze');let imported=0,skipped=0;
 const get=(r,k)=>r[mapping[k]];const list=v=>Array.isArray(v)?v.map(String):String(v??'').split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
 for(const r of rows){
  if(type==='sap'){const p=normalizeSapPerson(r,mapping);const existing=s.people.find(x=>x.employee_id===p.employee_id);if(existing?.deleted_at||existing?.source==='manual'){skipped++;continue;}if(!s.departments.some(d=>d.id===p.department_id)){const d={id:p.department_id,name:p.department_id};s.departments.push(d);audit(s,'departments','create',null,d);}if(existing){p.group_ids=personGroupIds(existing);p.group_id=p.group_ids[0]||null;}validPerson(s,p,existing);if(existing)s.people[s.people.indexOf(existing)]=p;else s.people.push(p);audit(s,'person','import',existing||null,p);imported++;}
  else if(type==='regions'||type==='functions'){const p=type==='regions'?{id:String(get(r,'id')??'').trim(),name:String(get(r,'name')??'')}:{id:String(get(r,'id')??'').trim(),name:String(get(r,'name')??''),geo_ids:list(get(r,'geo_ids')),covers:{}};const existing=s[type].find(x=>x.id===p.id);if(existing&&!active(existing))throw Error('Import enthält eine gelöschte, für die Historie reservierte Kennung');if(type==='functions'&&existing)p.covers=existing.covers;validMaster(s,type,p);if(existing)s[type][s[type].indexOf(existing)]=p;else s[type].push(p);audit(s,type,'import',existing||null,p);imported++;}
  else throw Error('Importtyp sap, regions oder functions erforderlich');
 }return {imported,skipped};})));
app.get('/vendor/html2canvas.js',(req,res)=>res.sendFile(resolve('node_modules/html2canvas/dist/html2canvas.min.js')));
app.get('/vendor/jspdf.js',(req,res)=>res.sendFile(resolve('node_modules/jspdf/dist/jspdf.umd.min.js')));
app.use(express.static('public'));
app.use((err,req,res,next)=>res.status(400).json({error:err.message}));
const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`ExternPlan läuft auf Port ${server.address().port}`));
