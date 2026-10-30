import test from 'node:test';
import assert from 'node:assert/strict';
import {createReverseGeocoder,coordinateKey,addressResult} from '../reverse-geocoding.js';
import {permitted} from '../accounts.js';
const response=()=>({ok:true,status:200,json:async()=>({address:{road:'Testweg',house_number:'7',postcode:'9000',city:'St. Gallen'}})});
test('Coordinates are validated before any request; addresses and place fallbacks are formatted',()=>{
 assert.deepEqual(coordinateKey('47.12345678','9.12345678'),['47.123457','9.123457']);
 for(const [lat,lng] of [['',9],['x',9],[91,9],[47,181],[null,9],[['47'],9]])assert.throws(()=>coordinateKey(lat,lng),{status:400});
 assert.equal(addressResult({address:{road:'Testweg',house_number:'7',postcode:'9000',city:'St. Gallen'}},47,9).label,'Testweg 7, 9000 St. Gallen');assert.equal(addressResult({address:{village:'Testdorf'}},47,9).kind,'place');assert.equal(addressResult({display_name:'Berggebiet'},47,9).label,'Berggebiet');assert.equal(addressResult(null,47,9).label,null);
 for(const role of ['admin','planner','user'])assert.equal(permitted(role,'GET','/api/reverse-address'),true);
});
test('Repeated coordinates coalesce/cache; provider calls are serialized, identified and rate limited',async()=>{
 let clock=0,calls=[];const lookup=createReverseGeocoder({now:()=>clock,wait:async ms=>{clock+=ms;},fetchImpl:async(url,options)=>{calls.push({at:clock,url,options});return response();}});
 const [a,b]=await Promise.all([lookup(47.1,9.1),lookup('47.100000','9.100000')]);assert.deepEqual(a,b);assert.equal(calls.length,1);await lookup(47.2,9.2);await lookup(47.1,9.1);assert.equal(calls.length,2);assert.ok(calls[1].at-calls[0].at>=1000);assert.equal(calls[0].url.origin,'https://nominatim.openstreetmap.org');assert.equal(calls[0].url.searchParams.get('lat'),'47.100000');assert.equal(calls[0].url.searchParams.get('accept-language'),'de-CH,de');assert.match(calls[0].options.headers['User-Agent'],/ExternPlan/);assert.equal(calls[0].options.redirect,'error');assert.ok(!JSON.stringify(calls[0]).includes('employee_id'));
});
test('Cache is bounded and expires; failures do not stop later requests and unknown addresses are cached',async()=>{
 let clock=0,count=0,mode='ok';const lookup=createReverseGeocoder({now:()=>clock,wait:async ms=>{clock+=ms;},ttl:10000,maxCache:1,fetchImpl:async()=>{count++;if(mode==='error')throw Error('private internal details');if(mode==='none')return {ok:false,status:404};return response();}});
 await lookup(47,9);await lookup(48,9);await lookup(47,9);assert.equal(count,3);clock+=11000;await lookup(47,9);assert.equal(count,4);
 mode='error';await assert.rejects(lookup(49,9),error=>error.status===503&&!error.message.includes('private'));mode='none';assert.equal((await lookup(49,9)).label,null);await lookup(49,9);assert.equal(count,6);
});
test('Excess concurrent points are rejected without making extra provider requests',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const lookup=createReverseGeocoder({maxQueue:1,fetchImpl:async()=>{await gate;return response();}});const first=lookup(47,9);await assert.rejects(lookup(48,9),{status:429});release();await first;assert.throws(()=>createReverseGeocoder({endpoint:'http://example.test/reverse'}),/HTTPS/);
});
