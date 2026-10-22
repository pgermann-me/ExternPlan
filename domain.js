import {projectEls,finishElsProjection} from './els-projection.js';
import {actorContext} from './request-context.js';
import {personScopeAllows} from './public/organization.js';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { simulatedElsAdapter } from './adapters/els.js';
export const zone = 'Europe/Zurich';
export const id = () => randomUUID();
export function instant(value) {
  if (typeof value !== 'string') throw Error('Zeitangabe fehlt');
  const dt = DateTime.fromISO(value, {zone, setZone: true});
  if (!dt.isValid || !value.includes('T')) throw Error('Ungültige Zeitangabe');
  if (!/[Zz]|[+-]\d\d:\d\d$/.test(value)) {
    const local = DateTime.fromISO(value,{zone});
    if (local.toFormat("yyyy-MM-dd'T'HH:mm") !== value.slice(0,16)) throw Error('Diese lokale Uhrzeit existiert wegen der Zeitumstellung nicht');
    if (local.getPossibleOffsets().length > 1) throw Error('Mehrdeutige lokale Uhrzeit: expliziten UTC-Offset angeben');
    return local.toMillis();
  }
  return dt.toMillis();
}
// UI wall times use Swiss DST rules automatically; for a repeated autumn hour choose its first occurrence.
export function automaticSwissInstant(value){
 try{return instant(value);}catch(error){
  if(error.message.startsWith('Mehrdeutige lokale Uhrzeit'))return Math.min(...DateTime.fromISO(value,{zone}).getPossibleOffsets().map(d=>d.toMillis()));
  throw error;
 }
}
export const iso = ms => DateTime.fromMillis(ms,{zone}).toISO({suppressMilliseconds:true});
export const overlap = (a,b) => a[0]<b[1] && b[0]<a[1];
export function merge(intervals) {
  const out=[];
  for(const [a,b] of intervals.filter(x=>x[0]<x[1]).sort((a,b)=>a[0]-b[0])) {
    if(out.length && a<=out.at(-1)[1]) out.at(-1)[1]=Math.max(b,out.at(-1)[1]); else out.push([a,b]);
  } return out;
}
export function gaps(required, covered) {
  const out=[]; const union=merge(covered);
  for(const [a,b] of merge(required)) {let cursor=a; for(const [c,d] of union) {if(d<=cursor||c>=b)continue; if(c>cursor)out.push([cursor,Math.min(c,b)]);cursor=Math.max(cursor,d);if(cursor>=b)break;}if(cursor<b)out.push([cursor,b]);}return out;
}
function ruleIntervals(rule,a,b) {
  const validA=rule.valid_from?DateTime.fromISO(rule.valid_from,{zone}).startOf('day').toMillis():-Infinity;
  const validB=rule.valid_until?DateTime.fromISO(rule.valid_until,{zone}).startOf('day').toMillis():Infinity;
  a=Math.max(a,validA);b=Math.min(b,validB);if(a>=b)return [];
  if(rule.mode==='continuous')return [[a,b]];
  const out=[];
  for(let day=DateTime.fromMillis(a,{zone}).startOf('day').minus({days:7});day.toMillis()<b;day=day.plus({days:1})) {
    for(const w of rule.windows) {
      if(day.weekday!==w.start_day)continue;
      const [h,m]=w.start_time.split(':').map(Number);const [eh,em]=w.end_time.split(':').map(Number);
      const start=day.set({hour:h,minute:m}); let delta=(w.end_day-w.start_day+7)%7;
      if(delta===0 && w.end_time<=w.start_time)delta=7;
      const end=day.plus({days:delta}).set({hour:eh,minute:em});
      const x=Math.max(a,start.toMillis()),y=Math.min(b,end.toMillis());if(x<y)out.push([x,y]);
    }
  } return merge(out);
}
// Request-local index: never retain mutable state or another user's scoped data.
const coverageIndex=Symbol('coverageIndex');
export function prepareCoverage(s,a=-Infinity,b=Infinity) {
 const functions=new Map(s.functions.map(f=>[f.id,f])),rules=new Map(),assignments=new Map();
 for(const rule of s.rules){if(!rules.has(rule.function_id))rules.set(rule.function_id,[]);rules.get(rule.function_id).push(rule);}
 for(const assignment of s.assignments){
  const interval=[instant(assignment.start_on),instant(assignment.end_on)];
  if(!overlap(interval,[a,b]))continue;
  const fn=functions.get(assignment.function_id);
  if(!assignments.has(assignment.function_id))assignments.set(assignment.function_id,new Map());
  const regions=assignments.get(assignment.function_id);
  const entry={assignment,interval};
  for(const geo of new Set([assignment.geodependency,...(fn?.covers[assignment.geodependency]||[])])){
   if(!regions.has(geo))regions.set(geo,[]);regions.get(geo).push(entry);
  }
 }
 return {...s,[coverageIndex]:{rules,assignments}};
}
export function coverage(s,function_id,geo,a,b) {
  const index=s[coverageIndex];
  const matching=index?(index.rules.get(function_id)||[]):s.rules.filter(r=>r.function_id===function_id);
  const specific=matching.filter(r=>r.geo_id===geo);
  const rules=specific.length?specific:matching.filter(r=>r.geo_id===null);
  const required=merge(rules.flatMap(r=>ruleIntervals(r,a,b)));
  const f=s.functions.find(f=>f.id===function_id);
  const entries=(index?.assignments.get(function_id)?.get(geo)||[]).filter(x=>overlap(x.interval,[a,b]));
  const assignments=index?entries.map(x=>x.assignment):s.assignments.filter(x=>x.function_id===function_id && (x.geodependency===geo || (f?.covers[x.geodependency]||[]).includes(geo)) && overlap([instant(x.start_on),instant(x.end_on)],[a,b]));
  const missing=gaps(required,index?entries.map(x=>x.interval):assignments.map(x=>[instant(x.start_on),instant(x.end_on)]));
  const total=required.reduce((n,[a,b])=>n+b-a,0),open=missing.reduce((n,[a,b])=>n+b-a,0);
  return {status:!total?'kein Pikett erforderlich':!open?'vollständig besetzt':open===total?'unbesetzt':'teilweise besetzt',gaps:missing.map(([a,b])=>({start_on:iso(a),end_on:iso(b)})),assignments};
}
export function validateAssignment(s,input,previous) {
  const person=s.people.find(p=>p.employee_id===input.employee_id&&!p.deleted_at);const f=s.functions.find(f=>f.id===input.function_id&&!f.deleted_at);
  if(!person||!f)throw Error('Person oder Funktion fehlt');
  if(f.duty_time_model==='always')throw Error('Für Funktionen mit Zeitbereich Immer werden keine Dienste geplant');
  if(!personScopeAllows(s,f,person,f.id))throw Error('Funktion ist für die Abteilungen oder Gruppen dieser Person nicht zulässig');
  const geo=input.geodependency??null;if(geo!==null&&!s.regions.some(r=>r.id===geo&&!r.deleted_at))throw Error('Gebiet wurde gelöscht oder ist unbekannt');
  if(geo&&!personScopeAllows(s,s.regions.find(r=>r.id===geo),person,f.id))throw Error('Gebiet ist für die Abteilungen, Gruppen oder Funktion dieser Person nicht zulässig');
  if(f.geo_ids.length?!f.geo_ids.includes(geo):geo!==null)throw Error(f.geo_ids.length?'Ein zugeordnetes Pflichtgebiet wählen':'Ortsunabhängige Funktion benötigt geodependency: null');
  if(!Number.isInteger(input.priority)||input.priority<1)throw Error('Priorität muss eine positive ganze Zahl sein');
  const a=instant(input.start_on),b=instant(input.end_on);if(b<=a)throw Error('Ende muss nach Beginn liegen');
  const others=s.assignments.filter(x=>x.assignment_id!==previous?.assignment_id);
  if(others.some(x=>x.employee_id===input.employee_id&&x.function_id===f.id&&x.geodependency===geo&&instant(x.start_on)===a&&instant(x.end_on)===b))throw Error('Identische Doppelzuteilung');
  const warnings=[];
  for(const x of others.filter(x=>x.function_id===f.id&&overlap([a,b],[instant(x.start_on),instant(x.end_on)]))) {
    if(x.employee_id===input.employee_id&&x.geodependency===geo)warnings.push('Zeitliche Überschneidung derselben Person, Funktion und desselben Gebiets');
    if((f.covers[geo]||[]).includes(x.geodependency)||(f.covers[x.geodependency]||[]).includes(geo))warnings.push('Gesamtgebiet und regionale Besetzung überschneiden sich; regionale Besetzung hat im ELS Vorrang');
  }
  return {assignment:{assignment_id:previous?.assignment_id||id(),employee_id:input.employee_id,function_id:f.id,start_on:iso(a),end_on:iso(b),geodependency:geo,priority:input.priority,revision:(previous?.revision||0)+1},warnings:[...new Set(warnings)]};
}
export function demo() {
 return {example_data:true,departments:[{id:'demo-abteilung',name:'Beispiel: Einsatz'}],groups:[{id:'demo-gruppe',name:'Beispiel: Externe',department_id:'demo-abteilung'}],people:[{employee_id:'DEMO-001',name:'Beispielperson Anna',source:'SAP',external_id:'DEMO-001',department_id:'demo-abteilung',group_id:null,contacts:[{type:'Telefon',value:'Beispiel – keine echte Nummer',priority:1}]},{employee_id:'DEMO-EXT-001',name:'Beispielperson Marco',source:'manual',external_id:null,department_id:null,group_id:'demo-gruppe',contacts:[]}],regions:[{id:'NORD',name:'Beispiel NORD'},{id:'SÜD',name:'Beispiel SÜD'},{id:'GANZ',name:'Beispiel GANZ'}],functions:[{id:'DEMO-KTD',name:'KTD Pikett',geo_ids:['NORD','SÜD','GANZ'],covers:{GANZ:['NORD','SÜD']},example:true},{id:'DEMO-ORT',name:'Beispiel: ortsunabhängiges Pikett',geo_ids:[],covers:{},example:true}],rules:[{id:id(),function_id:'DEMO-KTD',geo_id:null,mode:'continuous',windows:[],valid_from:null,valid_until:null}],assignments:[],outbox:[],exports:[],audit:[],els:{people:{},assignments:{},errors:[]}};
}
export function audit(s,entity,action,before,after){s.audit.push({id:id(),at:new Date().toISOString(),actor:actorContext.getStore()||'Lokaler Planer (Simulation)',entity,action,before,after});}
export function change(s,action,assignment){s.outbox.push({action,...assignment});}
export function makeExport(s,mode='delta',now=Date.now()) {
 if(!['delta','snapshot'].includes(mode))throw Error('Unbekannter Exportmodus');
 const {changes,sources,scope}=projectEls(s,mode,now);
 const payload={schema_version:'1.0',export_id:id(),export_mode:mode,timezone:zone,scope,changes};
 s.exports.push({payload,sources,status:'Datei erzeugt',created_at:new Date(now).toISOString(),errors:[]});return payload;
}
export function confirmExport(s,export_id,adapter=simulatedElsAdapter) {
 const e=s.exports.find(e=>e.payload.export_id===export_id);if(!e)throw Error('Export nicht gefunden');
 const errors=[];
 for(const p of s.people){try{adapter.syncPerson(s.els,p);}catch(error){errors.push({employee_id:p.employee_id,message:error.message});}}
 for(const c of e.payload.changes) {
   try {
     const result=adapter.applyAssignment(s.els,c);
     if(!result.acknowledged){errors.push({assignment_id:c.assignment_id,message:result.error});continue;}
     s.els.projection_receipts??={};const previous=s.els.projection_receipts[c.assignment_id];if(!previous||previous.revision<=c.revision)s.els.projection_receipts[c.assignment_id]={...c,deleted:c.action==='delete'};
     if(!e.sources)s.outbox=s.outbox.filter(x=>!(x.assignment_id===c.assignment_id&&x.revision<=c.revision));
   }catch(error){errors.push({assignment_id:c.assignment_id,message:error.message});}
 }
 finishElsProjection(s,e);
 e.errors=errors;e.status=errors.length?'Fehler':'Import bestätigt';e.confirmed_at=new Date().toISOString();s.els.errors=errors;return e;
}
