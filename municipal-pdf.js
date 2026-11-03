import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {XMLParser} from 'fast-xml-parser';
import ExcelJS from 'exceljs';
const run=promisify(execFile),list=x=>x==null?[]:Array.isArray(x)?x:[x];
const clean=x=>String(x||'').replace(/[_•]+/g,' ').replace(/^[|\[\]{}]+|[|\[\]{}]+$/g,'').replace(/\s+/g,' ').trim();
const normal=x=>clean(x).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const midpoint=w=>(w.xMin+w.xMax)/2;
function lines(words){
 const heights=words.map(w=>w.yMax-w.yMin).filter(h=>h>0&&h<20).sort((a,b)=>a-b),tolerance=Math.max(.8,(heights[Math.floor(heights.length/2)]||5)*.62),rows=[];
 for(const w of [...words].sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin)){let row=rows.at(-1);if(!row||w.yMin-row.y>tolerance){row={y:w.yMin,words:[]};rows.push(row);}row.words.push(w);}
 return rows.map(r=>({...r,words:r.words.sort((a,b)=>a.xMin-b.xMin),text:r.words.map(w=>w.text).join(' ')}));
}
function sectionName(value){
 const name=clean(value).replace(/^[iIl1|Ì]+(?=[A-ZÄÖÜ])/u,'');const key=normal(name);
 if(/gemeindev[ce]rwaltung/.test(key))return 'Gemeindeverwaltung';if(/bauv[ce]rwaltung/.test(key))return 'Bauverwaltung';if(key==='technbetriebe')return 'Techn. Betriebe';if(key==='bestattungsdienst')return 'Bestattungsdienst';if(/schl[ou]sseldienst/.test(key))return 'Schlüsseldienst';if(key==='tierschutzbeauftragte')return 'Tierschutzbeauftragte';return null;
}
function columnStarts(words,headers){
 return headers.map((header,i)=>{
  const left=i?(headers[i-1]+header)/2-(header-headers[i-1])*.28:0,right=i+1<headers.length?(header+headers[i+1])/2:Infinity;
  let candidates=words.filter(w=>w.xMin>=left&&w.xMin<right&&clean(w.text));if(i>=2&&i<=5||i===7)candidates=candidates.filter(w=>/^\+?\d+$/.test(clean(w.text)));if(i===6)candidates=candidates.filter(w=>w.text.includes('@'));
  const counts=new Map();for(const w of candidates){const x=Math.round(w.xMin*2)/2;counts.set(x,(counts.get(x)||0)+1);}const max=Math.max(0,...counts.values());return max?Math.min(...[...counts].filter(([,n])=>n>=max*.6).map(([x])=>x)):left;
 });
}
export function pdfWordsToMunicipalSheet(pages){
 if(!pages.length||pages.length>5)throw Error('Gemeinde-PDF mit 1 bis 5 Seiten erwartet');
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Gemeindeliste');let municipality='',nextRow=8,section='Gemeindeverwaltung',stopped=false;
 const notes=['Neu-/Löschmarkierungen aus PDF werden nicht automatisch ausgewertet. Zum Löschen markierte Zeilen in der Vorschau abwählen.','PDF-Erkennung prüfen: Namenreihenfolge, Telefonnummern und Neu-/Löschmarkierungen am Original kontrollieren. OCR-Fehler können auch formal gültige Telefonnummern verändern.'];
 for(const page of pages){
  const words=page.words;if(words.length>20000)throw Error('PDF enthält zu viele Textsegmente');const rows=lines(words),head=rows.find(r=>r.words.some(w=>/^Natel$/i.test(w.text))&&/Name|Vorname/i.test(r.text));
  if(!head){if(!words.length)throw Error('Die PDF enthält keine lesbare Textebene. Bitte die gescannte PDF zuerst mit Texterkennung (OCR) speichern.');throw Error('Gemeindetabelle in der PDF nicht erkannt (Name/Vorname, Telefonspalten und Natel erforderlich)');}
  // OCR may corrupt the small Gemeinde label; align text centres because
  // the adjacent municipality title is often printed in a larger font.
  const label=words.filter(w=>/^(Gemeinde:?|Genwind\w*)$/i.test(w.text)&&w.yMin<head.y).sort((a,b)=>a.yMin-b.yMin)[0];let name=label?clean(words.filter(w=>w.xMin>=label.xMax-1&&Math.abs((w.yMin+w.yMax-label.yMin-label.yMax)/2)<Math.max(3,label.yMax-label.yMin)).sort((a,b)=>a.xMin-b.xMin).map(w=>w.text).join(' ')):'';
  if(!name)throw Error('Gemeindename in der PDF nicht eindeutig erkannt');if(municipality&&normal(name)!==normal(municipality))throw Error('PDF enthält mehrere Gemeinden');municipality=name;
  const headerWords=words.filter(w=>Math.abs(w.yMin-head.y)<5),pick=pattern=>headerWords.find(w=>pattern.test(w.text));
  const a=pick(/Gemeindeverwaltung/i),b=pick(/^Name$/i)||pick(/Name.?Vorname/i),vor=pick(/^Vorname$/i),c=pick(/^Pikett$/i),d=pick(/^TelG$/i)||pick(/^G\.?$/i),e=pick(/^Priv\.?$/i),f=pick(/^Natel$/i),g=pick(/^E[-–]?Mail$/i),h=pick(/^Fax$/i);
  if(![a,b,c,d,e,f,g,h].every(Boolean))throw Error('Telefonspalten in der PDF nicht eindeutig erkannt; bitte die Excel-Datei verwenden');
  const prevTel=target=>headerWords.filter(w=>/^Tel\.?$/i.test(w.text)&&w.xMin<target.xMin&&target.xMin-w.xMax<10).sort((a,b)=>b.xMin-a.xMin)[0];
  const center=(first,last=first)=>(first.xMin+last.xMax)/2;
  const headers=[midpoint(a),center(b,vor||b),center(prevTel(c)||c,c),center(prevTel(d)||d,d),center(prevTel(e)||e,e),midpoint(f),midpoint(g),midpoint(h)];if(headers.some((x,i)=>i&&x<=headers[i-1]))throw Error('Unklare PDF-Spaltenreihenfolge');
  const stop=rows.find(r=>r.y>head.y&&/e[il]nsatzrelevante.*objekt/i.test(r.text)),bottom=stop?.y??page.height;
  const data=rows.filter(r=>r.y>head.y+10&&r.y<bottom),starts=columnStarts(data.flatMap(r=>r.words),headers);if(starts.some((x,i)=>i&&x<=starts[i-1]))throw Error('PDF-Spalten nicht eindeutig trennbar; bitte Excel verwenden');
  for(const line of data){
   const values=Array.from({length:8},()=>[]);for(const word of line.words){let column=0;for(let i=1;i<starts.length;i++)if(word.xMin>=starts[i]-1)column=i;values[column].push(word.text);}const cells=values.map(v=>clean(v.join(' '))),label=cells[0],title=sectionName(label);
   if(title&&!cells.slice(1).some(Boolean)){section=title;sheet.mergeCells(nextRow,1,nextRow,10);sheet.getCell(nextRow++,1).value=title;continue;}
   if(!cells[1]&&!cells.slice(2,6).some(v=>/\d{3}/.test(v)))continue;
   if(!label)cells[0]=section;else if(/^(neu|löschen|geändert|Name|Gemeindeverwaltung)$/i.test(label))continue;
   if(cells[6]&&!cells[6].includes('@'))cells[6]='';
   const row=sheet.getRow(nextRow++);cells.forEach((v,i)=>row.getCell(i+1).value=v);
  }
  if(stop){stopped=true;break;}
 }
 if(!municipality||nextRow===8)throw Error('Keine Gemeindekontakte aus PDF erkannt');
 sheet.getCell('E1').value=municipality;sheet.getCell('B5').value='Name Vorname';sheet.getCell('F5').value='Natel';
 if(!stopped)notes.push('Abschnittsende „Einsatzrelevante Objekte / Anlagen“ nicht erkannt; Zeilenauswahl besonders prüfen.');
 return {sheet,notes};
}
export async function readMunicipalPdf(buffer){
 if(!buffer.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('Ungültige PDF-Datei');const dir=await mkdtemp(join(tmpdir(),'externplan-municipal-pdf-'));
 try{const path=join(dir,'document.pdf');await writeFile(path,buffer,{mode:0o600});let output;
  try{output=await run('pdftotext',['-f','1','-l','6','-bbox','-enc','UTF-8',path,'-'],{timeout:15000,maxBuffer:8*1024*1024});}catch(error){throw Error(error.code==='ENOENT'?'PDF-Werkzeug pdftotext fehlt auf dem Server. Bitte den aktualisierten Docker-Build bereitstellen.':'PDF konnte nicht gelesen werden (beschädigt, verschlüsselt oder zu aufwendig).');}
  const xml=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',textNodeName:'text',parseAttributeValue:true,parseTagValue:false}).parse(output.stdout),raw=list(xml.html?.body?.doc?.page);
  return pdfWordsToMunicipalSheet(raw.map(p=>({width:p.width,height:p.height,words:list(p.word).filter(w=>typeof w.text==='string'&&[w.xMin,w.xMax,w.yMin,w.yMax].every(Number.isFinite)).map(w=>({...w,text:w.text}))})));
 }finally{await rm(dir,{recursive:true,force:true});}
}
