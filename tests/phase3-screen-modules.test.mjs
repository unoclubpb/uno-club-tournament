import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPlayerDatabase} from '../src/player-database-screen.mjs';
import {renderTournamentRegistration} from '../src/tournament-registration-screen.mjs';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;');
test('Player Database screen preserves searchable list controls without touching records',()=>{
 const state={players:[{id:'a',name:'Amy',phone:'123',archived:false}]};
 const html=renderPlayerDatabase({state,playerSearch:'',showArchived:false,playerDetail:null,profilePanel:'details',esc,empty:()=>'<div>Empty</div>'});
 assert.match(html,/data-player="a"/);assert.match(html,/id="player-search"/);assert.match(html,/id="show-archived"/);assert.equal(state.players.length,1);
});
test('Registration screen preserves both panels, candidates and registered-player controls',()=>{
 const t={id:'t1',status:'registration',entries:[{playerId:'a'}],settings:{buyIn:3500,startingStack:20000}};
 const state={players:[{id:'a',name:'Amy',archived:false},{id:'b',name:'Bob',archived:false}]};
 const html=renderTournamentRegistration({state,current:()=>t,noTournament:()=>'',financials:()=>({collected:3500}),registrationPanel:'find',signupSearch:'',money:n=>'$'+n/100,num:n=>String(n),esc,registrationRows:(rows)=>rows.map(p=>p.name).join(','),metrics:()=>'<div class="metrics"></div>',entryRows:()=>'<div>Registered Amy</div>'});
 assert.match(html,/Bob/);assert.doesNotMatch(html,/>Amy,Bob</);assert.match(html,/Registered \(1\)/);assert.match(html,/data-tournament="t1"/);assert.match(html,/Registered Amy/);assert.equal(t.entries.length,1);
});
