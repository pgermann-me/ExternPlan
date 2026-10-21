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
 const seen=new Set();let skipped_regions=0;
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
   const value=text(rev.REV_PRIO,'REV_PRIO'),priority=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(priority)||priority<1)throw Error('Ungültige REV_PRIO bei '+employee_id);
   const geo_id='J'+String(Number(number)).padStart(3,'0');if(regions.has(geo_id)&&regions.get(geo_id)!==priority)throw Error('Widersprüchliche Revierpriorität bei '+employee_id);regions.set(geo_id,priority);
  }
  return {employee_id,first_name,last_name,birth_date:date?.toISODate()||null,business_address:{type:'BusinessStandort',street:get('STRASSE'),streetNumber:get('HAUSNR'),zipCode:get('PLZ'),city:get('ORT')},contacts,regions:[...regions].map(([geo_id,priority])=>({geo_id,priority}))};
 });
 if(!people.length||people.length>10000)throw Error('1 bis 10 000 Personen erwartet');
 return {people,skipped_regions};
}
export function previewHunters(s,content){
 const parsed=parseHunters(content),fn=s.functions.find(f=>!f.deleted_at&&f.name.toLocaleLowerCase('de-CH')==='jäger');
 const region_ids=[...new Set(parsed.people.flatMap(p=>p.regions.map(r=>r.geo_id)))].sort();
 const reserved=region_ids.filter(id=>s.regions.some(r=>r.id===id&&r.deleted_at));if(reserved.length)throw Error('Gelöschte Geo_ID reserviert: '+reserved.join(', '));
 for(const p of parsed.people){const existing=s.people.find(x=>x.employee_id===p.employee_id);if(existing&&(existing.deleted_at||existing.source!=='manual'))throw Error('PERS_ID ist bereits für eine gelöschte oder SAP-Person reserviert: '+p.employee_id);}
 const updated=parsed.people.filter(p=>s.people.some(x=>x.employee_id===p.employee_id)).length;
 return {...parsed,count:parsed.people.length,created:parsed.people.length-updated,updated,function_id:fn?.id||null,missing_regions:region_ids.filter(id=>!s.regions.some(r=>r.id===id))};
}
export function importHunters(s,content,createRegions=false){
 const preview=previewHunters(s,content);
 if(preview.missing_regions.length&&!createRegions)throw Error('Fehlende Gebiete zuerst anlegen oder deren Erstellung bestätigen');
 for(const key of preview.missing_regions){const region={id:key,name:key};s.regions.push(region);audit(s,'regions','import',null,region);}
 let fn=s.functions.find(f=>f.id===preview.function_id);
 if(!fn){fn={id:id(),name:'Jäger',geo_ids:[],covers:{}};s.functions.push(fn);audit(s,'functions','create',null,structuredClone(fn));}
 const beforeFn=structuredClone(fn);fn.geo_ids=[...new Set([...fn.geo_ids,...preview.people.flatMap(p=>p.regions.map(r=>r.geo_id))])];
 if(JSON.stringify(fn)!==JSON.stringify(beforeFn))audit(s,'functions','update',beforeFn,structuredClone(fn));
 for(const row of preview.people){
  const previous=s.people.find(p=>p.employee_id===row.employee_id);
  const person=manualPerson({...row,external_id:previous?.external_id,department_id:previous?.department_id,contacts:[...(previous?.contacts||[]).filter(c=>!['phone_mobile','phone_business'].includes(c.type)),...row.contacts]},previous,row.employee_id);
  person.function_regions=[...(previous?.function_regions||[]).filter(r=>r.function_id!==fn.id),...row.regions.map(r=>({...r,function_id:fn.id}))];
  if(previous)s.people[s.people.indexOf(previous)]=person;else s.people.push(person);audit(s,'person','import',previous||null,person);
 }
 return {imported:preview.count,created:preview.created,updated:preview.updated,created_regions:preview.missing_regions.length,skipped_regions:preview.skipped_regions};
}
