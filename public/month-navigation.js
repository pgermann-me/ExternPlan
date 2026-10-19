export function shiftMonth(month,delta){
 const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);return date.toISOString().slice(0,7);
}
export function movePeriod(month,half,delta){
 if(!half)return {month:shiftMonth(month,delta),half:0};
 if(half===1&&delta>0)return {month,half:2};
 if(half===2&&delta<0)return {month,half:1};
 return {month:shiftMonth(month,delta),half:delta>0?1:2};
}
export function toggleHalfMonth(month,half){return half?{month:shiftMonth(month,1),half:0}:{month,half:1};}
// Clip calendar geometry only. Original assignment instants remain available for editing and tooltips.
export function halfMonthResult(result,half){
 if(!half)return result;
 const offset=half===2?15:0,end=half===1?Math.min(15,result.days.length):result.days.length;
 return {...result,days:result.days.slice(offset,end),...(result.day_meta?{day_meta:result.day_meta.slice(offset,end)}:{}),rows:result.rows.map(row=>{
  const ends=[],bars=[];
  for(const bar of row.bars){
   const left=Math.max(offset,bar.left),right=Math.min(end,bar.left+bar.width);if(right<=left)continue;
   let lane=ends.findIndex(end=>end<=left);if(lane<0)lane=ends.length;ends[lane]=right;
   bars.push({...bar,left:left-offset,width:right-left,lane});
  }
  return {...row,cells:row.cells.slice(offset,end),bars,lanes:Math.max(1,ends.length)};
 })};
}
