import {DateTime} from 'luxon';
const zone='Europe/Zurich',stamp=ms=>DateTime.fromMillis(ms,{zone}).toISO({suppressMilliseconds:true});
const same=(a,b)=>a&&b&&['employee_id','function_id','geodependency','priority','start_on','end_on','source_assignment_id','source_revision'].every(k=>a[k]===b[k]);
export function projectEls(s,mode,now=Date.now()){
 const start=now,end=DateTime.fromMillis(now,{zone}).plus({days:5}).toMillis(),known=new Map(),owners=new Map(),sources=[],changes=[],activeIds=new Set();
 for(const e of s.exports)for(const c of e.payload.changes){if(c.source_assignment_id)owners.set(c.assignment_id,c.source_assignment_id);const old=known.get(c.assignment_id);if(!old||old.revision<=c.revision)known.set(c.assignment_id,c);}
 const excludedFunctions=new Set(s.functions.filter(f=>f.duty_time_model==='always').map(f=>f.id)),excludedSources=new Set([...s.assignments,...s.outbox,...s.exports.flatMap(e=>e.payload.changes)].filter(a=>excludedFunctions.has(a.function_id)).map(a=>a.source_assignment_id||a.assignment_id));
 const deletes=new Map(s.outbox.filter(c=>c.action==='delete'&&!excludedSources.has(c.assignment_id)).map(c=>[c.assignment_id,c])),current=new Map(s.assignments.map(a=>[a.assignment_id,a]));
 const version=row=>{const previous=known.get(row.assignment_id);return previous?Math.max(row.source_revision||1,previous.revision+(previous.action==='delete'||!same(previous,row)?1:0)):row.source_revision||1;};
 for(const a of s.assignments){
  if(excludedSources.has(a.assignment_id))continue;
  const from=Math.max(start,Date.parse(a.start_on)),to=Math.min(end,Date.parse(a.end_on));if(to<=from)continue;
  const ids=[];
  const sourceStart=Date.parse(a.start_on),sourceEnd=Date.parse(a.end_on),parts=[];
  if(sourceEnd-sourceStart<=86400000)parts.push([sourceStart,sourceEnd]);
  else for(let day=DateTime.fromMillis(from,{zone}).startOf('day');day.toMillis()<to;day=day.plus({days:1})){
   const boundary=day.plus({days:1}).toMillis();for(let anchor=day.toMillis();anchor<boundary;anchor=Math.min(anchor+86400000,boundary))parts.push([Math.max(anchor,sourceStart),Math.min(anchor+86400000,boundary,sourceEnd)]);
  }
  for(const [anchor,limit] of parts){const left=Math.max(anchor,from),right=Math.min(limit,to);if(right<=left)continue;
   const row={action:'create',...a,assignment_id:a.assignment_id+':ELS:'+anchor,source_assignment_id:a.assignment_id,source_revision:a.revision,start_on:stamp(left),end_on:stamp(right)};row.revision=version(row);ids.push(row.assignment_id);activeIds.add(row.assignment_id);
   const acknowledged=s.els.projection_receipts?.[row.assignment_id]||s.els.assignments[row.assignment_id];if(mode==='snapshot'||!acknowledged||acknowledged.deleted||!same(acknowledged,row)||acknowledged.revision<row.revision)changes.push(row);
  }
  sources.push({assignment:structuredClone(a),ids,deleted:false});
 }
 const deletedSources=new Map();
 for(const [key,old] of known){
  const sourceId=old.source_assignment_id||owners.get(key)||key;if(activeIds.has(key)||excludedSources.has(sourceId))continue;
  if(!current.has(sourceId)&&!deletes.has(sourceId))continue;
  const revision=Math.max(old.revision+(old.action==='delete'?0:1),deletes.get(sourceId)?.revision||1),row={action:'delete',assignment_id:key,revision};
  const ack=s.els.projection_receipts?.[key]||s.els.assignments[key];if(!ack?.deleted||ack.revision<revision)changes.push(row);
  if(deletes.has(sourceId)){if(!deletedSources.has(sourceId))deletedSources.set(sourceId,[]);deletedSources.get(sourceId).push(key);}
 }
 for(const [sourceId,tombstone] of deletes){
  let ids=deletedSources.get(sourceId)||[...known.values()].filter(c=>(c.source_assignment_id||owners.get(c.assignment_id)||c.assignment_id)===sourceId).map(c=>c.assignment_id);
  if(!ids.length){ids=[sourceId];const old=known.get(sourceId),ack=s.els.projection_receipts?.[sourceId]||s.els.assignments[sourceId];const row={action:'delete',assignment_id:sourceId,revision:Math.max(tombstone.revision,old?.revision||0)};if(!ack?.deleted||ack.revision<row.revision)changes.push(row);}
  sources.push({assignment:structuredClone(tombstone),ids:[...new Set(ids)],deleted:true});
 }
 return {changes,sources,scope:{type:'rolling_five_days',from:stamp(start),until:stamp(end),replacement:false,description:'Nächste fünf Tage ab Exportzeitpunkt; maximal 24 Stunden pro Teilstück. Löschungen nur explizit.'}};
}
export function finishElsProjection(s,e){
 const expectedById=new Map(e.payload.changes.map(c=>[c.assignment_id,c]));
 for(const source of e.sources||[]){
  const a=source.assignment;if(!source.ids.every(id=>{const expected=expectedById.get(id),ack=s.els.projection_receipts?.[id]||s.els.assignments[id];return ack&&(!expected||ack.revision>=expected.revision)&&!!ack.deleted===source.deleted;}))continue;
  const existing=s.els.assignments[a.assignment_id];if(existing?.projection_summary&&existing.revision>a.revision)continue;
  s.els.assignments[a.assignment_id]={...a,revision:a.revision,projection_summary:true,deleted:source.deleted,status:'Import bestätigt',export_window:e.payload.scope};
  s.outbox=s.outbox.filter(c=>!(c.assignment_id===a.assignment_id&&c.revision<=a.revision));
 }
}
