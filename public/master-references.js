import {personGroupIds,personDepartmentIds} from './organization.js';
// Include both duty history and explicitly imported function/region affiliations.
export function masterReferences(state,type,id){
 const functions=[...state.functions,...(state.archived_master?.functions||[])];
 const regionDuty=a=>a.geodependency===id||(functions.find(f=>f.id===a.function_id)?.covers?.[a.geodependency]||[]).includes(id);
 let people,linkedFunctions;
 if(type==='departments'||type==='groups'){
  people=state.people.filter(p=>type==='departments'?personDepartmentIds(p,state.groups).includes(id):personGroupIds(p).includes(id));
  const ids=new Set(people.map(p=>p.employee_id));
  const functionIds=new Set([...state.assignments.filter(a=>ids.has(a.employee_id)),...people.flatMap(p=>p.function_regions||[])].map(a=>a.function_id));
  linkedFunctions=functions.filter(f=>functionIds.has(f.id));
 }else{
  const duties=state.assignments.filter(a=>type==='functions'?a.function_id===id:regionDuty(a));
  const ids=new Set(duties.map(a=>a.employee_id));people=[...state.people,...(state.archived_people||[])].filter(p=>ids.has(p.employee_id)||(p.function_regions||[]).some(r=>type==='functions'?r.function_id===id:r.geo_id===id));
  linkedFunctions=type==='regions'?functions.filter(f=>f.geo_ids.includes(id)||Object.values(f.covers||{}).some(parts=>parts.includes(id))):[];
 }
 const personName=p=>p.last_name&&p.first_name?`${p.last_name} ${p.first_name}`:p.name;
 return {people:people.map(p=>({id:p.employee_id,name:personName(p)+(p.deleted_at?' (gelöscht)':'')})).sort((a,b)=>a.name.localeCompare(b.name,'de-CH')),functions:linkedFunctions.map(f=>({id:f.id,name:f.name+(f.deleted_at?' (gelöscht)':'')})).sort((a,b)=>a.name.localeCompare(b.name,'de-CH'))};
}
