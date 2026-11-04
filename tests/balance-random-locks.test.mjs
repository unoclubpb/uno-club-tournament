import test from 'node:test';
import assert from 'node:assert/strict';
import {planTableSeating,execute,initialState} from '../src/domain.mjs';

function fixture(lockedSeats=[]){
 const entries=Array.from({length:10},(_,i)=>({id:'e'+(i+1),playerId:'p'+(i+1),table:i<9?1:null,seat:i<9?i+1:null,seatLocked:lockedSeats.includes(i+1),payments:[],eliminatedAt:null}));
 return {id:'tour',status:'pending',settings:{seatsPerTable:9},entries};
}
function balanced(t,updates){
 const byId=new Map(updates.map(x=>[x.entryId,x]));
 const placed=t.entries.map(e=>({...e,...byId.get(e.id)}));
 assert.equal(placed.filter(e=>e.table===1).length,5);
 assert.equal(placed.filter(e=>e.table===2).length,5);
 assert.equal(new Set(placed.map(e=>e.table+'/'+e.seat)).size,10);
 assert.equal(placed.filter(e=>!e.table).length,0);
 return placed;
}
test('9 + 1 seats the unseated player and randomly chooses four seated players, not the highest four seats',()=>{
 const t=fixture();
 const order=['e1','e3','e5','e7','e2','e4','e6','e8','e9','e10'];
 const moves=planTableSeating(t,{mode:'combine',order});
 const moved= moves.filter(x=>x.entryId!=='e10').map(x=>x.entryId).sort();
 assert.deepEqual(moved,['e1','e3','e5','e7']);
 assert(moves.some(x=>x.entryId==='e10'&&x.table===2));
 balanced(t,moves);
});
test('locked players stay at the exact seats by default',()=>{
 const t=fixture([1,3,7]);
 const moves=planTableSeating(t,{mode:'combine',order:t.entries.map(e=>e.id)});
 assert(!moves.some(x=>['e1','e3','e7'].includes(x.entryId)));
 const after=balanced(t,moves);
 for(const seat of [1,3,7])assert(after.some(e=>e.id==='e'+seat&&e.table===1&&e.seat===seat));
});
test('unchecking lock protection allows locked players to move',()=>{
 const t=fixture([1,2,3,4,5,6,7]);
 assert.throws(()=>planTableSeating(t,{mode:'combine'}),/Unlock a player/);
 const moves=planTableSeating(t,{mode:'combine',keepLocked:false,order:t.entries.map(e=>e.id)});
 assert(moves.some(x=>t.entries.find(e=>e.id===x.entryId)?.seatLocked));
 balanced(t,moves);
});
test('balancing is randomized even when a caller omits an order',()=>{
 const t=fixture(),sets=new Set();
 for(let i=0;i<15;i++)sets.add(planTableSeating(t,{mode:'combine'}).filter(x=>x.entryId!=='e10').map(x=>x.entryId).sort().join(','));
 assert(sets.size>1);
});
