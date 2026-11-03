import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusyTracker,withBusy} from '../public/busy.js';
function clock(){
 let now=0,next=0;const timers=new Map(),events=[];
 const start=createBusyTracker({show:()=>events.push('show'),hide:()=>events.push('hide'),setTimer:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimer:id=>timers.delete(id)});
 const advance=ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
 return {start,events,advance,timers};
}
test('Busy indicator waits one second and never flashes for completed operations',()=>{
 const c=clock(),finish=c.start();c.advance(999);assert.deepEqual(c.events,[]);finish();c.advance(1000);assert.deepEqual(c.events,[]);assert.equal(c.timers.size,0);
 const done=c.start();c.advance(1000);assert.deepEqual(c.events,['show']);done();done();assert.deepEqual(c.events,['show','hide']);
});
test('Concurrent operations have independent delays and finish without stale timers',()=>{
 const c=clock(),first=c.start();c.advance(700);const second=c.start();c.advance(300);assert.deepEqual(c.events,['show']);first();assert.deepEqual(c.events,['show','hide']);c.advance(700);assert.deepEqual(c.events,['show','hide','show']);second();assert.deepEqual(c.events,['show','hide','show','hide']);assert.equal(c.timers.size,0);
 const outer=c.start(),inner=c.start();c.advance(1000);inner();assert.equal(c.events.at(-1),'show');outer();assert.equal(c.events.at(-1),'hide');
});
test('Busy wrapper preserves values and errors, including nested operations',async()=>{
 assert.equal(await withBusy(()=>withBusy(async()=>42)),42);
 await assert.rejects(withBusy(()=>{throw Error('synchronous failure');}),/synchronous failure/);
 await assert.rejects(withBusy(async()=>{throw Error('asynchronous failure');}),/asynchronous failure/);
});
