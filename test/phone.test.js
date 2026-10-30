import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePhone,normalizePersonContacts} from '../public/phone.js';
import {manualPerson} from '../people.js';
test('Swiss phone variants normalize to a stable international number',()=>{
 for(const value of ['079 578 68 88','+41 (79) 578 68 88','079-578-68-88','079.578.68.88','079/578 68 88','  +41795786888  ','0041 79 578 68 88','+41 (0)79 578 68 88','+41 079 578 68 88','795786888','41795786888','079\u00a0578\u00a068\u00a088','079–578–68–88'])assert.equal(normalizePhone(value),'+41795786888');
 assert.equal(normalizePhone('071 222 33 44'),'+41712223344');assert.equal(normalizePhone(normalizePhone('079 578 68 88')),'+41795786888');
});
test('Foreign country codes are preserved and invalid numbers are rejected',()=>{
 assert.equal(normalizePhone('+49 (0)30 1234 5678'),'+493012345678');assert.equal(normalizePhone('0043 664 1234567'),'+436641234567');
 for(const value of ['',null,795786888,'079578','079 578 68 88 ext 3','+41 79 578 68 888','+41 00 000 00 00','+41+795786888','1234567890123456','+1234567890123456'])assert.throws(()=>normalizePhone(value));
});
test('Create and edit normalize all telephone fields, keeping other contacts and metadata',()=>{
 const contacts=[{type:'phone_mobile',value:'079 578 68 88',priority:2},{type:'phone_business',value:'071-222-33-44'},{type:'phone_private',value:'+41 (44) 555 66 77'},{type:'email',value:'test@example.test',priority:1},{type:'Polycom',value:'26120000',priority:3}];
 const p=manualPerson({first_name:'Anna',last_name:'Muster',contacts},null,'P');assert.deepEqual(p.contacts.map(c=>c.value),['+41795786888','+41712223344','+41445556677','test@example.test','26120000']);assert.equal(p.contacts[0].priority,2);assert.equal(contacts[0].value,'079 578 68 88');
 const updated=manualPerson({contacts:[{type:'Telefon Mobil',value:'078 111 22 33',priority:4}]},p);assert.equal(updated.contacts[0].value,'+41781112233');assert.equal(updated.employee_id,'P');
 assert.throws(()=>manualPerson({contacts:[{type:'phone_mobile',value:'not a number'}]},p));
});
test('Unchanged legacy phone text survives editing while numeric legacy numbers normalize',()=>{
 const previous=[{type:'Telefon',value:'Historischer Kontakt',priority:3},{type:'phone_business',value:'071 222 33 44',priority:0}];
 const result=normalizePersonContacts(previous,previous);assert.deepEqual(result[0],previous[0]);assert.equal(result[1].value,'+41712223344');assert.throws(()=>normalizePersonContacts([{...previous[0],value:'Anderer ungültiger Text'}],previous));
});
