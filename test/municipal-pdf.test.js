import test from 'node:test';
import assert from 'node:assert/strict';
import {municipalPdf} from '../scripts/fixtures/municipal-pdf.js';
import {municipalFile,seedMunicipalFunctions} from '../scripts/fixtures/municipal.js';
import {parseMunicipalFiles,prepareMunicipalImport,municipalToken} from '../municipal-import.js';
import {emptyState} from '../data-cleanup.js';
test('Text/OCR-layer PDFs extract municipality, column-based contact data and only the contact section',async()=>{
 const parsed=await parseMunicipalFiles([municipalPdf()]),d=parsed.documents[0];assert.equal(d.municipality,'Testdorf');assert.equal(d.source_format,'pdf');assert.equal(d.pdf_review_required,true);assert.equal(d.rows.length,4);assert.ok(d.source_notes.some(note=>note.includes('OCR')));assert.deepEqual(d.rows[1].phones,['','071 222 33 44','','079 111 22 33']);assert.equal(d.rows[0].email,'info@example.invalid');assert.equal(d.rows[3].contacts[0].description,'Pikettnummer 24h');assert.ok(d.rows.every(r=>!r.raw_role.includes('Schulhaus')));
});
test('PDF imports require explicit original verification and name order; corrections use the normal atomic import',async()=>{
 const parsed=await parseMunicipalFiles([municipalPdf()]),s=seedMunicipalFunctions(emptyState());s.regions=[{id:'T',name:'Testdorf'}];const documents=parsed.documents.map(d=>({...d,region_id:'T',pdf_name_order:'manual',pdf_verified:false}));assert.throws(()=>prepareMunicipalImport(s,parsed,{documents}),/PDF.*Original/);assert.equal(s.people.length,0);
 documents[0].pdf_verified=true;documents[0].rows[1].first_name='Anna';documents[0].rows[1].last_name='Muster';const token=municipalToken(s,parsed,{documents}),result=prepareMunicipalImport(s,parsed,{documents});assert.ok(result.state.people.some(p=>p.name==='Anna Muster'));assert.equal(result.state.people.length,3);assert.ok(!s.people.length);documents[0].pdf_verified=false;assert.notEqual(municipalToken(s,parsed,{documents}),token);const file=municipalPdf(),changed={...file,content:Buffer.concat([Buffer.from(file.content,'base64'),Buffer.from('\n% changed source\n')]).toString('base64')},a=await parseMunicipalFiles([file]),b=await parseMunicipalFiles([changed]);assert.deepEqual(a.documents[0].rows,b.documents[0].rows);assert.notEqual(a.documents[0].source_hash,b.documents[0].source_hash);assert.notEqual(municipalToken(s,a,{documents}),municipalToken(s,b,{documents}));
});
test('Mixed Excel/PDF batches work; unreadable, encrypted/invalid and oversized-page PDFs give actionable errors',async()=>{
 const mixed=await parseMunicipalFiles([municipalPdf(),await municipalFile('Testwil')]);assert.equal(mixed.documents.length,2);assert.equal(mixed.documents[1].source_format,'xlsx');await assert.rejects(()=>parseMunicipalFiles([municipalPdf('Testdorf',1,false)]),/Textebene.*OCR/);await assert.rejects(()=>parseMunicipalFiles([municipalPdf('Testdorf',6)]),/1 bis 5 Seiten/);await assert.rejects(()=>parseMunicipalFiles([{name:'invalid.pdf',content:Buffer.from('not a pdf').toString('base64')}]),/Ungültige PDF/);
});
