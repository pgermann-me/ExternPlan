import {audit,id} from '../domain.js';
import {personDepartmentIds} from '../public/organization.js';
import {DateTime} from 'luxon';

// Example mapping only: no identities, AD attributes or personal facts are invented.
function contactRow(c,issues){
 const key=String(c.type||'').toLowerCase();
 const mapping={phone_mobile:['Mobile',''],mobile:['Mobile',''],'telefon mobil':['Mobile',''],phone_business:['Phone','business'],business:['Phone','business'],'telefon geschäft':['Phone','business'],phone_private:['Phone','private'],private:['Phone','private'],'telefon privat':['Phone','private'],phone:['Phone',''],telefon:['Phone',''],email:['Email',''],'e-mail':['Email','']};
 const [type,defaultKind]=mapping[key]||['',''];
 const kind=['business','private'].includes(c.kind)?c.kind:defaultKind;
 if(!type)issues.add('Kontaktart ist noch nicht für OnCall zugeordnet.');
 if(!kind)issues.add('Bei einzelnen Kontakten fehlt die Zuordnung Geschäft/Privat.');
 return {priority:c.priority??0,type,kind,value:String(c.value??''),description:String(c.description??'')};
}
export function onCallPersonExample(state){
 const warnings=[];
 const payload=state.people.filter(p=>!p.deleted_at).map(p=>{
  const issues=new Set();
  const departments=personDepartmentIds(p,state.groups);
  const department=p.department_id||(departments.length===1?departments[0]:'');
  if(!p.first_name||!p.last_name)issues.add('Vorname und Nachname sind noch nicht in getrennten Feldern erfasst.');
  if(!department)issues.add(departments.length>1?'Mehrere Abteilungen vorhanden; eine eindeutige OnCall-Zuordnung fehlt.':'Abteilungszuordnung fehlt.');
  const a=p.business_address;
  const addresses=a?[{type:a.type||'BusinessStandort',street:a.street||'',streetNumber:a.streetNumber||null,additionalInfo:a.additionalInfo||null,zipCode:a.zipCode||'',city:a.city||'',country:a.country||null}]:[];
  if(!a)issues.add('Geschäftliche Adresse ist noch nicht erfasst.');else if(!a.street||!a.zipCode||!a.city)issues.add('Geschäftliche Adresse ist unvollständig (Strasse, PLZ oder Ort fehlen).');
  const row={externalAD_ID1:null,externalAD_ID2:null,externalAD_Role:null,persID:p.employee_id,shortSign:'',sex:null,firstName:p.first_name||'',lastName:p.last_name||'',birthdate:null,organisation:'',position:'',department,qualifications:[],addresses,contacts:(p.contacts||[]).map(c=>contactRow(c,issues))};
  if(issues.size)warnings.push({employee_id:p.employee_id,issues:[...issues]});return row;
 });
 return {payload,warnings};
}
export function createOnCallPersonExport(state,now=new Date()){
 const {payload,warnings}=onCallPersonExample(state),exportId=id();
 const record={id:exportId,created_at:now.toISOString(),filename:`E3_OnCall_Person_${DateTime.fromJSDate(now,{zone:'Europe/Zurich'}).toFormat('ddMMyyyy')}.json`,person_count:payload.length,warnings,payload};
 state.person_exports??=[];state.person_exports.push(record);
 audit(state,'person_export','create',null,{export_id:exportId,count:payload.length,example:true});return record;
}
