import ExcelJS from 'exceljs';
import {createHash} from 'node:crypto';
import {DateTime} from 'luxon';
import {audit,id} from './domain.js';
import {saveOffice} from './offices.js';
import {manualPerson,validatePersonAffiliations} from './people.js';
import {normalizePhone,contactDescription} from './public/phone.js';
import {personGroupIds} from './public/organization.js';
import {regionGroupIds,withRegionGroups} from './public/region-groups.js';
export const municipalName=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\(sg\)|gemeinde|stadt/g,'').replace(/[^a-z0-9]/g,'');
const norm=v=>String(v||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-CH');
const active=r=>!r.deleted_at;
const cell=(row,n)=>row.getCell(n).text.trim().replace(/\s+/g,' ');
const canonicalRole=raw=>raw.replace(/\*in/g,'').replace(/\bI{1,3}\.\s*Stv\b/g,'Stv').replace(/\s+/g,' ').trim();
const organization=name=>/\b(AG|GmbH|Group|IBG|EVU|EW)\b|gemeindeverwaltung|wasserwerk|technische[nr]? betriebe|schlüssel|schluessel|elektro|electro|bestattung|energie|stadtwerk|elektriz|stromversorgung|gasversorgung|wasserwerke/i.test(name);
export async function parseMunicipalFiles(files,now=Date.now()){
 if(!Array.isArray(files)||!files.length||files.length>80)throw Error('1 bis 80 Excel-Dateien wählen');
 let total=0;const documents=[],seen=new Set();
 for(const [index,file] of files.entries()){
  if(typeof file.name!=='string'||typeof file.content!=='string'||!file.name.toLowerCase().endsWith('.xlsx'))throw Error('Gemeindelisten als XLSX-Dateien einlesen');
  const buffer=Buffer.from(file.content,'base64');total+=buffer.length;if(!buffer.length||buffer.length>2e6||total>6e6)throw Error('Pro Datei maximal 2 MB, zusammen maximal 6 MB');
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.worksheets.find(sh=>/Gemeinde/i.test(sh.name))||book.worksheets[0];if(!sheet||sheet.rowCount>500||sheet.columnCount>30)throw Error('Unbekanntes oder zu grosses Gemeindelisten-Format');
  if(!/Name.*Vorname/i.test(cell(sheet.getRow(5),2))||!/Natel/i.test(cell(sheet.getRow(5),6)))throw Error(file.name+': Erwartete Gemeindelisten-Kopfzeile fehlt');
  const municipality=cell(sheet.getRow(1),5),key=municipalName(municipality);if(!key)throw Error(file.name+': Gemeinde fehlt');
  if(key==='stgallen')throw Error('Stadt St. Gallen ist von diesem Import ausgeschlossen');if(seen.has(key))throw Error('Gemeinde mehrfach gewählt: '+municipality);seen.add(key);
  const rows=[],counts=new Map();let section='Gemeindeverwaltung '+municipality;
  for(let n=8;n<=sheet.rowCount;n++){
   const row=sheet.getRow(n),raw_role=cell(row,1);if(/Einsatzrelevante Objekte|Datum|Mutation.*Verantwortlich/i.test(raw_role)||cell(row,4)==='Datum')break;
   if(!raw_role)continue;if(row.getCell(1).isMerged){section=raw_role;continue;}
   let raw_name=cell(row,2);const warnings=[],deletion=/^(x|ja|löschen|loeschen)$/i.test(cell(row,10));
   const until=raw_name.match(/\(\s*bis\s+(\d{2}\.\d{2}\.\d{4})\s*\)/i);let expired=false;
   if(until){const date=DateTime.fromFormat(until[1],'dd.MM.yyyy',{zone:'Europe/Zurich'});expired=date.isValid&&date.endOf('day').toMillis()<now;warnings.push('Befristeter Eintrag: bis '+until[1]+'; Gültigkeit prüfen.');raw_name=raw_name.replace(until[0],'').trim();}
   const vacant=/vakant|unbesetzt/i.test(raw_name);if(deletion)warnings.push('In der Datei zum Löschen markiert; bestehende Daten werden nicht gelöscht.');if(vacant)warnings.push('Vakante Stelle.');
   const person_kind=!raw_name||organization(raw_name)?'office':'person',name=raw_name||raw_role+' '+municipality;
   const words=name.split(/\s+/),last_name=person_kind==='person'?words[0]:'',first_name=person_kind==='person'?words.slice(1).join(' '):'';
   if(person_kind==='person'&&words.length!==2)warnings.push('Aufteilung von Nachname und Vorname prüfen.');if(/\//.test(raw_role))warnings.push('Zusammengesetzte Funktionsbezeichnung prüfen.');
   if(raw_role==='Gemeindehaus'&&person_kind==='office')section=name;
   const office_name=person_kind==='office'?name:/^TB /.test(raw_role)?raw_role:section,parent_office_name=office_name!==section?section:'';
   const roleNames=canonicalRole(raw_role).split(/\s+\/\s+(?=Schulpräsident\b)/);
   const phones=[3,4,5,6].map(c=>cell(row,c)),contacts=[],types=['Telefon Pikett','phone_business','phone_private','phone_mobile'];let invalid=false;
   phones.forEach((value,i)=>{if(!value)return;try{contacts.push({type:types[i],value:normalizePhone(value),priority:i===0?1:0,description:i===0?'Pikettnummer 24h':''});}catch{invalid=true;warnings.push('Ungültige Telefonnummer in '+['Tel Pikett','Tel G','Tel Priv.','Natel'][i]+': bitte korrigieren.');}});
   const email=cell(row,7);if(email)contacts.push({type:'email',value:email,priority:0,description:''});if(cell(row,8))warnings.push('Fax wird nicht übernommen.');
   if(cell(row,10)&&!deletion)warnings.push('Hinweis in Spalte löschen: '+cell(row,10));
   for(const [part,function_name] of roleNames.entries()){const priority=(counts.get(function_name)||0)+1;if(!deletion&&!vacant&&!expired)counts.set(function_name,priority);rows.push({key:index+':'+n+':'+part,row:n,raw_role,raw_name:cell(row,2),function_name,person_kind,office_name,parent_office_name,first_name,last_name,priority,contacts,phones,email,warnings,include:!deletion&&!vacant&&!expired&&!invalid&&(person_kind==='office'||!!first_name)});}
  }
  if(!rows.length)throw Error(file.name+': Keine Gemeindefunktionen erkannt');documents.push({key:String(index),file_name:file.name,municipality,municipality_key:key,rows});
 }
 return {documents};
}
export function municipalPreview(s,parsed){
 return {...parsed,department_id:s.departments.find(d=>active(d)&&norm(d.name)==='gemeinden')?.id||'',documents:parsed.documents.map(d=>{const matches=s.regions.filter(r=>active(r)&&municipalName(r.name)===d.municipality_key);return {...d,region_id:matches.length===1?matches[0].id:''};})};
}
export function municipalToken(s,parsed,input){return createHash('sha256').update(JSON.stringify({parsed,input:{department_id:input.department_id||'',documents:input.documents},state:{departments:s.departments,groups:s.groups,regions:s.regions,region_groups:s.region_groups,functions:s.functions,people:s.people,offices:s.offices}})).digest('hex');}
export function prepareMunicipalImport(source,parsed,input){
 const s=structuredClone(source),plan=input.documents;s.region_groups??=[];s.offices??=[];if(!Array.isArray(plan)||plan.length!==parsed.documents.length)throw Error('Gemeindezuordnungen fehlen');
 const documents=parsed.documents.map(d=>{const p=plan.find(p=>p.key===d.key),region=p&&s.regions.find(r=>active(r)&&r.id===p.region_id);if(!region)throw Error(d.municipality+': Ein bestehendes Gemeindegebiet wählen');if(municipalName(region.name)==='stgallen')throw Error('Stadt St. Gallen ist ausgeschlossen');if(!Array.isArray(p.rows)||p.rows.length!==d.rows.length)throw Error('Unvollständige Zeilenauswahl');return {...d,region,rows:d.rows.map(raw=>{const edited=p.rows.find(r=>r.key===raw.key);if(!edited||typeof edited.include!=='boolean')throw Error('Zeilenauswahl fehlt');return {...raw,...Object.fromEntries(['include','function_name','person_kind','office_name','parent_office_name','first_name','last_name','priority','phones','email','employee_id'].map(k=>[k,edited[k]??raw[k]]))};})};});
 if(new Set(documents.map(d=>d.region.id)).size!==documents.length)throw Error('Jede Gemeinde benötigt ein eigenes Gebiet');
 let department=input.department_id?s.departments.find(d=>active(d)&&d.id===input.department_id):s.departments.find(d=>active(d)&&norm(d.name)==='gemeinden');if(input.department_id&&!department)throw Error('Abteilung nicht gefunden');
 const summary={created_people:0,updated_people:0,created_offices:0,updated_offices:0,affiliations:0,created_functions:[],created_groups:[],created_department:false,skipped:0};
 if(!documents.some(d=>d.rows.some(r=>r.include)))throw Error('Mindestens einen Eintrag auswählen');
 if(!department){department={id:id(),name:'Gemeinden'};s.departments.push(department);audit(s,'departments','create',null,structuredClone(department));summary.created_department=true;}
 const changedPeople=new Set(),changedOffices=new Set(),functionIds=new Set();
 for(const doc of documents){
  const rows=doc.rows.filter(r=>r.include);summary.skipped+=doc.rows.length-rows.length;if(!rows.length)continue;
  let group=s.groups.find(g=>active(g)&&g.department_id===department.id&&(g.municipal_region_id===doc.region.id||municipalName(g.name)===doc.municipality_key));
  if(!group){group={id:id(),name:doc.region.name,department_id:department.id,geo_ids:[doc.region.id],municipal_region_id:doc.region.id};s.groups.push(group);audit(s,'groups','create',null,structuredClone(group));summary.created_groups.push(group.name);}
  if(Array.isArray(group.geo_ids)&&!group.geo_ids.includes(doc.region.id)){const before=structuredClone(group);group.geo_ids.push(doc.region.id);audit(s,'groups','update',before,structuredClone(group));}
  for(const row of rows){
   if(typeof row.function_name!=='string'||!row.function_name.trim()||row.function_name.length>200)throw Error('Funktionsname fehlt oder ist zu lang');if(!Number.isSafeInteger(row.priority)||row.priority<1)throw Error('Priorität muss eine ganze Zahl ab 1 sein');
   const function_name=row.function_name.trim(),matches=s.functions.filter(f=>active(f)&&norm(f.name)===norm(function_name));if(matches.length>1)throw Error('Funktion nicht eindeutig: '+function_name);
   let fn=matches[0];if(fn&&fn.duty_time_model!=='always')throw Error('Funktion '+function_name+' existiert mit Zeitprofil Geplant. Bitte einen anderen Funktionsnamen verwenden.');
   if(!fn){fn={id:id(),name:function_name,geo_ids:[],covers:{},region_assignment_mode:'groups',duty_time_model:'always'};s.functions.push(fn);fn.department_ids=[department.id];summary.created_functions.push(fn.name);audit(s,'functions','create',null,structuredClone(fn));}
   functionIds.add(fn.id);
   let rg=s.region_groups.find(g=>active(g)&&g.municipal_function_id===fn.id);if(!rg){rg={id:id(),name:fn.name+' · Gemeindegebiete',municipal_function_id:fn.id,function_ids:[fn.id]};s.region_groups.push(rg);audit(s,'region_groups','create',null,structuredClone(rg));}
   if(!regionGroupIds(doc.region).includes(rg.id)){const before=structuredClone(doc.region);doc.region.region_group_ids=[...regionGroupIds(doc.region),rg.id];delete doc.region.region_group_id;audit(s,'regions','update',before,structuredClone(doc.region));}
   if(!['person','office'].includes(row.person_kind))throw Error('Eintrag muss Person oder Stelle sein');
   if(!Array.isArray(row.phones)||row.phones.length!==4||row.phones.some(v=>typeof v!=='string'))throw Error('Vier Telefonfelder erwartet');const contacts=row.phones.flatMap((v,i)=>v.trim()?[{type:['Telefon Pikett','phone_business','phone_private','phone_mobile'][i],value:normalizePhone(v),priority:i===0?1:0,description:i===0?'Pikettnummer 24h':''}]:[]);if(row.email){if(typeof row.email!=='string'||!/^\S+@\S+\.\S+$/.test(row.email))throw Error('Ungültige E-Mail-Adresse');contacts.push({type:'email',value:row.email.trim(),priority:0,description:''});}
   const storeOffice=(name,parent,values={})=>{
    if(typeof name!=='string'||!name.trim()||name.length>250)throw Error('Stellenbezeichnung erforderlich');
    const officeKey=doc.municipality_key+':'+norm(name),existing=s.offices.find(o=>active(o)&&(o.municipal_key===officeKey||o.group_id===group.id&&norm(o.name)===norm(name)));
    const office=saveOffice(s,{...existing,...values,name:name.trim(),department_id:department.id,group_id:group.id,region_id:doc.region.id,parent_office_id:parent?.id||null});office.municipal_key=officeKey;
    if(!changedOffices.has(office.id)){summary[existing?'updated_offices':'created_offices']++;changedOffices.add(office.id);}return office;
   };
   const parent=row.parent_office_name?storeOffice(row.parent_office_name,null):null;
   if(parent&&norm(parent.name)===norm(row.office_name))throw Error('Stelle kann nicht sich selbst übergeordnet sein');
   let office=storeOffice(row.office_name,parent);
   if(row.person_kind==='office'){
    const sourceKey=doc.municipality_key+':'+norm(row.raw_role)+':'+norm(row.raw_name),oldSource=office.municipal_sources?.find(x=>x.key===sourceKey),otherSources=(office.municipal_sources||[]).filter(x=>x.key!==sourceKey);
    for(const c of contacts){const existing=office.contacts?.find(old=>old.type===c.type&&old.value===c.value);if(existing)c.description=contactDescription(existing);}
    const combined=(office.contacts||[]).filter(c=>!oldSource?.contacts?.some(old=>old.type===c.type&&old.value===c.value)||otherSources.some(x=>x.contacts?.some(old=>old.type===c.type&&old.value===c.value)));for(const c of contacts)if(!combined.some(old=>old.type===c.type&&old.value===c.value))combined.push(c);
    office=storeOffice(row.office_name,parent,{contacts:combined,function_regions:[...(office.function_regions||[]).filter(a=>a.function_id!==fn.id||a.geo_id!==doc.region.id),{function_id:fn.id,geo_id:doc.region.id,priority:row.priority}]});office.municipal_sources=[...otherSources,{key:sourceKey,contacts}];summary.affiliations++;continue;
   }
   const personKey=doc.municipality_key+':'+norm(row.raw_name||row.raw_role),sourceKey=personKey+':'+norm(row.raw_role),targetName=[row.first_name,row.last_name].join(' ');
   let previous;
   if(row.employee_id){previous=s.people.find(p=>active(p)&&p.employee_id===row.employee_id);if(!previous||previous.source!=='manual')throw Error('Gewählte Person nicht verfügbar oder nicht manuell gepflegt');}
   else{const candidates=s.people.filter(p=>active(p)&&p.source==='manual'&&(p.municipal_sources?.some(x=>x.person_key===personKey||x.key===sourceKey)||personGroupIds(p).includes(group.id)&&norm(p.name)===norm(targetName)));if(candidates.length>1)throw Error('Mehrere passende Personen: '+targetName+'; bitte explizit auswählen');previous=candidates[0];}
   for(const c of contacts){const existing=previous?.contacts?.find(old=>old.type===c.type&&old.value===c.value);if(existing)c.description=contactDescription(existing);}
   const oldSource=previous?.municipal_sources?.find(x=>x.key===sourceKey),otherSources=(previous?.municipal_sources||[]).filter(x=>x.key!==sourceKey),retained=(previous?.contacts||[]).filter(c=>!oldSource?.contacts?.some(old=>old.type===c.type&&old.value===c.value)||otherSources.some(x=>x.contacts?.some(old=>old.type===c.type&&old.value===c.value)));
   const combined=[...retained];for(const c of contacts)if(!combined.some(old=>old.type===c.type&&old.value===c.value))combined.push(c);
   const person=manualPerson({first_name:row.first_name,last_name:row.last_name,department_id:previous?.department_id||department.id,group_ids:[...new Set([...personGroupIds(previous),group.id])],contacts:combined},previous,'EXT-'+id());
   person.municipal_sources=[...otherSources,{key:sourceKey,person_key:personKey,contacts}];person.function_regions=[...(previous?.function_regions||[]).filter(a=>a.function_id!==fn.id||a.geo_id!==doc.region.id),{function_id:fn.id,geo_id:doc.region.id,priority:row.priority,office_id:office.id}];
   if(previous)s.people[s.people.indexOf(previous)]=person;else s.people.push(person);if(!changedPeople.has(person.employee_id)){summary[previous?'updated_people':'created_people']++;changedPeople.add(person.employee_id);}summary.affiliations++;audit(s,'person','municipal_import',previous||null,structuredClone(person));
  }
 }
 const view=withRegionGroups(s);for(const key of changedPeople){const p=s.people.find(p=>p.employee_id===key);validatePersonAffiliations(view,p,source.people.find(old=>old.employee_id===key));}
 summary.functions=[...functionIds].map(key=>s.functions.find(f=>f.id===key).name);summary.department=department.name;
 return {state:s,summary,token:municipalToken(source,parsed,input)};
}
