import test from 'node:test';
import assert from 'node:assert/strict';
import {auditEntryDetails,auditText} from '../public/audit-text.js';
test('Textprotokoll gibt Schweizer Zeiten, Umlaute und verschachtelte Werte lesbar und vollständig aus',()=>{
 const entry={at:'2026-10-18T22:30:00Z',entity:'person',action:'create',actor:'local',before:null,after:{name:'Anna Müller',start_on:'2026-10-19T05:00:00Z',contacts:[{type:'phone_mobile',value:'+41790000000',priority:0}],active:false}};
 const text=auditText([entry]);assert.match(text,/19\.10\.2026 00:30 · Person · Angelegt · local/);assert.match(text,/Vorher:\n  Keine Angaben/);assert.match(text,/Name: Anna Müller/);assert.match(text,/Beginn: 19\.10\.2026 07:00/);assert.match(text,/Kontaktdaten:\n    1\./);assert.match(text,/Priorität: 0/);assert.match(text,/Zugang aktiv: Nein/);assert.equal(text.includes('"name"'),false);assert.equal(auditEntryDetails(entry).includes('2026-10-19T05:00'),false);
});
test('Leeres Protokoll und leere Werte ergeben eine verständliche Textdatei',()=>{
 assert.match(auditText([]),/Noch keine Änderungen/);assert.match(auditEntryDetails({before:{contacts:[]},after:{}}),/Keine Einträge/);assert.match(auditEntryDetails({before:{contacts:[]},after:{}}),/Nachher:\n  Keine Angaben/);
});
