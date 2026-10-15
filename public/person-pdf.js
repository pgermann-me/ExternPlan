const scripts=new Map();
function script(src){
 if(!scripts.has(src))scripts.set(src,new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>{scripts.delete(src);tag.remove();reject(Error('PDF-Komponente konnte nicht geladen werden'));};document.head.append(tag);}));
 return scripts.get(src);
}
export async function downloadPersonPdf(root,filename){
 await Promise.all([script('/vendor/html2canvas.js'),script('/vendor/jspdf.js')]);await document.fonts.ready;
 const listView=root.dataset.view==='list',renderWidth=listView?800:1120;
 let boundaries=[],captureWidth=renderWidth;
 const canvas=await window.html2canvas(root,{scale:2,windowWidth:renderWidth,scrollX:0,scrollY:0,backgroundColor:'#ffffff',logging:false,onclone:doc=>{
  // Use the existing print layout for the snapshot without changing the live view.
  const rules=[...doc.styleSheets].flatMap(sheet=>[...sheet.cssRules]).filter(rule=>rule.media?.mediaText==='print').flatMap(rule=>[...rule.cssRules].map(inner=>inner.cssText));
  const style=doc.createElement('style');style.textContent=rules.join('\n');doc.head.append(style);
  doc.querySelector('#calendar-message').style.display='none';
  const content=doc.querySelector('main');content.style.width=renderWidth+'px';content.style.maxWidth='none';const rect=content.getBoundingClientRect();captureWidth=rect.width;
  boundaries=[...new Set([...content.querySelectorAll('thead,tbody tr,.calendar-date')].map(row=>row.getBoundingClientRect().bottom-rect.top))].sort((a,b)=>a-b);
 }});
 const pdf=new window.jspdf.jsPDF({orientation:listView?'portrait':'landscape',unit:'mm',format:'a4',compress:true}),margin=8,width=pdf.internal.pageSize.getWidth()-2*margin,height=pdf.internal.pageSize.getHeight()-2*margin;
 if(listView){const scale=Math.min(width/canvas.width,height/canvas.height);if(scale>=width/canvas.width*.8){pdf.addImage(canvas.toDataURL('image/png'),'PNG',margin+(width-canvas.width*scale)/2,margin,canvas.width*scale,canvas.height*scale);await pdf.save(filename,{returnPromise:true});return;}}
 const factor=canvas.width/captureWidth,maxPixels=Math.floor(height/width*canvas.width),cuts=boundaries.map(y=>Math.round(y*factor));let top=0,page=0;
 while(top<canvas.height){
  const limit=Math.min(canvas.height,top+maxPixels),safe=cuts.filter(y=>y>top+1&&y<=limit),bottom=limit===canvas.height?limit:(safe.at(-1)||limit);
  const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=bottom-top;slice.getContext('2d').drawImage(canvas,0,top,canvas.width,slice.height,0,0,canvas.width,slice.height);
  if(page++)pdf.addPage();pdf.addImage(slice.toDataURL('image/png'),'PNG',margin,margin,width,slice.height/canvas.width*width);top=bottom;
 }
 await pdf.save(filename,{returnPromise:true});
}
