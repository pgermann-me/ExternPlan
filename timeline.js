import {instant} from './domain.js';
import {dutyColor} from './public/duty-color.js';
export function timelineBars(assignments,days,styles={}){
 const bounds=days.map(d=>[instant(d.start_on),instant(d.end_on)]);if(!bounds.length)return {bars:[],lanes:1};
 const min=bounds[0][0],max=bounds.at(-1)[1];
 const position=ms=>{if(ms<=min)return 0;if(ms>=max)return bounds.length;const i=bounds.findIndex(([a,b])=>a<=ms&&ms<b);return i+(ms-bounds[i][0])/(bounds[i][1]-bounds[i][0]);};
 const ends=[],bars=[];
 for(const a of [...assignments].sort((a,b)=>instant(a.start_on)-instant(b.start_on)||instant(a.end_on)-instant(b.end_on))){
   const start=Math.max(min,instant(a.start_on)),end=Math.min(max,instant(a.end_on));if(start>=end)continue;
   let lane=ends.findIndex(ms=>ms<=start);if(lane<0)lane=ends.length;ends[lane]=end;
   const color=dutyColor(a,styles);
   bars.push({...a,left:position(start),width:position(end)-position(start),lane,color});
 }
 return {bars,lanes:Math.max(1,ends.length)};
}
