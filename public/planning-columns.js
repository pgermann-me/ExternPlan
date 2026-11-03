const storageKey='externplan.planningColumnWidths';
const limits={name:120,group:80};
export function bindPlanningColumns(board){
 const table=board.querySelector('.timeline'),handles=[...board.querySelectorAll('[data-resize-column]')];
 const controller=new AbortController(),options={signal:controller.signal};
 let preferred={},defaults={},drag=null,lastWidth=-1;
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');for(const key of Object.keys(limits))if(Number.isFinite(saved?.[key]))preferred[key]=Math.max(limits[key],Math.min(600,saved[key]));}catch{}
 const width=key=>board.querySelector('thead .'+(key==='name'?'person':'group')+'-column').getBoundingClientRect().width;
 const max=key=>Math.max(limits[key],Math.min(600,board.clientWidth-140-width(key==='name'?'group':'name')));
 const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(preferred));}catch{}};
 const apply=()=>{
  const desired=Object.fromEntries(Object.keys(limits).map(key=>[key,preferred[key]??defaults[key]]));
  const budget=Math.max(200,board.clientWidth-140),extra=desired.name+desired.group-200,scale=extra>0?Math.min(1,(budget-200)/extra):1;
  for(const key of Object.keys(limits)){
   if(Object.keys(preferred).length)table.style.setProperty('--'+key+'-width',Math.round(limits[key]+(desired[key]-limits[key])*scale)+'px');
   else table.style.removeProperty('--'+key+'-width');
  }
  for(const handle of handles){const key=handle.dataset.resizeColumn,current=Math.round(width(key));handle.setAttribute('aria-valuemin',String(limits[key]));handle.setAttribute('aria-valuemax',String(Math.round(max(key))));handle.setAttribute('aria-valuenow',String(current));handle.setAttribute('aria-valuetext',`${current} Pixel`);}
 };
 const resize=()=>{if(drag||board.clientWidth===lastWidth)return;lastWidth=board.clientWidth;for(const key of Object.keys(limits))table.style.removeProperty('--'+key+'-width');defaults={name:width('name'),group:width('group')};apply();};
 const finish=()=>{if(!drag)return;drag=null;board.classList.remove('resizing-columns');save();resize();};
 for(const handle of handles){
  const key=handle.dataset.resizeColumn;
  handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();drag={key,id:e.pointerId,x:e.clientX,width:width(key)};handle.setPointerCapture(e.pointerId);handle.focus();board.classList.add('resizing-columns');},options);
  handle.addEventListener('pointermove',e=>{if(!drag||drag.key!==key||drag.id!==e.pointerId)return;preferred[key]=Math.max(limits[key],Math.min(max(key),drag.width+e.clientX-drag.x));apply();},options);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,finish,options);
  handle.addEventListener('dblclick',()=>{delete preferred[key];apply();save();},options);
  handle.addEventListener('keydown',e=>{let next;switch(e.key){case 'ArrowLeft':next=width(key)-(e.shiftKey?1:16);break;case 'ArrowRight':next=width(key)+(e.shiftKey?1:16);break;case 'Home':next=limits[key];break;case 'End':next=max(key);break;case 'Delete':case 'Backspace':delete preferred[key];apply();save();e.preventDefault();return;default:return;}e.preventDefault();preferred[key]=Math.max(limits[key],Math.min(max(key),next));apply();save();},options);
 }
 const observer=new ResizeObserver(resize);observer.observe(board);resize();
 return ()=>{controller.abort();observer.disconnect();board.classList.remove('resizing-columns');};
}
