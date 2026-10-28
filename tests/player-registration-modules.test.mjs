import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingPlayers} from '../src/player-data.mjs';
import {registrationCandidates} from '../src/registration-data.mjs';
const players=[
  {id:'p1',name:'Zoe',phone:'4045550123',archived:false},
  {id:'p2',name:'Amy',phone:'',archived:false},
  {id:'p3',name:'Ben',phone:'',archived:true}
];
test('Player Database preserves player IDs, alphabetical order, archive visibility and phone search',()=>{
 assert.deepEqual(matchingPlayers(players).map(p=>p.id),['p2','p1']);
 assert.deepEqual(matchingPlayers(players,'4045550123').map(p=>p.id),['p1']);
 assert.deepEqual(matchingPlayers(players,'',true).map(p=>p.id),['p2','p3','p1']);
 assert.equal(players[0].id,'p1');
});
test('Registration excludes enrolled and archived players without changing records',()=>{
 const entries=[{playerId:'p2'}];
 assert.deepEqual(registrationCandidates(players,entries).map(p=>p.id),['p1']);
 assert.deepEqual(registrationCandidates(players,entries,'Zoe').map(p=>p.id),['p1']);
 assert.equal(entries.length,1);
 assert.equal(players.length,3);
});
