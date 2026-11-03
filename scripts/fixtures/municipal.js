import ExcelJS from 'exceljs';
export async function municipalFile(municipality='Testdorf',options={}){
 const b=new ExcelJS.Workbook(),sh=b.addWorksheet('Gemeindeliste');sh.getCell('D1').value='Gemeinde';sh.getCell('E1').value=municipality;sh.getCell('B5').value='Name Vorname';sh.getCell('F5').value='Natel';
 const row=(n,role,name,phone,deleted=false)=>{sh.getCell('A'+n).value=role;sh.getCell('B'+n).value=name;sh.getCell('F'+n).value=phone;if(deleted)sh.getCell('J'+n).value='x';};
 row(8,'Gemeindepräsident*in','Muster Anna','079 111 22 33');row(9,'Gemeindepräsident*in','Beispiel Ben','079 222 33 44');row(10,'Bestattungsdienst','Beispiel AG','079 333 44 55');sh.getCell('C10').value='071 111 22 33';row(11,'Gemeindepräsident*in I. Stv','Andere Berta','079 444 55 66');row(12,'Gemeindepräsident*in II. Stv / Schulpräsident','Weitere Clara','079 555 66 77');row(13,'Bauamt','Gelöscht Gerd','079 666 77 88',true);row(14,options.unknown_role?'Erfundene Gemeindefunktion':'Tierschutzbeauftragte','Muster Anna','079 111 22 33');row(15,'Gemeindeschreiber*in','Vorbei Vera (bis 31.07.2026)','079 777 88 99');row(16,'Gemeindehaus','Gemeindeverwaltung '+municipality,'');sh.getCell('D16').value='071 123 45 67';sh.mergeCells('A17:J17');sh.getCell('A17').value='Techn. Betriebe';sh.getCell('A18').value='Einsatzrelevante Objekte / Anlagen';row(19,'Schulhaus','Keine Person','keine Nummer');
 return {name:'Gemeindeliste '+municipality+'.xlsx',content:Buffer.from(await b.xlsx.writeBuffer()).toString('base64')};
}
export function seedMunicipalFunctions(s){
 for(const [i,name] of ['Gemeindepräsident','Gemeindepräsident Stv','Schulpräsident','Bestattungsdienst','Tierschutzbeauftragte','Gemeindehaus','Gemeindeschreiber'].entries())if(!s.functions.some(f=>f.name===name))s.functions.push({id:'MUNICIPAL-'+i,name,geo_ids:[],covers:{},region_assignment_mode:'groups',duty_time_model:'always'});
 return s;
}
