import {mergeContinuousDuties} from './continuous-migration.js';
import {createStandingDuties,validateStandingFunction} from './standing-duties.js';
import {bulkPeopleOrganization,bulkDeletePeople,bulkDeletePersonDuties} from './people-bulk.js';
import {previewHunters,importHunters} from './hunter-import.js';
import {bulkRegionScopes} from './region-bulk.js';
import {inspectGeojson,mapGeojson,geojsonConflicts,prepareGeojsonImport} from './geojson-import.js';
import {accessContext} from './request-context.js';
import {restricted,accessPolicy,scopedState,assertScopedMutation,scopedPersonInput,assertFavoriteAccess,scopedFavoriteOrder} from './access-scope.js';
import {pikettList} from './public/pikett-list-data.js';
import {transferAssignment} from './assignment-transfer.js';
import {createOnCallPersonExport} from './adapters/oncall-person.js';
import {planningChange,undoPlanning} from './planning-undo.js';
import {emptyState,cleanupNeeded,removeKtdAndExamplePeople} from './data-cleanup.js';
import {resolve} from 'node:path';
import {timelineBars} from './timeline.js';
import {personGroupIds,allowedFunctionRegions,validatePlanningGroup,planningPeople,controlFunctions,validateScopeRestrictions} from './public/organization.js';
import express from 'express';
import {installAccounts,roleViews} from './accounts.js';
import { manualPerson,deletePerson,personDetails,validatePersonAffiliations } from './people.js';
import { personMonth } from './person-planning.js';
import {active,publicState,deleteMaster} from './master-data.js';
import {saveFavorite,removeFavorite,previewFavorite,applyFavorite,reorderFavorites} from './favorites.js';
import ExcelJS from 'exceljs';
import { normalizeSapPerson } from './adapters/sap.js';
import { simulatedElsAdapter } from './adapters/els.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import {demo,id,audit,change,validateAssignment,coverage,makeExport,confirmExport,zone,iso,instant,automaticSwissInstant} from './domain.js';
const dataDir=process.env.DATA_DIR||'data';mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(`${dataDir}/externplan.sqlite`);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
const testFixtures=process.env.NODE_ENV==='test'&&process.env.EXTERNPLAN_TEST_FIXTURES==='1';
if(!db.prepare('SELECT id FROM state').get())db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(testFixtures?demo():emptyState()));
const read=()=>JSON.parse(db.prepare('SELECT data FROM state WHERE id=1').get().data);
function mutate(fn){db.exec('BEGIN IMMEDIATE');try{const s=read(),user=accessContext.getStore(),before=restricted(user)?structuredClone(s):null;const result=fn(s);if(before)assertScopedMutation(before,s,user);db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(s));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
if(!testFixtures&&cleanupNeeded(read()))mutate(s=>{
 if(!cleanupNeeded(s))return null;
 const backup=resolve(dataDir,'backup-before-ktd-cleanup-'+id()+'.json');writeFileSync(backup,JSON.stringify(s),{mode:0o600,flag:'wx'});
 const result=removeKtdAndExamplePeople(s);console.log('KTD-/Beispielbereinigung abgeschlossen; Sicherung: '+backup);return result;
});
if(read().regions.some(r=>r.name==='region Wil/Uzwil/Gossau'))mutate(s=>{for(const r of s.regions.filter(r=>r.name==='region Wil/Uzwil/Gossau')){const before={...r};r.name='Region Wil/Uzwil/Gossau';audit(s,'regions','update',before,{...r});}});
if(read().continuous_storage_version!==1)mutate(s=>mergeContinuousDuties(s));
const app=express();if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);app.disable('x-powered-by');app.use(express.json({limit:'10mb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`${req.protocol}://${req.headers.host}`)return res.status(403).json({error:'Fremder Ursprung nicht zugelassen'});next();});
installAccounts(app,db,{dataDir,getState:read,recordAudit:(action,before,after,actor)=>{const s=read();audit(s,'user',action,before,after);if(actor)s.audit.at(-1).actor=actor;db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(s));}});
app.use('/api',(req,res,next)=>{if(restricted(req.user)){const p=accessPolicy(read(),req.user);for(const [key,ids] of [['department_id',p.departmentIds],['group_id',p.groupIds],['function_id',p.functionIds],['region_id',p.regionIds],['planning_department_id',p.departmentIds],['planning_group_id',p.groupIds]])for(const value of [].concat(req.query[key]||req.body?.[key]||[]))if(value&&!ids.has(value))return res.status(403).json({error:'Dieser Filter liegt ausserhalb Ihrer Berechtigung'});}next();});
app.post('/api/planning/undo',(req,res)=>res.json(mutate(s=>undoPlanning(s,req.body.token))));
app.get('/api/state',(req,res)=>{const state=publicState(scopedState(read(),req.user));if(req.user.role!=='admin')for(const key of ['audit','exports','person_exports','outbox','els'])delete state[key];res.json({...state,current_user:req.user,allowed_views:roleViews[req.user.role],...(req.user.role==='admin'?{map_revision:db.prepare('SELECT COUNT(*) AS n FROM imported_map_layers').get().n}:{})});});
const regionMapLayers=[['amtsarzt','Amtsarzt','Amtsarzt_Gebiete.geojson'],['ua','Untersuchungsämter','UA_Regionen.geojson'],['wildhut','Wildhut','Wildhut_Kanton_SG.geojson']].map(([id,name,filename])=>({id,name,filename,geojson:JSON.parse(readFileSync(new URL('./map-data/'+filename,import.meta.url),'utf8'))}));
db.exec('CREATE TABLE IF NOT EXISTS imported_map_layers (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
const mapLayers=()=>[...regionMapLayers,...db.prepare('SELECT data FROM imported_map_layers ORDER BY rowid').all().map(r=>JSON.parse(r.data))];
app.get('/api/region-map',(req,res)=>res.json({layers:mapLayers()}));
app.post('/api/geojson/preview',(req,res)=>{if(!req.body.mapping)return res.json(inspectGeojson(req.body.geojson));const {geojson,...preview}=mapGeojson(req.body.geojson,req.body.mapping);res.json({...preview,conflicts:geojsonConflicts(mapLayers(),preview)});});
app.post('/api/geojson/import',(req,res)=>res.json(mutate(s=>{const {layer,summary}=prepareGeojsonImport(s,mapLayers(),req.body);db.prepare('INSERT INTO imported_map_layers (id,data) VALUES (?,?)').run(layer.id,JSON.stringify(layer));return summary;})));
app.get('/api/health',(req,res)=>res.json({status:'ok',database:!!read(),timezone:zone}));
function assignmentStyle(s,a,input){if(input.color===undefined)return;if(!/^#[0-9a-f]{6}$/i.test(input.color))throw Error('Ungültige Dienstfarbe');s.assignment_styles??={};s.assignment_styles[a.assignment_id]={...s.assignment_styles[a.assignment_id],color:input.color};}
app.post('/api/assignments/delete-many',(req,res)=>res.json(mutate(s=>planningChange(s,()=>{
 const entries=req.body.assignments;if(!Array.isArray(entries)||!entries.length||entries.length>1000||new Set(entries.map(e=>e?.assignment_id)).size!==entries.length)throw Error('1 bis 1000 eindeutige Dienste auswählen');
 const removed=entries.map(e=>{const a=s.assignments.find(a=>a.assignment_id===e?.assignment_id);if(!a||a.revision!==e.revision)throw Error('Ein ausgewählter Dienst wurde inzwischen geändert oder gelöscht. Neu laden und erneut auswählen.');return a;});
 const ids=new Set(removed.map(a=>a.assignment_id));s.assignments=s.assignments.filter(a=>!ids.has(a.assignment_id));
 for(const a of removed){change(s,'delete',{...a,revision:a.revision+1});audit(s,'assignment','delete',a,null);}
 return {deleted:removed.length};
}))));
app.post('/api/assignments',(req,res)=>res.json(mutate(s=>planningChange(s,()=>{validatePlanningGroup(s,req.body);const r=validateAssignment(s,req.body);s.assignments.push(r.assignment);assignmentStyle(s,r.assignment,req.body);change(s,'create',r.assignment);audit(s,'assignment','create',null,r.assignment);return r;}))));
app.post('/api/assignments/:id/transfer',(req,res)=>res.json(mutate(s=>planningChange(s,()=>transferAssignment(s,req.params.id,req.body)))));
app.put('/api/assignments/:id',(req,res)=>res.json(mutate(s=>planningChange(s,()=>{const index=s.assignments.findIndex(x=>x.assignment_id===req.params.id);if(index<0)throw Error('Zuteilung nicht gefunden');const before=s.assignments[index];if(req.body.revision!==before.revision)throw Error('Zuteilung wurde inzwischen geändert. Neu laden.');validatePlanningGroup(s,req.body);const r=validateAssignment(s,req.body,before);s.assignments[index]=r.assignment;assignmentStyle(s,r.assignment,req.body);change(s,'update',r.assignment);audit(s,'assignment','update',before,r.assignment);return r;}))));
app.delete('/api/assignments/:id',(req,res)=>res.json(mutate(s=>planningChange(s,()=>{const index=s.assignments.findIndex(x=>x.assignment_id===req.params.id);if(index<0)throw Error('Zuteilung nicht gefunden');const before=s.assignments[index];if(Number(req.query.revision)!==before.revision)throw Error('Revision stimmt nicht überein');s.assignments.splice(index,1);change(s,'delete',{...before,revision:before.revision+1});audit(s,'assignment','delete',before,null);return {ok:true};}))));
function validPerson(s,p,previous){validatePersonAffiliations(s,p,previous);if(!p.employee_id||!p.name)throw Error('employee_id und Name erforderlich');if(p.department_id&&!s.departments.some(x=>x.id===p.department_id))throw Error('Abteilung unbekannt');if(personGroupIds(p).some(g=>!s.groups.some(x=>x.id===g&&(active(x)||personGroupIds(previous).includes(g)))))throw Error('Gruppe unbekannt');if(!Array.isArray(p.contacts)||p.contacts.some(c=>!c.type||!c.value||!Number.isInteger(c.priority)||c.priority<0))throw Error('Kontakte benötigen Typ, Wert und eine ganzzahlige Priorität ab 0');}
app.post('/api/people/delete-duties',(req,res)=>res.json(mutate(s=>bulkDeletePersonDuties(s,req.body,req.user))));
app.post('/api/people/delete-many',(req,res)=>res.json(mutate(s=>bulkDeletePeople(s,req.body.employee_ids,req.user))));
app.post('/api/people/bulk-organization',(req,res)=>res.json(mutate(s=>bulkPeopleOrganization(s,req.body,req.user))));
app.post('/api/people',(req,res)=>res.json(mutate(s=>{
 let employeeId;do{employeeId='EXT-'+id();}while(s.people.some(p=>p.employee_id===employeeId));
 const p=manualPerson(scopedPersonInput(s,req.user,req.body),null,employeeId);validPerson(s,p);s.people.push(p);audit(s,'person','create',null,p);return restricted(req.user)?accessPolicy(s,req.user).projectPerson(p):p;
})));
app.delete('/api/people/:id',(req,res)=>res.json(mutate(s=>deletePerson(s,req.params.id))));
app.put('/api/people/:id',(req,res)=>res.json(mutate(s=>{
 const i=s.people.findIndex(p=>p.employee_id===req.params.id&&!p.deleted_at);if(i<0||s.people[i].source!=='manual')throw Error('Nur externe manuelle Personen sind bearbeitbar');
 const before=s.people[i];const p=manualPerson(scopedPersonInput(s,req.user,req.body,before),before);validPerson(s,p,before);s.people[i]=p;audit(s,'person','update',before,p);return restricted(req.user)?accessPolicy(s,req.user).projectPerson(p):p;
})));
app.put('/api/people/:id/groups',(req,res)=>res.json(mutate(s=>{const before=s.people.find(p=>p.employee_id===req.params.id&&!p.deleted_at);if(!before)throw Error('Person unbekannt');const values=scopedPersonInput(s,req.user,{group_ids:req.body.group_ids,function_regions:req.body.function_regions,department_id:accessPolicy(s,req.user).projectPerson(before).department_id},before),ids=values.group_ids;if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('Eindeutige Gruppen wählen');const p={...before,...personDetails({...values,birth_date:req.body.birth_date},before),group_ids:ids,group_id:ids[0]||null};validPerson(s,p,before);s.people[s.people.indexOf(before)]=p;audit(s,'person','update',before,p);return restricted(req.user)?accessPolicy(s,req.user).projectPerson(p):p;})));
const allowed=['functions','regions','departments','groups','rules'];
function validMaster(s,type,p){if(type==='functions')validateStandingFunction(p);if(typeof p.id!=='string'||!p.id.trim()||p.id==='undefined')throw Error('ID erforderlich');if(type!=='rules'&&!p.name)throw Error('Name erforderlich');
 if(['functions','regions'].includes(type))validateScopeRestrictions(s,type,p);
 if(type==='regions'&&p.polygon_geo_id!=null&&(typeof p.polygon_geo_id!=='string'||!mapLayers().some(l=>l.geojson.features.some(f=>f.properties.GEO_ID===p.polygon_geo_id))))throw Error('Unbekanntes Kartenpolygon');
 if(type==='groups'&&p.department_id&&!s.departments.some(d=>d.id===p.department_id))throw Error('Abteilung unbekannt');
 if(type==='groups'&&p.geo_ids!=null&&(!Array.isArray(p.geo_ids)||new Set(p.geo_ids).size!==p.geo_ids.length||p.geo_ids.some(g=>!s.regions.some(r=>r.id===g&&(active(r)||s.groups.find(x=>x.id===p.id)?.geo_ids?.includes(g))))))throw Error('Gruppenregionen enthalten unbekannte oder doppelte Kennungen');
 if(type==='functions'){if(!Array.isArray(p.geo_ids)||new Set(p.geo_ids).size!==p.geo_ids.length||p.geo_ids.some(g=>!s.regions.some(r=>r.id===g&&(active(r)||s.functions.find(f=>f.id===p.id)?.geo_ids.includes(g)))))throw Error('Gebietszuordnung enthält unbekannte oder doppelte IDs');const counterpart=s.functions.find(f=>active(f)&&f.id!==p.id&&f.name===(p.name==='Notfallarzt'?'Notfallzahnarzt':p.name==='Notfallzahnarzt'?'Notfallarzt':null));if(counterpart&&JSON.stringify([...counterpart.geo_ids].sort())!==JSON.stringify([...p.geo_ids].sort()))throw Error('Notfallarzt und Notfallzahnarzt benötigen dieselbe Gebietsauswahl');for(const r of s.rules.filter(r=>active(r)&&r.function_id===p.id))if(r.geo_id!==null&&!p.geo_ids.includes(r.geo_id))throw Error('Bestehende Abdeckungsvorgabe widerspricht der Gebietszuordnung');if(!p.covers||typeof p.covers!=='object')throw Error('covers muss ein Objekt sein');if(p.name==='KTD Pikett'&&(p.geo_ids.length!==3||!['NORD','SÜD','GANZ'].every(x=>p.geo_ids.includes(x))))throw Error('KTD Pikett benötigt exakt NORD, SÜD und GANZ');for(const [whole,parts] of Object.entries(p.covers)){if(!p.geo_ids.includes(whole)||!Array.isArray(parts)||parts.includes(whole)||parts.some(g=>!p.geo_ids.includes(g)))throw Error('Gesamtgebiet und Teilgebiete müssen ausdrücklich zugeordnet sein');}for(const a of s.assignments.filter(a=>a.function_id===p.id))if(p.geo_ids.length?!p.geo_ids.includes(a.geodependency):a.geodependency!==null)throw Error('Bestehende Zuteilung widerspricht neuer Gebietszuordnung');}
 if(type==='rules'){const f=s.functions.find(f=>f.id===p.function_id&&active(f));if(!f||p.geo_id!==null&&(!f.geo_ids.includes(p.geo_id)||!s.regions.some(g=>g.id===p.geo_id&&active(g))))throw Error('Funktion/Gebiet unbekannt');if(!['continuous','weekly'].includes(p.mode))throw Error('Modus continuous oder weekly erforderlich');for(const key of ['valid_from','valid_until'])if(p[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(p[key])||!DateTime.fromISO(p[key],{zone}).isValid))throw Error('Gültigkeit als YYYY-MM-DD');if(p.valid_from&&p.valid_until&&p.valid_until<=p.valid_from)throw Error('Gültig bis muss nach gültig ab liegen (Ende exklusiv)');if(!Array.isArray(p.windows)||p.mode==='weekly'&&!p.windows.length)throw Error('Wochenzeitfenster fehlen');for(const w of p.windows)if(![w.start_day,w.end_day].every(d=>Number.isInteger(d)&&d>=1&&d<=7)||![w.start_time,w.end_time].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw Error('Wochentage 1–7 und Uhrzeiten HH:mm erforderlich');}
}
app.post('/api/regions/bulk-scope',(req,res)=>res.json(mutate(s=>bulkRegionScopes(s,req.body))));
app.post('/api/master/:type',(req,res)=>res.json(mutate(s=>{const type=req.params.type;if(!allowed.includes(type))throw Error('Unbekannte Stammdaten');const p={...req.body,id:req.body.id||id()};if(s[type].some(x=>x.id===p.id&&!active(x)))throw Error('Diese Kennung wurde gelöscht und bleibt für die Historie reserviert');delete p.deleted_at;const standing=p.standing_dates;delete p.standing_dates;validMaster(s,type,p);const i=s[type].findIndex(x=>x.id===p.id);const before=i<0?null:s[type][i];if(i<0)s[type].push(p);else s[type][i]=p;audit(s,type,before?'update':'create',before,p);const standing_result=type==='functions'&&p.duty_time_model==='always'&&(standing||before?.duty_time_model!=='always')?createStandingDuties(s,p.id,standing||{}):null;return standing_result?{...p,standing_result}:p;})));
app.delete('/api/master/:type/:id',(req,res)=>res.json(mutate(s=>deleteMaster(s,req.params.type,req.params.id))));
app.get('/api/month',(req,res)=>{const s=publicState(scopedState(read(),req.user));if(!/^\d{4}-\d{2}$/.test(req.query.month||''))throw Error('Monat als YYYY-MM');const start=DateTime.fromISO(`${req.query.month}-01`,{zone});if(!start.isValid)throw Error('Ungültiger Monat');const selectedGroup=req.query.group_id;if(selectedGroup&&!s.groups.some(g=>g.id===selectedGroup))throw Error('Gruppe unbekannt');const selectedDepartment=req.query.department_id,eligible=new Set(planningPeople(s,selectedGroup,selectedDepartment).map(p=>p.employee_id));const planningState=selectedGroup||selectedDepartment?{...s,assignments:s.assignments.filter(a=>eligible.has(a.employee_id))}:s;const days=Array.from({length:start.daysInMonth},(_,i)=>start.plus({days:i}));res.json({days:days.map(d=>d.toISODate()),rows:controlFunctions(s,selectedGroup,selectedDepartment).flatMap(f=>(f.geo_ids.length?allowedFunctionRegions(f,s.groups.find(g=>g.id===selectedGroup),s.regions,selectedDepartment,s.groups):[null]).map(geo=>({function_id:f.id,geo_id:geo,...timelineBars(coverage(planningState,f.id,geo,start.toMillis(),start.plus({months:1}).toMillis()).assignments,days.map(d=>({start_on:d.toISO(),end_on:d.plus({days:1}).toISO()})),s.assignment_styles||{}),cells:days.map(d=>{const cell=coverage(planningState,f.id,geo,d.toMillis(),d.plus({days:1}).toMillis());return {...cell,...timelineBars(cell.assignments,[{start_on:d.toISO(),end_on:d.plus({days:1}).toISO()}],s.assignment_styles||{})};})}))) });});
app.get('/api/swiss-time',(req,res)=>res.json({time:iso(automaticSwissInstant(req.query.value))}));
app.get('/api/pikett-list',(req,res)=>res.json(pikettList(publicState(scopedState(read(),req.user)),iso(automaticSwissInstant(req.query.at||new Date().toISOString())))));
app.get('/api/person-month',(req,res)=>{const regions=Object.hasOwn(req.query,'region_id')?[].concat(req.query.region_id).filter(Boolean):undefined;res.json(personMonth(scopedState(read(),req.user),req.query.month,req.query.function_id,regions,req.query.group_id,req.query.department_id));});
app.post('/api/favorites/order',(req,res)=>res.json(mutate(s=>{const order=scopedFavoriteOrder(s,req.user,req.body.ids,req.body.expected);const result=reorderFavorites(s,order.ids,order.expected);return restricted(req.user)?{ok:true}:result;})));
app.post('/api/favorites',(req,res)=>res.json(mutate(s=>saveFavorite(s,req.body))));
app.delete('/api/favorites/:id',(req,res)=>res.json(mutate(s=>removeFavorite(s,req.params.id,req.query.revision))));
app.post('/api/favorites/:id/preview',(req,res)=>{const s=read();assertFavoriteAccess(s,req.user,req.params.id,req.body);res.json(previewFavorite(s,req.params.id,req.body));});
app.post('/api/favorites/:id/apply',(req,res)=>res.json(mutate(s=>planningChange(s,()=>{assertFavoriteAccess(s,req.user,req.params.id,req.body);return applyFavorite(s,req.params.id,req.body);}))));
app.post('/api/oncall/person-exports',(req,res)=>res.json(mutate(s=>createOnCallPersonExport(s))));
app.get('/api/oncall/person-exports/:id',(req,res)=>{const e=(read().person_exports||[]).find(x=>x.id===req.params.id);if(!e)return res.status(404).json({error:'Personenexport nicht gefunden'});res.setHeader('Content-Disposition',`attachment; filename="${e.filename}"`);res.type('application/json').send(JSON.stringify(e.payload,null,2));});
app.post('/api/exports',(req,res)=>res.json(mutate(s=>makeExport(s,req.body.mode||'delta',process.env.NODE_ENV==='test'&&process.env.EXTERNPLAN_TEST_EXPORT_NOW?instant(process.env.EXTERNPLAN_TEST_EXPORT_NOW):Date.now()))));
app.post('/api/exports/:id/confirm',(req,res)=>res.json(mutate(s=>confirmExport(s,req.params.id))));
app.post('/api/els/people',(req,res)=>res.json(mutate(s=>{for(const p of s.people)simulatedElsAdapter.syncPerson(s.els,p);return {confirmed:s.people.length};})));
app.get('/api/exports/:id',(req,res)=>{const e=read().exports.find(x=>x.payload.export_id===req.params.id);if(!e)return res.status(404).json({error:'Nicht gefunden'});res.setHeader('Content-Disposition',`attachment; filename="els-${e.payload.export_id}.json"`);res.json(e.payload);});
app.post('/api/import/hunters/preview',(req,res)=>res.json(previewHunters(read(),req.body.content)));
app.post('/api/import/hunters/commit',(req,res)=>res.json(mutate(s=>importHunters(s,req.body.content,req.body.create_regions===true))));
// Import is two-stage: parse and inspect headers, then explicitly map columns and commit atomically.
app.post('/api/import/preview',async(req,res)=>{const {format,content}=req.body;let rows;if(format==='xlsx'){const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(content,'base64'));const sheet=workbook.worksheets[0];if(!sheet)throw Error('Leere Arbeitsmappe');const headers=sheet.getRow(1).values.slice(1).map(v=>String(v??''));rows=[];sheet.eachRow((row,n)=>{if(n>1){const r={};headers.forEach((h,i)=>{const v=row.getCell(i+1).value;r[h]=typeof v==='object'&&v!==null?(v.text??v.result??String(v)):v;});rows.push(r);}});}else{const parsed=JSON.parse(content);rows=Array.isArray(parsed)?parsed:Array.isArray(parsed.people)?parsed.people:Array.isArray(parsed.persons)?parsed.persons:null;if(!rows)throw Error('JSON benötigt ein Array oder people/persons; Struktur zuerst prüfen');}res.json({rows,headers:[...new Set(rows.flatMap(r=>Object.keys(r)))],count:rows.length});});
app.post('/api/import/commit',(req,res)=>res.json(mutate(s=>{const {type,rows,mapping}=req.body;if(!Array.isArray(rows)||rows.length>10000)throw Error('Import erwartet maximal 10 000 Datensätze');let imported=0,skipped=0;
 const get=(r,k)=>r[mapping[k]];const list=v=>Array.isArray(v)?v.map(String):String(v??'').split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
 for(const r of rows){
  if(type==='sap'){const p=normalizeSapPerson(r,mapping);const existing=s.people.find(x=>x.employee_id===p.employee_id);if(existing?.deleted_at||existing?.source==='manual'){skipped++;continue;}if(!s.departments.some(d=>d.id===p.department_id)){const d={id:p.department_id,name:p.department_id};s.departments.push(d);audit(s,'departments','create',null,d);}if(existing){p.group_ids=personGroupIds(existing);p.group_id=p.group_ids[0]||null;Object.assign(p,personDetails({},existing));}validPerson(s,p,existing);if(existing)s.people[s.people.indexOf(existing)]=p;else s.people.push(p);audit(s,'person','import',existing||null,p);imported++;}
  else if(type==='regions'||type==='functions'){const p=type==='regions'?{id:String(get(r,'id')??'').trim(),name:String(get(r,'name')??'')}:{id:String(get(r,'id')??'').trim(),name:String(get(r,'name')??''),geo_ids:list(get(r,'geo_ids')),covers:{}};const existing=s[type].find(x=>x.id===p.id);if(existing&&!active(existing))throw Error('Import enthält eine gelöschte, für die Historie reservierte Kennung');if(type==='functions'&&existing)p.covers=existing.covers;if(type==='regions'&&existing&&Object.hasOwn(existing,'polygon_geo_id'))p.polygon_geo_id=existing.polygon_geo_id;validMaster(s,type,p);if(existing)s[type][s[type].indexOf(existing)]=p;else s[type].push(p);audit(s,type,'import',existing||null,p);imported++;}
  else throw Error('Importtyp sap, regions oder functions erforderlich');
 }return {imported,skipped};})));
app.get('/vendor/html2canvas.js',(req,res)=>res.sendFile(resolve('node_modules/html2canvas/dist/html2canvas.min.js')));
app.get('/vendor/jspdf.js',(req,res)=>res.sendFile(resolve('node_modules/jspdf/dist/jspdf.umd.min.js')));
app.use('/vendor/leaflet',express.static(resolve('node_modules/leaflet/dist')));
app.use(express.static('public'));
app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message}));
const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`ExternPlan läuft auf Port ${server.address().port}`));
