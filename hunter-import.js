import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {DateTime} from 'luxon';
import {manualPerson} from './people.js';
import {audit,id} from './domain.js';
const list=v=>v==null?[]:Array.isArray(v)?v:[v];
const text=(v,field)=>{if(v!=null&&typeof v==='object')throw Error('Ungültiges XML-Feld: '+field);return String(v??'').trim();};
export function parseHunters(content){
 if(typeof content!=='string'||Buffer.byteLength(content)>5e6)throw Error('XML-Datei maximal 5 MB');
 if(/<!DOCTYPE|<!ENTITY/i.test(content))throw Error('XML-DTD und Entitäten sind nicht erlaubt');
 if(XMLValidator.validate(content)!==true)throw Error('Ungültige XML-Datei');
 const root=new XMLParser({parseTagValue:false,ignoreAttributes:false}).parse(content);
 if(!root.PERSONEN||!Object.hasOwn(root.PERSONEN,'PERSON'))throw Error('XML benötigt PERSONEN/PERSON');
 const seen=new Set(),descriptions={};let skipped_regions=0;
 const people=list(root.PERSONEN.PERSON).map((r,index)=>{
  const get=k=>text(r[k],k),employee_id=get('PERS_ID'),first_name=get('VORNAME'),last_name=get('NACHNAME');
  if(!employee_id||!first_name||!last_name)throw Error(`Person ${index+1}: Kennung, Name und Vorname erforderlich`);
  if(seen.has(employee_id))throw Error('Doppelte PERS_ID: '+employee_id);seen.add(employee_id);
  const raw=get('GEBURTSDATUM'),date=raw?DateTime.fromFormat(raw,'dd.MM.yyyy'):null;
  if(date&&!date.isValid)throw Error('Ungültiges Geburtsdatum bei PERS_ID '+employee_id);
  const contacts=list(r.KOMMUNIKATIONEN?.KOMMUNIKATION).flatMap(c=>{const type={FESTNETZ:'phone_business',NATEL:'phone_mobile'}[text(c.TYP,'TYP')],value=text(c.KOMM,'KOMM');return type&&value?[{type,value,priority:0}]:[];});
  const regions=new Map();
  for(const rev of list(r.JAGDREVIERE?.JAGDREVIER)){
   const number=text(rev.REV_NUMMER,'REV_NUMMER');if(!/^\d+$/.test(number)||!Number.isSafeInteger(Number(number)))throw Error('Ungültige REV_NUMMER bei '+employee_id);
   if(Number(number)>999){skipped_regions++;continue;}
   const value=text(rev.REV_PRIO,'REV_PRIO'),priority=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(priority)||priority<0)throw Error('Ungültige REV_PRIO bei '+employee_id);
   const geo_id='J'+String(Number(number)).padStart(3,'0');if(regions.has(geo_id)&&regions.get(geo_id)!==priority)throw Error('Widersprüchliche Revierpriorität bei '+employee_id);regions.set(geo_id,priority);const description=text(rev.REV_NAME,'REV_NAME');if(description&&!descriptions[geo_id])descriptions[geo_id]=description;
  }
  return {employee_id,first_name,last_name,birth_date:date?.toISODate()||null,business_address:{type:'BusinessStandort',street:get('STRASSE'),streetNumber:get('HAUSNR'),zipCode:get('PLZ'),city:get('ORT')},contacts,regions:[...regions].map(([geo_id,priority])=>({geo_id,priority}))};
 });
 if(!people.length||people.length>10000)throw Error('1 bis 10 000 Personen erwartet');
 return {people,skipped_regions,descriptions};
}
export function previewHunters(s,content){
 const parsed=parseHunters(content),fn=s.functions.find(f=>!f.deleted_at&&f.name.toLocaleLowerCase('de-CH')==='jäger')||s.functions.find(f=>f.name.toLocaleLowerCase('de-CH')==='jäger');
 const region_ids=[...new Set(parsed.people.flatMap(p=>p.regions.map(r=>r.geo_id)))].sort();
 const restored_regions=region_ids.filter(id=>s.regions.some(r=>r.id===id&&r.deleted_at));
 for(const p of parsed.people){const existing=s.people.find(x=>x.employee_id===p.employee_id);if(existing&&existing.source!=='manual')throw Error('PERS_ID ist bereits für eine SAP-Person reserviert: '+p.employee_id);}
 const updated=parsed.people.filter(p=>s.people.some(x=>x.employee_id===p.employee_id)).length;
 return {...parsed,restored_regions,restored:parsed.people.filter(p=>s.people.some(x=>x.employee_id===p.employee_id&&x.deleted_at)).length,count:parsed.people.length,created:parsed.people.length-updated,updated,function_id:fn?.id||null,organization:describeHunterOrganization(s,parsed),missing_regions:region_ids.filter(id=>!s.regions.some(r=>r.id===id))};
}
function describeHunterOrganization(s,parsed){
 const department=s.departments.find(d=>!d.deleted_at&&d.name?.toLocaleLowerCase('de-CH')==='jäger')||s.departments.find(d=>d.name?.toLocaleLowerCase('de-CH')==='jäger');
 const ids=[...new Set(parsed.people.flatMap(p=>p.regions.map(r=>r.geo_id)))].sort();
 return {department_id:department?.id||null,groups:ids.map(geo_id=>{
  const region=s.regions.find(r=>r.id===geo_id),description=region?.name&&region.name!==geo_id?region.name:parsed.descriptions[geo_id]||geo_id;
  const name=description===geo_id?geo_id:geo_id+' · '+description;
  const matches=g=>g.department_id===department?.id&&(g.hunter_geo_id===geo_id||g.name===name);
  const existing=department&&(s.groups.find(g=>!g.deleted_at&&matches(g))||s.groups.find(matches));
  return {geo_id,name,id:existing?.id||null};
 })};
}
export function importHunters(s,content,createRegions=false){
 const preview=previewHunters(s,content);
 if(preview.missing_regions.length&&!createRegions)throw Error('Fehlende Gebiete zuerst anlegen oder deren Erstellung bestätigen');
 for(const key of preview.restored_regions){const r=s.regions.find(r=>r.id===key),before={...r};delete r.deleted_at;audit(s,'regions','restore',before,{...r});}
 for(const key of preview.missing_regions){const region={id:key,name:key};s.regions.push(region);audit(s,'regions','import',null,region);}
 let fn=s.functions.find(f=>f.id===preview.function_id);
 if(!fn){fn={id:id(),name:'Jäger',geo_ids:[],covers:{}};s.functions.push(fn);audit(s,'functions','create',null,structuredClone(fn));}
 const beforeFn=structuredClone(fn);delete fn.deleted_at;fn.duty_time_model='always';delete fn.duty_color;fn.geo_ids=[...new Set([...fn.geo_ids,...preview.people.flatMap(p=>p.regions.map(r=>r.geo_id))])];
 if(JSON.stringify(fn)!==JSON.stringify(beforeFn))audit(s,'functions','update',beforeFn,structuredClone(fn));
 let department=s.departments.find(d=>d.id===preview.organization.department_id),created_departments=0,created_groups=0;
 if(!department){department={id:id(),name:'Jäger'};s.departments.push(department);audit(s,'departments','create',null,department);created_departments++;}
 if(department.deleted_at){const before={...department};delete department.deleted_at;audit(s,'departments','restore',before,{...department});}
 const groupByGeo=new Map();for(const planned of preview.organization.groups){let group=s.groups.find(g=>g.id===planned.id);if(!group){group={id:id(),name:planned.name,department_id:department.id,geo_ids:[planned.geo_id],hunter_geo_id:planned.geo_id};s.groups.push(group);audit(s,'groups','create',null,group);created_groups++;}if(group.deleted_at){const before={...group};delete group.deleted_at;audit(s,'groups','restore',before,{...group});}groupByGeo.set(planned.geo_id,group.id);}
 const managed=new Set(s.groups.filter(g=>g.department_id===department.id&&g.hunter_geo_id).map(g=>g.id));
 for(const row of preview.people){
  const previous=s.people.find(p=>p.employee_id===row.employee_id);
  const person=manualPerson({...row,external_id:previous?.external_id,department_id:previous?.department_id||department.id,group_ids:[...new Set([...(previous?.group_ids||(previous?.group_id?[previous.group_id]:[])).filter(g=>!managed.has(g)),...row.regions.map(r=>groupByGeo.get(r.geo_id))])],contacts:[...(previous?.contacts||[]).filter(c=>!['phone_mobile','phone_business'].includes(c.type)),...row.contacts]},previous,row.employee_id);
  delete person.deleted_at;
  person.function_regions=[...(previous?.function_regions||[]).filter(r=>r.function_id!==fn.id),...row.regions.map(r=>({geo_id:r.geo_id,priority:r.priority,function_id:fn.id}))];
  if(previous)s.people[s.people.indexOf(previous)]=person;else s.people.push(person);audit(s,'person','import',previous||null,person);
 }
 return {imported:preview.count,restored:preview.restored,restored_regions:preview.restored_regions.length,created:preview.created,updated:preview.updated,created_regions:preview.missing_regions.length,created_groups,created_departments,skipped_regions:preview.skipped_regions};
}
