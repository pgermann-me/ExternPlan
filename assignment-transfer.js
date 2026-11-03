import {audit,change,instant,iso,validateAssignment} from './domain.js';

// Prepare every piece on a working copy before changing the persisted state.
export function transferAssignment(s,key,input){
 const before=s.assignments.find(a=>a.assignment_id===key);if(!before)throw Error('Dienst nicht gefunden');
 if(input.revision!==before.revision)throw Error('Dienst wurde inzwischen geändert. Neu laden.');
 if(!input.employee_id||input.employee_id===before.employee_id)throw Error('Eine andere Person für die Übernahme wählen');
 if(!s.people.some(p=>p.employee_id===before.employee_id&&!p.deleted_at))throw Error('Dienst einer archivierten Person kann nicht übergeben werden');
 const start=instant(input.start_on),end=instant(input.end_on),originalStart=instant(before.start_on),originalEnd=instant(before.end_on);
 if(start<originalStart||end>originalEnd||end<=start)throw Error('Der übergebene Zeitbereich muss vollständig innerhalb des bestehenden Dienstes liegen');
 const segments=[];if(start>originalStart)segments.push({employee_id:before.employee_id,start_on:before.start_on,end_on:iso(start)});
 segments.push({employee_id:input.employee_id,start_on:iso(start),end_on:iso(end)});
 if(end<originalEnd)segments.push({employee_id:before.employee_id,start_on:iso(end),end_on:before.end_on});
 const working={...s,assignments:s.assignments.filter(a=>a.assignment_id!==key)},assignments=[],warnings=[];
 for(const segment of segments){const result=validateAssignment(working,{...before,...segment},assignments.length?undefined:before);assignments.push(result.assignment);working.assignments.push(result.assignment);warnings.push(...result.warnings);}
 const style=s.assignment_styles?.[key];s.assignments=working.assignments;
 for(const a of assignments){if(style){s.assignment_styles??={};s.assignment_styles[a.assignment_id]={...style};}const action=a.assignment_id===key?'update':'create';change(s,action,a);audit(s,'assignment',action,action==='update'?before:null,a);}
 audit(s,'assignment_transfer','transfer',before,{employee_id:input.employee_id,start_on:iso(start),end_on:iso(end),count:assignments.length});
 return {assignments,warnings:[...new Set(warnings)],transferred:assignments.find(a=>a.employee_id===input.employee_id)};
}
