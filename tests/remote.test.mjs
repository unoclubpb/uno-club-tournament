import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,execute,applyRemoteElimination,finalizePendingEliminations,planSeatMove,tableBalanceNeeded,icmProposal,clone} from '../src/domain.mjs';
const start=100000;
function fixture(n=6){let s=initialState();s=execute(s,{type:'tournament-create',id:'remote-test',name:'Remote test',templateId:s.templates[0].id},start);for(let i=1;i<=n;i++){s=execute(s,{type:'player-save',id:'r'+i,name:'Remote Player '+i},start);s=execute(s,{type:'register',id:'re'+i,tournamentId:'remote-test',playerId:'r'+i},start);}s.tournaments[0].entries.forEach((e,i)=>{e.table=i<3?1:2;e.seat=i%3+1;});return s;}
const command=(s,entryId,requestId,command,now)=>applyRemoteElimination(s,{tournamentId:'remote-test',entryId,requestId,command},now);
test('remote Undo at 4999 ms leaves the original seat, status, order and all finances unchanged',()=>{
 const seed=fixture(),pending=command(seed,'re4','a','start',start),t=pending.tournaments[0],e=t.entries[3];assert.equal(e.pendingElimination.expiresAt-start,5000);assert.equal(e.table,2);assert.equal(e.seat,1);assert.equal(e.eliminatedAt,null);assert.equal(e.place,null);assert.deepEqual(t.eliminationUndo,[]);assert.equal(tableBalanceNeeded(t),false);assert.deepEqual(finalizePendingEliminations(pending,start+4999),pending);
 const undone=command(pending,'re4','a','undo',start+4999);assert.deepEqual(undone.tournaments[0].entries,seed.tournaments[0].entries);assert.equal(undone.tournaments[0].remoteEliminationRequests[0].status,'canceled');assert.equal(tableBalanceNeeded(undone.tournaments[0]),false);assert.deepEqual(command(undone,'re4','a','start',start+5001),undone);
});
test('exact deadline finalizes once, orders simultaneous eliminations and supports later regular Undo',()=>{
 let s=fixture();s=command(s,'re4','a','start',start);s=command(s,'re5','b','start',start+1);const atFirst=finalizePendingEliminations(s,start+5000);assert.equal(atFirst.tournaments[0].entries[3].place,6);assert.equal(atFirst.tournaments[0].entries[4].place,null);assert.equal(tableBalanceNeeded(atFirst.tournaments[0]),false);
 s=command(atFirst,'re5','b','undo',start+5001);const t=s.tournaments[0];assert.equal(t.entries[4].place,5);assert.equal(t.entries[3].eliminationOrder,1);assert.equal(t.entries[4].eliminationOrder,2);assert.equal(t.entries[4].table,null);assert.equal(tableBalanceNeeded(t),true);assert.deepEqual(command(s,'re5','b','start',start+6000),s);assert.deepEqual(finalizePendingEliminations(s,start+9000),s);
 s=execute(s,{type:'undo-elimination',tournamentId:t.id,entryId:'re4'},start+10000);assert.equal(s.tournaments[0].entries[3].table,2);assert.equal(s.tournaments[0].entries[3].seat,1);assert.equal(s.tournaments[0].entries[4].place,6);
});
test('reserved seats reject moves, swaps, capacity removal, elimination and ICM until finalized',()=>{
 let s=fixture();s=command(s,'re4','a','start',start);const t=s.tournaments[0];assert.throws(()=>planSeatMove(t,{entryId:'re4',table:1,seat:4}),/reserved/);assert.throws(()=>planSeatMove(t,{entryId:'re1',table:2,seat:1,mode:'swap'}),/reserved/);assert.throws(()=>execute(s,{type:'eliminate',tournamentId:t.id,entryId:'re4'},start+1),/pending elimination/);assert.throws(()=>icmProposal(t,t.entries.map(e=>({entryId:e.id,chips:100}))),/pending eliminations/);
 const before=clone(s);assert.throws(()=>execute(s,{type:'seat',tournamentId:t.id,entryId:'re2',table:2,seat:1}),/occupied/);assert.deepEqual(s,before);
 for(const id of ['re1','re2','re3','re5'])s=command(s,id,'req'+id,'start',start+2);assert.throws(()=>command(s,'re6','last','start',start+3),/Leave one player/);assert.throws(()=>execute(s,{type:'eliminate',tournamentId:t.id,entryId:'re6'}),/Leave one player/);
});
export {fixture};
