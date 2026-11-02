import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureContactDescriptions,manualPerson} from '../people.js';
import {contactDescription} from '../public/phone.js';
import {parseMunicipalFiles,prepareMunicipalImport} from '../municipal-import.js';
import {municipalFile,seedMunicipalFunctions} from '../scripts/fixtures/municipal.js';
import {emptyState} from '../data-cleanup.js';
test('Existing descriptions migrate idempotently without rewriting communications or historical exports',()=>{
 const s=emptyState();s.people=[{contacts:[{type:'Telefon Pikett',value:'Alt',description:'Pikett'},{type:'phone_mobile',value:'079 000 00 00'},{type:'email',value:'test@example.invalid',description:'Postfach'}]}];s.offices=[{contacts:[{type:'Telefon Pikett',value:'071 000 00 00'}]}];s.person_exports=[{payload:[{contacts:[{description:'Pikett'}]}]}];const before=structuredClone(s.person_exports);
 assert.equal(ensureContactDescriptions(s),3);assert.equal(s.people[0].contacts[0].description,'Pikettnummer 24h');assert.equal(s.people[0].contacts[0].value,'Alt');assert.equal(s.people[0].contacts[1].description,'');assert.equal(s.people[0].contacts[2].description,'Postfach');assert.deepEqual(s.person_exports,before);assert.equal(ensureContactDescriptions(s),0);
 assert.equal(contactDescription({type:'Telefon Pikett',description:'Eigener Hinweis'}),'Eigener Hinweis');assert.throws(()=>contactDescription({type:'email',description:{}}),/Text/);
 const p=manualPerson({first_name:'Anna',last_name:'Test',contacts:[{type:'phone_mobile',value:'079 111 22 33'},{type:'email',value:'test@example.invalid'}]},null,'P');assert.ok(p.contacts.every(c=>c.description===''));
});
test('Repeated municipal imports retain custom descriptions on both people and Stellen',async()=>{
 const file=await municipalFile(),parsed=await parseMunicipalFiles([file]),s=seedMunicipalFunctions(emptyState());s.regions=[{id:'T',name:'Testdorf'}];const input={documents:parsed.documents.map(d=>({...d,region_id:'T'}))},first=prepareMunicipalImport(s,parsed,input).state;
 const person=first.people.find(p=>p.name==='Anna Muster'),office=first.offices.find(o=>o.name==='Beispiel AG');person.contacts[0].description='Persönlicher Hinweis';office.contacts.find(c=>c.type==='Telefon Pikett').description='Eigene Pikettnummer';const next=prepareMunicipalImport(first,parsed,input).state;
 assert.equal(next.people.find(p=>p.employee_id===person.employee_id).contacts[0].description,'Persönlicher Hinweis');assert.equal(next.offices.find(o=>o.id===office.id).contacts.find(c=>c.type==='Telefon Pikett').description,'Eigene Pikettnummer');
});
