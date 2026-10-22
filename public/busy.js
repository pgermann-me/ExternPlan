// Each operation has its own delay; overlapping and nested operations cannot hide each other.
export function createBusyTracker({show,hide,delay=1000,setTimer=setTimeout,clearTimer=clearTimeout}){
 const visibleOperations=new Set();let visible=false;
 const update=()=>{const next=visibleOperations.size>0;if(next===visible)return;visible=next;if(next)show();else hide();};
 return ()=>{
  const token={};let finished=false;
  const timer=setTimer(()=>{if(finished)return;visibleOperations.add(token);update();},delay);
  return ()=>{if(finished)return;finished=true;clearTimer(timer);visibleOperations.delete(token);update();};
 };
}
let indicator;
const start=createBusyTracker({
 show(){
  if(!indicator){
   indicator=document.createElement('div');indicator.id='busy-indicator';indicator.className='busy-indicator';indicator.setAttribute('role','status');indicator.setAttribute('aria-live','polite');indicator.setAttribute('aria-atomic','true');
   indicator.innerHTML='<span class="busy-spinner" aria-hidden="true"></span><span>Bitte warten …</span>';
   if(typeof indicator.showPopover==='function')indicator.setAttribute('popover','manual');
   document.body.append(indicator);
  }
  indicator.hidden=false;
  if(indicator.hasAttribute('popover'))indicator.showPopover();
 },
 hide(){if(!indicator)return;if(indicator.hasAttribute('popover'))indicator.hidePopover();indicator.hidden=true;}
});
export async function withBusy(operation){const finish=start();try{return await operation();}finally{finish();}}
