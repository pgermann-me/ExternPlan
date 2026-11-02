import {audit,id} from './domain.js';
import {normalizePersonContacts} from './public/phone.js';
export function officeAffiliationProblem(s,person,row){
 if(!row.office_id)return null;const office=(s.offices||[]).find(o=>o.id===row.office_id&&!o.deleted_at);
 if(!office)return 'Die zugeordnete Stelle ist nicht verfügbar';
 if(office.region_id!==row.geo_id)return 'Die Stelle gehört nicht zum gewählten Gebiet';
 const groups=person.group_ids||(person.group_id?[person.group_id]:[]);if(office.group_id&&!groups.includes(office.group_id))return 'Die Person muss der Gemeindegruppe der Stelle zugeordnet sein';
 return null;
}
export function saveOffice(s,input){
 const previous=(s.offices||[]).find(o=>o.id===input.id&&!o.deleted_at);if(input.id&&!previous)throw Error('Stelle nicht gefunden');
 const row={...previous,id:previous?.id||'OFF-'+id(),name:String(input.name??previous?.name??'').trim(),department_id:input.department_id??previous?.department_id,group_id:input.group_id??previous?.group_id,region_id:input.region_id??previous?.region_id,parent_office_id:Object.hasOwn(input,'parent_office_id')?input.parent_office_id:previous?.parent_office_id??null,els_org_id:String(input.els_org_id??previous?.els_org_id??'').trim(),contacts:normalizePersonContacts(input.contacts??previous?.contacts??[],previous?.contacts||[]),function_regions:input.function_regions??previous?.function_regions??[]};
 if(!row.name||row.name.length>250)throw Error('Bezeichnung der Stelle erforderlich (maximal 250 Zeichen)');
 if(!s.departments.some(d=>d.id===row.department_id&&!d.deleted_at)||!s.groups.some(g=>g.id===row.group_id&&!g.deleted_at&&g.department_id===row.department_id)||!s.regions.some(r=>r.id===row.region_id&&!r.deleted_at))throw Error('Stelle benötigt gültige Abteilung, Gemeindegruppe und Gebiet');
 if(row.contacts.some(c=>!c.type||!c.value||!Number.isSafeInteger(c.priority)||c.priority<0))throw Error('Ungültige Kontaktdaten der Stelle');
 let parent=row.parent_office_id;const seen=new Set([row.id]);while(parent){if(seen.has(parent))throw Error('Stellenhierarchie enthält einen Kreis');seen.add(parent);const p=(s.offices||[]).find(o=>o.id===parent&&!o.deleted_at);if(!p||p.group_id!==row.group_id||p.region_id!==row.region_id)throw Error('Übergeordnete Stelle muss zur gleichen Gemeinde gehören');parent=p.parent_office_id;}
 if(!Array.isArray(row.function_regions)||row.function_regions.some(r=>!s.functions.some(f=>f.id===r.function_id&&!f.deleted_at)||r.geo_id!==row.region_id||!Number.isSafeInteger(r.priority)||r.priority<0))throw Error('Ungültige Stellenfunktion');
 if(row.els_org_id&&(s.offices||[]).some(o=>o.id!==row.id&&!o.deleted_at&&(o.els_org_id||o.id)===row.els_org_id))throw Error('ELS-Stellenkennung ist bereits vergeben');
 if(previous&&(row.region_id!==previous.region_id||row.group_id!==previous.group_id)&&(s.offices||[]).some(o=>!o.deleted_at&&o.parent_office_id===row.id))throw Error('Stelle mit untergeordneten Stellen kann nicht in eine andere Gemeinde verschoben werden');
 const member=s.people.some(p=>!p.deleted_at&&(p.function_regions||[]).some(r=>r.office_id===row.id));if(member&&previous&&(row.region_id!==previous.region_id||row.group_id!==previous.group_id))throw Error('Stelle mit zugeordneten Personen kann nicht in eine andere Gemeinde verschoben werden');
 s.offices??=[];if(previous)s.offices[s.offices.indexOf(previous)]=row;else s.offices.push(row);audit(s,'office',previous?'update':'create',previous||null,structuredClone(row));return row;
}
