import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePayoutRules,validatePayoutRules,payoutOrderError,validatePayoutOrder} from '../src/payout-rules.mjs';
import {initialState,execute,financials,prizes,payoutBalance,icmProposal,manualChopProposal,clone} from '../src/domain.mjs';
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
function fixture(){let s=initialState();s=execute(s,{type:'tournament-create',id:'t',name:'Mixed awards',templateId:s.templates[0].id});for(let i=1;i<=10;i++){s=execute(s,{type:'player-save',id:'p'+i,name:'Player '+i});s=execute(s,{type:'register',id:'e'+i,tournamentId:'t',playerId:'p'+i});}s.tournaments[0].entries.forEach((entry,i)=>{entry.table=1;entry.seat=i+1;});s.tournaments[0].settings.houseContribution=128000;return s;}
test('mixed rules are one shared custom schedule for finance, payouts, ICM and completed history',()=>{
 let s=fixture(),t=s.tournaments[0];assert.equal(financials(t).pool,160000);
 s=execute(s,{type:'payout-settings',tournamentId:'t',custom:true,settings:{...t.settings,payoutMode:'mixed',payoutRules:mixed,payouts:[91000,49000,10000,10000]}});t=s.tournaments[0];assert.equal(t.payoutCustom,true);assert.deepEqual(prizes(t),[91000,49000,10000,10000]);assert.equal(payoutBalance(t),0);assert.equal(t.payoutAutomatic.payoutMode,'percent');
 const proposal=icmProposal(t,t.entries.map(e=>({entryId:e.id,chips:1000})));assert.equal(proposal.participants.reduce((sum,p)=>sum+p.payout,0),160000);
 s=execute(s,{type:'icm-accept',tournamentId:'t',participants:proposal.participants});const frozen=clone(prizes(s.tournaments[0]));s.tournaments[0].settings.payoutRules[0].value=0;assert.deepEqual(prizes(s.tournaments[0]),frozen);
});
test('active tournament settings cannot bypass Save Payouts by changing mixed rules',()=>{
 let s=fixture(),t=s.tournaments[0];s=execute(s,{type:'payout-settings',tournamentId:'t',custom:true,settings:{...t.settings,payoutMode:'mixed',payoutRules:mixed,payouts:[91000,49000,10000,10000]}});s=execute(s,{type:'clock',tournamentId:'t',command:'start'});t=s.tournaments[0];const settings=clone(t.settings);settings.payoutRules[0].value=60;settings.payoutRules[1].value=40;assert.throws(()=>execute(s,{type:'tournament-settings',tournamentId:'t',settings}),/Save Payouts/);
});

test('ranked payouts allow equal amounts but reject every adjacent inversion with the places and amounts identified',()=>{
 for(const values of [[100000,60000,0],[80000,80000],[50000,50000,50000],[0,0]])assert.equal(payoutOrderError(values),'');
 assert.match(payoutOrderError([70000,90000]),/2nd place \(\$900\).*1st place \(\$700\)/);assert.match(payoutOrderError([90000,30000,40000]),/3rd place.*2nd place/);assert.match(payoutOrderError([90000,40000,10000,20000]),/4th place.*3rd place/);assert.throws(()=>validatePayoutOrder([35,65],'percent'),error=>error.code==='PAYOUT_ORDER'&&/65%/.test(error.message));
});
test('structure and event saves reject reversed fixed or percentage places without changing data',()=>{
 let s=fixture(),before=clone(s),template=clone(s.templates[0]);template.settings.payouts=[35,65];assert.throws(()=>execute(s,{type:'template-save',template}),/2nd place/);template.settings.payoutMode='fixed';template.settings.payouts=[70000,90000];assert.throws(()=>execute(s,{type:'template-save',template}),/2nd place/);const t=s.tournaments[0];for(const [payoutMode,payouts] of [['percent',[35,65]],['fixed',[70000,90000]]])assert.throws(()=>execute(s,{type:'payout-settings',tournamentId:t.id,custom:payoutMode==='fixed',settings:{...t.settings,payoutMode,payouts}}),/2nd place/);assert.deepEqual(s,before);
});
test('mixed order validation compares calculated dollars across fixed and percentage places',()=>{
 const s=fixture(),t=s.tournaments[0],bad=[{mode:'percent',value:65},{mode:'percent',value:35},{mode:'fixed',value:60000}],good=[...bad.slice(0,2),{mode:'fixed',value:40000}];assert.deepEqual(calculatePayoutRules(160000,bad),[65000,35000,60000]);assert.throws(()=>execute(s,{type:'payout-settings',tournamentId:t.id,custom:true,settings:{...t.settings,payoutMode:'mixed',payoutRules:bad,payouts:calculatePayoutRules(160000,bad)}}),/3rd place/);const saved=execute(s,{type:'payout-settings',tournamentId:t.id,custom:true,settings:{...t.settings,payoutMode:'mixed',payoutRules:good,payouts:calculatePayoutRules(160000,good)}});assert.deepEqual(prizes(saved.tournaments[0]),[78000,42000,40000]);
});
test('post-rounding inversions cannot be saved or used to finish; completed history is left untouched',()=>{
 const s=fixture(),t=s.tournaments[0];t.settings={...t.settings,housePercent:100,houseContribution:100,payouts:[50,50]};assert.deepEqual(prizes(t),[0,100]);assert.throws(()=>execute(s,{type:'payout-settings',tournamentId:t.id,settings:t.settings}),/2nd place/);for(let i=2;i<=10;i++)s.tournaments[0].entries[i-1]={...s.tournaments[0].entries[i-1],eliminatedAt:Date.now(),place:i};assert.throws(()=>execute(s,{type:'finish',tournamentId:t.id}),/2nd place/);assert.equal(s.points,undefined);t.status='completed';t.finalPayouts=[0,100];assert.deepEqual(prizes(t),[0,100]);
});
test('chops require a valid ranked source schedule, while named-player agreements can have any money split',()=>{
 let s=fixture(),t=s.tournaments[0];t.settings.payoutMode='fixed';t.settings.payouts=[70000,90000];const chips=t.entries.map(e=>({entryId:e.id,chips:1000})),agreements=t.entries.map((e,i)=>({entryId:e.id,payout:i===9?160000:0}));assert.throws(()=>icmProposal(t,chips),/2nd place/);assert.throws(()=>manualChopProposal(t,agreements),/2nd place/);t.settings.payouts=[100000,60000];assert.equal(manualChopProposal(t,agreements).participants[9].payout,160000);const proposal=icmProposal(t,chips);const custom=proposal.participants.map((p,i)=>({...p,payout:i===9?160000:0}));s=execute(s,{type:'icm-accept',tournamentId:t.id,participants:custom});assert.equal(s.tournaments[0].icmChop.participants[9].payout,160000);
});
