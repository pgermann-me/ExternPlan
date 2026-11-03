import {renderPikettRegion} from './pikett-region.js';
import {swissTime,localDateTime} from './time.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headings=['Pikett','Region','Name','Start Pikett','Ende Pikett','Kontaktdaten'];
const cells=row=>[row.function_name,row.region_name,row.person_name,swissTime(row.start_on),swissTime(row.end_on),row.contacts.join('\n')];
let pdfScript;
async function downloadPdf(data,rows){
 if(!window.jspdf){pdfScript??=new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src='/vendor/jspdf.js';tag.onload=resolve;tag.onerror=()=>{pdfScript=null;tag.remove();reject(Error('PDF-Komponente konnte nicht geladen werden'));};document.head.append(tag);});await pdfScript;}
 const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true}),widths=[32,27,32,25,25,47],margin=11;
 let y=0,page=0;
 const header=()=>{page++;pdf.setFont('helvetica','bold');pdf.setFontSize(15);pdf.setTextColor(25,45,60);pdf.text('Pikettliste',margin,15);pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text(swissTime(data.at)+' · Schweizer Zeit',margin,21);pdf.setFontSize(7);pdf.text('Graue Zeilen: Pikett beginnt später an diesem Tag.',margin,26);y=30;let x=margin;pdf.setFont('helvetica','bold');headings.forEach((text,i)=>{pdf.setFillColor(232,238,242);pdf.rect(x,y,widths[i],7,'F');pdf.text(text,x+1.3,y+4.5);x+=widths[i];});y+=7;pdf.setFont('helvetica','normal');};
 header();pdf.setFontSize(7);
 if(!rows.length){pdf.text('Keine Pikettdienste für den gewählten Zeitpunkt.',margin,y+6);}
 for(const row of rows){
  const texts=cells(row).map((text,i)=>pdf.splitTextToSize(text||'–',widths[i]-2.6)),height=Math.max(8,...texts.map(lines=>lines.length*3.2+3));
  if(y+height>280){pdf.addPage();header();}
  let x=margin;pdf.setDrawColor(160,170,178);pdf.setLineWidth(.15);
  texts.forEach((lines,i)=>{pdf.setFillColor(...(row.future?[225,225,225]:[255,255,255]));pdf.rect(x,y,widths[i],height,'FD');pdf.text(lines,x+1.3,y+3.5);x+=widths[i];});y+=height;
 }
 for(let i=1;i<=page;i++){pdf.setPage(i);pdf.setFontSize(7);pdf.setTextColor(90,100,110);pdf.text(`ExternPlan · Seite ${i} von ${page}`,margin,290);}
 await pdf.save('Pikettliste '+swissTime(data.at).replace(/\./g,'-').replace(' ','_').replace(':','-')+'.pdf',{returnPromise:true});
}
export async function renderPikettList(root,{api,safe,heading=true}){
 root.innerHTML=`${heading?'<h1>Pikettliste</h1>':''}<form id="pikett-list-filter" class="toolbar"><label for="pikett-list-at">Datum / Uhrzeit</label><input id="pikett-list-at" type="text" value="${esc(swissTime(new Date()))}" placeholder="TT.MM.JJJJ HH:mm" data-time-format="datetime" inputmode="numeric" required><button type="submit">Anzeigen</button><button type="button" id="pikett-list-previous" class="secondary">← Vortag</button><button type="button" id="pikett-list-now" class="secondary">Jetzt</button><button type="button" id="pikett-list-next" class="secondary">Folgetag →</button><select id="pikett-list-function" aria-label="Pikett filtern"><option value="">Alle Piketts</option></select><button type="button" id="pikett-list-pdf" disabled>PDF herunterladen</button></form><p class="small muted">Schweizer Zeit · Graue Zeilen: Pikett beginnt später an diesem Tag.</p><div id="pikett-list-results" aria-live="polite"></div>`;
 const $=selector=>root.querySelector(selector),form=$('#pikett-list-filter');let data,filtered=[],sequence=0;
 const draw=()=>{const id=$('#pikett-list-function').value;filtered=data.rows.filter(row=>!id||row.function_id===id);$('#pikett-list-results').innerHTML=`<h2>Pikettliste · ${esc(swissTime(data.at))}</h2><p class="small">${filtered.filter(r=>!r.future).length} aktuell gültig · ${filtered.filter(r=>r.future).length} später am gewählten Tag</p><div class="pikett-list-board"><table class="pikett-list"><thead><tr>${headings.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${filtered.map(row=>`<tr data-pikett-list-duty="${esc(row.assignment_id)}" class="${row.future?'pikett-list-future':''}">${cells(row).map(text=>`<td>${esc(text).replace(/\n/g,'<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${filtered.length?'':'<p>Keine Pikettdienste für den gewählten Zeitpunkt.</p>'}`;$('#pikett-list-pdf').disabled=false;};
 const load=async at=>{const request=++sequence;$('#pikett-list-pdf').disabled=true;$('#pikett-list-function').disabled=true;try{const next=await api('/pikett-list?'+new URLSearchParams({at}));if(request!==sequence||!form.isConnected)return;data=next;$('#pikett-list-function').disabled=false;$('#pikett-list-at').value=swissTime(data.at);const selected=$('#pikett-list-function').value,functions=[...new Map(data.rows.map(r=>[r.function_id,r.function_name])).entries()];$('#pikett-list-function').innerHTML='<option value="">Alle Piketts</option>'+functions.map(([id,name])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(name)}</option>`).join('');draw();}catch(error){if(request===sequence&&form.isConnected){$('#pikett-list-results').textContent=error.message;}throw error;}};
 const selectedAt=()=>localDateTime($('#pikett-list-at').value);
 $('#pikett-list-filter').onsubmit=safe(async e=>{e.preventDefault();await load(selectedAt());});
 $('#pikett-list-now').onclick=safe(async()=>{await load(new Date().toISOString());});
 for(const [id,delta] of [['previous',-1],['next',1]])$('#pikett-list-'+id).onclick=safe(async()=>{const local=localDateTime($('#pikett-list-at').value),date=new Date(local+'Z');date.setUTCDate(date.getUTCDate()+delta);await load(date.toISOString().slice(0,19));});
 $('#pikett-list-function').onchange=draw;
 $('#pikett-list-pdf').onclick=safe(async()=>{const button=$('#pikett-list-pdf');button.disabled=true;try{await downloadPdf(data,filtered);}finally{button.disabled=false;}});
 await load(new Date().toISOString());
}

let pikettTab='list';
export function mountPikettViews(root,{api,safe}){
 root.innerHTML='<h1>Pikettliste</h1><div class="master-tabs" role="tablist" aria-label="Pikettlisten"><button type="button" id="pikett-tab-list" role="tab" aria-controls="pikett-panel">Pikettliste</button><button type="button" id="pikett-tab-region" role="tab" aria-controls="pikett-panel">Pikett nach Region</button></div><div id="pikett-panel" role="tabpanel"></div>';
 const buttons=[...root.querySelectorAll('[role=tab]')],panel=root.querySelector('#pikett-panel');let generation=0,disposeChild=()=>{},disposed=false;
 const show=async tab=>{
  const request=++generation;pikettTab=tab;disposeChild();disposeChild=()=>{};
  buttons.forEach(button=>{const active=button.id==='pikett-tab-'+tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});panel.setAttribute('aria-labelledby','pikett-tab-'+tab);
  const content=document.createElement('div');panel.replaceChildren(content);
  if(tab==='region')await renderPikettRegion(content,{api,safe,registerDispose:cleanup=>{if(disposed||request!==generation)cleanup();else disposeChild=cleanup;}});
  else await renderPikettList(content,{api,safe,heading:false});
 };
 buttons.forEach((button,index)=>{button.onclick=safe(()=>show(index?'region':'list'));button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;buttons[next].focus();buttons[next].click();}};});
 safe(()=>show(pikettTab))();
 return ()=>{disposed=true;generation++;disposeChild();};
}
