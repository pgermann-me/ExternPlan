import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {readdirSync,readFileSync,writeFileSync,renameSync,rmSync,lstatSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {anonymizePhones} from './phone-anonymization.js';
const args=process.argv.slice(2),apply=args.includes('--apply'),index=args.indexOf('--data-dir');
if(index<0||!args[index+1]||args[index+1].startsWith('--')||args.some((arg,i)=>arg!=='--apply'&&arg!=='--data-dir'&&i!==index+1))throw Error('Aufruf: node anonymize-phone-numbers.js --data-dir /app/data [--apply]');
const dataDir=resolve(args[index+1]),database=join(dataDir,'externplan.sqlite'),digest=raw=>createHash('sha256').update(raw).digest('hex'),files=[],staged=[];
function collect(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Symbolischer Link im Datenverzeichnis: '+basename(path)+'. Bitte vorab prüfen.');if(entry.isDirectory())collect(path);else if(entry.isFile()&&/\.json$/i.test(entry.name)){const raw=readFileSync(path,'utf8');let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('Ungültige JSON-Datei: '+basename(path)+'. Keine Änderung durchgeführt.');}const next=anonymizePhones(parsed);if(next.replacements)files.push({path,hash:digest(raw),text:JSON.stringify(next.value),replacements:next.replacements});}}}
collect(dataDir);if(lstatSync(database).isSymbolicLink())throw Error('Datenbank darf kein symbolischer Link sein.');
const db=new DatabaseSync(database,{readOnly:!apply});let committed=false,transaction=false;
try{
 db.exec('PRAGMA busy_timeout=10000');if(apply){db.exec('PRAGMA secure_delete=ON; BEGIN IMMEDIATE');transaction=true;}
 const records=[];
 for(const table of ['state','imported_map_layers']){if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;for(const row of db.prepare('SELECT id,data FROM '+table).all()){let parsed;try{parsed=JSON.parse(row.data);}catch{throw Error('Ungültiges JSON in Datenbanktabelle '+table+'.');}const result=anonymizePhones(parsed);if(result.replacements)records.push({table,id:row.id,data:JSON.stringify(result.value),replacements:result.replacements});}}
 const summary={mode:apply?'Anonymisieren':'Vorschau – keine Änderung',database_records:records.length,database_replacements:records.reduce((n,r)=>n+r.replacements,0),json_files:files.length,json_replacements:files.reduce((n,f)=>n+f.replacements,0)};
 if(apply){
  if(summary.database_replacements||summary.json_replacements){
   const changed=records.find(r=>r.table==='state'),stored=db.prepare('SELECT id,data FROM state WHERE id=1').get();
   if(stored){const state=JSON.parse(changed?.data||stored.data);state.audit??=[];state.audit.push({id:randomUUID(),at:new Date().toISOString(),actor:'System · Telefonnummern-Anonymisierung',entity:'maintenance',action:'anonymize-phones',before:null,after:{database_replacements:summary.database_replacements,json_files:summary.json_files,json_replacements:summary.json_replacements}});if(changed)changed.data=JSON.stringify(state);else records.push({table:'state',id:stored.id,data:JSON.stringify(state),replacements:0});}
  }
  // Stage all file replacements before updating the database. No original-number backup is created.
  for(const file of files){if(digest(readFileSync(file.path,'utf8'))!==file.hash)throw Error('Eine JSON-Datei wurde inzwischen geändert. Bitte erneut ausführen.');const temp=file.path+'.anonymize-'+randomUUID()+'.tmp';writeFileSync(temp,file.text,{mode:0o600,flag:'wx'});staged.push({temp,path:file.path});}
  for(const row of records)db.prepare('UPDATE '+row.table+' SET data=? WHERE id=?').run(row.data,row.id);
  for(const file of staged)renameSync(file.temp,file.path);
  db.exec('COMMIT');transaction=false;committed=true;
  const checkpoint=()=>{const result=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(result.busy)throw Error('Daten geändert, aber WAL-Bereinigung durch andere Zugriffe blockiert. Nutzung unterbrechen und Befehl erneut ausführen.');};
  checkpoint();db.exec('VACUUM');checkpoint();
 }
 console.log(JSON.stringify(summary,null,2));
 if(apply)console.log('Aktiver Datenbestand und JSON-Dateien bearbeitet. Externe Render-Snapshots, heruntergeladene Dateien und andere Sicherungsorte sind nicht enthalten.');
}catch(error){if(transaction)db.exec('ROLLBACK');if(apply)console.error(committed?'Die Datenänderung wurde gespeichert; die abschliessende Bereinigung ist fehlgeschlagen.':'Vorgang nicht vollständig abgeschlossen. Bereits ersetzte JSON-Dateien können anonymisiert sein; sicher erneut ausführbar.');throw error;}finally{for(const file of staged)rmSync(file.temp,{force:true});db.close();}
