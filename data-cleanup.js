import {audit,change,iso} from './domain.js';
import {active,deleteMaster} from './master-data.js';
export const cleanupId='2026-10-15-remove-ktd-and-example-people';
const examplePeople=new Set(['DEMO-001','DEMO-EXT-001']);
export function emptyState(){return {example_data:false,departments:[],groups:[],people:[],regions:[],functions:[],rules:[],assignments:[],outbox:[],exports:[],audit:[],els:{people:{},assignments:{},errors:[]}};}
export function cleanupNeeded(s){return !(s.migrations||[]).some(m=>m.id===cleanupId);}
export function removeKtdAndExamplePeople(s,now=Date.now()){
 if(!cleanupNeeded(s))return null;
 const functionIds=new Set(['DEMO-KTD',...s.functions.filter(f=>f.name==='KTD Pikett').map(f=>f.id)]);
 const affected=a=>functionIds.has(a.function_id)||examplePeople.has(a.employee_id);
 const originalOutbox=s.outbox,removed=s.assignments.filter(affected),pending=s.outbox.filter(affected),targets=new Map([...pending,...removed].map(a=>[a.assignment_id,a]));
 // Remove obsolete pending creates/updates before queueing the authoritative tombstone.
 s.outbox=s.outbox.filter(a=>!targets.has(a.assignment_id));
 for(const [key,a] of targets){
  const revisions=[a.revision||0,...originalOutbox.filter(x=>x.assignment_id===key).map(x=>x.revision||0),s.els.assignments[key]?.revision||0,...s.exports.flatMap(e=>e.payload.changes.filter(x=>x.assignment_id===key).map(x=>x.revision||0))];
  const {action:obsoleteAction,...assignment}=a;change(s,'delete',{...assignment,revision:Math.max(...revisions)+1});
  if(s.assignment_styles)delete s.assignment_styles[key];
 }
 s.assignments=s.assignments.filter(a=>!affected(a));for(const a of removed)audit(s,'assignment','delete',a,null);
 for(const f of s.functions.filter(f=>functionIds.has(f.id)&&active(f)))deleteMaster(s,'functions',f.id,now);
 const people=s.people.filter(p=>examplePeople.has(p.employee_id));s.people=s.people.filter(p=>!examplePeople.has(p.employee_id));
 for(const p of people){audit(s,'person','delete',p,null);delete s.els.people[p.employee_id];}
 const result={id:cleanupId,at:iso(now),removed_assignments:removed.length,removed_people:people.length};
 s.migrations??=[];s.migrations.push(result);audit(s,'maintenance','remove-ktd-and-example-people',null,result);return result;
}
