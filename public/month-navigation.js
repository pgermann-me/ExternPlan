export function shiftMonth(month,delta){
 const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);return date.toISOString().slice(0,7);
}
export function movePeriod(month,half,delta){return {month:shiftMonth(month,delta),half};}
export function toggleHalfMonth(month,half){return half?{month:shiftMonth(month,1),half:0}:{month,half:1};}
// Join the second half of the selected month and the first half of its successor.
// Geometry is clipped; original instants and assignment identities remain unchanged.
export function halfMonthResult(result,half,next){
 if(!half)return result;
 const boundary=result.days.length,offset=15,end=boundary+15;
 const emptyCell=()=>({status:'kein Pikett erforderlich',gaps:[],assignments:[],bars:[],lanes:1});
 const key=row=>row.employee_id??JSON.stringify([row.function_id,row.geo_id]);
 const first=new Map(result.rows.map(row=>[key(row),row])),second=new Map(next.rows.map(row=>[key(row),row]));
 const rows=[...new Set([...first.keys(),...second.keys()])].map(id=>{
  const a=first.get(id),b=second.get(id),merged=new Map();
  for(const [source,shift] of [[a,0],[b,boundary]])for(const bar of source?.bars||[]){
   const left=bar.left+shift,right=left+bar.width,previous=merged.get(bar.assignment_id);
   merged.set(bar.assignment_id,{...bar,left:previous?Math.min(left,previous.left):left,width:(previous?Math.max(right,previous.left+previous.width):right)-(previous?Math.min(left,previous.left):left)});
  }
  const ends=[],bars=[];
  for(const bar of [...merged.values()].sort((a,b)=>a.left-b.left||a.width-b.width)){
   const left=Math.max(offset,bar.left),right=Math.min(end,bar.left+bar.width);if(right<=left)continue;
   let lane=ends.findIndex(end=>end<=left);if(lane<0)lane=ends.length;ends[lane]=right;
   bars.push({...bar,left:left-offset,width:right-left,lane});
  }
  const cells=[...(a?.cells||result.days.map(emptyCell)),...(b?.cells||next.days.map(emptyCell))].slice(offset,end);
  return {...(a||b),cells,bars,lanes:Math.max(1,ends.length)};
 });
 if(rows.some(row=>row.employee_id))rows.sort((a,b)=>a.name.localeCompare(b.name,'de-CH'));
 return {...result,days:[...result.days,...next.days].slice(offset,end),...(result.day_meta?{day_meta:[...result.day_meta,...next.day_meta].slice(offset,end)}:{}),rows};
}
