import {manualPerson,personDetails,validatePersonAffiliations} from './people.js';
import {accessPolicy,restricted,scopedPersonInput} from './access-scope.js';
import {withRegionGroups} from './public/region-groups.js';
import {validatePlanningGroup,personGroupIds} from './public/organization.js';
import {audit,id} from './domain.js';
const fail=(message,status=400)=>{const error=Error(message);error.status=status;throw error;};
export function changeAlwaysAffiliation(state,input,user){
 if(input.action==='replace')return replaceAlwaysAffiliation(state,input,user);
 const {employee_id,function_id,geo_id,action}=input,priority=input.priority??0;
 if(!['add','update','remove'].includes(action))fail('Ungültige Zuordnungsänderung');
 if(!Number.isSafeInteger(priority)||priority<0||priority>9)fail('Priorität als ganze Zahl von 0 bis 9 eingeben');
 const person=state.people.find(p=>p.employee_id===employee_id&&!p.deleted_at),s=withRegionGroups(state),fn=s.functions.find(f=>f.id===function_id&&!f.deleted_at);
 if(!person||!fn||fn.duty_time_model!=='always')fail('Person oder Immer-Funktion nicht gefunden');
 if(!(geo_id===null||typeof geo_id==='string'&&geo_id))fail('Region wählen');
 const policy=accessPolicy(state,user);
 if(restricted(user)&&(!policy.personAllowed(person)||!policy.functionIds.has(fn.id)||!policy.targetAllowed(fn,geo_id)))fail('Diese Zuordnung liegt ausserhalb Ihrer Berechtigung',403);
 validatePlanningGroup(s,{...input,region_ids:geo_id?[geo_id]:[]});
 const rows=person.function_regions||[],index=rows.findIndex(r=>r.function_id===function_id&&r.geo_id===geo_id);
 if(action==='add'&&index>=0)fail('Diese Funktion und Region sind der Person bereits zugeordnet',409);
 if(action!=='add'&&(index<0||!Number.isSafeInteger(input.expected_priority)||input.expected_priority<0||input.expected_priority!==(rows[index].priority??0)))fail('Die Zuordnung wurde inzwischen geändert. Bitte neu laden',409);
 const affiliation={function_id,geo_id,priority};
 const next=action==='add'?[...rows,affiliation]:action==='remove'?rows.filter((_,i)=>i!==index):rows.map((r,i)=>i===index?affiliation:r);
 const after={...person,function_regions:personDetails({function_regions:next},person).function_regions};validatePersonAffiliations(state,after,person);
 state.people[state.people.indexOf(person)]=after;audit(state,'person','update',person,after);
 return {ok:true,affiliation:action==='remove'?null:affiliation};
}

export function replaceAlwaysAffiliation(state,input,user){
 if(typeof input.replacement_employee_id!=='string'||input.replacement_employee_id===input.employee_id)fail('Eine andere Person wählen');
 const next={...state,people:[...state.people],audit:[...state.audit]},priority=input.priority??input.expected_priority;
 changeAlwaysAffiliation(next,{...input,priority,action:'remove'},user);
 const result=changeAlwaysAffiliation(next,{...input,priority,action:'add',employee_id:input.replacement_employee_id},user);
 state.people=next.people;state.audit=next.audit;return result;
}
export function createAlwaysPerson(state,input,user){
 const {function_id,geo_id}=input,priority=input.priority??0;
 const values=input.person;if(!values||typeof values!=='object'||Array.isArray(values))fail('Personendaten fehlen');
 if(values.function_regions?.length)fail('Die Zuordnung wird aus der gewählten Funktion und Region übernommen');
 const fn=withRegionGroups(state).functions.find(f=>f.id===function_id&&!f.deleted_at);
 if(!fn||fn.duty_time_model!=='always')fail('Immer-Funktion wählen');
 if(!Number.isSafeInteger(priority)||priority<0||priority>9)fail('Priorität als ganze Zahl von 0 bis 9 eingeben');
 if(!(geo_id===null||typeof geo_id==='string'&&geo_id))fail('Region wählen');
 if(input.planning_department_id&&values.department_id!==input.planning_department_id)fail('Die Person muss die gewählte Abteilung erhalten');
 if(input.planning_group_id&&!personGroupIds(values).includes(input.planning_group_id))fail('Die Person muss die gewählte Gruppe erhalten');
 const policy=accessPolicy(state,user);
 if(restricted(user)&&(!policy.functionIds.has(fn.id)||!policy.targetAllowed(fn,geo_id)))fail('Diese Zuordnung liegt ausserhalb Ihrer Berechtigung',403);
 const permitted={first_name:values.first_name,last_name:values.last_name,department_id:values.department_id||null,group_ids:values.group_ids||[],contacts:values.contacts||[],birth_date:values.birth_date,business_address:values.business_address,function_regions:[{function_id,geo_id,priority}]};
 let employeeId;do{employeeId='EXT-'+id();}while(state.people.some(p=>p.employee_id===employeeId));
 const person=manualPerson(scopedPersonInput(state,user,permitted),null,employeeId);
 if(person.department_id&&!state.departments.some(d=>d.id===person.department_id&&!d.deleted_at))fail('Abteilung unbekannt');
 if(person.group_ids.some(id=>!state.groups.some(g=>g.id===id&&!g.deleted_at&&(!person.department_id||g.department_id===person.department_id))))fail('Gruppe gehört nicht zur gewählten Abteilung');
 if(person.contacts.some(c=>!c.type||typeof c.value!=='string'||!c.value.trim()||!Number.isSafeInteger(c.priority)||c.priority<0))fail('Ungültige Kontaktdaten');
 validatePersonAffiliations(state,person);
 // Validate the planning context against a candidate state before storing anything.
 validatePlanningGroup({...state,people:[...state.people,person]},{...input,planning_department_id:input.planning_department_id||person.department_id,planning_group_id:input.planning_group_id||person.group_ids[0],employee_id:person.employee_id,region_ids:geo_id?[geo_id]:[]});
 if(restricted(user)&&!accessPolicy({...state,people:[...state.people,person]},user).personAllowed(person))fail('Person liegt ausserhalb Ihrer Berechtigung',403);
 const next={...state,people:[...state.people],audit:[...state.audit]};
 if(input.replace_employee_id)changeAlwaysAffiliation(next,{...input,employee_id:input.replace_employee_id,action:'remove'},user);
 next.people.push(person);audit(next,'person','create',null,person);state.people=next.people;state.audit=next.audit;
 return restricted(user)?accessPolicy(state,user).projectPerson(person):person;
}
