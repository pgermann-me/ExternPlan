import {instant} from './domain.js';
import {dutyColor} from './public/duty-color.js';
export function timelineBars(assignments,days,styles={}){
 const bounds=days.map(d=>[instant(d.start_on),instant(d.end_on)]);if(!bounds.length)return {bars:[],lanes:1};
 const min=bounds[0][0],max=bounds.at(-1)[1];
 const position=ms=>{if(ms<=min)return 0;if(ms>=max)return bounds.length;const i=bounds.findIndex(([a,b])=>a<=ms&&ms<b);return i+(ms-bounds[i][0])/(bounds[i][1]-bounds[i][0]);};
 const ends=[],bars=[];
 for(const {assignment:a,start:from,end:until} of assignments.map(assignment=>({assignment,start:instant(assignment.start_on),end:instant(assignment.end_on)})).sort((a,b)=>a.start-b.start||a.end-b.end)){
   const start=Math.max(min,from),end=Math.min(max,until);if(start>=end)continue;
   let lane=ends.findIndex(ms=>ms<=start);if(lane<0)lane=ends.length;ends[lane]=end;
   const color=dutyColor(a,styles);
   bars.push({...a,left:position(start),width:position(end)-position(start),lane,color});
 }
 return {bars,lanes:Math.max(1,ends.length)};
}
