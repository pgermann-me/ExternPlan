import {id,audit,change,validateAssignment} from './domain.js';
const equal=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const latestRevision=(s,key)=>Math.max(0,s.assignments.find(a=>a.assignment_id===key)?.revision||0,...s.outbox.filter(a=>a.assignment_id===key).map(a=>a.revision),s.els.assignments[key]?.revision||0,...s.exports.flatMap(x=>x.payload.changes.filter(a=>a.assignment_id===key).map(a=>a.revision)));
const snapshot=s=>new Map(s.assignments.map(a=>[a.assignment_id,structuredClone(a)]));
export function planningChange(s,fn){
 const before=snapshot(s),styles=structuredClone(s.assignment_styles||{}),result=fn(s),after=snapshot(s);
 const entries=[...new Set([...before.keys(),...after.keys()])].filter(key=>!equal(before.get(key),after.get(key))).map(key=>({key,revision:latestRevision(s,key),before:before.get(key)||null,after:after.get(key)||null,style:styles[key]||null,afterStyle:s.assignment_styles?.[key]||null}));
 if(!entries.length)return result;
 const token=id();s.planning_undo=[...(s.planning_undo||[]).slice(-99),{token,entries}];
 return {...result,undo_token:token};
}
export function undoPlanning(s,token){
 const record=s.planning_undo?.find(r=>r.token===token);if(!record)throw Error('Keine rückgängig machbare Änderung vorhanden.');
 for(const e of record.entries)if(latestRevision(s,e.key)!==e.revision||!equal(s.assignments.find(a=>a.assignment_id===e.key),e.after)||!equal(s.assignment_styles?.[e.key],e.afterStyle))throw Error('Die betroffenen Dienste wurden inzwischen geändert. Rückgängig ist nicht mehr möglich.');
 // Prepare and validate the entire inverse before writing any changes.
 const working={...s,assignments:s.assignments.filter(a=>!record.entries.some(e=>e.key===a.assignment_id))};
 const restored=new Map();
 for(const e of record.entries){
  const revision=latestRevision(s,e.key)+1;
  if(e.before){const a={...validateAssignment(working,e.before).assignment,assignment_id:e.key,revision};working.assignments.push(a);restored.set(e.key,a);}else restored.set(e.key,{...e.after,revision});
 }
 for(const e of record.entries){const a=restored.get(e.key);change(s,e.before?(e.after?'update':'create'):'delete',a);audit(s,'assignment','undo',e.after,e.before?a:null);s.assignment_styles??={};if(e.style)s.assignment_styles[e.key]=e.style;else delete s.assignment_styles[e.key];}
 s.assignments=working.assignments;s.planning_undo=s.planning_undo.filter(r=>r.token!==token);
 return {ok:true};
}
