import {readMunicipalPdf} from './municipal-pdf.js';
import ExcelJS from 'exceljs';
import {createHash} from 'node:crypto';
import {DateTime} from 'luxon';
import {audit,id} from './domain.js';
import {saveOffice} from './offices.js';
import {manualPerson,validatePersonAffiliations} from './people.js';
import {normalizePhone,contactDescription,pikettPhoneType,canonicalContact} from './public/phone.js';
import {personGroupIds} from './public/organization.js';
import {regionGroupIds,withRegionGroups} from './public/region-groups.js';
export const municipalName=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\(sg\)|gemeinde|stadt/g,'').replace(/[^a-z0-9]/g,'');
const norm=v=>String(v||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-CH');
const active=r=>!r.deleted_at;
const cell=(row,n)=>row.getCell(n).text.trim().replace(/\s+/g,' ');
const canonicalRole=raw=>raw.replace(/\*in/g,'').replace(/\bI{1,3}\.\s*Stv\b/g,'Stv').replace(/\s+/g,' ').trim();
const organization=name=>/\b(AG|GmbH|Group|IBG|EVU|EW)\b|gemeindeverwaltung|wasserwerk|technische[nr]? betriebe|schlüssel|schluessel|elektro|electro|bestattung|energie|stadtwerk|elektriz|stromversorgung|gasversorgung|wasserwerke|abwasserverband|eisenhandlung|verein\s+(für|fuer)|sch.{0,6}sselservice/i.test(name);
export async function parseMunicipalFiles(files,now=Date.now()){
 if(!Array.isArray(files)||!files.length||files.length>80)throw Error('1 bis 80 Excel- oder PDF-Dateien wählen');
 let total=0;const documents=[],seen=new Set();
 for(const [index,file] of files.entries()){
  if(typeof file.name!=='string'||typeof file.content!=='string'||!/\.(xlsx|pdf)$/i.test(file.name))throw Error('Gemeindelisten als XLSX- oder PDF-Dateien einlesen');
  const buffer=Buffer.from(file.content,'base64');total+=buffer.length;if(!buffer.length||buffer.length>2e6||total>6e6)throw Error('Pro Datei maximal 2 MB, zusammen maximal 6 MB');
  const pdf=/\.pdf$/i.test(file.name)?await readMunicipalPdf(buffer):null;let sheet;if(pdf)sheet=pdf.sheet;else{const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);sheet=book.worksheets.find(sh=>/Gemeinde/i.test(sh.name))||book.worksheets[0];}if(!sheet||sheet.rowCount>500||sheet.columnCount>30)throw Error('Unbekanntes oder zu grosses Gemeindelisten-Format');
  if(!/Name.*Vorname/i.test(cell(sheet.getRow(5),2))||!/Natel/i.test(cell(sheet.getRow(5),6)))throw Error(file.name+': Erwartete Gemeindelisten-Kopfzeile fehlt');
  const municipality=cell(sheet.getRow(1),5),key=municipalName(municipality);if(!key)throw Error(file.name+': Gemeinde fehlt');
  if(key==='stgallen')throw Error('Stadt St. Gallen ist von diesem Import ausgeschlossen');if(seen.has(key))throw Error('Gemeinde mehrfach gewählt: '+municipality);seen.add(key);
  const rows=[],counts=new Map(),office_name='Gemeindehaus '+municipality;
  for(let n=8;n<=sheet.rowCount;n++){
   const row=sheet.getRow(n),raw_role=cell(row,1);if(/Einsatzrelevante Objekte|Datum|Mutation.*Verantwortlich/i.test(raw_role)||cell(row,4)==='Datum')break;
   if(!raw_role)continue;if(row.getCell(1).isMerged)continue;
   let raw_name=cell(row,2);const warnings=[],deletion=/^(x|ja|löschen|loeschen)$/i.test(cell(row,10));
   const until=raw_name.match(/\(\s*bis\s+(\d{2}\.\d{2}\.\d{4})\s*\)/i);let expired=false;
   if(until){const date=DateTime.fromFormat(until[1],'dd.MM.yyyy',{zone:'Europe/Zurich'});expired=date.isValid&&date.endOf('day').toMillis()<now;warnings.push('Befristeter Eintrag: bis '+until[1]+'; Gültigkeit prüfen.');raw_name=raw_name.replace(until[0],'').trim();}
   const vacant=/vakant|unbesetzt/i.test(raw_name);if(deletion)warnings.push('In der Datei zum Löschen markiert; bestehende Daten werden nicht gelöscht.');if(vacant)warnings.push('Vakante Stelle.');
   const person_kind=/^(Gemeindehaus|Stadtverwaltung Hauptnummer|Gemeindeverwaltung Hauptnummer)$/i.test(raw_role)?'office':'person',name=raw_name||raw_role;
   const words=name.split(/\s+/),singleName=organization(name)||words.length===1;
   const last_name=person_kind==='person'?(singleName?name:words[0]):'',first_name=person_kind==='person'&&!singleName?words.slice(1).join(' '):'';
   if(person_kind==='person'&&(singleName||words.length!==2))warnings.push('Name / Bezeichnung und Vorname prüfen.');if(/\//.test(raw_role))warnings.push('Zusammengesetzte Funktionsbezeichnung prüfen.');
   const roleNames=canonicalRole(raw_role).split(/\s+\/\s+(?=Schulpräsident\b)/);
   const phones=[3,4,5,6].map(c=>cell(row,c)),contacts=[],pikett_type=pikettPhoneType(phones[0]),phone_descriptions=['Pikettnummer 24h','','',''],types=[pikett_type,'phone_business','phone_private','phone_mobile'];let invalid=false;
   phones.forEach((value,i)=>{if(!value)return;try{contacts.push({type:types[i],value:normalizePhone(value),priority:i===0?1:0,description:phone_descriptions[i],...(i===0||i===1||i===3?{kind:'business'}:{kind:'private'})});}catch{invalid=true;warnings.push('Ungültige Telefonnummer in '+['Tel Pikett','Tel G','Tel Priv.','Natel'][i]+': bitte korrigieren.');}});
   const email=cell(row,7);if(email)contacts.push({type:'email',value:email,priority:0,description:''});if(cell(row,8))warnings.push('Fax wird nicht übernommen.');
   if(cell(row,10)&&!deletion)warnings.push('Hinweis in Spalte löschen: '+cell(row,10));
   for(const [part,function_name] of roleNames.entries()){const priority=(counts.get(function_name)||0)+1;if(!deletion&&!vacant&&!expired)counts.set(function_name,priority);rows.push({key:index+':'+n+':'+part,row:n,raw_role,raw_name:cell(row,2),function_name,person_kind,office_only:person_kind==='office',office_name,first_name,last_name,priority,contacts,phones,pikett_type,phone_descriptions,phone_description_edited:[false,false,false,false],email,email_description:'',email_description_edited:false,warnings,include:!deletion&&!vacant&&!expired&&!invalid&&(person_kind==='office'||!!last_name)});}
  }
  if(!rows.length)throw Error(file.name+': Keine Gemeindefunktionen erkannt');documents.push({key:String(index),file_name:file.name,source_hash:createHash('sha256').update(buffer).digest('hex'),source_format:pdf?'pdf':'xlsx',pdf_review_required:!!pdf,source_notes:pdf?.notes||[],municipality,municipality_key:key,office_name,rows});
 }
 return {documents};
}
export function municipalPreview(s,parsed){
 return {...parsed,function_options:s.functions.filter(f=>active(f)&&f.duty_time_model==='always').map(f=>({id:f.id,name:f.name})).sort((a,b)=>a.name.localeCompare(b.name,'de-CH')),department_id:s.departments.find(d=>active(d)&&norm(d.name)==='gemeinden')?.id||'',documents:parsed.documents.map(d=>{const matches=s.regions.filter(r=>active(r)&&municipalName(r.name)===d.municipality_key);const root=s.offices?.find(o=>active(o)&&(matches.length===1&&o.municipal_root_region_id===matches[0].id||o.municipal_key===d.municipality_key+':gemeindehaus'));return {...d,office_name:root?.name||d.office_name,region_id:matches.length===1?matches[0].id:'',rows:d.rows.map(row=>{const f=s.functions.filter(f=>active(f)&&f.duty_time_model==='always'&&norm(f.name)===norm(row.function_name));return {...row,function_id:row.person_kind==='person'&&f.length===1?f[0].id:''};})};})};
}
export function municipalToken(s,parsed,input){return createHash('sha256').update(JSON.stringify({parsed,input:{department_id:input.department_id||'',documents:input.documents},state:{departments:s.departments,groups:s.groups,regions:s.regions,region_groups:s.region_groups,functions:s.functions,people:s.people,offices:s.offices}})).digest('hex');}
export function prepareMunicipalImport(source,parsed,input){
 const s=structuredClone(source),plan=input.documents;s.region_groups??=[];s.offices??=[];if(!Array.isArray(plan)||plan.length!==parsed.documents.length)throw Error('Gemeindezuordnungen fehlen');
 const documents=parsed.documents.map(d=>{const p=plan.find(p=>p.key===d.key);if(d.pdf_review_required&&(p?.pdf_verified!==true||!['first_last','last_first','manual'].includes(p.pdf_name_order)))throw Error(d.municipality+': PDF-Namenreihenfolge wählen und PDF-Daten am Original prüfen');const region=p&&s.regions.find(r=>active(r)&&r.id===p.region_id);if(!region)throw Error(d.municipality+': Ein bestehendes Gemeindegebiet wählen');if(municipalName(region.name)==='stgallen')throw Error('Stadt St. Gallen ist ausgeschlossen');if(!Array.isArray(p.rows)||p.rows.length!==d.rows.length)throw Error('Unvollständige Zeilenauswahl');return {...d,office_name:p.office_name??d.office_name,region,rows:d.rows.map(raw=>{const edited=p.rows.find(r=>r.key===raw.key);if(!edited||typeof edited.include!=='boolean')throw Error('Zeilenauswahl fehlt');return {...raw,...Object.fromEntries(['include','function_name','function_id','first_name','last_name','priority','phones','pikett_type','phone_descriptions','phone_description_edited','email','email_description','email_description_edited','employee_id'].map(k=>[k,edited[k]??raw[k]]))};})};});
 if(new Set(documents.map(d=>d.region.id)).size!==documents.length)throw Error('Jede Gemeinde benötigt ein eigenes Gebiet');
 let department=input.department_id?s.departments.find(d=>active(d)&&d.id===input.department_id):s.departments.find(d=>active(d)&&norm(d.name)==='gemeinden');if(input.department_id&&!department)throw Error('Abteilung nicht gefunden');
 const summary={access_changes:[],created_people:0,updated_people:0,created_offices:0,updated_offices:0,affiliations:0,office_only_rows:0,legacy_role_checks:0,migrated_offices:0,legacy_offices:0,created_functions:[],created_groups:[],created_department:false,skipped:0};
 if(!documents.some(d=>d.rows.some(r=>r.include)))throw Error('Mindestens einen Eintrag auswählen');
 if(!department){department={id:id(),name:'Gemeinden'};s.departments.push(department);audit(s,'departments','create',null,structuredClone(department));summary.created_department=true;}
 const changedPeople=new Set(),functionIds=new Set(),assigned=new Map();
 const retiredFunction=(old,others,target,geo,sourceName)=>{if(!old)return null;if(!Object.hasOwn(old,'function_id')){if(!target||norm(target.name)!==norm(sourceName))summary.legacy_role_checks++;return null;}if(!old.function_id||old.function_id===target?.id)return null;if(others.some(x=>!Object.hasOwn(x,'function_id'))){summary.legacy_role_checks++;return null;}return others.some(x=>x.function_id===old.function_id&&x.geo_id===geo)?null:old.function_id;};
 for(const doc of documents){
  const rows=doc.rows.filter(r=>r.include);summary.skipped+=doc.rows.length-rows.length;if(!rows.length)continue;
  let group=s.groups.find(g=>active(g)&&g.department_id===department.id&&(g.municipal_region_id===doc.region.id||municipalName(g.name)===doc.municipality_key));
  if(!group){group={id:id(),name:doc.region.name,department_id:department.id,geo_ids:[doc.region.id],municipal_region_id:doc.region.id};s.groups.push(group);audit(s,'groups','create',null,structuredClone(group));summary.created_groups.push(group.name);}
  if(Array.isArray(group.geo_ids)&&!group.geo_ids.includes(doc.region.id)){const before=structuredClone(group);group.geo_ids.push(doc.region.id);audit(s,'groups','update',before,structuredClone(group));}
  const targets=new Map();
  for(const row of rows.filter(r=>r.person_kind==='person')){
   if(row.function_id===undefined&&(typeof row.function_name!=='string'||!row.function_name.trim()||row.function_name.length>200))throw Error('Funktionsname fehlt oder ist zu lang');if(!Number.isSafeInteger(row.priority)||row.priority<1)throw Error('Priorität muss eine ganze Zahl ab 1 sein');
   const matches=row.function_id!==undefined?s.functions.filter(f=>active(f)&&f.id===row.function_id):s.functions.filter(f=>active(f)&&norm(f.name)===norm(row.function_name));if(matches.length>1)throw Error('Funktion nicht eindeutig: '+row.function_name);
   const fn=matches[0];if(!fn)throw Error('Funktion „'+row.function_name+'“ einer vorhandenen Funktion zuordnen oder die Zeile vom Import ausschliessen. Neue Funktionen werden nicht automatisch angelegt.');if(fn.duty_time_model!=='always')throw Error('Funktion '+fn.name+' existiert mit Zeitprofil Geplant. Eine vorhandene Immer-Funktion wählen.');
   targets.set(row.key,fn);functionIds.add(fn.id);
  }
  // A municipality import explicitly assigns the selected area to its municipality.
  // Add this context rather than weakening existing region-group restrictions.
  const functionIdsHere=[...new Set([...targets.values()].map(f=>f.id))];
  let context=s.region_groups.find(g=>active(g)&&g.municipal_region_id===doc.region.id&&g.group_ids?.includes(group.id));
  if(!context){context={id:id(),name:doc.region.name+' · Gemeindefunktionen',municipal_region_id:doc.region.id,department_ids:[department.id],group_ids:[group.id],function_ids:functionIdsHere};s.region_groups.push(context);audit(s,'region_groups','create',null,structuredClone(context));summary.access_changes.push(doc.region.name+': Gebietsgruppe für '+department.name+' / '+group.name+' vorbereitet');}
  else{const before=structuredClone(context);context.function_ids=[...new Set([...(context.function_ids||[]),...functionIdsHere])];if(JSON.stringify(before)!==JSON.stringify(context)){audit(s,'region_groups','update',before,structuredClone(context));summary.access_changes.push(doc.region.name+': weitere ausgewählte Gemeindefunktionen freigegeben');}}
  const regionBefore=structuredClone(doc.region);
  if(!regionGroupIds(doc.region).includes(context.id)){doc.region.region_group_ids=[...regionGroupIds(doc.region),context.id];delete doc.region.region_group_id;}
  const additions=[['department_ids',[department.id],'Abteilung '+department.name],['group_ids',[group.id],'Gemeindegruppe '+group.name],['function_ids',functionIdsHere,'ausgewählte Gemeindefunktionen']];
  for(const [key,ids,label] of additions)if(doc.region[key]?.length&&ids.some(id=>!doc.region[key].includes(id))){doc.region[key]=[...new Set([...doc.region[key],...ids])];summary.access_changes.push(doc.region.name+': '+label+' zur bestehenden Gebietsfreigabe ergänzt');}
  if(JSON.stringify(regionBefore)!==JSON.stringify(doc.region))audit(s,'regions','update',regionBefore,structuredClone(doc.region));
  if(typeof doc.office_name!=='string'||!doc.office_name.trim()||doc.office_name.length>250)throw Error('Bezeichnung des Gemeindehauses erforderlich');
  const roots=s.offices.filter(o=>active(o)&&o.group_id===group.id&&(o.municipal_root_region_id===doc.region.id||o.municipal_key?.startsWith(doc.municipality_key+':')&&!o.parent_office_id&&(/^(Gemeindehaus|Gemeindeverwaltung|Stadtverwaltung)\b/i.test(o.name)||doc.rows.some(r=>r.person_kind==='office'&&norm(r.raw_name)===norm(o.name)))));
  if(roots.length>1)throw Error(doc.municipality+': Mehrere bestehende Gemeindehaus-Stellen. Bitte vor dem Import bereinigen.');
  const root=saveOffice(s,{...roots[0],name:doc.office_name.trim(),department_id:department.id,group_id:group.id,region_id:doc.region.id,parent_office_id:null});
  root.municipal_root_region_id=doc.region.id;root.municipal_key=doc.municipality_key+':gemeindehaus';summary[roots.length?'updated_offices':'created_offices']++;
  for(const row of rows){
   const fn=targets.get(row.key)||null;
   if(!Array.isArray(row.phones)||row.phones.length!==4||row.phones.some(v=>typeof v!=='string'))throw Error('Vier Telefonfelder erwartet');
   if(!['phone_mobile','phone_business'].includes(row.pikett_type))throw Error('Tel Pikett muss Mobil Geschäft oder Telefon Geschäft sein');
   if(!Array.isArray(row.phone_descriptions)||row.phone_descriptions.length!==4||row.phone_descriptions.some(v=>typeof v!=='string')||typeof row.email_description!=='string')throw Error('Kontaktbeschreibungen als Text eingeben');
   if(!Array.isArray(row.phone_description_edited)||row.phone_description_edited.length!==4||row.phone_description_edited.some(v=>typeof v!=='boolean')||typeof row.email_description_edited!=='boolean')throw Error('Ungültige Beschreibungsauswahl');
   const contacts=row.phones.flatMap((v,i)=>v.trim()?[{type:[row.pikett_type,'phone_business','phone_private','phone_mobile'][i],value:normalizePhone(v),kind:i===2?'private':'business',priority:i===0?1:0,description:row.phone_descriptions[i].trim()}]:[]);
   if(row.email){if(typeof row.email!=='string'||!/^\S+@\S+\.\S+$/.test(row.email))throw Error('Ungültige E-Mail-Adresse');contacts.push({type:'email',value:row.email.trim(),priority:0,description:row.email_description.trim()});}
   const descriptionEdited=c=>c.type==='email'?row.email_description_edited:row.phones.some((v,i)=>v.trim()&&row.phone_description_edited[i]&&[row.pikett_type,'phone_business','phone_private','phone_mobile'][i]===c.type&&normalizePhone(v)===c.value);
   let office=s.offices.find(o=>o.id===root.id);
   if(row.person_kind==='office'){
    const sourceKey=doc.municipality_key+':'+norm(row.raw_role)+':'+norm(row.raw_name),oldSource=office.municipal_sources?.find(x=>x.key===sourceKey),otherSources=(office.municipal_sources||[]).filter(x=>x.key!==sourceKey);
    for(const c of contacts){const existing=office.contacts?.find(old=>old.type===c.type&&old.value===c.value);if(existing&&!descriptionEdited(c)&&c.description===row.contacts.find(old=>canonicalContact(old).type===c.type&&old.value===c.value)?.description)c.description=contactDescription(existing);}
    const combined=(office.contacts||[]).filter(c=>!oldSource?.contacts?.some(old=>old.type===c.type&&old.value===c.value)||otherSources.some(x=>x.contacts?.some(old=>old.type===c.type&&old.value===c.value)));for(const c of contacts)if(!combined.some(old=>old.type===c.type&&old.value===c.value))combined.push(c);
    const obsolete=retiredFunction(oldSource,otherSources,fn,doc.region.id,row.function_name),roles=(office.function_regions||[]).filter(a=>!(a.function_id===obsolete&&a.geo_id===doc.region.id));
    summary.office_only_rows++;
    office=saveOffice(s,{id:root.id,contacts:combined,function_regions:roles});office.municipal_sources=[...otherSources,{key:sourceKey,contacts,function_id:null,geo_id:doc.region.id}];continue;
   }
   const personKey=doc.municipality_key+':'+norm(row.raw_name||row.raw_role),sourceKey=personKey+':'+norm(row.raw_role),targetName=[row.first_name,row.last_name].join(' ');
   let previous;
   if(row.employee_id){previous=s.people.find(p=>active(p)&&p.employee_id===row.employee_id);if(!previous||previous.source!=='manual')throw Error('Gewählte Person nicht verfügbar oder nicht manuell gepflegt');}
   else{const candidates=s.people.filter(p=>active(p)&&p.source==='manual'&&(p.municipal_sources?.some(x=>x.person_key===personKey||x.key===sourceKey)||personGroupIds(p).includes(group.id)&&norm(p.name)===norm(targetName)));if(candidates.length>1)throw Error('Mehrere passende Personen: '+targetName+'; bitte explizit auswählen');previous=candidates[0];}
   for(const c of contacts){const existing=previous?.contacts?.find(old=>old.type===c.type&&old.value===c.value);if(existing&&!descriptionEdited(c)&&c.description===row.contacts.find(old=>canonicalContact(old).type===c.type&&old.value===c.value)?.description)c.description=contactDescription(existing);}
   const legacySourceKey=doc.municipality_key+':'+norm(row.raw_role)+':'+norm(row.raw_name),legacyOffice=s.offices.find(o=>active(o)&&o.id!==root.id&&o.group_id===group.id&&o.municipal_sources?.some(x=>x.key===legacySourceKey));
   const legacySource=legacyOffice?.municipal_sources.find(x=>x.key===legacySourceKey);
   if(legacyOffice){for(const c of contacts){const old=legacyOffice.contacts.find(old=>canonicalContact(old).type===c.type&&old.value===c.value);if(old&&!descriptionEdited(c)&&c.description===row.contacts.find(raw=>canonicalContact(raw).type===c.type&&raw.value===c.value)?.description)c.description=contactDescription(old);}}
   const oldSource=previous?.municipal_sources?.find(x=>x.key===sourceKey),otherSources=(previous?.municipal_sources||[]).filter(x=>x.key!==sourceKey),retained=(previous?.contacts||[]).filter(c=>!oldSource?.contacts?.some(old=>old.type===c.type&&old.value===c.value)||otherSources.some(x=>x.contacts?.some(old=>old.type===c.type&&old.value===c.value)));
   const combined=[...retained,...(legacyOffice?.contacts||[]).map(canonicalContact).filter(c=>!retained.some(old=>old.type===c.type&&old.value===c.value)&&!contacts.some(old=>old.type===c.type&&old.value===c.value))];for(const c of contacts)if(!combined.some(old=>old.type===c.type&&old.value===c.value))combined.push(c);
   const person=manualPerson({first_name:row.first_name,last_name:row.last_name,department_id:previous?.department_id||department.id,group_ids:[...new Set([...personGroupIds(previous),group.id])],contacts:combined},previous,'EXT-'+id(),{allowNameOnly:true});
   const assignmentKey=JSON.stringify(['person',person.employee_id,fn.id,doc.region.id]),earlier=assigned.get(assignmentKey);if(earlier&&earlier.office_id!==office.id)throw Error(person.name+': Mehrere Quellzeilen weisen dieselbe Funktion im selben Gebiet unterschiedlichen Stellen zu. Stellenzuordnung prüfen oder eine Zeile ausschliessen.');
   const priority=earlier?Math.min(earlier.priority,row.priority):row.priority,obsolete=retiredFunction(oldSource,otherSources,fn,doc.region.id,row.function_name);
   person.municipal_sources=[...otherSources,{key:sourceKey,person_key:personKey,contacts,function_id:fn.id,geo_id:doc.region.id,office_id:office.id}];person.function_regions=[...(previous?.function_regions||[]).filter(a=>!(a.function_id===fn.id&&a.geo_id===doc.region.id)&&!(a.function_id===obsolete&&a.geo_id===doc.region.id)),{function_id:fn.id,geo_id:doc.region.id,priority,office_id:office.id}];if(!earlier)summary.affiliations++;assigned.set(assignmentKey,{priority,office_id:office.id});
   if(legacyOffice){
    const before=structuredClone(legacyOffice);legacyOffice.municipal_sources=legacyOffice.municipal_sources.filter(x=>x.key!==legacySourceKey);
    const obsoleteOfficeFunction=retiredFunction(legacySource,legacyOffice.municipal_sources,null,doc.region.id,row.function_name);
    legacyOffice.function_regions=(legacyOffice.function_regions||[]).filter(r=>!(r.function_id===obsoleteOfficeFunction&&r.geo_id===doc.region.id));
    if(!legacyOffice.municipal_sources.length&&!legacyOffice.function_regions.length&&!s.offices.some(o=>active(o)&&o.parent_office_id===legacyOffice.id)&&!s.people.some(p=>active(p)&&(p.els_office_id===legacyOffice.id||p.function_regions?.some(r=>r.office_id===legacyOffice.id)))){legacyOffice.deleted_at=new Date().toISOString();summary.migrated_offices++;}
    audit(s,'offices','municipal_person_conversion',before,structuredClone(legacyOffice));
   }
   if(previous)s.people[s.people.indexOf(previous)]=person;else s.people.push(person);if(!changedPeople.has(person.employee_id)){summary[previous?'updated_people':'created_people']++;changedPeople.add(person.employee_id);}audit(s,'person','municipal_import',previous||null,structuredClone(person));
  }
 }
 summary.legacy_offices=s.offices.filter(o=>active(o)&&!o.municipal_root_region_id&&documents.some(d=>o.municipal_key?.startsWith(d.municipality_key+':'))).length;
 const view=withRegionGroups(s);for(const key of changedPeople){const p=s.people.find(p=>p.employee_id===key);validatePersonAffiliations(view,p,source.people.find(old=>old.employee_id===key));}
 summary.functions=[...functionIds].map(key=>s.functions.find(f=>f.id===key).name);summary.department=department.name;
 return {state:s,summary,token:municipalToken(source,parsed,input)};
}
