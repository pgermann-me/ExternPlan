// Each named checkbox list (or a cover's parts list) has its own range anchor.
export function bindCheckboxRanges(root){
 const anchors=new WeakMap();let labelShift=null;
 const keyFor=input=>input?.name||(input?.hasAttribute('data-part')?'cover-parts':'');
 const eligible=input=>input?.matches('input[type=checkbox]')&&!input.matches(':disabled')&&keyFor(input)&&root.contains(input.closest('fieldset'));
 const click=event=>{
  const input=event.target;
  if(!input.matches?.('input[type=checkbox]')){
   const control=input.closest?.('label')?.control;
   // Browsers can treat Shift-clicking label text as text selection instead of activation.
   if(event.shiftKey&&eligible(control)){event.preventDefault();labelShift=control;control.focus({preventScroll:true});control.click();labelShift=null;}return;
  }
  if(!eligible(input))return;
  const key=keyFor(input),scope=input.closest('fieldset'),inputs=[...scope.querySelectorAll('input[type=checkbox]')].filter(other=>other.closest('fieldset')===scope&&keyFor(other)===key&&!other.matches(':disabled')&&other.getClientRects().length);
  let lists=anchors.get(scope);if(!lists){lists=new Map();anchors.set(scope,lists);}const from=inputs.indexOf(lists.get(key)),to=inputs.indexOf(input),checked=input.checked;
  if((event.shiftKey||labelShift===input)&&from>=0&&to>=0)for(const other of inputs.slice(Math.min(from,to),Math.max(from,to)+1))other.checked=checked;
  lists.set(key,input);
 };
 const mousedown=event=>{if(event.shiftKey&&!event.target.matches?.('input[type=checkbox]')&&eligible(event.target.closest?.('label')?.control))event.preventDefault();};
 root.addEventListener('click',click);root.addEventListener('mousedown',mousedown);
 return ()=>{root.removeEventListener('click',click);root.removeEventListener('mousedown',mousedown);};
}
