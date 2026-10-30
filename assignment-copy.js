import {DateTime} from 'luxon';
import {audit,change,instant,iso,automaticSwissInstant,validateAssignment,zone} from './domain.js';
import {accessPolicy} from './access-scope.js';
import {validatePlanningGroup} from './public/organization.js';

export function copyAssignments(s,input,user){
 const entries=input.assignments;
 if(!Array.isArray(entries)||!entries.length||entries.length>1000||new Set(entries.map(e=>e?.assignment_id)).size!==entries.length)throw Error('1 bis 1000 eindeutige Dienste auswählen');
 const policy=accessPolicy(s,user),sources=entries.map(e=>{
  const a=s.assignments.find(a=>a.assignment_id===e?.assignment_id);
  if(!a||a.revision!==e.revision)throw Error('Ein ausgewählter Dienst wurde inzwischen geändert oder gelöscht. Neu auswählen.');
  if(!policy.assignmentAllowed(a)){const error=Error('Diese Daten liegen ausserhalb Ihrer Berechtigung');error.status=403;throw error;}
  return a;
 });
 const target=DateTime.fromISO(input.date||'',{zone});
 if(typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!target.isValid)throw Error('Gültigen Zieltag wählen');
 const person=s.people.find(p=>p.employee_id===input.employee_id&&!p.deleted_at);
 if(!person||!policy.personAllowed(person)){const error=Error('Zielperson nicht verfügbar oder ausserhalb Ihrer Berechtigung');error.status=403;throw error;}
 const earliest=DateTime.fromMillis(Math.min(...sources.map(a=>instant(a.start_on))),{zone}).startOf('day');
 const days=Math.round(target.startOf('day').diff(earliest,'days').days);
 const shift=value=>{
  const original=DateTime.fromMillis(instant(value),{zone});
  if(!days)return value; // Preserve a repeated autumn hour's explicit offset when the date is unchanged.
  const date=original.startOf('day').plus({days}).toISODate();
  return iso(automaticSwissInstant(date+'T'+original.toFormat('HH:mm:ss')));
 };
 const working={...s,assignments:[...s.assignments]},assignments=[],warnings=[];
 for(const source of sources){
  const inputAssignment={...source,employee_id:input.employee_id,start_on:shift(source.start_on),end_on:shift(source.end_on)};
  validatePlanningGroup(s,{...inputAssignment,planning_department_id:input.planning_department_id,planning_group_id:input.planning_group_id});
  const result=validateAssignment(working,inputAssignment);
  if(!policy.assignmentAllowed(result.assignment)){const error=Error('Kopierter Dienst liegt ausserhalb Ihrer Berechtigung');error.status=403;throw error;}
  assignments.push(result.assignment);working.assignments.push(result.assignment);warnings.push(...result.warnings);
 }
 // Commit only after every source and every new assignment passed validation.
 s.assignment_styles??={};
 for(let i=0;i<assignments.length;i++){
  const assignment=assignments[i],style=s.assignment_styles[sources[i].assignment_id];
  if(style)s.assignment_styles[assignment.assignment_id]={...style};
  s.assignments.push(assignment);change(s,'create',assignment);audit(s,'assignment','create',null,assignment);
 }
 audit(s,'assignment_copy','create',null,{employee_id:input.employee_id,date:input.date,count:assignments.length,source_assignment_ids:sources.map(a=>a.assignment_id)});
 return {assignments,warnings:[...new Set(warnings)]};
}
