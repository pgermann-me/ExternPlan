// Selection mode captures grid gestures before favorite planning or editing.
export function bindDutySelection({board,toggle,remove,status,eligible,onDelete,onError}){
 const controller=new AbortController(),options={signal:controller.signal};
 const bars=[...board.querySelectorAll('[data-bar-assignment]')].filter(b=>eligible.has(b.dataset.barAssignment));
 let active=false,selected=new Set(),gesture=null,busy=false;
 const box=document.createElement('div');box.className='duty-selection-box';box.hidden=true;document.body.append(box);
 const update=()=>{toggle.setAttribute('aria-pressed',String(active));toggle.textContent=active?'Auswahl beenden':'Dienste auswählen';board.classList.toggle('duty-selection-mode',active);remove.hidden=!active;remove.disabled=busy||!selected.size;remove.textContent=`${selected.size} Dienste löschen`;status.hidden=!active;status.textContent=`${selected.size} ausgewählt · Rechteck ziehen oder Balken anklicken. Mit Strg/⌘ oder Umschalt weitere hinzufügen. Esc beendet die Auswahl.`;for(const b of bars){b.classList.toggle('duty-selected',selected.has(b.dataset.barAssignment));if(active)b.setAttribute('aria-pressed',String(selected.has(b.dataset.barAssignment)));else b.removeAttribute('aria-pressed');}};
 const finish=()=>{if(gesture&&board.hasPointerCapture(gesture.id))board.releasePointerCapture(gesture.id);gesture=null;box.hidden=true;};
 toggle.addEventListener('click',()=>{if(busy)return;finish();active=!active;selected.clear();update();},options);
 board.addEventListener('click',e=>{if(!active)return;e.preventDefault();e.stopImmediatePropagation();if(e.detail===0&&!busy){const b=e.target.closest('[data-bar-assignment]');if(b&&eligible.has(b.dataset.barAssignment)){const id=b.dataset.barAssignment;selected.has(id)?selected.delete(id):selected.add(id);update();}}},{...options,capture:true});
 board.addEventListener('pointerdown',e=>{
  if(!active||busy||e.button!==0||!e.target.closest('.timeline-cell'))return;
  e.preventDefault();const b=e.target.closest('[data-bar-assignment]');gesture={id:e.pointerId,x:e.clientX,y:e.clientY,bar:b?.dataset.barAssignment,previous:new Set(selected),base:e.ctrlKey||e.metaKey||e.shiftKey?new Set(selected):new Set(),drag:false};board.setPointerCapture(e.pointerId);
 },options);
 board.addEventListener('pointermove',e=>{
  if(!gesture||gesture.id!==e.pointerId)return;
  if(!gesture.drag&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<4)return;
  gesture.drag=true;const bounds=board.getBoundingClientRect();const left=Math.max(bounds.left,Math.min(gesture.x,e.clientX)),right=Math.min(bounds.right,Math.max(gesture.x,e.clientX)),top=Math.max(bounds.top,Math.min(gesture.y,e.clientY)),bottom=Math.min(bounds.bottom,Math.max(gesture.y,e.clientY));
  Object.assign(box.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});box.hidden=false;
  selected=new Set(gesture.base);for(const b of bars){const r=b.getBoundingClientRect();if(r.right>left&&r.left<right&&r.bottom>top&&r.top<bottom)selected.add(b.dataset.barAssignment);}update();
 },options);
 board.addEventListener('pointerup',e=>{if(!gesture||gesture.id!==e.pointerId)return;if(!gesture.drag&&eligible.has(gesture.bar)){selected.has(gesture.bar)?selected.delete(gesture.bar):selected.add(gesture.bar);}finish();update();},options);
 board.addEventListener('pointercancel',()=>{if(gesture){selected=new Set(gesture.previous);finish();update();}},options);
 document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'&&!busy){finish();active=false;selected.clear();update();}},options);
 remove.addEventListener('click',async()=>{if(busy||!selected.size)return;busy=true;update();try{await onDelete([...selected]);}catch(e){onError(e);}finally{busy=false;if(board.isConnected)update();}},options);
 update();return ()=>{finish();controller.abort();box.remove();};
}
