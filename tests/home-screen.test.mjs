import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHome} from '../src/home-screen.mjs';
const icon=()=>'<svg></svg>',esc=s=>String(s),money=()=>'$35',statusLabel=()=> 'In progress';
test('Home renders menu without requiring a tournament',()=>{
 const html=renderHome({t:null,icon,esc,money,statusLabel});
 assert.match(html,/Tournament Management/);
 assert.match(html,/data-go="players"/);
 assert.doesNotMatch(html,/CURRENT TOURNAMENT/);
});
test('Home displays active tournament summary and resume action',()=>{
 const t={id:'test-123',name:'Tuesday Poker',startedAt:1,entries:[{},{}],settings:{buyIn:3500}};
 const html=renderHome({t,icon,esc,money,statusLabel});
 assert.match(html,/Tuesday Poker/);
 assert.match(html,/data-resume="test-123"/);
 assert.match(html,/2 registered players/);
});

test('Home uses approved menu order and Tournament Design name',()=>{
 const html=renderHome({t:null,icon,esc,money,statusLabel});
 assert.ok(html.indexOf('data-go="players"')<html.indexOf('data-go="setup"'));
 assert.match(html,/Tournament Design/);
 assert.doesNotMatch(html,/Tournament Setup/);
});
