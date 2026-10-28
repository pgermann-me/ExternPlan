import {withRegionGroups,regionGroupIds} from './public/region-groups.js';
import {personGroupIds} from './public/organization.js';
import { audit, instant, iso } from './domain.js';
import {orderedFavorites} from './favorites.js';
export const active = item => !item.deleted_at;
export function publicState(s){
 s=withRegionGroups(s);
 const {planning_undo,...visible}=s;
 const types=['functions','regions','region_groups','groups','rules','favorites'];
 return {...visible,people:s.people.filter(active),archived_people:s.people.filter(p=>!active(p)),...Object.fromEntries(types.map(t=>[t,(s[t]||[]).filter(active)])),favorites:orderedFavorites(s),archived_master:Object.fromEntries(types.map(t=>[t,(s[t]||[]).filter(x=>!active(x))]))};
}
export function assertRegionDeletable(s,key){
 const record=s.regions.find(r=>r.id===key&&active(r));if(!record)throw Error('Gebiet nicht gefunden');
 if(s.assignments.some(a=>a.geodependency===key))throw Error('Gebiet '+record.name+' kann nicht gelöscht werden: Ein Pikettdienst verweist direkt auf dieses Gebiet; auch vergangene Dienste zählen.');
 return record;
}
export function deleteMaster(s,type,key,now=Date.now()){
 if(!['functions','regions','region_groups','groups','departments','rules'].includes(type))throw Error('Unbekannte Stammdaten');
 const record=(s[type]||[]).find(x=>x.id===key&&active(x));if(!record)throw Error('Stammdatensatz nicht gefunden');
 if(type==='region_groups'&&s.regions.some(r=>active(r)&&regionGroupIds(r).includes(key)))throw Error('Gebietsgruppe wird noch von Gebieten verwendet');
 const current=s.assignments.filter(a=>instant(a.end_on)>now);
 let used=false;
 if(type==='functions')used=current.some(a=>a.function_id===key);
 if(type==='regions')assertRegionDeletable(s,key);
 if(type==='groups'){const members=new Set(s.people.filter(p=>personGroupIds(p).includes(key)).map(p=>p.employee_id));used=current.some(a=>members.has(a.employee_id));}
 if(used)throw Error('Löschen nicht möglich: laufender oder zukünftiger Pikettdienst ist zugewiesen');
 if(type==='departments'&&(s.people.some(p=>active(p)&&p.department_id===key)||s.groups.some(g=>active(g)&&g.department_id===key)))throw Error('Abteilung wird noch verwendet');
 if(type==='departments'){for(const f of (s.favorites||[]).filter(active)){if(f.scope_type==='department'&&f.scope_id===key){const previous={...f};f.deleted_at=iso(now);audit(s,'favorite','delete',previous,{...f});}}s.departments=s.departments.filter(d=>d.id!==key);audit(s,type,'delete',record,null);return {ok:true};}
 // Retain identifiers, names, geographic relations and all historical assignments.
 const before={...record};record.deleted_at=iso(now);audit(s,type,'delete',before,{...record});
 if(type==='functions'||type==='regions')for(const rule of s.rules.filter(active)){
   if(type==='functions'?rule.function_id===key:rule.geo_id===key){const previous={...rule};rule.deleted_at=iso(now);audit(s,'rules','delete',previous,{...rule});}
 }
 for(const f of (s.favorites||[]).filter(active)){
   if((type==='functions'&&(f.function_id===key||f.scope_type==='function'&&f.scope_id===key))||(type==='regions'&&f.region_ids.includes(key))||(type==='groups'&&f.scope_type==='group'&&f.scope_id===key)){
     const previous={...f};f.deleted_at=iso(now);audit(s,'favorite','delete',previous,{...f});
   }
 }
 return {ok:true,archived:true};
}
