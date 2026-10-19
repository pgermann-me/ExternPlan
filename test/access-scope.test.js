import test from 'node:test';
import assert from 'node:assert/strict';
import {accessPolicy,scopedState,validateAccessScope,assertScopedMutation,scopedPersonInput,scopedFavoriteOrder} from '../access-scope.js';
const fixture=()=>({departments:[{id:'A',name:'A'},{id:'B',name:'B'}],groups:[{id:'GA',department_id:'A',geo_ids:['N']},{id:'GB',department_id:'B',geo_ids:['S']}],regions:[{id:'N'},{id:'S'},{id:'ALL'}],functions:[{id:'F',geo_ids:['N','S','ALL'],covers:{ALL:['N','S']}},{id:'FB',department_ids:['B'],geo_ids:['S'],covers:{}}],people:[{employee_id:'idle',department_id:'A',group_ids:['GA']},{employee_id:'shared',department_id:'B',group_ids:['GA','GB']},{employee_id:'other',department_id:'B',group_ids:['GB']}],assignments:[{assignment_id:'n',employee_id:'shared',function_id:'F',geodependency:'N'},{assignment_id:'s',employee_id:'other',function_id:'FB',geodependency:'S'},{assignment_id:'whole',employee_id:'shared',function_id:'F',geodependency:'ALL'}],favorites:[{id:'fn',scope_type:'function',function_id:'F',region_ids:['N']},{id:'fs',scope_type:'function',function_id:'FB',region_ids:['S']},{id:'fmix',scope_type:'function',function_id:'F',region_ids:['N','S']}],rules:[{function_id:'F',geo_id:null},{function_id:'FB',geo_id:'S'}],assignment_styles:{n:{color:'#123456',favorite_id:'fn'},s:{color:'#abcdef'}},audit:[],outbox:[],exports:[],els:{},planning_undo:[]});
const account=access_scope=>({role:'planner',access_scope});
test('Alle ist uneingeschränkt, Admin ignoriert Begrenzungen; konfigurierte Dimensionen gelten gemeinsam',()=>{
 const s=fixture();assert.equal(scopedState(s,account({})),s);assert.equal(scopedState(s,{role:'admin',access_scope:{department_id:'A'}}),s);
 const p=accessPolicy(s,account({department_id:'A',group_id:'GA',region_id:'N'}));assert.equal(p.personAllowed(s.people[0]),true);assert.equal(p.personAllowed(s.people[1]),true);assert.equal(p.personAllowed(s.people[2]),false);
 assert.throws(()=>validateAccessScope(s,{department_id:'A',group_id:'GB'},'user'));assert.throws(()=>validateAccessScope(s,{group_id:'GA',region_id:'S'},'user'));assert.throws(()=>validateAccessScope(s,{region_id:'unknown'},'user'));
});
test('Scoped state contains idle members, removes foreign memberships, services, metadata and private history',()=>{
 const s=fixture(),out=scopedState(s,account({department_id:'A',group_id:'GA',region_id:'N'}));
 assert.deepEqual(out.people.map(p=>p.employee_id),['idle','shared']);assert.deepEqual(out.people[1].group_ids,['GA']);assert.equal(out.people[1].department_id,null);
 assert.deepEqual(out.departments.map(x=>x.id),['A']);assert.deepEqual(out.groups.map(x=>x.id),['GA']);assert.deepEqual(out.regions.map(x=>x.id),['N']);assert.deepEqual(out.functions.map(x=>x.id),['F']);assert.deepEqual(out.functions[0].geo_ids,['N']);assert.deepEqual(out.favorites.map(x=>x.id),['fn']);assert.equal(out.rules.length,1);assert.equal(out.assignment_styles.s,undefined);assert.equal(out.assignment_styles.n.favorite_id,undefined);
 assert.deepEqual(s.people[1].group_ids,['GA','GB']);
});
test('Parent-region coverage remains visible in the authorized region but cannot be modified',()=>{
 const s=fixture(),u=account({region_id:'N'}),out=scopedState(s,u),a=out.assignments.find(a=>a.assignment_id==='whole');
 assert.equal(a.geodependency,'N');assert.equal(a.access_read_only,true);assert.equal(accessPolicy(s,u).assignmentAllowed(s.assignments[2]),false);
 const after=structuredClone(s);after.assignments[2].revision=2;assert.throws(()=>assertScopedMutation(s,after,u),{status:403});
});
test('Atomic checks reject foreign changes and undo while allowing authorized services',()=>{
 const s=fixture(),u=account({group_id:'GA',region_id:'N'}),after=structuredClone(s);after.assignments[0].revision=2;assert.doesNotThrow(()=>assertScopedMutation(s,after,u));after.assignments.splice(1,1);assert.throws(()=>assertScopedMutation(s,after,u),{status:403});
 const moved=structuredClone(s);moved.assignments[0].employee_id='other';assert.throws(()=>assertScopedMutation(s,moved,u),{status:403});
});
test('Editing a shared person preserves invisible group memberships and rejects assigning foreign groups',()=>{
 const s=fixture(),u=account({group_id:'GA'}),before=s.people[1];
 const input=scopedPersonInput(s,u,{group_ids:['GA'],department_id:null},before);assert.deepEqual(input.group_ids,['GA','GB']);assert.equal(input.department_id,'B');
 assert.throws(()=>scopedPersonInput(s,u,{group_ids:['GB']},before),{status:403});assert.throws(()=>scopedPersonInput(s,u,{group_ids:['GA']},s.people[2]),{status:403});
});
test('Reordering a scoped list keeps hidden favorites in their original positions',()=>{
 const s=fixture();s.favorites.push({...s.favorites[0],id:'fn2'});const order=scopedFavoriteOrder(s,account({region_id:'N'}),['fn2','fn'],['fn','fn2']);assert.deepEqual(order.ids,['fn2','fs','fmix','fn']);assert.throws(()=>scopedFavoriteOrder(s,account({region_id:'N'}),['fs'],['fs']),{status:403});
});

test('Functions with no authorized regional target never become independent duties',()=>{
 const s=fixture();assert.equal(scopedState(s,account({group_id:'GA'})).assignments.find(a=>a.assignment_id==='whole').geodependency,'N');s.functions.push({id:'south-only',geo_ids:['S'],covers:{}});const out=scopedState(s,account({group_id:'GA'}));assert(!out.functions.some(f=>f.id==='south-only'));
 assert.equal(accessPolicy(s,account({group_id:'GA'})).personDeletable(s.people[1]),false);
});

test('Multiple departments, groups and regions are alternatives within each dimension',()=>{
 const s=fixture(),u=account({department_ids:['A','B'],group_ids:['GA','GB'],region_ids:['N','S']});
 const out=scopedState(s,u);assert.deepEqual(out.people.map(p=>p.employee_id),['idle','shared','other']);assert.deepEqual(out.regions.map(r=>r.id),['N','S']);assert.deepEqual(out.groups.map(g=>g.id),['GA','GB']);
 assert.equal(accessPolicy(s,u).assignmentAllowed(s.assignments[0]),true);assert.equal(accessPolicy(s,u).assignmentAllowed(s.assignments[1]),true);assert.equal(accessPolicy(s,u).assignmentAllowed(s.assignments[2]),false);
 assert.deepEqual(validateAccessScope(s,u.access_scope,'planner'),u.access_scope);
 const narrow=scopedState(s,account({department_ids:['A'],region_ids:['N','S']}));assert(!narrow.people.some(p=>p.employee_id==='other'));
 assert.throws(()=>validateAccessScope(s,{department_ids:['A'],group_ids:['GA','GB']},'user'));
 assert.throws(()=>validateAccessScope(s,{region_ids:['N','N']},'user'));
 assert.throws(()=>validateAccessScope(s,{department_ids:'A'},'user'));
 assert.deepEqual(validateAccessScope(s,{department_id:'A',group_id:'GA',region_id:'N'},'planner'),{department_ids:['A'],group_ids:['GA'],region_ids:['N']});
});
test('Function and region must match the same authorized organizational context',()=>{
 const s=fixture();s.regions[0].department_ids=['B'];s.functions[0].department_ids=['A'];
 const out=scopedState(s,account({department_ids:['A','B'],region_ids:['N']}));assert(!out.functions.some(f=>f.id==='F'));
});
