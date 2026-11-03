import {jsPDF} from 'jspdf';
export function municipalPdf(municipality='Testdorf',pages=1,withText=true){
 const pdf=new jsPDF({unit:'pt',format:'a4'}),centers=[63,170,270,327,384,441,498,555],starts=[20,115,242,299,356,413,470,527];
 for(let p=0;p<pages;p++){if(p)pdf.addPage();if(!withText)continue;pdf.setFontSize(9);pdf.text('Gemeinde',260,25);pdf.text(municipality,310,25);pdf.setFontSize(6);pdf.text('Mutationen bitte prüfen; diese Zeile ist keine Kontaktzeile.',20,45);
 ['Gemeindeverwaltung','Name Vorname','Tel Pikett','Tel G','Tel Priv.','Natel','E-Mail','Fax'].forEach((s,i)=>pdf.text(s,centers[i],70,{align:'center'}));
 const rows=[['Gemeindehaus','Gemeindeverwaltung '+municipality,'','071 111 22 33','','','info@example.invalid',''],['Gemeindepräsident','Anna Muster','','071 222 33 44','','079 111 22 33','',''],['Gemeindepräsident Stv','Beispiel Ben','','','','079 222 33 44','',''],['Gemeindeschreiber','Clara Weitere','079 333 44 55','','','','','']];
 rows.forEach((r,j)=>r.forEach((value,i)=>{if(value)pdf.text(value,starts[i],90+j*14);}));pdf.text('Einsatzrelevante Objekte / Anlagen',20,170);pdf.text('Schulhaus Nicht importieren',20,190);
 }
 return {name:'Gemeindeliste '+municipality+'.pdf',content:Buffer.from(pdf.output('arraybuffer')).toString('base64')};
}
