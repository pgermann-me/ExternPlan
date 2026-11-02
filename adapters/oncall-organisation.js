import {audit,id} from '../domain.js';
import {DateTime} from 'luxon';
import {contactRow} from './oncall-person.js';
// Example based on the supplied orgID/name/organisation/addresses/contacts schema.
// Internal identifiers and parent references still require validation with ELS.
export function onCallOrganisationExample(state){
 const offices=(state.offices||[]).filter(o=>!o.deleted_at),groups=state.groups.filter(g=>!g.deleted_at&&offices.some(o=>o.group_id===g.id)),departments=state.departments.filter(d=>!d.deleted_at),warnings=[],ids=new Set();
 const officeId=o=>o.els_org_id||o.id;
 const records=[...departments.map(d=>({id:d.id,name:d.name,parent:null,contacts:[]})),...groups.map(g=>({id:g.id,name:g.name,parent:departments.find(d=>d.id===g.department_id)?.id||null,contacts:[]})),...offices.map(o=>({id:officeId(o),name:o.name,parent:offices.find(p=>p.id===o.parent_office_id)?officeId(offices.find(p=>p.id===o.parent_office_id)):groups.find(g=>g.id===o.group_id)?.id||null,contacts:o.contacts||[]}))];
 const payload=records.map(r=>{if(ids.has(r.id))throw Error('Doppelte Organisationskennung: '+r.id);ids.add(r.id);const issues=new Set(),contacts=r.contacts.map(c=>contactRow(c,issues));if(issues.size)warnings.push({orgID:r.id,issues:[...issues]});return {orgID:r.id,description:null,name:r.name,organisation:r.parent,addresses:[],contacts};});
 for(const row of payload)if(row.organisation&&!ids.has(row.organisation))throw Error('Übergeordnete Organisation fehlt');
 warnings.push({orgID:null,issues:['Beispieldatei: interne Organisationskennungen und die Zuordnung des Feldes organisation als Elternreferenz müssen vor einer produktiven ELS-Anbindung bestätigt werden.']});return {payload,warnings};
}
export function createOnCallOrganisationExport(state,now=new Date()){
 const {payload,warnings}=onCallOrganisationExample(state),record={id:id(),created_at:now.toISOString(),filename:`E3_OnCall_Organisation_${DateTime.fromJSDate(now,{zone:'Europe/Zurich'}).toFormat('ddMMyyyy')}.json`,organisation_count:payload.length,payload,warnings};state.office_exports??=[];state.office_exports.push(record);audit(state,'office_export','create',null,{export_id:record.id,count:payload.length,example:true});return record;
}
