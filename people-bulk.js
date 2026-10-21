import {audit,change} from './domain.js';
import {personGroupIds} from './public/organization.js';
import {accessPolicy,restricted,scopedPersonInput} from './access-scope.js';
export const personOrganizationSnapshot=p=>({employee_id:p.employee_id,department_id:p.department_id||null,group_ids:[...personGroupIds(p)].sort()});
export function bulkPeopleOrganization(s,input,user){
 const {expected,department={mode:'keep'},groups={mode:'keep'}}=input;
 if(!Array.isArray(expected)||!expected.length||expected.length>1000||new Set(expected.map(p=>p?.employee_id)).size!==expected.length)throw Error('1 bis 1000 eindeutige Personen auswählen');
 if(!['keep','set','clear'].includes(department.mode)||!['keep','add','replace','clear'].includes(groups.mode))throw Error('Ungültige Zuordnungsänderung');
 const policy=restricted(user)?accessPolicy(s,user):null;
 if(department.mode==='set'&&!s.departments.some(d=>d.id===department.id&&!d.deleted_at))throw Error('Abteilung unbekannt');
 const ids=groups.ids||[];if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!s.groups.some(g=>g.id===id&&!g.deleted_at)))throw Error('Ungültige Gruppen');
 if(['add','replace'].includes(groups.mode)&&!ids.length)throw Error('Mindestens eine Gruppe wählen');
 if(department.mode==='set'&&['add','replace'].includes(groups.mode)&&ids.some(id=>s.groups.find(g=>g.id===id).department_id!==department.id))throw Error('Gruppen müssen zur gewählten Abteilung gehören');
 const changes=expected.map(snapshot=>{
  const before=s.people.find(p=>p.employee_id===snapshot.employee_id&&!p.deleted_at);if(!before)throw Error('Person nicht mehr vorhanden');
  if(policy&&!policy.personAllowed(before)){const error=Error('Person ausserhalb Ihrer Berechtigung');error.status=403;throw error;}
  const visible=policy?policy.projectPerson(before):before;
  if(JSON.stringify(personOrganizationSnapshot(visible))!==JSON.stringify({employee_id:snapshot.employee_id,department_id:snapshot.department_id||null,group_ids:[...(snapshot.group_ids||[])].sort()})){const error=Error('Zuordnungen wurden inzwischen geändert. Neu laden und erneut auswählen.');error.status=409;throw error;}
  const nextGroups=groups.mode==='keep'?personGroupIds(visible):groups.mode==='clear'?[]:groups.mode==='add'?[...new Set([...personGroupIds(visible),...ids])]:ids;
  const values=scopedPersonInput(s,user,{group_ids:nextGroups,department_id:department.mode==='keep'?visible.department_id:department.mode==='clear'?null:department.id},before);
  const after={...before,department_id:values.department_id||null,group_ids:values.group_ids,group_id:values.group_ids[0]||null};
  // A scoped planner must retain access to every affected person after the change.
  if(policy&&!policy.personAllowed(after)){const error=Error('Die neue Zuordnung liegt ausserhalb Ihrer Berechtigung');error.status=403;throw error;}
  return {before,after};
 });
 let updated=0;for(const {before,after} of changes){if(JSON.stringify(personOrganizationSnapshot(before))===JSON.stringify(personOrganizationSnapshot(after)))continue;s.people[s.people.indexOf(before)]=after;audit(s,'person','bulk-organization',before,after);updated++;}
 return {selected:expected.length,updated};
}

export function bulkDeletePeople(s,ids,user,now=Date.now()){
 if(!Array.isArray(ids)||!ids.length||ids.length>1000||new Set(ids).size!==ids.length)throw Error('1 bis 1000 eindeutige Personen auswählen');
 const policy=restricted(user)?accessPolicy(s,user):null;
 const people=ids.map(id=>{const p=s.people.find(p=>p.employee_id===id&&!p.deleted_at);if(!p)throw Error('Person nicht mehr vorhanden');if(policy&&(!policy.personAllowed(p)||!policy.personDeletable(p))){const error=Error('Person darf mit Ihrer Berechtigung nicht gelöscht werden');error.status=403;throw error;}if(s.assignments.some(a=>a.employee_id===id&&Date.parse(a.end_on)>now))throw Error('Löschen nicht möglich: '+p.name+' hat laufende oder zukünftige Dienste');return p;});
 for(const p of people){const before={...p};p.deleted_at=new Date(now).toISOString();audit(s,'person','delete',before,{...p});}return {deleted:people.length};
}


export function bulkDeletePersonDuties(s,input,user){
 const {employee_ids:ids,expected}=input;
 if(!Array.isArray(ids)||!ids.length||ids.length>1000||new Set(ids).size!==ids.length)throw Error('1 bis 1000 eindeutige Personen auswählen');
 if(!Array.isArray(expected)||expected.length>100000||expected.some(a=>!a||typeof a.assignment_id!=='string'||!Number.isInteger(a.revision))||new Set(expected.map(a=>a.assignment_id)).size!==expected.length)throw Error('Ungültige Dienstliste; neu laden und erneut auswählen');
 const policy=restricted(user)?accessPolicy(s,user):null;
 for(const id of ids){const person=s.people.find(p=>p.employee_id===id&&!p.deleted_at);if(!person)throw Error('Person nicht mehr vorhanden');if(policy&&!policy.personAllowed(person)){const error=Error('Person ausserhalb Ihrer Berechtigung');error.status=403;throw error;}}
 const selected=new Set(ids),duties=s.assignments.filter(a=>selected.has(a.employee_id));
 if(policy&&duties.some(a=>!policy.assignmentAllowed(a))){const error=Error('Nicht alle Dienste dieser Personen liegen in Ihrer Berechtigung. Es wurde nichts gelöscht.');error.status=403;throw error;}
 const revisions=new Map(expected.map(a=>[a.assignment_id,a.revision]));if(duties.length!==expected.length||duties.some(a=>revisions.get(a.assignment_id)!==a.revision)){const error=Error('Die Dienste wurden inzwischen geändert. Neu laden und erneut auswählen.');error.status=409;throw error;}
 const deleted=new Set(duties.map(a=>a.assignment_id));s.assignments=s.assignments.filter(a=>!deleted.has(a.assignment_id));
 for(const a of duties){change(s,'delete',{...a,revision:a.revision+1});audit(s,'assignment','delete',a,null);if(s.assignment_styles)delete s.assignment_styles[a.assignment_id];}
 return {deleted_duties:duties.length,people:ids.length};
}
