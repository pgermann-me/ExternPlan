import {personDetails,validatePersonAffiliations} from './people.js';
import {accessPolicy,restricted} from './access-scope.js';
import {withRegionGroups} from './public/region-groups.js';
import {validatePlanningGroup} from './public/organization.js';
import {audit} from './domain.js';
const fail=(message,status=400)=>{const error=Error(message);error.status=status;throw error;};
export function changeAlwaysAffiliation(state,input,user){
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
