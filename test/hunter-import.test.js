import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHunters,previewHunters,importHunters} from '../hunter-import.js';
import {manualPerson} from '../people.js';
import {personRegionPriority,controlFunctions} from '../public/organization.js';
const xml=(rev='12',extra='')=>`<?xml version="1.0"?><PERSONEN><PERSON><PERS_ID>00042</PERS_ID><NACHNAME>Muster &amp; Test</NACHNAME><VORNAME>Anna</VORNAME><STRASSE>Testweg</STRASSE><HAUSNR>3a</HAUSNR><PLZ>9000</PLZ><ORT>St. Gallen</ORT><GEBURTSDATUM>19.04.1972</GEBURTSDATUM><KOMMUNIKATIONEN><KOMMUNIKATION><TYP>NATEL</TYP><KOMM>+41790000000</KOMM></KOMMUNIKATION><KOMMUNIKATION><TYP>FESTNETZ</TYP><KOMM>0710000000</KOMM></KOMMUNIKATION></KOMMUNIKATIONEN><JAGDREVIERE><JAGDREVIER><REV_NUMMER>${rev}</REV_NUMMER><REV_PRIO>3</REV_PRIO><REV_NAME>Ignorieren</REV_NAME></JAGDREVIER>${extra}</JAGDREVIERE><GUELTIG_BIS>ignorieren</GUELTIG_BIS></PERSON></PERSONEN>`;
const state=()=>({people:[],functions:[],regions:[],departments:[],groups:[],assignments:[],audit:[]});
test('Jäger XML: Kennung, Geburtsdatum, Adresse, Telefonarten und Revierpriorität',()=>{
 const {people:[p]}=parseHunters(xml());assert.equal(p.employee_id,'00042');assert.equal(p.last_name,'Muster & Test');assert.equal(p.birth_date,'1972-04-19');assert.equal(p.business_address.streetNumber,'3a');assert.equal(p.business_address.zipCode,'9000');assert.deepEqual(p.regions,[{geo_id:'J012',priority:3}]);assert.deepEqual(p.contacts.map(c=>[c.type,c.priority]),[['phone_mobile',0],['phone_business',0]]);
});
test('Reviernummern 0/999 werden formatiert, über 999 nur Zuordnung übersprungen',()=>{
 assert.equal(parseHunters(xml('0')).people[0].regions[0].geo_id,'J000');assert.equal(parseHunters(xml('999')).people[0].regions[0].geo_id,'J999');const p=parseHunters(xml('1000'));assert.equal(p.people.length,1);assert.equal(p.people[0].regions.length,0);assert.equal(p.skipped_regions,1);
});
test('Vorschau ändert keine Daten; fehlende Gebiete erfordern Zustimmung',()=>{
 const s=state(),before=structuredClone(s),p=previewHunters(s,xml());assert.equal(p.created,1);assert.deepEqual(p.missing_regions,['J012']);assert.deepEqual(s,before);assert.throws(()=>importHunters(s,xml()),/Fehlende Gebiete/);assert.deepEqual(s,before);
 const result=importHunters(s,xml(),true);assert.equal(result.created,1);assert.equal(s.functions[0].name,'Jäger');assert.deepEqual(s.functions[0].geo_ids,['J012']);assert.equal(s.regions[0].name,'J012');assert.equal(s.people[0].source,'manual');assert.equal(s.assignments.length,0);assert.equal(personRegionPriority(s.people[0],s.functions[0].id,'J012'),3);assert.equal(personRegionPriority(s.people[0],s.functions[0].id,'ANDERS',2),2);
});
test('Wiederholter Import aktualisiert statt Duplikate und bewahrt fremde Zuordnungen',()=>{
 const s=state();importHunters(s,xml(),true);const p=s.people[0],fn=s.functions[0];p.group_ids=['G'];p.group_id='G';p.department_id='D';p.external_id='ALT';p.function_regions.push({function_id:'ANDERE',geo_id:'X',priority:2});p.contacts.push({type:'email',value:'test@example.invalid',priority:1});s.departments.push({id:'D'});s.groups.push({id:'G',department_id:'D'});
 const result=importHunters(s,xml().replace('Anna','Anne'),true);assert.equal(result.updated,1);assert.equal(s.people.length,1);assert.equal(s.functions.length,1);assert.equal(s.people[0].first_name,'Anne');assert.deepEqual(s.people[0].group_ids,['G']);assert.equal(s.people[0].external_id,'ALT');assert.equal(s.people[0].function_regions.length,2);assert.equal(s.people[0].contacts.length,3);assert.equal(controlFunctions(s,'G','D')[0].id,fn.id);
 const edit=manualPerson({first_name:'Anni',last_name:'Test'},s.people[0]);assert.equal(edit.birth_date,'1972-04-19');assert.deepEqual(edit.function_regions,s.people[0].function_regions);
});
test('Unsichere/ungültige XML, doppelte Kennungen, Daten und Prioritäten abweisen',()=>{
 for(const bad of ['<!DOCTYPE foo>'+xml(),xml().slice(0,-10),'<OTHER/>',xml().replace('19.04.1972','31.02.1972'),xml('abc'),xml().replace('<REV_PRIO>3','<REV_PRIO>0'),xml().replace('</PERSONEN>',xml().match(/<PERSON>.*<\/PERSON>/s)[0]+'</PERSONEN>')])assert.throws(()=>parseHunters(bad));
 const s=state();s.people.push({employee_id:'00042',source:'SAP'});assert.throws(()=>previewHunters(s,xml()),/reserviert/);s.people=[];s.regions.push({id:'J012',deleted_at:'2026-01-01'});assert.throws(()=>previewHunters(s,xml()),/reserviert/);
 assert.throws(()=>manualPerson({first_name:'A',last_name:'B',birth_date:'2026-02-30'},null,'P'),/Geburtsdatum/);
});

import {demo,instant} from '../domain.js';
import {saveFavorite,previewFavorite} from '../favorites.js';
import {permitted} from '../accounts.js';
test('Import nur für Admin; Favoriten nutzen Revierpriorität statt Standard',()=>{
 for(const role of ['user','planner'])for(const path of ['/api/import/hunters/preview','/api/import/hunters/commit'])assert.equal(permitted(role,'POST',path),false);
 const s=demo(),p=s.people.find(p=>p.employee_id==='DEMO-EXT-001');p.function_regions=[{function_id:'DEMO-KTD',geo_id:'NORD',priority:3}];
 const f=saveFavorite(s,{name:'Test',scope_type:'function',scope_id:'DEMO-KTD',function_id:'DEMO-KTD',region_ids:['NORD','SÜD'],duration_minutes:60,start_time:'07:00',priority:1});
 assert.deepEqual(previewFavorite(s,f.id,{employee_id:p.employee_id,date:'2026-10-14',revision:f.revision},instant('2026-10-14T00:00+02:00')).assignments.map(a=>a.priority),[3,1]);
});

import {accessPolicy} from '../access-scope.js';
import {masterReferences} from '../public/master-references.js';
test('Revierzuordnungen respektieren regionale Zugriffsrechte und erscheinen in Referenzen',()=>{
 const s=demo(),person=s.people.find(p=>p.employee_id==='DEMO-EXT-001');person.function_regions=[{function_id:'DEMO-KTD',geo_id:'NORD',priority:3},{function_id:'DEMO-KTD',geo_id:'SÜD',priority:2}];
 const policy=accessPolicy(s,{role:'planner',access_scope:{region_ids:['NORD']}});assert.equal(policy.personAllowed(person),true);assert.deepEqual(policy.projectPerson(person).function_regions,[person.function_regions[0]]);assert.equal(policy.personAllowed({...person,function_regions:[person.function_regions[1]]}),false);
 assert(masterReferences(s,'functions','DEMO-KTD').people.some(p=>p.id===person.employee_id));assert(masterReferences(s,'regions','NORD').people.some(p=>p.id===person.employee_id));
});
