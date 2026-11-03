import {scopeAllows} from './organization.js';
export function filteredGroups(state,{department='',regions=[]}={}){
 return state.groups.filter(g=>!g.deleted_at&&(!department||g.department_id===department)&&(!regions.length||regions.some(id=>{const r=state.regions.find(r=>r.id===id&&!r.deleted_at);return r&&(!r.department_ids?.length||r.department_ids.includes(g.department_id))&&(!Array.isArray(g.geo_ids)||g.geo_ids.includes(id))&&scopeAllows(r,{department_id:g.department_id,group_id:g.id},state.groups);})));
}
export function groupedDepartments(state,filters={}){
 const groups=filteredGroups(state,filters),sort=(a,b)=>a.name.localeCompare(b.name,'de-CH');
 const nodes=state.departments.filter(d=>!d.deleted_at&&(!filters.department||d.id===filters.department)).sort(sort).map(d=>({department:d,groups:groups.filter(g=>g.department_id===d.id).sort(sort)}));
 const orphan=groups.filter(g=>!state.departments.some(d=>!d.deleted_at&&d.id===g.department_id)).sort(sort);if(orphan.length)nodes.push({department:null,groups:orphan});
 return nodes.filter(n=>!filters.regions?.length||n.groups.length||filters.department===n.department?.id);
}
