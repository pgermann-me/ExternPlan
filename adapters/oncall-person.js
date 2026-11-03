import {onCallMembershipExample} from './oncall-memberships.js';
import {contactDescription,canonicalContact} from '../public/phone.js';
import {audit,id} from '../domain.js';
import {personDepartmentIds,personGroupIds} from '../public/organization.js';
import {DateTime} from 'luxon';

// Example mapping only: no identities, AD attributes or personal facts are invented.
export function contactRow(c,issues){
 c=canonicalContact(c);
 const key=String(c.type||'').trim().toLowerCase();
 const mapping={phone_mobile:['Mobile',''],mobile:['Mobile',''],'telefon mobil':['Mobile',''],phone_business:['Phone','business'],business:['Phone','business'],'telefon geschäft':['Phone','business'],phone_private:['Phone','private'],private:['Phone','private'],'telefon privat':['Phone','private'],phone:['Phone',''],telefon:['Phone',''],email:['Email',''],'e-mail':['Email','']};
 const [type,defaultKind]=mapping[key]||['',''];
 const kind=['business','private'].includes(c.kind)?c.kind:defaultKind;
 if(!type)issues.add('Kontaktart ist noch nicht für OnCall zugeordnet.');
 if(!kind)issues.add('Bei einzelnen Kontakten fehlt die Zuordnung Geschäft/Privat.');
 return {priority:c.priority??0,type,kind,value:String(c.value??''),description:contactDescription(c)};
}
export function onCallPersonExample(state){
 const warnings=[];
 const payload=state.people.filter(p=>!p.deleted_at).map(p=>{
  const issues=new Set();
  const departments=personDepartmentIds(p,state.groups);
  const officeIds=[...new Set((p.function_regions||[]).map(r=>r.office_id).filter(Boolean))],offices=(state.offices||[]).filter(o=>!o.deleted_at),office=offices.find(o=>o.id===(p.els_office_id||(officeIds.length===1?officeIds[0]:null)));
  const groups=state.groups.filter(g=>!g.deleted_at&&personGroupIds(p).includes(g.id));
  const department=office?(office.els_org_id||office.id):officeIds.length?'':groups.length===1?groups[0].id:p.department_id||(groups.length===0&&departments.length===1?departments[0]:'');
  if(office&&!office.els_org_id)issues.add('ELS-Stellenkennung noch nicht bestätigt; interne Stellenkennung verwendet.');if(officeIds.length&&!office)issues.add('Mehrere oder fehlende Stellenzuordnungen; ELS-Stelle bei der Person ausdrücklich wählen.');
  if(groups.length>1)issues.add('Mehrere Gruppenzuordnungen sind vollständig in der begleitenden Zuordnungs-Beispieldatei enthalten; department enthält nur die primäre Stelle.');
  if(!p.first_name||!p.last_name)issues.add('Vorname und Nachname sind noch nicht in getrennten Feldern erfasst.');
  if(!department)issues.add(departments.length>1?'Mehrere Abteilungen vorhanden; eine eindeutige OnCall-Zuordnung fehlt.':'Abteilungszuordnung fehlt.');
  const a=p.business_address;
  const addresses=a?[{type:a.type||'BusinessStandort',street:a.street||'',streetNumber:a.streetNumber||null,additionalInfo:a.additionalInfo||null,zipCode:a.zipCode||'',city:a.city||'',country:a.country||null}]:[];
  const row={externalAD_ID1:null,externalAD_ID2:null,externalAD_Role:null,persID:p.employee_id,shortSign:'',sex:null,firstName:p.first_name||'',lastName:p.last_name||'',birthdate:null,organisation:'',position:'',department,qualifications:[],addresses,contacts:(p.contacts||[]).map(c=>contactRow(c,issues))};
  if(issues.size)warnings.push({employee_id:p.employee_id,issues:[...issues]});return row;
 });
 return {payload,warnings};
}
export function createOnCallPersonExport(state,now=new Date()){
 const {payload,warnings}=onCallPersonExample(state),exportId=id();
 const record={id:exportId,created_at:now.toISOString(),filename:`E3_OnCall_Person_${DateTime.fromJSDate(now,{zone:'Europe/Zurich'}).toFormat('ddMMyyyy')}.json`,person_count:payload.length,warnings,payload,memberships:{...onCallMembershipExample(state),filename:`ExternPlan_Person_Organisation_Beispiel_${DateTime.fromJSDate(now,{zone:'Europe/Zurich'}).toFormat('ddMMyyyy')}.json`}};
 state.person_exports??=[];state.person_exports.push(record);
 audit(state,'person_export','create',null,{export_id:exportId,count:payload.length,example:true});return record;
}
