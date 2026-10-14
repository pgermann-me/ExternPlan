import { audit, instant, iso } from './domain.js';
export const active = item => !item.deleted_at;
export function publicState(s){
 const types=['functions','regions','groups','rules'];
 return {...s,...Object.fromEntries(types.map(t=>[t,s[t].filter(active)])),archived_master:Object.fromEntries(types.map(t=>[t,s[t].filter(x=>!active(x))]))};
}
export function deleteMaster(s,type,key,now=Date.now()){
 if(!['functions','regions','groups','departments','rules'].includes(type))throw Error('Unbekannte Stammdaten');
 const record=s[type].find(x=>x.id===key&&active(x));if(!record)throw Error('Stammdatensatz nicht gefunden');
 const current=s.assignments.filter(a=>instant(a.end_on)>now);
 let used=false;
 if(type==='functions')used=current.some(a=>a.function_id===key);
 if(type==='regions')used=current.some(a=>a.geodependency===key||(s.functions.find(f=>f.id===a.function_id)?.covers[a.geodependency]||[]).includes(key));
 if(type==='groups'){const members=new Set(s.people.filter(p=>p.group_id===key).map(p=>p.employee_id));used=current.some(a=>members.has(a.employee_id));}
 if(used)throw Error('Löschen nicht möglich: laufender oder zukünftiger Pikettdienst ist zugewiesen');
 if(type==='departments'&&(s.people.some(p=>p.department_id===key)||s.groups.some(g=>active(g)&&g.department_id===key)))throw Error('Abteilung wird noch verwendet');
 if(type==='departments'){s.departments=s.departments.filter(d=>d.id!==key);audit(s,type,'delete',record,null);return {ok:true};}
 // Retain identifiers, names, geographic relations and all historical assignments.
 const before={...record};record.deleted_at=iso(now);audit(s,type,'delete',before,{...record});
 if(type==='functions'||type==='regions')for(const rule of s.rules.filter(active)){
   if(type==='functions'?rule.function_id===key:rule.geo_id===key){const previous={...rule};rule.deleted_at=iso(now);audit(s,'rules','delete',previous,{...rule});}
 }
 return {ok:true,archived:true};
}
