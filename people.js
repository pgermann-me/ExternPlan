import {audit,instant,iso} from './domain.js';
import {personGroupIds} from './public/organization.js';
// Existing combined names are retained verbatim; they are never guessed into components.
export function manualPerson(input, previous, employeeId) {
  const first_name=String(input.first_name??previous?.first_name??'').trim();
  const last_name=String(input.last_name??previous?.last_name??'').trim();
  if ((!previous || first_name || last_name) && (!first_name || !last_name)) {
    throw Error('Vorname und Name sind erforderlich');
  }
  const group_ids=input.group_ids??(Object.hasOwn(input,'group_id')?(input.group_id?[input.group_id]:[]):personGroupIds(previous));
  if(!Array.isArray(group_ids)||group_ids.some(g=>typeof g!=='string'||!g)||new Set(group_ids).size!==group_ids.length)throw Error('Gruppen müssen eindeutige Kennungen enthalten');
  return {
    ...previous,
    employee_id: previous?.employee_id || employeeId,
    first_name,
    last_name,
    name: first_name || last_name ? [first_name,last_name].filter(Boolean).join(' ') : previous.name,
    source:'manual',
    external_id:input.external_id||null,
    department_id:input.department_id||null,
    group_ids,group_id:group_ids[0]||null,
    contacts:(input.contacts??previous?.contacts??[]).map(c=>({...c,priority:c.priority??0}))
  };
}

export function deletePerson(s,employeeId,now=Date.now()){
 const person=s.people.find(p=>p.employee_id===employeeId&&!p.deleted_at);
 if(!person)throw Error('Person nicht gefunden');
 if(s.assignments.some(a=>a.employee_id===employeeId&&instant(a.end_on)>now))throw Error('Löschen nicht möglich: Die Person hat laufende oder zukünftige Pikettdienste');
 const before={...person};person.deleted_at=iso(now);audit(s,'person','delete',before,{...person});
 return {ok:true,archived:true};
}
