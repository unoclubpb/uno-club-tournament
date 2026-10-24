import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,execute,clone,financials,prizes,payoutBalance,guaranteeEligible,icmProposal,statsFor,upgradeState} from '../src/domain.mjs';
import {icmEquities,roundLowerFirst} from '../src/icm.mjs';
const now=Date.parse('2026-10-23T23:00:00Z');
function fixture(n=10){let s=initialState();s=execute(s,{type:'tournament-create',id:'t',name:'Money test',templateId:s.templates[0].id},now);for(let i=1;i<=n;i++){s=execute(s,{type:'player-save',id:'p'+i,name:'Player '+i},now);s=execute(s,{type:'register',id:'e'+i,tournamentId:'t',playerId:'p'+i},now);}return s;}
const act=(s,a)=>execute(s,{tournamentId:'t',...a},now);
const event=s=>s.tournaments[0];
function checkLedger(f){assert.equal(f.tournamentEntries+f.dealerTokes+f.rebuyTotal+f.addonTotal-f.houseFee-f.dealerTokesPaidOut+f.houseContribution,f.pool);}
function guaranteePool(pool){let s=fixture();event(s).settings.housePercent=0;event(s).settings.houseContribution=pool-40000;s=act(s,{type:'payout-settings',settings:{...event(s).settings,payoutMode:'guaranteed',payouts:[65,35]}});return s;}
test('summary matches the requested $420 example and only net entries attract the configured fee',()=>{
 const s=fixture(),t=event(s);t.rebuyCount=4;let f=financials(t);assert.equal(f.tournamentEntries,40000);assert.equal(f.dealerTokes,10000);assert.equal(f.rebuyTotal,10000);assert.equal(f.houseFee,8000);assert.equal(f.dealerTokesPaidOut,10000);assert.equal(f.houseContribution,0);assert.equal(f.pool,42000);checkLedger(f);
 t.settings.housePercent=12.5;f=financials(t);assert.equal(f.houseFee,5000);assert.equal(f.pool,45000);checkLedger(f);t.rebuyCount=8;assert.equal(financials(t).houseFee,5000);
 t.entries[0].payments.push({kind:'addon',total:9000,dealerToke:0,chips:20000});t.settings.houseContribution=10000;f=financials(t);assert.equal(f.addonTotal,9000);assert.equal(f.houseFee,5000);checkLedger(f);
});
test('the saved guarantee is inactive at nine and activates at ten, including eliminated entrants',()=>{
 let s=fixture(9),settings={...event(s).settings,payoutMode:'guaranteed',payouts:[65,35]};assert.equal(guaranteeEligible(event(s)),false);s=act(s,{type:'payout-settings',settings});assert.equal(financials(event(s)).guaranteeActive,false);assert.equal(event(s).settings.payoutMode,'guaranteed');assert.deepEqual(prizes(event(s)),[18700,10100]);
 s=execute(s,{type:'player-save',id:'p10',name:'Player 10'},now);s=act(s,{type:'register',id:'e10',playerId:'p10'});s=act(s,{type:'eliminate',entryId:'e1'});assert.equal(guaranteeEligible(event(s)),true);s=act(s,{type:'payout-settings',settings});assert.equal(event(s).settings.payoutMode,'guaranteed');assert.equal(prizes(event(s)).length,2);
});
test('all guarantee examples and the $1539 threshold recalculate with lower-place dollar rounding',()=>{
 for(const [pool,expected] of [[120000,[100000,20000]],[150000,[100000,50000]],[153800,[100000,53800]],[153900,[100000,53900]],[154000,[100100,53900]],[160000,[104000,56000]],[170000,[110500,59500]],[200000,[130000,70000]]]){const t=event(guaranteePool(pool));assert.deepEqual(prizes(t),expected);assert.equal(t.settings.payoutMode,'guaranteed');assert.equal(prizes(t).reduce((a,b)=>a+b,0),pool);assert.ok(prizes(t).every(n=>n%100===0));}
});
test('guarantee shortfalls are explicit, included in house contribution and frozen on completion',()=>{
 let s=fixture();s=act(s,{type:'payout-settings',settings:{...event(s).settings,payoutMode:'guaranteed',payouts:[65,35]}});let f=financials(event(s));assert.equal(f.basePool,32000);assert.equal(f.guaranteeContribution,68000);assert.equal(f.houseContribution,68000);assert.equal(f.pool,100000);assert.deepEqual(prizes(event(s)),[100000,0]);checkLedger(f);
 event(s).rebuyCount=4;f=financials(event(s));assert.equal(f.guaranteeContribution,58000);event(s).settings.houseContribution=20000;f=financials(event(s));assert.equal(f.guaranteeContribution,38000);assert.equal(f.houseContribution,58000);checkLedger(f);
 for(let i=1;i<10;i++)s=act(s,{type:'eliminate',entryId:'e'+i});s=act(s,{type:'finish'});const frozen=clone(event(s).settlement),payouts=prizes(event(s));event(s).settings.houseContribution=0;event(s).settings.housePercent=0;assert.deepEqual(financials(event(s)).pool,frozen.pool);assert.deepEqual(prizes(event(s)),payouts);assert.equal(event(s).settlement.guaranteeContribution,38000);
});
test('percentage odd dollars go one at a time to lower positions and all ordinary amounts stay whole dollars',()=>{
 const t=event(fixture());t.settings.housePercent=0;t.settings.houseContribution=100;t.settings.payouts=[33.33,33.33,33.34];assert.deepEqual(prizes(t),[13300,13400,13400]);assert.equal(prizes(t).reduce((a,b)=>a+b,0),40100);
 assert.deepEqual(roundLowerFirst([200/3,200/3,200/3],200),[0,100,100]);assert.deepEqual(roundLowerFirst([100/3,100/3,100/3],100),[0,0,100]);
 let s=fixture();assert.throws(()=>act(s,{type:'payout-settings',settings:{...event(s).settings,buyIn:5050}}),/whole dollars/);assert.throws(()=>act(s,{type:'payout-settings',settings:{...event(s).settings,payoutMode:'fixed',payouts:[20000,10000]}}),/exactly match/);
 s=act(s,{type:'payout-settings',settings:{...event(s).settings,payoutMode:'fixed',payouts:[20000,12000]}});assert.equal(payoutBalance(event(s)),0);
});
test('existing completed settlement and historical cent payouts remain untouched on upgrade',()=>{
 const s=fixture(2),t=event(s);t.status='completed';t.settlement={collected:10000,owed:0,dealerTokes:2000,houseFee:1600,houseBase:8000,pool:6401,housePercent:20};const saved=clone(t.settlement),old=[4161,2240];assert.deepEqual(prizes(t),old);const next=upgradeState(s);assert.deepEqual(event(next).settlement,saved);assert.deepEqual(prizes(event(next)),old);checkLedger(financials(event(next)));
});
test('ICM exact equities match two- and three-player hand calculations and are invariant to chip scaling',()=>{
 assert.deepEqual(icmEquities([75,25],[70000,30000]),[60000,40000]);const e=icmEquities([50,30,20],[7000,3000]);const exact=[3500+3000*(.3*.5/.7+.2*.5/.8),2100+3000*(.5*.3/.5+.2*.3/.8),1400+3000*(.5*.2/.5+.3*.2/.7)];for(let i=0;i<3;i++)assert.ok(Math.abs(e[i]-exact[i])<1e-7);assert.deepEqual(icmEquities([500,300,200],[7000,3000]),e);
 assert.deepEqual(icmEquities([1,2,3],[100,100,100]),[100,100,100]);for(const stacks of [[0,1],[1.5,2],[1,NaN]])assert.throws(()=>icmEquities(stacks,[100,0]),/positive whole chip/);
});
test('ICM acceptance saves manual agreed payouts and final chips atomically without inventing finishes or points',()=>{
 let s=fixture(4);s=act(s,{type:'eliminate',entryId:'e4'});const previous=clone(event(s).entries[3]),chips=[{entryId:'e1',chips:50000},{entryId:'e2',chips:30000},{entryId:'e3',chips:20000}],proposal=icmProposal(event(s),chips);assert.equal(proposal.chopPool,financials(event(s)).pool);assert.ok(proposal.participants.every(v=>v.payout%100===0));const participants=proposal.participants.map(v=>({...v}));participants[0].payout-=100;participants[2].payout+=100;
 s=act(s,{type:'icm-accept',participants});const t=event(s);assert.equal(t.status,'completed');assert.equal(t.endedBy,'icm-chop');assert.equal(t.clock.status,'ended');assert.equal(t.clock.deadline,null);assert.deepEqual(t.entries[3],previous);assert.equal(t.entries[0].finalChipCount,50000);assert.equal(t.entries[0].agreedPayout,participants[0].payout);assert.equal(t.entries[0].place,null);assert.equal(statsFor(s,'p1').wins,0);assert.equal(statsFor(s,'p1').played,1);assert.ok(t.entries.every(e=>!('points' in e)));assert.equal(prizes(t).reduce((a,b)=>a+b,0),t.settlement.pool);assert.throws(()=>act(s,{type:'undo-elimination'}),/locked/);assert.throws(()=>act(s,{type:'icm-accept',participants}),/locked/);
});
test('ICM preserves already eliminated paid places and rejects missing, duplicate or underfunded agreements',()=>{
 let s=fixture(5);event(s).settings.payouts=[50,30,15,5];s=act(s,{type:'eliminate',entryId:'e5'});s=act(s,{type:'eliminate',entryId:'e4'});const chips=[{entryId:'e1',chips:50},{entryId:'e2',chips:30},{entryId:'e3',chips:20}],p=icmProposal(event(s),chips),before=clone(s);assert.deepEqual(p.reservedPayouts,[800]);assert.equal(p.chopPool,15200);
 assert.throws(()=>act(s,{type:'icm-accept',participants:p.participants.map((v,i)=>({...v,payout:v.payout+(i===0?100:0)}))}),/exactly match/);assert.throws(()=>icmProposal(event(s),chips.slice(0,2)),/every remaining player/);assert.throws(()=>icmProposal(event(s),[chips[0],chips[0],chips[2]]),/exactly once/);assert.throws(()=>icmProposal(event(s),[{entryId:'e4',chips:1},chips[1],chips[2]]),/Only remaining/);assert.deepEqual(s,before);
 s=act(s,{type:'icm-accept',participants:p.participants});assert.deepEqual(event(s).entries.slice(3),event(before).entries.slice(3));assert.equal(prizes(event(s)).at(-1),800);assert.equal(prizes(event(s)).reduce((a,b)=>a+b,0),16000);
});

test('ICM subset calculation matches independent finishing-order enumeration for small fields',()=>{
 function brute(stacks,payouts){const result=stacks.map(()=>0);function visit(left,probability,place){if(place>=payouts.length)return;const total=left.reduce((n,i)=>n+stacks[i],0);for(const i of left){const chance=probability*stacks[i]/total;result[i]+=chance*payouts[place];visit(left.filter(j=>j!==i),chance,place+1);}}visit(stacks.map((_,i)=>i),1,0);return result;}
 for(let n=2;n<=6;n++){const stacks=Array.from({length:n},(_,i)=>(i+1)**2+7),payouts=Array.from({length:n},(_,i)=>(n-i)*100),expected=brute(stacks,payouts),actual=icmEquities(stacks,payouts);for(let i=0;i<n;i++)assert.ok(Math.abs(expected[i]-actual[i])<1e-7);const rounded=roundLowerFirst(actual,payouts.reduce((a,b)=>a+b,0));assert.equal(rounded.reduce((a,b)=>a+b,0),payouts.reduce((a,b)=>a+b,0));}
});
