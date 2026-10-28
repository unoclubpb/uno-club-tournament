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

import {renderRegistrationRows} from '../src/registration-rows.mjs';
test('Registration row module preserves cards, limit, escaping and disabled state',()=>{
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
 assert.match(renderRegistrationRows([{id:'p1',name:'Amy & Co'}],{status:'open'},esc),/Amy &amp; Co/);
 assert.match(renderRegistrationRows([{id:'p1',name:'Amy'}],{status:'completed'},esc),/disabled/);
 assert.match(renderRegistrationRows([],{status:'open'},esc),/No matching unregistered players/);
 assert.equal((renderRegistrationRows(Array.from({length:100},(_,i)=>({id:'p'+i,name:'Player'})),{status:'open'},esc).match(/data-register=/g)||[]).length,80);
});

import {renderRegistrationTabs} from '../src/registration-tabs.mjs';
test('Registration navigation preserves selected panel and registered count',()=>{
 const find=renderRegistrationTabs('find',3);
 assert.match(find,/data-registration-panel="find" aria-pressed="true"/);
 assert.match(find,/data-registration-panel="registered" aria-pressed="false"/);
 assert.match(find,/Registered \(3\)/);
 const registered=renderRegistrationTabs('registered',0);
 assert.match(registered,/data-registration-panel="registered" aria-pressed="true"/);
 assert.match(registered,/Registered \(0\)/);
});
