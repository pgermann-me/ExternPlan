// Keep the preferred proportion while clamping both panes to usable widths.
export function bindSplitPanel(panel){
 const handle=panel.querySelector('.favorites-splitter');if(!handle)return ()=>{};
 let ratio=null,drag=null;try{const stored=Number(localStorage.getItem('externplan.favoritePanelRatio'));if(stored>0&&stored<1)ratio=stored;}catch{}
 const bounds=()=>{const width=panel.getBoundingClientRect().width;return {width,min:180,max:Math.max(180,Math.min(width*.65,width-330))};};
 const update=(value,persist=false)=>{const {width,min,max}=bounds();if(!width)return;const left=Math.round(Math.max(min,Math.min(max,value)));panel.style.setProperty('--favorites-width',left+'px');handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(Math.round(max)));handle.setAttribute('aria-valuenow',String(left));handle.setAttribute('aria-valuetext',`${left} Pixel Favoritenbreite`);if(persist){ratio=left/width;try{localStorage.setItem('externplan.favoritePanelRatio',String(ratio));}catch{}}};
 const resize=()=>{if(!drag)update(ratio===null?250:bounds().width*ratio);};
 const finish=()=>{if(!drag)return;drag=null;panel.classList.remove('resizing');update(parseFloat(panel.style.getPropertyValue('--favorites-width')),true);};
 handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,width:parseFloat(panel.style.getPropertyValue('--favorites-width'))};handle.setPointerCapture(e.pointerId);panel.classList.add('resizing');handle.focus();};
 handle.onpointermove=e=>{if(drag)update(drag.width+e.clientX-drag.x);};
 handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=finish;
 handle.onkeydown=e=>{const current=parseFloat(panel.style.getPropertyValue('--favorites-width'));let next;switch(e.key){case 'ArrowLeft':next=current-16;break;case 'ArrowRight':next=current+16;break;case 'Home':next=bounds().min;break;case 'End':next=bounds().max;break;default:return;}e.preventDefault();update(next,true);};
 const observer=new ResizeObserver(resize);observer.observe(panel);resize();
 return ()=>{observer.disconnect();panel.classList.remove('resizing');};
}
