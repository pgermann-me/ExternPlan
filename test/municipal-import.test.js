import test from 'node:test';
import assert from 'node:assert/strict';
import {municipalFile,seedMunicipalFunctions} from '../scripts/fixtures/municipal.js';
import {parseMunicipalFiles,municipalPreview,prepareMunicipalImport,municipalToken} from '../municipal-import.js';
import {emptyState} from '../data-cleanup.js';
import {saveOffice} from '../offices.js';
import {onCallPersonExample} from '../adapters/oncall-person.js';
import {onCallOrganisationExample} from '../adapters/oncall-organisation.js';
import {withRegionGroups} from '../public/region-groups.js';
import {permitted} from '../accounts.js';
const state=()=>{const s=seedMunicipalFunctions(emptyState());s.regions=[{id:'T',name:'Testdorf'}];return s;};
const request=p=>({documents:p.documents.map(d=>({...structuredClone(d),region_id:'T'}))});
test('Gemeindelisten parse data rows, normalized contacts, companies, deputies and excluded mutations',async()=>{
 const parsed=await parseMunicipalFiles([await municipalFile()],Date.parse('2026-11-02T12:00Z')),rows=parsed.documents[0].rows;
 assert.equal(rows.length,9);assert.equal(rows.filter(r=>r.include).length,7);assert.deepEqual(rows.filter(r=>r.function_name==='Gemeindepräsident').map(r=>r.priority),[1,2]);assert.deepEqual(rows.filter(r=>r.function_name==='Gemeindepräsident Stv').map(r=>r.priority),[1,2]);assert.equal(rows.filter(r=>r.function_name==='Schulpräsident').length,1);assert.ok(rows.every(r=>r.row<16));assert.equal(rows[0].contacts[0].value,'+41791112233');assert.equal(rows.find(r=>r.row===10).person_kind,'office');assert.ok(!rows.find(r=>r.row===13).include);assert.ok(!rows.find(r=>r.row===15).include);
 assert.equal(municipalPreview(state(),parsed).documents[0].region_id,'T');
 await assert.rejects(()=>parseMunicipalFiles([awaitPromiseInvalid()]),/XLSX/);
});
function awaitPromiseInvalid(){return {name:'bad.xml',content:'bad'};}
test('Gemeinde-Import prepares a consistent reusable model without modifying input or planning duties',async()=>{
 const p=await parseMunicipalFiles([await municipalFile()],Date.parse('2026-11-02T12:00Z')),s=state(),before=structuredClone(s),input=request(p),r=prepareMunicipalImport(s,p,input),n=r.state;
 assert.deepEqual(s,before);assert.equal(r.summary.created_people,4);assert.equal(r.summary.affiliations,7);assert.equal(n.assignments.length,0);assert.equal(n.outbox.length,0);assert.equal(n.favorites?.length||0,0);assert.ok(n.functions.every(f=>f.duty_time_model==='always'&&f.region_assignment_mode==='groups'));assert.ok(withRegionGroups(n).functions.filter(f=>r.summary.functions.includes(f.name)).every(f=>f.geo_ids.includes('T')));assert.deepEqual(r.summary.created_functions,[]);
 const person=n.people.find(p=>p.name==='Anna Muster'),company=n.offices.find(p=>p.name==='Beispiel AG');assert.equal(person.function_regions.length,2);assert.ok(!n.people.some(p=>p.name==='Beispiel AG'));assert.ok(company.parent_office_id);assert.equal(r.summary.created_offices,2);assert.ok(person.function_regions.every(r=>n.offices.some(o=>o.id===r.office_id)));assert.equal(company.contacts.find(c=>c.type==='Telefon Pikett').priority,1);assert.equal(n.people.filter(p=>p.deleted_at).length,0);
 person.contacts.push({type:'email',value:'manual@example.invalid',priority:2});const repeated=prepareMunicipalImport(n,p,input);assert.equal(repeated.summary.created_people,0);assert.equal(repeated.state.people.length,n.people.length);assert.equal(repeated.state.functions.length,n.functions.length);assert.ok(repeated.state.people.find(p=>p.employee_id===person.employee_id).contacts.some(c=>c.value==='manual@example.invalid'));
 const changed=structuredClone(input);changed.documents[0].rows[0].phones[3]='079 888 99 00';const updated=prepareMunicipalImport(repeated.state,p,changed);const a=updated.state.people.find(p=>p.employee_id===person.employee_id);assert.ok(a.contacts.some(c=>c.value==='+41798889900'));assert.ok(a.contacts.some(c=>c.value==='+41791112233'));assert.equal(a.function_regions.length,2);
});
test('Invalid mappings, changed review state and protected function conflicts never mutate original data',async()=>{
 const p=await parseMunicipalFiles([await municipalFile()]),s=state(),input=request(p),before=structuredClone(s);const token=municipalToken(s,p,input);assert.throws(()=>prepareMunicipalImport(s,p,{...input,documents:input.documents.map(d=>({...d,region_id:'missing'}))}),/Gemeindegebiet/);assert.deepEqual(s,before);
 const bad=structuredClone(input);bad.documents[0].rows[0].phones[3]='falsch';assert.throws(()=>prepareMunicipalImport(s,p,bad),/Telefonnummer/);assert.deepEqual(s,before);assert.notEqual(municipalToken(s,p,bad),token);
 s.functions.find(f=>f.name==='Gemeindepräsident').duty_time_model='scheduled';const conflict=structuredClone(s);assert.throws(()=>prepareMunicipalImport(s,p,input),/Zeitprofil Geplant/);assert.deepEqual(s,conflict);assert.notEqual(municipalToken(s,p,input),token);
 await assert.rejects(async()=>parseMunicipalFiles([await municipalFile('Stadt St. Gallen')]),/ausgeschlossen/);
});
test('Stellen remain separate from people, have their own export identifiers and protect their hierarchy',async()=>{
 const parsed=await parseMunicipalFiles([await municipalFile()]),s=prepareMunicipalImport(state(),parsed,request(parsed)).state;
 const org=s.offices.find(o=>o.name==='Beispiel AG'),root=s.offices.find(o=>!o.parent_office_id);
 saveOffice(s,{id:root.id,els_org_id:'ELS-ROOT'});const persons=onCallPersonExample(s);assert.equal(persons.payload.length,4);assert.ok(persons.payload.every(p=>p.department==='ELS-ROOT'));
 const organisations=onCallOrganisationExample(s);assert.ok(organisations.payload.some(o=>o.orgID==='ELS-ROOT'));assert.equal(organisations.payload.find(o=>o.orgID===org.id).organisation,'ELS-ROOT');assert.ok(organisations.payload.find(o=>o.orgID===org.id).contacts.some(c=>c.type==='Phone'&&c.description==='Pikettnummer 24h'));
 const before=structuredClone(s);assert.throws(()=>saveOffice(s,{id:root.id,parent_office_id:org.id}),/Kreis/);assert.deepEqual(s,before);assert.throws(()=>saveOffice(s,{id:org.id,els_org_id:'ELS-ROOT'}),/vergeben/);assert.deepEqual(s,before);
 for(const role of ['planner','user'])for(const action of ['preview','commit'])assert.equal(permitted(role,'POST','/api/import/municipal/'+action),false);
});
test('Stellen and their identifiers follow access restrictions; hidden references survive permitted person edits',async()=>{
 const {scopedState,scopedPersonInput}=await import('../access-scope.js');
 const parsed=await parseMunicipalFiles([await municipalFile('Testdorf'),await municipalFile('Testwil')]),s=state();s.regions.push({id:'W',name:'Testwil'});const input={documents:parsed.documents.map((d,i)=>({...d,region_id:i?'W':'T'}))},n=prepareMunicipalImport(s,parsed,input).state;
 const visibleOffice=n.offices.find(o=>o.region_id==='T'&&!o.parent_office_id),hiddenOffice=n.offices.find(o=>o.region_id==='W'&&!o.parent_office_id),person=n.people.find(p=>p.function_regions.some(r=>r.office_id===visibleOffice.id));
 person.group_ids.push(hiddenOffice.group_id);person.function_regions.push({...person.function_regions[0],geo_id:'W',office_id:hiddenOffice.id});person.els_office_id=hiddenOffice.id;n.office_exports=[{payload:'private'}];
 const user={role:'planner',access_scope:{group_ids:[visibleOffice.group_id],region_ids:['T']}},view=scopedState(n,user),projected=view.people.find(p=>p.employee_id===person.employee_id);
 assert.ok(view.offices.every(o=>o.region_id==='T'&&o.municipal_sources===undefined&&o.function_regions.every(r=>view.functions.some(f=>f.id===r.function_id))));assert.ok(!JSON.stringify(view).includes(hiddenOffice.id));assert.equal(projected.els_office_id,null);assert.deepEqual(view.office_exports,[]);
 const edit=scopedPersonInput(n,user,{department_id:person.department_id,group_ids:[visibleOffice.group_id],function_regions:projected.function_regions},person);assert.equal(edit.els_office_id,hiddenOffice.id);assert.ok(edit.function_regions.some(r=>r.office_id===hiddenOffice.id));
 assert.throws(()=>scopedPersonInput(n,user,{group_ids:[visibleOffice.group_id],function_regions:[{...projected.function_regions[0],office_id:hiddenOffice.id}]},person),/Berechtigung/);
});
test('A Stelle with a permanent responsibility appears at its region point without inventing a person',async()=>{
 const {regionFixture}=await import('../scripts/fixtures/pikett-region.js'),{pikettByRegion}=await import('../public/pikett-region-data.js');const {state:s,mapData}=regionFixture(),parsed=await parseMunicipalFiles([await municipalFile()]);
 seedMunicipalFunctions(s);const n=prepareMunicipalImport(s,parsed,{documents:parsed.documents.map(d=>({...d,region_id:'R1'}))}).state;
 const result=pikettByRegion(n,mapData,'2026-10-22T12:00+02:00',47.3,9.2),office=result.rows.find(r=>r.kind==='office');assert.equal(office.person_name,'Beispiel AG');assert.ok(office.office_id);assert.equal(office.employee_id,undefined);assert.ok(office.contacts.some(c=>c.includes('+41711112233')));assert.ok(!n.people.some(p=>p.name==='Beispiel AG'));
 for(const role of ['user','planner'])for(const path of ['/api/offices/X','/api/oncall/organisation-exports'])assert.equal(permitted(role,path.includes('offices')?'PUT':'POST',path),false);
});
test('Priority changes and replacements retain the Stelle; bulk changes cannot orphan a linked person',async()=>{
 const {changeAlwaysAffiliation}=await import('../always-planning.js'),{bulkPeopleOrganization,personOrganizationSnapshot}=await import('../people-bulk.js');
 const parsed=await parseMunicipalFiles([await municipalFile()]),s=prepareMunicipalImport(state(),parsed,request(parsed)).state,source=s.people.find(p=>p.name==='Anna Muster'),target=s.people.find(p=>p.name==='Berta Andere'),fn=s.functions.find(f=>f.name==='Gemeindepräsident'),office_id=source.function_regions[0].office_id,admin={role:'admin'};
 changeAlwaysAffiliation(s,{action:'update',employee_id:source.employee_id,function_id:fn.id,geo_id:'T',expected_priority:1,priority:3},admin);assert.equal(s.people.find(p=>p.employee_id===source.employee_id).function_regions.find(r=>r.function_id===fn.id).office_id,office_id);
 changeAlwaysAffiliation(s,{action:'replace',employee_id:source.employee_id,replacement_employee_id:target.employee_id,function_id:fn.id,geo_id:'T',expected_priority:3},admin);assert.equal(s.people.find(p=>p.employee_id===target.employee_id).function_regions.find(r=>r.function_id===fn.id).office_id,office_id);
 const before=structuredClone(s);assert.throws(()=>bulkPeopleOrganization(s,{expected:[personOrganizationSnapshot(target)],groups:{mode:'clear'}},admin),/Gemeindegruppe/);assert.deepEqual(s,before);
});
test('Custom source functions must be mapped or excluded; no new master functions are created',async()=>{
 const p=await parseMunicipalFiles([await municipalFile('Testdorf',{unknown_role:true})]),s=state(),input=request(p),before=structuredClone(s),row=input.documents[0].rows.find(r=>r.function_name==='Erfundene Gemeindefunktion');
 assert.throws(()=>prepareMunicipalImport(s,p,input),/vorhandenen Funktion.*ausschliessen/);assert.deepEqual(s,before);row.include=false;const skipped=prepareMunicipalImport(s,p,input);assert.equal(skipped.summary.skipped,3);assert.deepEqual(skipped.state.functions,s.functions);assert.deepEqual(skipped.summary.created_functions,[]);
 row.include=true;row.function_id=s.functions.find(f=>f.name==='Schulpräsident').id;row.priority=2;const mapped=prepareMunicipalImport(s,p,input);assert.deepEqual(mapped.state.functions,s.functions);const anna=mapped.state.people.find(p=>p.name==='Anna Muster');assert.ok(anna.function_regions.some(r=>r.function_id===row.function_id&&r.priority===2));assert.ok(!mapped.state.functions.some(f=>f.name==='Erfundene Gemeindefunktion'));
 const school=row.function_id;row.function_id=s.functions.find(f=>f.name==='Tierschutzbeauftragte').id;const changed=prepareMunicipalImport(mapped.state,p,input);const updated=changed.state.people.find(p=>p.employee_id===anna.employee_id);assert.ok(updated.function_regions.some(r=>r.function_id===row.function_id));assert.ok(!updated.function_regions.some(r=>r.function_id===school));assert.ok(changed.state.people.find(p=>p.name==='Clara Weitere').function_regions.some(r=>r.function_id===school));
 row.function_id='missing';assert.throws(()=>prepareMunicipalImport(s,p,input),/vorhandenen Funktion/);assert.deepEqual(s,before);
});
test('Mapped duplicate responsibilities keep the highest priority and reject conflicting Stellen',async()=>{
 const p=await parseMunicipalFiles([await municipalFile()]),s=state(),input=request(p),row=input.documents[0].rows.find(r=>r.function_name==='Tierschutzbeauftragte');row.function_id=s.functions.find(f=>f.name==='Gemeindepräsident').id;row.priority=3;
 const result=prepareMunicipalImport(s,p,input),anna=result.state.people.find(p=>p.name==='Anna Muster');assert.equal(anna.function_regions.length,1);assert.equal(anna.function_regions[0].priority,1);assert.equal(result.summary.affiliations,6);
 row.office_name='Andere Stelle';const before=structuredClone(s);assert.throws(()=>prepareMunicipalImport(s,p,input),/unterschiedlichen Stellen/);assert.deepEqual(s,before);
});
test('Deleted functions cannot be chosen, while archived office references do not block contact edits or remapping',async()=>{
 const parsed=await parseMunicipalFiles([await municipalFile()]),input=request(parsed),n=prepareMunicipalImport(state(),parsed,input).state,office=n.offices.find(o=>o.name==='Beispiel AG'),old=n.functions.find(f=>f.name==='Bestattungsdienst'),target=n.functions.find(f=>f.name==='Gemeindehaus');old.deleted_at='2026-11-02';
 saveOffice(n,{id:office.id,contacts:office.contacts.map(c=>({...c,description:'Eigener Hinweis'}))});assert.equal(n.offices.find(o=>o.id===office.id).contacts[0].description,'Eigener Hinweis');
 const row=input.documents[0].rows.find(r=>r.function_name==='Bestattungsdienst');row.function_id=old.id;assert.throws(()=>prepareMunicipalImport(n,parsed,input),/vorhandenen Funktion/);row.function_id=target.id;const updated=prepareMunicipalImport(n,parsed,input).state.offices.find(o=>o.id===office.id);assert.ok(updated.function_regions.some(r=>r.function_id===target.id));assert.ok(!updated.function_regions.some(r=>r.function_id===old.id));assert.equal(updated.contacts[0].description,'Eigener Hinweis');
});
test('Stellen can retain their contact data without inventing a function or a person',async()=>{
 const parsed=await parseMunicipalFiles([await municipalFile()]),s=emptyState();s.regions=[{id:'T',name:'Testdorf'}];const input=request(parsed);for(const row of input.documents[0].rows){row.include=row.person_kind==='office';row.office_only=row.person_kind==='office';}
 const result=prepareMunicipalImport(s,parsed,input);assert.equal(result.state.people.length,0);assert.equal(result.state.functions.length,0);assert.equal(result.summary.affiliations,0);assert.equal(result.summary.office_only_rows,1);assert.equal(result.state.offices.length,2);const office=result.state.offices.find(o=>o.name==='Beispiel AG');assert.ok(office.contacts.length>0);assert.deepEqual(office.function_regions,[]);
 const full=prepareMunicipalImport(state(),parsed,request(parsed)).state,updated=request(parsed),row=updated.documents[0].rows.find(r=>r.person_kind==='office');row.office_only=true;const without=prepareMunicipalImport(full,parsed,updated).state.offices.find(o=>o.id===full.offices.find(o=>o.name==='Beispiel AG').id);assert.deepEqual(without.function_regions,[]);assert.ok(without.contacts.length>0);
 const invalid=request(parsed);invalid.documents[0].rows.find(r=>r.include&&r.person_kind==='person').office_only=true;assert.throws(()=>prepareMunicipalImport(state(),parsed,invalid),/Nur Stellen/);
});
