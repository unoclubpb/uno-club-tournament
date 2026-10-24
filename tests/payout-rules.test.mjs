import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePayoutRules,validatePayoutRules} from '../src/payout-rules.mjs';
import {initialState,execute,financials,prizes,payoutBalance,icmProposal,clone} from '../src/domain.mjs';
const mixed=[{mode:'percent',value:65},{mode:'percent',value:35},{mode:'fixed',value:10000},{mode:'fixed',value:10000}];
test('fixed awards are reserved before the remaining pool is split by percentage',()=>{
 assert.deepEqual(calculatePayoutRules(160000,mixed),[91000,49000,10000,10000]);
 assert.deepEqual(calculatePayoutRules(170000,mixed),[97500,52500,10000,10000]);
 assert.deepEqual(mixed,[{mode:'percent',value:65},{mode:'percent',value:35},{mode:'fixed',value:10000},{mode:'fixed',value:10000}]);
});
test('odd dollars go only to lower percentage positions, leaving fixed awards exact',()=>{
 const rules=[{mode:'percent',value:50},{mode:'fixed',value:10000},{mode:'percent',value:50},{mode:'fixed',value:10000}];
 assert.deepEqual(calculatePayoutRules(160100,rules),[70000,10000,70100,10000]);
 for(let dollars=200;dollars<1800;dollars++){const amounts=calculatePayoutRules(dollars*100,mixed);assert.equal(amounts.reduce((a,b)=>a+b,0),dollars*100);assert.equal(amounts[2],10000);assert.equal(amounts[3],10000);}
});
test('invalid percentages, unsupported modes and fractional dollars are rejected; unfunded awards remain visible',()=>{
 for(const rules of [[{mode:'percent',value:99}],[{mode:'percent',value:101}],[{mode:'fixed',value:101}],[{mode:'fixed',value:-100}],[{mode:'wrong',value:0}],[],[{mode:'percent',value:NaN}]])assert.throws(()=>validatePayoutRules(rules));
 assert.deepEqual(calculatePayoutRules(19900,mixed),[0,0,10000,10000]);
 assert.deepEqual(calculatePayoutRules(20000,[{mode:'fixed',value:10000}]),[10000]); // balance validation reports the unallocated $100
});
function fixture(){let s=initialState();s=execute(s,{type:'tournament-create',id:'t',name:'Mixed awards',templateId:s.templates[0].id});for(let i=1;i<=10;i++){s=execute(s,{type:'player-save',id:'p'+i,name:'Player '+i});s=execute(s,{type:'register',id:'e'+i,tournamentId:'t',playerId:'p'+i});}s.tournaments[0].settings.houseContribution=128000;return s;}
test('mixed rules are one shared custom schedule for finance, payouts, ICM and completed history',()=>{
 let s=fixture(),t=s.tournaments[0];assert.equal(financials(t).pool,160000);
 s=execute(s,{type:'payout-settings',tournamentId:'t',custom:true,settings:{...t.settings,payoutMode:'mixed',payoutRules:mixed,payouts:[91000,49000,10000,10000]}});t=s.tournaments[0];assert.equal(t.payoutCustom,true);assert.deepEqual(prizes(t),[91000,49000,10000,10000]);assert.equal(payoutBalance(t),0);assert.equal(t.payoutAutomatic.payoutMode,'percent');
 const proposal=icmProposal(t,t.entries.map(e=>({entryId:e.id,chips:1000})));assert.equal(proposal.participants.reduce((sum,p)=>sum+p.payout,0),160000);
 s=execute(s,{type:'icm-accept',tournamentId:'t',participants:proposal.participants});const frozen=clone(prizes(s.tournaments[0]));s.tournaments[0].settings.payoutRules[0].value=0;assert.deepEqual(prizes(s.tournaments[0]),frozen);
});
test('active tournament settings cannot bypass Save Payouts by changing mixed rules',()=>{
 let s=fixture(),t=s.tournaments[0];s=execute(s,{type:'payout-settings',tournamentId:'t',custom:true,settings:{...t.settings,payoutMode:'mixed',payoutRules:mixed,payouts:[91000,49000,10000,10000]}});s=execute(s,{type:'clock',tournamentId:'t',command:'start'});t=s.tournaments[0];const settings=clone(t.settings);settings.payoutRules[0].value=60;settings.payoutRules[1].value=40;assert.throws(()=>execute(s,{type:'tournament-settings',tournamentId:'t',settings}),/Save Payouts/);
});
