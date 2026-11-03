import {personGroupIds} from '../public/organization.js';
// Companion example only. The supplied ELS schema has no multiple-membership field.
export function onCallMembershipExample(state){
 const departments=new Set(state.departments.filter(d=>!d.deleted_at).map(d=>d.id)),groups=new Set(state.groups.filter(g=>!g.deleted_at).map(g=>g.id)),offices=new Map((state.offices||[]).filter(o=>!o.deleted_at).map(o=>[o.id,o.els_org_id||o.id])),payload=[],warnings=[];
 for(const p of state.people.filter(p=>!p.deleted_at)){
  const targets=new Set(),issues=new Set();
  if(p.department_id){if(departments.has(p.department_id))targets.add(p.department_id);else issues.add('Direkte Abteilungsstelle ist nicht verfügbar.');}
  for(const id of personGroupIds(p)){if(groups.has(id))targets.add(id);else issues.add('Eine zugewiesene Gruppenstelle ist nicht verfügbar.');}
  for(const id of new Set([p.els_office_id,...(p.function_regions||[]).map(r=>r.office_id)].filter(Boolean))){if(offices.has(id))targets.add(offices.get(id));else issues.add('Eine zugewiesene Stelle ist nicht verfügbar.');}
  for(const orgID of targets)payload.push({persID:p.employee_id,orgID});
  if(issues.size)warnings.push({employee_id:p.employee_id,issues:[...issues]});
 }
 return {payload,warnings};
}
