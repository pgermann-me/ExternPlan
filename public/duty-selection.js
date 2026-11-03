// Selection mode captures grid gestures before favorite planning or editing.
export function bindDutySelection({board,toggle,remove,copy,status,eligible,onDelete,onCopy,prepareCopy,targetAt,onError,model={active:false,selected:new Set(),copying:false,busy:false}}){
 const controller=new AbortController(),options={signal:controller.signal};
 const bars=[...board.querySelectorAll('[data-bar-assignment]')].filter(b=>eligible.has(b.dataset.barAssignment));
 for(const id of model.selected)if(!eligible.has(id)){model.selected.delete(id);model.copying=false;model.prepared=null;}
 let gesture=null;
 const box=document.createElement('div');box.className='duty-selection-box';box.hidden=true;document.body.append(box);
 const update=()=>{
  toggle.setAttribute('aria-pressed',String(model.active));toggle.textContent=model.active?'Auswahl beenden':'Dienste auswählen';board.classList.toggle('duty-selection-mode',model.active);board.classList.toggle('duty-copy-mode',model.active&&model.copying);
  remove.hidden=!model.active;remove.disabled=model.busy||model.copying||!model.selected.size;remove.textContent=`${model.selected.size} Dienste löschen`;
  if(copy){copy.hidden=!model.active;copy.disabled=model.busy||!model.selected.size;copy.textContent=model.copying?'Kopieren abbrechen':`${model.selected.size} Dienste kopieren`;copy.setAttribute('aria-pressed',String(model.copying));}
  status.hidden=!model.active;status.textContent=model.copying?`${model.selected.size} Dienste kopieren · Auf den Zieltag bei der Zielperson klicken. Der früheste Starttag wird auf diesen Tag verschoben. Esc bricht das Kopieren ab.`:`${model.selected.size} ausgewählt · Rechteck ziehen oder Balken anklicken. Mit Strg/⌘ oder Umschalt weitere hinzufügen. Anschliessend löschen oder kopieren. Esc beendet die Auswahl.`;
  for(const b of bars){b.classList.toggle('duty-selected',model.selected.has(b.dataset.barAssignment));if(model.active)b.setAttribute('aria-pressed',String(model.selected.has(b.dataset.barAssignment)));else b.removeAttribute('aria-pressed');}
 };
 model.update=update;
 const finish=()=>{if(gesture&&board.hasPointerCapture(gesture.id))board.releasePointerCapture(gesture.id);gesture=null;box.hidden=true;};
 const cancel=()=>{finish();model.active=false;model.copying=false;model.prepared=null;model.selected.clear();update();};
 toggle.addEventListener('click',()=>{if(model.busy)return;if(model.active)cancel();else{model.active=true;model.selected.clear();update();}},options);
 board.addEventListener('click',async e=>{
  if(!model.active)return;e.preventDefault();e.stopImmediatePropagation();if(model.busy)return;
  if(model.copying){
   const target=targetAt(e);if(!target)return;model.busy=true;update();
   try{await onCopy(model.prepared,target);}catch(error){onError(error);}finally{model.busy=false;model.update?.();}return;
  }
  if(e.detail===0){const b=e.target.closest('[data-bar-assignment]');if(b&&eligible.has(b.dataset.barAssignment)){const id=b.dataset.barAssignment;model.selected.has(id)?model.selected.delete(id):model.selected.add(id);update();}}
 },{...options,capture:true});
 board.addEventListener('pointerdown',e=>{
  if(!model.active||model.busy||model.copying||e.button!==0||!e.target.closest('.timeline-cell'))return;
  e.preventDefault();const b=e.target.closest('[data-bar-assignment]');gesture={id:e.pointerId,x:e.clientX,y:e.clientY,bar:b?.dataset.barAssignment,previous:new Set(model.selected),base:e.ctrlKey||e.metaKey||e.shiftKey?new Set(model.selected):new Set(),drag:false};board.setPointerCapture(e.pointerId);
 },options);
 board.addEventListener('pointermove',e=>{
  if(!gesture||gesture.id!==e.pointerId)return;
  if(!gesture.drag&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<4)return;
  gesture.drag=true;const bounds=board.getBoundingClientRect();const left=Math.max(bounds.left,Math.min(gesture.x,e.clientX)),right=Math.min(bounds.right,Math.max(gesture.x,e.clientX)),top=Math.max(bounds.top,Math.min(gesture.y,e.clientY)),bottom=Math.min(bounds.bottom,Math.max(gesture.y,e.clientY));
  Object.assign(box.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});box.hidden=false;
  model.selected=new Set(gesture.base);for(const b of bars){const r=b.getBoundingClientRect();if(r.right>left&&r.left<right&&r.bottom>top&&r.top<bottom)model.selected.add(b.dataset.barAssignment);}update();
 },options);
 board.addEventListener('pointerup',e=>{if(!gesture||gesture.id!==e.pointerId)return;if(!gesture.drag&&eligible.has(gesture.bar)){model.selected.has(gesture.bar)?model.selected.delete(gesture.bar):model.selected.add(gesture.bar);}finish();update();},options);
 board.addEventListener('pointercancel',()=>{if(gesture){model.selected=new Set(gesture.previous);finish();update();}},options);
 document.addEventListener('keydown',e=>{if(model.active&&e.key==='Escape'&&!model.busy){if(model.copying){model.copying=false;model.prepared=null;update();}else cancel();}},options);
 copy?.addEventListener('click',()=>{if(model.busy||!model.selected.size)return;try{model.copying=!model.copying;model.prepared=model.copying?prepareCopy([...model.selected]):null;finish();update();}catch(error){model.copying=false;onError(error);update();}},options);
 remove.addEventListener('click',async()=>{if(model.busy||model.copying||!model.selected.size)return;model.busy=true;update();try{await onDelete([...model.selected]);}catch(e){onError(e);}finally{model.busy=false;model.update?.();}},options);
 update();return ()=>{finish();controller.abort();box.remove();if(model.update===update)model.update=null;};
}
