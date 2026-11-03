import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {readdirSync,readFileSync,writeFileSync,rmSync,lstatSync,statSync,statfsSync,openSync,closeSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {anonymizePhones,replaceAnonymizedJson,anonymizationSpacePlan} from './phone-anonymization.js';
const args=process.argv.slice(2),apply=args.includes('--apply'),index=args.indexOf('--data-dir');
if(index<0||!args[index+1]||args[index+1].startsWith('--')||args.some((arg,i)=>arg!=='--apply'&&arg!=='--data-dir'&&i!==index+1))throw Error('Aufruf: node anonymize-phone-numbers.js --data-dir /app/data [--apply]');
const dataDir=resolve(args[index+1]),database=join(dataDir,'externplan.sqlite'),lock=join(dataDir,'.anonymize-phones.lock'),digest=raw=>createHash('sha256').update(raw).digest('hex'),files=[],stale=[];
const staleName=/\.json\.anonymize-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;
const freeBytes=()=>{const s=statfsSync(dataDir,{bigint:true});return Number(s.bavail*s.bsize);};
const mb=n=>(n/1024/1024).toFixed(1)+' MiB';
function collect(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Symbolischer Link im Datenverzeichnis: '+basename(path)+'. Bitte vorab prüfen.');if(entry.isDirectory())collect(path);else if(entry.isFile()&&staleName.test(entry.name))stale.push(path);else if(entry.isFile()&&/\.json$/i.test(entry.name)){const raw=readFileSync(path,'utf8');let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('Ungültige JSON-Datei: '+basename(path)+'.');}const next=anonymizePhones(parsed);if(next.replacements)files.push({path,hash:digest(raw),bytes:Buffer.byteLength(JSON.stringify(next.value)),replacements:next.replacements});}}}
let db,committed=false,transaction=false,ownsLock=false,jsonCompleted=0;
try{
 if(apply){try{const fd=openSync(lock,'wx',0o600);ownsLock=true;closeSync(fd);}catch(error){if(error.code==='EEXIST')throw Error('Eine Anonymisierung läuft bereits oder eine alte Sperrdatei ist vorhanden. Keinen zweiten Lauf starten. Eine alte .anonymize-phones.lock erst nach Prüfung laufender Prozesse entfernen.');throw error;}}
 collect(dataDir);if(lstatSync(database).isSymbolicLink())throw Error('Datenbank darf kein symbolischer Link sein.');
 const staleBytes=stale.reduce((n,path)=>n+statSync(path).size,0);
 // Only this tool's UUID-named temporary files are removed, never databases or backups.
 if(apply){for(const path of stale)rmSync(path);writeFileSync(lock,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}),{mode:0o600});}
 db=new DatabaseSync(database,{readOnly:!apply});db.exec('PRAGMA busy_timeout=10000');if(apply){db.exec('PRAGMA secure_delete=ON; BEGIN IMMEDIATE');transaction=true;}
 const records=[];
 for(const table of ['state','imported_map_layers']){if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;for(const row of db.prepare('SELECT id,data FROM '+table).all()){let parsed;try{parsed=JSON.parse(row.data);}catch{throw Error('Ungültiges JSON in Datenbanktabelle '+table+'.');}const result=anonymizePhones(parsed);if(result.replacements)records.push({table,id:row.id,data:JSON.stringify(result.value),replacements:result.replacements});}}
 const plan=anonymizationSpacePlan({databaseBytes:statSync(database).size,changedBytes:records.reduce((n,r)=>n+Buffer.byteLength(r.data),0),largestJsonBytes:files.reduce((n,f)=>Math.max(n,f.bytes),0),freeBytes:freeBytes()});
 const summary={mode:apply?'Anonymisieren':'Vorschau – keine Änderung',database_records:records.length,database_replacements:records.reduce((n,r)=>n+r.replacements,0),json_files:files.length,json_replacements:files.reduce((n,f)=>n+f.replacements,0),temporary_files:stale.length,temporary_bytes:staleBytes,space:{available_bytes:plan.freeBytes,required_bytes:plan.requiredBytes,enough:plan.enough}};
 if(apply){
  if(!plan.enough)throw Error('Zu wenig freier Speicher: verfügbar '+mb(plan.freeBytes)+', vorsorglich benötigt '+mb(plan.requiredBytes)+'. Keine Datenbank- oder Sicherungsinhalte geändert. Verwaiste temporäre Dateien wurden gegebenenfalls entfernt. Render-Datenträger vergrössern und erneut ausführen.');
  if(summary.database_replacements||summary.json_replacements){const changed=records.find(r=>r.table==='state'),stored=db.prepare('SELECT id,data FROM state WHERE id=1').get();if(stored){const state=JSON.parse(changed?.data||stored.data);state.audit??=[];state.audit.push({id:randomUUID(),at:new Date().toISOString(),actor:'System · Telefonnummern-Anonymisierung',entity:'maintenance',action:'anonymize-phones',before:null,after:{database_replacements:summary.database_replacements,json_files:summary.json_files,json_replacements:summary.json_replacements}});if(changed)changed.data=JSON.stringify(state);else records.push({table:'state',id:stored.id,data:JSON.stringify(state),replacements:0});}}
  for(const file of files){
   const raw=readFileSync(file.path,'utf8');if(digest(raw)!==file.hash)throw Error('Eine JSON-Datei wurde inzwischen geändert. Bitte erneut ausführen.');
   const text=JSON.stringify(anonymizePhones(JSON.parse(raw)).value);
   if(freeBytes()<Buffer.byteLength(text)+plan.reserveBytes)throw Error('Freier Speicher hat während der Ausführung abgenommen. Datenträger vergrössern und erneut ausführen.');
   replaceAnonymizedJson(file.path,text);jsonCompleted++;
  }
  for(const row of records)db.prepare('UPDATE '+row.table+' SET data=? WHERE id=?').run(row.data,row.id);
  db.exec('COMMIT');transaction=false;committed=true;
  const checkpoint=()=>{const result=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(result.busy)throw Error('Daten geändert, aber WAL-Bereinigung durch andere Zugriffe blockiert. Nutzung unterbrechen und Befehl erneut ausführen.');};
  checkpoint();db.exec('VACUUM');checkpoint();
 }
 console.log(JSON.stringify(summary,null,2));
 if(apply)console.log('Aktiver Datenbestand und JSON-Dateien bearbeitet. Externe Render-Snapshots, heruntergeladene Dateien und andere Sicherungsorte sind nicht enthalten.');
}catch(error){
 if(transaction){try{db.exec('ROLLBACK');}catch{}}
 if(apply)console.error(committed?'Datenbankänderung gespeichert; abschliessende Bereinigung noch nicht vollständig.':'Keine Datenbankänderung gespeichert. Bereits ersetzte JSON-Dateien: '+jsonCompleted+'.');
 const full=error.code==='ENOSPC'||error.errcode===13||/database or disk is full/i.test(error.message);
 console.error(full?'Datenträger voll. Unvollständige temporäre Dateien dieses Laufs wurden nach Möglichkeit entfernt. Keine SQLite-, WAL-, SHM- oder Sicherungsdateien löschen. Freien Platz prüfen oder Render-Datenträger vergrössern; danach erneut ausführen.':error.message);process.exitCode=1;
}finally{try{db?.close();}finally{if(ownsLock)rmSync(lock,{force:true});}}
