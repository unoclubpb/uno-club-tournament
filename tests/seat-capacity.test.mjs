import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,execute,clone} from '../src/domain.mjs';
import * as published from '../chunks/chunk-CDIEYG7T.js';
for(const [label,initial,run] of [['source',initialState,execute],['published',published.C,published.X]]){
 function fixture(){let s=initial();s=run(s,{type:'tournament-create',id:'t',name:'Seat test',templateId:s.templates[0].id});s.tournaments[0].settings.seatsPerTable=6;for(let i=0;i<10;i++){s=run(s,{type:'player-save',id:'p'+i,name:'Player '+i});s=run(s,{type:'register',id:'e'+i,tournamentId:'t',playerId:'p'+i});const e=s.tournaments[0].entries[i];e.table=i<5?1:2;e.seat=i<5?[1,3,4,5,6][i]:i-4;}return s;}
 test(label+': reducing six seats to five closes gaps on each table without unseating',()=>{const s=fixture(),next=run(s,{type:'seating-settings',tournamentId:'t',seatsPerTable:5}),entries=next.tournaments[0].entries;assert.deepEqual(entries.map(e=>e.table),[1,1,1,1,1,2,2,2,2,2]);assert.deepEqual(entries.map(e=>e.seat),[1,2,3,4,5,1,2,3,4,5]);assert.equal(s.tournaments[0].entries[1].seat,3);});
 test(label+': reducing to four retains existing valid seats and unseats overflow',()=>{const next=run(fixture(),{type:'seating-settings',tournamentId:'t',seatsPerTable:4}),entries=next.tournaments[0].entries;assert.deepEqual(entries.slice(0,5).map(e=>e.seat),[1,3,4,null,null]);assert.deepEqual(entries.slice(5).map(e=>e.seat),[1,2,3,4,null]);});
 test(label+': locked players cannot be shifted by compaction and failure is atomic',()=>{const s=fixture();s.tournaments[0].entries[1].seatLocked=true;const before=clone(s);assert.throws(()=>run(s,{type:'seating-settings',tournamentId:'t',seatsPerTable:5}),/Unlock/);assert.deepEqual(s,before);});
}
