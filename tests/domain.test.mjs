import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,execute,id,clockAt,financials,prizes,statsFor,clone,tablesRequired,tablesInUse,upgradeState,rebuyOpen,purchaseOpen,rebuyPhase,cutoffHasBreak,validateTemplate,playerNumberLabel,canRecordRebuys,tvDisplayMode} from '../src/domain.mjs';
const start=Date.parse('2026-10-15T23:35:00Z');
function setup(n=3){let s=initialState();const event=id();s=execute(s,{type:'tournament-create',id:event,name:'Test tournament',templateId:s.templates[0].id},start);for(let i=0;i<n;i++){const player=id();s=execute(s,{type:'player-save',id:player,name:'Player '+i},start);s=execute(s,{type:'register',tournamentId:event,playerId:player,paid:true},start);const entry=s.tournaments[0].entries.at(-1);entry.table=1;entry.seat=i+1;}return {s,event};}
function act(s,event,a,now=start){return execute(s,{...a,tournamentId:event},now);}
test('TV modes start with seating, default on first start, and change without clock or accounting writes',()=>{
 let {s,event}=setup();assert.equal(tvDisplayMode(s.tournaments[0]),'clock-seating');assert.throws(()=>act(s,event,{type:'tv-display',mode:'full-clock'}),/when the tournament starts/);
 s.tournaments[0].tvDisplayMode='full-clock';assert.equal(tvDisplayMode(s.tournaments[0]),'clock-seating');s=act(s,event,{type:'clock',command:'start'});assert.equal(s.tournaments[0].tvDisplayMode,'clock-seating');
 const before=clone(s),deadline=s.tournaments[0].clock.deadline;s=act(s,event,{type:'tv-display',mode:'full-clock'},start+901000);assert.equal(tvDisplayMode(s.tournaments[0]),'full-clock');assert.deepEqual(s.tournaments[0].clock,before.tournaments[0].clock);assert.deepEqual(financials(s.tournaments[0]),financials(before.tournaments[0]));const expected=clone(before);expected.tournaments[0].tvDisplayMode='full-clock';assert.deepEqual(s,expected);assert.equal(clockAt(s.tournaments[0],start+901000).index,1);assert.equal(s.tournaments[0].clock.deadline,deadline);
 s=act(s,event,{type:'clock',command:'pause'},start+902000);s=act(s,event,{type:'clock',command:'resume'},start+903000);assert.equal(tvDisplayMode(s.tournaments[0]),'full-clock');s=act(s,event,{type:'eliminate',entryId:s.tournaments[0].entries[0].id},start+904000);assert.equal(tvDisplayMode(s.tournaments[0]),'full-clock');s=act(s,event,{type:'tv-display',mode:'clock-seating'});assert.equal(tvDisplayMode(s.tournaments[0]),'clock-seating');assert.throws(()=>act(s,event,{type:'tv-display',mode:'other'}),/TV display mode/);
});
test('legacy and completed tournaments retain a manually selected TV mode',()=>{
 let {s,event}=setup(1);s.tournaments[0].clock.status='paused';s=act(s,event,{type:'tv-display',mode:'full-clock'});s=act(s,event,{type:'clock',command:'resume'});assert.equal(tvDisplayMode(s.tournaments[0]),'full-clock');s=act(s,event,{type:'finish'});const before=clone(s.tournaments[0]);s=act(s,event,{type:'tv-display',mode:'clock-seating'});assert.equal(tvDisplayMode(s.tournaments[0]),'clock-seating');assert.deepEqual(s.tournaments[0].clock,before.clock);assert.deepEqual(s.tournaments[0].settlement,before.settlement);assert.deepEqual(s.tournaments[0].finalPayouts,before.finalPayouts);
});
test('template is copied; antes can be off while amounts are retained',()=>{let {s,event}=setup();const t=s.tournaments[0],original=clone(t.levels);s.templates[0].levels[0].minutes=30;assert.equal(t.levels[0].minutes,15);assert.equal(t.settings.anteMode,'off');assert.equal(t.levels[6].ante,600);s=act(s,event,{type:'tournament-settings',settings:{...t.settings,anteMode:'big_blind'}});assert.deepEqual(s.tournaments[0].levels,original);assert.equal(s.templates[0].settings.anteMode,'off');});
test('actual start, refresh and late ticks use deadline; 30-minute custom levels work',()=>{let {s,event}=setup();s=act(s,event,{type:'clock',command:'start'});const t=s.tournaments[0];assert.equal(t.clock.deadline,start+900000);assert.equal(clockAt(t,start+7000).remainingMs,893000);assert.equal(clockAt(t,start+901000).index,1);assert.equal(clockAt(t,start+901000).remainingMs,899000);assert.equal(clockAt(t,start+2000000).index,2);const a=setup(2);a.s.tournaments[0].levels[0].minutes=30;a.s.tournaments[0].clock.remainingMs=1800000;const result=act(a.s,a.event,{type:'clock',command:'start'});assert.equal(result.tournaments[0].clock.deadline,start+1800000);});
test('pause preserves remaining time and resume ignores elapsed pause time',()=>{let {s,event}=setup();s=act(s,event,{type:'clock',command:'start'});s=act(s,event,{type:'clock',command:'pause'},start+420000);assert.equal(s.tournaments[0].clock.remainingMs,480000);assert.equal(clockAt(s.tournaments[0],start+900000).remainingMs,480000);s=act(s,event,{type:'clock',command:'resume'},start+1000000);assert.equal(s.tournaments[0].clock.deadline,start+1480000);assert.throws(()=>act(s,event,{type:'clock',command:'start'}),/already running/);});
test('breaks pause before and after; can run straight through when selected',()=>{let {s,event}=setup();s=act(s,event,{type:'clock',command:'start'});let c=clockAt(s.tournaments[0],start+7200000);assert.equal(c.index,8);assert.equal(c.status,'paused');assert.equal(c.remainingMs,300000);s=act(s,event,{type:'clock',command:'resume'},start+7200000);c=clockAt(s.tournaments[0],start+7500000);assert.equal(c.index,9);assert.equal(c.status,'paused');s.tournaments[0].settings.pauseBreaks=false;c=clockAt(s.tournaments[0],start+7501000);assert.equal(c.index,9);assert.equal(c.status,'running');assert.equal(c.remainingMs,899000);});
test('last level ends without looping or accumulating timing drift',()=>{let {s,event}=setup();s.tournaments[0].settings.pauseBreaks=false;s=act(s,event,{type:'clock',command:'start'});const c=clockAt(s.tournaments[0],start+27000000);assert.equal(c.status,'ended');assert.equal(c.remainingMs,0);assert.equal(c.index,30);});
test('eliminations have correct finishes, winner guard and LIFO undo',()=>{let {s,event}=setup();const [a,b,c]=s.tournaments[0].entries;s=act(s,event,{type:'eliminate',entryId:a.id},start+1);assert.equal(s.tournaments[0].entries[0].place,3);s=act(s,event,{type:'eliminate',entryId:b.id},start+2);assert.equal(s.tournaments[0].entries[1].place,2);assert.throws(()=>act(s,event,{type:'eliminate',entryId:c.id},start+3),/Finish Tournament/);s=act(s,event,{type:'undo-elimination'});assert.equal(s.tournaments[0].entries[1].place,null);assert.equal(s.tournaments[0].entries[0].place,3);});
test('registration always counts as paid and aggregate rebuys update exact payout rounding',()=>{let {s,event}=setup();const t=s.tournaments[0];t.clock={index:8,status:'paused',remainingMs:300000,deadline:null};s=act(s,event,{type:'rebuy-count',count:1});assert.equal(financials(s.tournaments[0]).owed,0);assert.equal(financials(s.tournaments[0]).pool,12100);assert.deepEqual(prizes(s.tournaments[0]),[7800,4300]);s.tournaments[0].settings.payouts=[33.33,33.33,33.34];assert.equal(prizes(s.tournaments[0]).reduce((a,b)=>a+b,0),12100);const p=id();s=execute(s,{type:'player-save',id:p,name:'Assumed Paid'});s=act(s,event,{type:'register',playerId:p,paid:false});assert.equal(s.tournaments[0].entries.at(-1).payments[0].paid,true);assert.equal(financials(s.tournaments[0]).owed,0);});
test('rebuys cannot be attached to a player or recorded as a total before the cutoff',()=>{let {s,event}=setup();const entry=s.tournaments[0].entries[0].id;assert.throws(()=>act(s,event,{type:'payment',entryId:entry,kind:'rebuy',paid:true}),/tournament total/);assert.throws(()=>act(s,event,{type:'rebuy-count',count:1}),/rebuy total/);assert.throws(()=>act(s,event,{type:'paid',entryId:entry,paid:false}),/Unknown action/);s.tournaments[0].clock={index:8,status:'paused',remainingMs:300000,deadline:null};s=act(s,event,{type:'eliminate',entryId:entry},start+1);s=act(s,event,{type:'rebuy-count',count:3});assert.equal(s.tournaments[0].rebuyCount,3);assert.ok(s.tournaments[0].entries.every(e=>!e.payments.some(p=>p.kind==='rebuy')));});
test('invalid payouts fail; results count only after finalization and stay locked',()=>{let {s,event}=setup();assert.equal(statsFor(s,s.players[0].id).played,0);assert.throws(()=>act(s,event,{type:'tournament-settings',settings:{...s.tournaments[0].settings,payouts:[80,30]}}),/100%/);const entries=s.tournaments[0].entries;s=act(s,event,{type:'eliminate',entryId:entries[0].id},start+1);s=act(s,event,{type:'eliminate',entryId:entries[1].id},start+2);s=act(s,event,{type:'finish'},start+3);assert.equal(s.tournaments[0].entries[2].place,1);assert.equal(statsFor(s,s.players[2].id).wins,1);assert.equal('winnings' in statsFor(s,s.players[2].id),false);assert.equal('cost' in statsFor(s,s.players[2].id),false);assert.ok(s.tournaments[0].entries.every(e=>!('winnings' in e)));assert.throws(()=>act(s,event,{type:'undo-elimination'}),/locked/);});
test('seating rejects occupied seats and automatically creates enough tables',()=>{let {s,event}=setup();const [a,b]=s.tournaments[0].entries;s=act(s,event,{type:'seat',entryId:a.id,table:1,seat:1});assert.throws(()=>act(s,event,{type:'seat',entryId:b.id,table:1,seat:1}),/occupied/);s=act(s,event,{type:'auto-seat',order:s.tournaments[0].entries.map(e=>e.id)});assert.equal(new Set(s.tournaments[0].entries.map(e=>`${e.table}/${e.seat}`)).size,3);s.tournaments[0].settings.seatsPerTable=2;assert.equal(tablesRequired(s.tournaments[0]),2);s=act(s,event,{type:'auto-seat'});assert.equal(tablesInUse(s.tournaments[0]),2);assert.ok(s.tournaments[0].entries.every(e=>e.seat<=2));});
test('global player rename follows stable identity; duplicate registration rejected',()=>{let {s,event}=setup();const player=s.players[0];s=execute(s,{type:'player-save',id:player.id,name:'Renamed Player'});assert.equal(s.players[0].name,'Renamed Player');assert.equal(s.tournaments[0].entries[0].playerId,player.id);assert.throws(()=>act(s,event,{type:'register',playerId:player.id,paid:true}),/already registered/);});

test('full buy-in and dealer toke separate from a fee on initial net entries only',()=>{let {s,event}=setup(10);s.tournaments[0].clock={index:8,status:'paused',remainingMs:300000,deadline:null};s=act(s,event,{type:'rebuy-count',count:4});const t=s.tournaments[0],f=financials(t);assert.equal(f.collected,60000);assert.equal(f.dealerTokes,10000);assert.equal(f.houseBase,40000);assert.equal(f.houseFee,8000);assert.equal(f.pool,42000);assert.equal(f.rebuyCount,4);assert.equal(f.chips,70000);assert.ok(t.entries.every(e=>e.payments.length===1));});
test('tables grow with entries and consolidate after explicit reseating',()=>{let {s,event}=setup(21);assert.equal(tablesRequired(s.tournaments[0]),3);s=act(s,event,{type:'auto-seat'});assert.equal(tablesInUse(s.tournaments[0]),3);const victims=s.tournaments[0].entries.slice(0,12).map(e=>e.id);victims.forEach((entryId,i)=>{s=act(s,event,{type:'eliminate',entryId},start+i+1);});assert.equal(tablesRequired(s.tournaments[0]),1);assert.ok(tablesInUse(s.tournaments[0])>=1);s=act(s,event,{type:'auto-seat'});assert.equal(tablesInUse(s.tournaments[0]),1);assert.ok(s.tournaments[0].entries.filter(e=>!e.eliminatedAt).every(e=>e.table===1));});
test('toke cannot exceed full buy-in and invalid house percentages are rejected',()=>{const {s,event}=setup();assert.throws(()=>act(s,event,{type:'tournament-settings',settings:{...s.tournaments[0].settings,buyIn:500,dealerToke:1000}}),/cannot exceed/);assert.throws(()=>act(s,event,{type:'tournament-settings',settings:{...s.tournaments[0].settings,housePercent:101}}),/between 0 and 100/);});
test('legacy records keep collected amounts and completed settlement totals',()=>{let {s}=setup(1);const legacy={startingStack:5000,entryPrize:1000,entryHouse:1000,rebuyPrize:2500,rebuyHouse:0,addonPrize:7500,addonHouse:1500,tableCount:2,fixedExpense:2000,seatsPerTable:10,houseContribution:0};s.templates[0].settings={...legacy};const t=s.tournaments[0];t.settings={...legacy};t.entries[0].payments=[{kind:'entry',prize:1000,house:1000,chips:5000,paid:true}];let migrated=upgradeState(s);assert.equal(migrated.tournaments[0].entries[0].payments[0].total,2000);assert.equal(migrated.tournaments[0].settings.buyIn,2000);assert.equal(migrated.templates[0].settings.buyIn,5000);t.status='completed';t.entries[0].payments[0].prize=9000;migrated=upgradeState(s);assert.equal(financials(migrated.tournaments[0]).pool,7000);assert.equal(financials(migrated.tournaments[0]).collected,10000);assert.equal(financials(migrated.tournaments[0]).houseFee,3000);assert.equal(migrated.tournaments[0].settlement.legacy,true);});

test('rebuys and add-ons remain available through the immediately following break, with closure at next playing round',()=>{
 let {s,event}=setup();let t=s.tournaments[0];t.settings.rebuyLastRound=8;t.settings.addonEnabled=true;t.settings.addonLastRound=8;t.clock.index=7;
 assert.equal(rebuyPhase(t,t.clock),'final-round');assert.equal(cutoffHasBreak(t),true);assert.equal(purchaseOpen(t,t.clock,'addon'),true);
 t.clock.index=8;assert.equal(rebuyPhase(t,t.clock),'final-break');
 t.clock.status='paused';assert.equal(canRecordRebuys(t,t.clock),true);s=act(s,event,{type:'rebuy-count',count:1});t=s.tournaments[0];s=act(s,event,{type:'payment',entryId:t.entries[0].id,kind:'addon',paid:true});t=s.tournaments[0];assert.equal(financials(t).rebuyCount,1);assert.equal(financials(t).addonCount,1);
 t.clock.index=9;t.clock.status='paused';assert.equal(rebuyPhase(t,t.clock),'closed');assert.equal(canRecordRebuys(t,t.clock),false);assert.throws(()=>act(s,event,{type:'rebuy-count',count:2}),/Override/);s=act(s,event,{type:'rebuy-count',count:2,overrideCutoff:true});assert.equal(s.tournaments[0].rebuyCount,2);assert.throws(()=>act(s,event,{type:'payment',entryId:t.entries[1].id,kind:'addon'}),/period has closed/);
 t.clock.index=0;t.settings.rebuyEnabled=false;assert.equal(rebuyOpen(t,t.clock),false);t.settings.rebuyEnabled=true;t.status='completed';assert.equal(rebuyOpen(t,t.clock),false);t.status='open';t.clock.status='ended';assert.equal(rebuyOpen(t,t.clock),false);
});
test('a cutoff without a following break closes at the next level and does not reopen at a later break',()=>{
 const {s}=setup(),t=s.tournaments[0];t.settings.rebuyLastRound=6;assert.equal(cutoffHasBreak(t),false);t.clock.index=5;assert.equal(rebuyPhase(t,t.clock),'final-round');t.clock.index=6;assert.equal(rebuyPhase(t,t.clock),'closed');t.clock.index=8;assert.equal(rebuyPhase(t,t.clock),'closed');
});
test('fractional breaks are rejected while whole-minute breaks and playing durations stay supported',()=>{
 const template=initialState().templates[0],br=template.levels.find(l=>l.kind==='break');br.minutes=3.5;assert.throws(()=>validateTemplate(template),/whole number/);br.minutes=3;template.levels[0].minutes=0.5;assert.doesNotThrow(()=>validateTemplate(template));
});
test('rebuy and add-on cutoff closure follows the resumed clock at break end and survives a delayed tick',()=>{
 let {s,event}=setup();let t=s.tournaments[0];t.settings.rebuyLastRound=8;t.settings.addonLastRound=8;t.settings.addonEnabled=true;t.clock.index=7;s=act(s,event,{type:'clock',command:'start'});t=s.tournaments[0];
 let c=clockAt(t,start+900000);assert.equal(c.status,'paused');assert.equal(rebuyPhase(t,c),'final-break');assert.equal(purchaseOpen(t,c,'addon'),true);
 s=act(s,event,{type:'clock',command:'resume'},start+900000);t=s.tournaments[0];c=clockAt(t,start+1200000);assert.equal(c.status,'paused');assert.equal(rebuyOpen(t,c),false);assert.equal(purchaseOpen(t,c,'addon'),false);
 t.settings.pauseBreaks=false;t.clock={index:7,status:'running',remainingMs:900000,deadline:start+900000};c=clockAt(t,start+1500000);assert.equal(rebuyPhase(t,c),'closed');
});

test('player numbers start at 001, remain permanent, and do not reuse archived IDs',()=>{
 let s=initialState();for(const [id,name] of [['p1','Alpha'],['p2','Beta']])s=execute(s,{type:'player-save',id,name});
 assert.deepEqual(s.players.map(p=>p.playerNumber),[1,2]);assert.equal(playerNumberLabel(s.players[0]),'001');
 s=execute(s,{type:'player-save',id:'p1',name:'Renamed',playerNumber:99});assert.equal(s.players[0].playerNumber,1);
 s=execute(s,{type:'player-archive',id:'p2'});s=execute(s,{type:'player-save',id:'p3',name:'Gamma'});assert.equal(s.players[2].playerNumber,3);
});
test('legacy player numbers backfill deterministically without changing references, results or existing numbers',()=>{
 let {s}=setup();const ids=s.players.map(p=>p.id),entries=clone(s.tournaments[0].entries);s.players.forEach(p=>delete p.playerNumber);
 s=upgradeState(s);assert.deepEqual(s.players.map(p=>p.playerNumber),[1,2,3]);assert.deepEqual(s.players.map(p=>p.id),ids);assert.deepEqual(s.tournaments[0].entries,entries);assert.deepEqual(upgradeState(s),s);
 s.players.reverse();assert.deepEqual(upgradeState(s).players.map(p=>p.playerNumber),[3,2,1]);s=execute(s,{type:'player-save',id:'new',name:'Newest'});assert.equal(s.players.at(-1).playerNumber,4);
});


test('rebuy totals replace previous counts, accept zero, reject invalid numbers and lock after finishing',()=>{
 let {s,event}=setup(1);s.tournaments[0].clock={index:8,status:'paused',remainingMs:300000,deadline:null};const entries=clone(s.tournaments[0].entries);
 for(const count of [-1,1.5,NaN,Infinity,'3',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>act(s,event,{type:'rebuy-count',count}),/whole number/);
 for(const count of [4,4,2,0]){s=act(s,event,{type:'rebuy-count',count});assert.equal(s.tournaments[0].rebuyCount,count);assert.equal(financials(s.tournaments[0]).collected,5000+count*2500);assert.deepEqual(s.tournaments[0].entries,entries);}
 s.tournaments[0].settings.rebuyEnabled=false;assert.throws(()=>act(s,event,{type:'rebuy-count',count:1}),/rebuy total/);s.tournaments[0].settings.rebuyEnabled=true;
 s=act(s,event,{type:'finish'});assert.throws(()=>act(s,event,{type:'rebuy-count',count:1}),/locked/);
});

test('legacy player rebuys migrate once into an unassigned total, preserving IDs and completed settlements',()=>{
 let {s}=setup(2);const t=s.tournaments[0],ids=t.entries.map(e=>e.playerId);delete t.rebuyCount;t.entries[0].payments[0].paid=false;
 t.entries[0].payments.push({id:'legacy-rebuy',kind:'rebuy',total:2500,dealerToke:0,chips:5000,paid:true});
 let upgraded=upgradeState(s);assert.equal(upgraded.tournaments[0].rebuyCount,1);assert.equal(financials(upgraded.tournaments[0]).pool,8900);assert.deepEqual(upgraded.tournaments[0].entries.map(e=>e.playerId),ids);assert.ok(upgraded.tournaments[0].entries.every(e=>e.payments.length===1));assert.deepEqual(upgradeState(upgraded),upgraded);
 t.status='completed';t.settlement={collected:7500,owed:0,dealerTokes:1000,houseBase:6500,houseFee:1300,pool:5200};upgraded=upgradeState(s);assert.deepEqual(upgraded.tournaments[0].settlement,t.settlement);assert.equal(financials(upgraded.tournaments[0]).pool,5200);
});

test('last played follows player identity and the latest started or completed tournament date',()=>{
 const s=initialState();s.players=[{id:'p1',name:'Alex',playerNumber:1},{id:'p2',name:'Casey',playerNumber:2}];
 s.tournaments=[
  {id:'ongoing',date:'2026-10-22',status:'open',startedAt:0,entries:[{playerId:'p1'}]},
  {id:'future-draft',date:'2026-12-01',status:'open',entries:[{playerId:'p1'}]},
  {id:'completed',date:'2026-10-20',status:'completed',entries:[{playerId:'p1',place:1}]},
  {id:'other-player',date:'2026-10-23',status:'completed',entries:[{playerId:'p2',place:1}]}
 ];
 assert.equal(statsFor(s,'p1').lastPlayed,'2026-10-22');assert.equal(statsFor(s,'p1').played,1);assert.equal(statsFor(s,'p2').lastPlayed,'2026-10-23');assert.equal(statsFor(s,'missing').lastPlayed,null);
 s.players[0].name='Alex Updated';s.players[0].archived=true;assert.equal(statsFor(s,'p1').lastPlayed,'2026-10-22');
 s.tournaments=s.tournaments.filter(t=>t.id!=='ongoing');assert.equal(statsFor(s,'p1').lastPlayed,'2026-10-20');s.tournaments=s.tournaments.filter(t=>t.id!=='completed');assert.equal(statsFor(s,'p1').lastPlayed,null);
});


test('player phone numbers normalize ten digits and reject malformed values without changing the player',()=>{
 let s=initialState();s=execute(s,{type:'player-save',id:'phone-player',name:'Phone Player',phone:'4045550123'});
 assert.equal(s.players[0].phone,'404-555-0123');
 s=execute(s,{type:'player-save',id:'phone-player',name:'Phone Player',phone:'770-555-0199'});assert.equal(s.players[0].phone,'770-555-0199');
 for(const phone of ['123456789','12345678901','abc5550123','404.555.0123','(404)5550123','+14045550123','404 555 0123','404-55-50123','404-555-01234']){
  assert.throws(()=>execute(s,{type:'player-save',id:'phone-player',name:'Phone Player',phone}),/exactly 10 digits/);assert.equal(s.players[0].phone,'770-555-0199');
 }
 s=execute(s,{type:'player-save',id:'phone-player',name:'Phone Player',phone:''});assert.equal(s.players[0].phone,'');assert.equal(s.players[0].id,'phone-player');
});

test('seat capacity is per tournament, preserves valid assignments and relocates removed seats',()=>{
 let {s,event}=setup(20);s=act(s,event,{type:'auto-seat'});const before=clone(s.tournaments[0]),valid=before.entries.filter(e=>e.seat<=9);
 s=act(s,event,{type:'seating-settings',seatsPerTable:9});const t=s.tournaments[0];assert.equal(t.settings.seatsPerTable,9);assert.equal(tablesRequired(t),3);assert.equal(tablesInUse(t),3);assert.equal(s.templates[0].settings.seatsPerTable,10);assert.deepEqual(t.clock,before.clock);
 for(const old of valid){const entry=t.entries.find(e=>e.id===old.id);assert.equal(entry.table,old.table);assert.equal(entry.seat,old.seat);}
 assert.ok(t.entries.every(e=>e.table>=1&&e.table<=3&&e.seat>=1&&e.seat<=9));assert.equal(new Set(t.entries.map(e=>`${e.table}/${e.seat}`)).size,20);assert.deepEqual(t.entries.map(e=>e.playerId),before.entries.map(e=>e.playerId));
 const seats=t.entries.map(e=>[e.table,e.seat]);s=act(s,event,{type:'seating-settings',seatsPerTable:10});assert.deepEqual(s.tournaments[0].entries.map(e=>[e.table,e.seat]),seats);
 for(const seatsPerTable of [0,1,11,12,13,1.5,NaN,'9'])assert.throws(()=>act(s,event,{type:'seating-settings',seatsPerTable}),/2–10/);
});

test('balanced seating accounts for empty, uneven and full tables at nine or ten seats',()=>{
 for(const capacity of [9,10])for(const players of [0,1,9,10,12,13,18,19,20,21]){
  let {s,event}=setup(players);s=act(s,event,{type:'seating-settings',seatsPerTable:capacity});s=act(s,event,{type:'auto-seat'});const t=s.tournaments[0],count=tablesRequired(t),loads=Array.from({length:count},(_,i)=>t.entries.filter(e=>e.table===i+1).length);
  assert.equal(count,Math.ceil(players/capacity));assert.equal(loads.reduce((n,v)=>n+v,0),players);if(count)assert.ok(Math.max(...loads)-Math.min(...loads)<=1);assert.ok(t.entries.every(e=>e.seat<=capacity));
  if(players===12)assert.deepEqual(loads,[6,6]);if(players===13)assert.deepEqual(loads,[7,6]);
 }
});

test('undo elimination never restores a removed seat and finished tournaments lock capacity',()=>{
 let {s,event}=setup(20);s=act(s,event,{type:'auto-seat'});const victim=s.tournaments[0].entries.find(e=>e.seat===10).id;s=act(s,event,{type:'eliminate',entryId:victim});s=act(s,event,{type:'seating-settings',seatsPerTable:9});const before=clone(s);assert.throws(()=>act(s,event,{type:'undo-elimination'}),/original seat no longer exists/);assert.deepEqual(s,before);
 const one=setup(1);const finished=act(one.s,one.event,{type:'finish'});assert.throws(()=>act(finished,one.event,{type:'seating-settings',seatsPerTable:9}),/locked/);
});

function manualSeats(players=10,capacity=10){const result=setup(players);const t=result.s.tournaments[0];t.settings.seatsPerTable=capacity;t.entries.forEach((e,i)=>{e.table=Math.floor(i/capacity)+1;e.seat=i%capacity+1;});return result;}
function assertValidSeats(t){const seated=t.entries.filter(e=>!e.eliminatedAt&&e.table);assert.equal(new Set(seated.map(e=>`${e.table}/${e.seat}`)).size,seated.length);assert.ok(seated.every(e=>e.seat>=1&&e.seat<=t.settings.seatsPerTable));}

test('manual moves use empty seats, swap occupants and retain player identity and records',()=>{
 let {s,event}=manualSeats(7);const before=clone(s),source=s.tournaments[0].entries[6].id,target=s.tournaments[0].entries[0].id;
 s=act(s,event,{type:'seat-move',entryId:source,table:1,seat:9,mode:'move'});assert.equal(s.tournaments[0].entries[6].seat,9);assert.equal(s.tournaments[0].entries[0].seat,1);
 s=act(s,event,{type:'seat-move',entryId:source,table:1,seat:1,mode:'swap'});assert.equal(s.tournaments[0].entries[6].seat,1);assert.equal(s.tournaments[0].entries.find(e=>e.id===target).seat,9);assertValidSeats(s.tournaments[0]);
 for(let i=0;i<s.tournaments[0].entries.length;i++){const {table,seat,...entry}=s.tournaments[0].entries[i],{table:oldTable,seat:oldSeat,...original}=before.tournaments[0].entries[i];assert.deepEqual(entry,original);}assert.deepEqual(s.players,before.players);
});

test('sliding seven to one uses the vacated seventh seat and leaves seats eight through ten unchanged',()=>{
 const {s,event}=manualSeats(10),before=clone(s),source=s.tournaments[0].entries[6].id;
 const moved=act(s,event,{type:'seat-move',entryId:source,table:1,seat:1,mode:'slide'});const entries=moved.tournaments[0].entries;assert.equal(entries[6].seat,1);for(let i=0;i<6;i++)assert.equal(entries[i].seat,i+2);for(let i=7;i<10;i++)assert.equal(entries[i].seat,i+1);assertValidSeats(moved.tournaments[0]);assert.deepEqual(s,before);
});

test('a slide stops at the first gap and cannot push anyone past the final seat',()=>{
 const {s,event}=manualSeats(10),before=clone(s);assert.throws(()=>act(s,event,{type:'seat-move',entryId:s.tournaments[0].entries[0].id,table:1,seat:7,mode:'slide'}),/no empty seat.*Seat 10/);assert.deepEqual(s,before);
 s.tournaments[0].entries[2].table=null;s.tournaments[0].entries[2].seat=null;const moved=act(s,event,{type:'seat-move',entryId:s.tournaments[0].entries[6].id,table:1,seat:1,mode:'slide'}),entries=moved.tournaments[0].entries;assert.equal(entries[0].seat,2);assert.equal(entries[1].seat,3);assert.equal(entries[3].seat,4);assert.equal(entries[6].seat,1);assert.equal(entries[9].seat,10);assertValidSeats(moved.tournaments[0]);
});

test('cross-table swaps work on full tables and cross-table slides require a free destination seat',()=>{
 let {s,event}=manualSeats(20);const source=s.tournaments[0].entries[16].id;
 assert.throws(()=>act(s,event,{type:'seat-move',entryId:source,table:1,seat:7,mode:'slide'}),/no empty seat/);
 const swapped=act(s,event,{type:'seat-move',entryId:source,table:1,seat:1,mode:'swap'});assert.equal(swapped.tournaments[0].entries[16].table,1);assert.equal(swapped.tournaments[0].entries[0].table,2);assert.equal(swapped.tournaments[0].entries[0].seat,7);assertValidSeats(swapped.tournaments[0]);
 s.tournaments[0].entries[9].table=null;s.tournaments[0].entries[9].seat=null;s=act(s,event,{type:'seat-move',entryId:source,table:1,seat:7,mode:'slide'});assert.equal(s.tournaments[0].entries[16].seat,7);assert.equal(s.tournaments[0].entries[6].seat,8);assert.equal(s.tournaments[0].entries[7].seat,9);assert.equal(s.tournaments[0].entries[8].seat,10);assertValidSeats(s.tournaments[0]);
});

test('manual moves reject missing choices, invalid seats, eliminated players and finished events',()=>{
 const {s,event}=manualSeats(10),source=s.tournaments[0].entries[6].id;
 assert.throws(()=>act(s,event,{type:'seat-move',entryId:source,table:1,seat:1}),/occupied.*Swap/);
 for(const target of [{table:0,seat:1},{table:3,seat:1},{table:1,seat:11},{table:1,seat:1.5}])assert.throws(()=>act(s,event,{type:'seat-move',entryId:source,...target,mode:'swap'}),/Invalid table or seat/);
 assert.throws(()=>act(s,event,{type:'seat-move',entryId:source,table:1,seat:1,mode:'unknown'}),/valid seat move/);
 const eliminated=act(s,event,{type:'eliminate',entryId:source});assert.throws(()=>act(eliminated,event,{type:'seat-move',entryId:source,table:1,seat:1,mode:'swap'}),/remaining players/);
 const one=manualSeats(1),finished=act(one.s,one.event,{type:'finish'});assert.throws(()=>act(finished,one.event,{type:'seat-move',entryId:finished.tournaments[0].entries[0].id,table:1,seat:1}),/locked/);
 s.tournaments[0].entries[6].table=null;s.tournaments[0].entries[6].seat=null;assert.throws(()=>act(s,event,{type:'seat-move',entryId:source,table:1,seat:1,mode:'swap'}),/already have a seat/);
});

test('all swaps and possible insertion slides preserve one player per valid seat',()=>{
 for(const capacity of [2,9,10,12])for(let from=1;from<=capacity;from++)for(let to=1;to<=capacity;to++)for(const mode of ['swap','slide']){
  const {s,event}=manualSeats(capacity,capacity),action={type:'seat-move',entryId:s.tournaments[0].entries[from-1].id,table:1,seat:to,mode};
  if(mode==='slide'&&from<to){assert.throws(()=>act(s,event,action),/no empty seat/);continue;}
  const result=act(s,event,action);assertValidSeats(result.tournaments[0]);assert.equal(result.tournaments[0].entries[from-1].seat,to);assert.equal(result.tournaments[0].entries.length,capacity);
 }
});

test('initial seating balances tables and seating remaining players never changes existing seats or locks',()=>{
 let {s,event}=setup(12);s.tournaments[0].entries.forEach(e=>{e.table=null;e.seat=null;});s=act(s,event,{type:'seat-remaining',order:s.tournaments[0].entries.map(e=>e.id).reverse()});let t=s.tournaments[0];assert.deepEqual([1,2].map(n=>t.entries.filter(e=>e.table===n).length),[6,6]);assertValidSeats(t);
 const locked=t.entries[0].id;s=act(s,event,{type:'seat-lock',entryId:locked,locked:true});const before=clone(s.tournaments[0].entries);
 const player=id();s=execute(s,{type:'player-save',id:player,name:'Late arrival'});s=act(s,event,{type:'register',playerId:player});s=act(s,event,{type:'seat-remaining'});t=s.tournaments[0];assert.deepEqual(t.entries.slice(0,12),before);assert.equal(t.entries.at(-1).table,1);assert.equal(t.entries.find(e=>e.id===locked).seatLocked,true);assertValidSeats(t);
});
function reducedTables(players,keep){const result=manualSeats(players);for(const [i,e] of result.s.tournaments[0].entries.entries())if(!keep.includes(i)){e.eliminatedAt=start+1;e.table=null;e.seat=null;}return result;}
test('combining three tables into two moves only closing-table players into vacant seats',()=>{
 const {s,event}=reducedTables(30,[0,1,2,3,4,5,6,7,10,11,12,13,14,15,20,21]);const before=clone(s);const result=act(s,event,{type:'combine-tables',mode:'combine'}),t=result.tournaments[0];
 assert.equal(tablesInUse(t),2);for(let i=0;i<20;i++)assert.deepEqual(t.entries[i],before.tournaments[0].entries[i]);assert.equal(t.entries[20].table,2);assert.equal(t.entries[21].table,2);assertValidSeats(t);assert.deepEqual(s,before);
 assert.throws(()=>act(s,event,{type:'combine-tables',mode:'redraw'}),/only.*final table/);assert.throws(()=>act(result,event,{type:'combine-tables',mode:'combine'}),/No tables/);
});
test('combining four tables into two retains all existing seats at the surviving tables',()=>{
 const keep=[0,1,2,3,10,11,12,13,20,21,22,23,30,31,32,33],{s,event}=reducedTables(40,keep),before=clone(s.tournaments[0]);
 const result=act(s,event,{type:'combine-tables',mode:'combine'}).tournaments[0];assert.equal(tablesInUse(result),2);for(const i of keep.filter(i=>i<20))assert.deepEqual(result.entries[i],before.entries[i]);assertValidSeats(result);
});
test('final table can retain its seats or redraw everyone except locked players',()=>{
 let {s,event}=reducedTables(20,[0,2,4,10,11,12]);s=act(s,event,{type:'seat-lock',entryId:s.tournaments[0].entries[0].id,locked:true});s=act(s,event,{type:'seat-lock',entryId:s.tournaments[0].entries[4].id,locked:true});const before=clone(s),active=s.tournaments[0].entries.filter(e=>!e.eliminatedAt);
 const kept=act(s,event,{type:'combine-tables',mode:'combine'}).tournaments[0];for(const i of [0,2,4])assert.deepEqual(kept.entries[i],s.tournaments[0].entries[i]);assert.equal(tablesInUse(kept),1);assertValidSeats(kept);
 const redrawn=act(s,event,{type:'combine-tables',mode:'redraw',order:active.map(e=>e.id).reverse()}).tournaments[0];assert.deepEqual(redrawn.entries[0],s.tournaments[0].entries[0]);assert.deepEqual(redrawn.entries[4],s.tournaments[0].entries[4]);assert.equal(redrawn.entries[12].seat,2);assert.ok(redrawn.entries.filter(e=>!e.eliminatedAt).every(e=>e.table===1));assertValidSeats(redrawn);assert.deepEqual(s,before);
});
test('locked players at closing tables block merging, final-table choices and legacy shuffling atomically',()=>{
 for(const keep of [[0,1,2,10,11,12],[0,1,2,3,4,5,10,11,12,13,14,15,20]]){
  let {s,event}=reducedTables(keep.length>10?30:20,keep);const entry=s.tournaments[0].entries[keep.at(-1)];s=act(s,event,{type:'seat-lock',entryId:entry.id,locked:true});const before=clone(s);
  for(const action of [{type:'combine-tables',mode:'combine'},{type:'auto-seat'},...(keep.length<10?[{type:'combine-tables',mode:'redraw'}]:[])])assert.throws(()=>act(s,event,action),/Unlock.*Table.*Seat/);
  assert.deepEqual(s,before);s=act(s,event,{type:'seat-lock',entryId:entry.id,locked:false});s=act(s,event,{type:'combine-tables',mode:'combine'});assertValidSeats(s.tournaments[0]);
 }
});
test('locks prevent direct moves, swaps, insertion slides, unseating and removing their seat',()=>{
 let {s,event}=manualSeats(10);const [first,,third]=s.tournaments[0].entries;s=act(s,event,{type:'seat-lock',entryId:third.id,locked:true});const before=clone(s);
 for(const action of [
  {type:'seat-move',entryId:third.id,table:1,seat:1,mode:'swap'},
  {type:'seat-move',entryId:first.id,table:1,seat:3,mode:'swap'},
  {type:'seat-move',entryId:s.tournaments[0].entries[6].id,table:1,seat:1,mode:'slide'},
  {type:'seat',entryId:third.id,table:null,seat:null},
  {type:'seat',entryId:third.id,table:1,seat:11},
  {type:'seating-settings',seatsPerTable:2}
 ])assert.throws(()=>act(s,event,action),/Unlock/);
 assert.deepEqual(s,before);s=act(s,event,{type:'auto-seat',order:s.tournaments[0].entries.map(e=>e.id).reverse()});assert.equal(s.tournaments[0].entries[2].seat,3);assertValidSeats(s.tournaments[0]);
});
test('seat locks are per tournament, require a seated active player and restore safely on elimination undo',()=>{
 let {s,event}=manualSeats(3);const entry=s.tournaments[0].entries[0].id;s=act(s,event,{type:'seat-lock',entryId:entry,locked:true});s=act(s,event,{type:'eliminate',entryId:entry});assert.equal(s.tournaments[0].entries[0].seatLocked,false);assert.throws(()=>act(s,event,{type:'seat-lock',entryId:entry,locked:true}),/seated remaining/);
 const restored=act(s,event,{type:'undo-elimination'});assert.equal(restored.tournaments[0].entries[0].seatLocked,true);assert.equal(restored.tournaments[0].entries[0].seat,1);
 s=act(s,event,{type:'seat',entryId:s.tournaments[0].entries[1].id,table:1,seat:1});const blocked=clone(s);assert.throws(()=>act(s,event,{type:'undo-elimination'}),/occupied/);assert.deepEqual(s,blocked);assert.throws(()=>act(s,event,{type:'seat-lock',entryId:entry,locked:true}),/seated remaining/);
 const one=manualSeats(1);one.s=act(one.s,one.event,{type:'finish'});assert.throws(()=>act(one.s,one.event,{type:'seat-lock',entryId:one.s.tournaments[0].entries[0].id,locked:true}),/Completed tournament/);
});


test('configurable guarantees trigger at the saved registered count, fund the minimum and revert below it',()=>{
 const {s}=setup(8),t=s.tournaments[0];t.settings={...t.settings,payoutMode:'guaranteed',guaranteeAmount:75000,guaranteePlayers:8};
 const below=clone(t);below.entries.pop();assert.equal(financials(below).guaranteeActive,false);assert.equal(financials(below).guaranteeContribution,0);assert.deepEqual(prizes(below),[14500,7900]);assert.equal(below.settings.payoutMode,'guaranteed');
 assert.equal(financials(t).guaranteeActive,true);assert.equal(financials(t).guaranteeContribution,49400);assert.deepEqual(prizes(t),[75000,0]);
 t.settings.houseContribution=94400;assert.equal(financials(t).pool,120000);assert.equal(financials(t).guaranteeContribution,0);assert.deepEqual(prizes(t),[78000,42000]);assert.equal(prizes(t).reduce((a,b)=>a+b),financials(t).pool);
 t.entries.pop();assert.equal(financials(t).guaranteeActive,false);assert.equal(prizes(t).length,2);t.entries.push(clone(s.tournaments[0].entries[0]));assert.equal(financials(t).guaranteeActive,true);
});

test('legacy guarantees retain $1000 at ten and invalid configurable terms are rejected',()=>{
 const {s}=setup(10),t=s.tournaments[0];t.settings.payoutMode='guaranteed';delete t.settings.guaranteeAmount;delete t.settings.guaranteePlayers;
 assert.deepEqual(prizes(t),[100000,0]);assert.equal(financials(t).guaranteeContribution,68000);assert.equal('guaranteeAmount' in t.settings,false);
 for(const [key,value] of [['guaranteeAmount',0],['guaranteeAmount',75050],['guaranteeAmount',-100],['guaranteePlayers',0],['guaranteePlayers',8.5],['guaranteePlayers',NaN]]){
  const template=clone(s.templates[0]);template.settings[key]=value;assert.throws(()=>execute(s,{type:'template-save',template}),/guarantee/);
 }
});

test('saved guarantee terms copy to events and custom payouts remember their automatic source',()=>{
 let {s,event}=setup(8);let template=clone(s.templates[0]);Object.assign(template.settings,{payoutMode:'guaranteed',guaranteeAmount:75000,guaranteePlayers:8});
 s=execute(s,{type:'template-save',template});s=execute(s,{type:'tournament-create',id:'copied',name:'Configured guarantee',templateId:template.id});assert.equal(s.tournaments[1].settings.guaranteeAmount,75000);assert.equal(s.tournaments[1].settings.guaranteePlayers,8);
 s=act(s,event,{type:'payout-settings',settings:{...s.tournaments[0].settings,...template.settings}});s=act(s,event,{type:'clock',command:'start'});
 assert.throws(()=>act(s,event,{type:'tournament-settings',settings:{...s.tournaments[0].settings,guaranteePlayers:9}}),/Use Save Payouts/);
 s=act(s,event,{type:'payout-settings',custom:true,settings:{...s.tournaments[0].settings,payoutMode:'fixed',houseContribution:49400,payouts:[50000,25000]}});
 assert.equal(s.tournaments[0].payoutAutomatic.guaranteeAmount,75000);assert.equal(s.tournaments[0].payoutAutomatic.guaranteePlayers,8);assert.equal(s.tournaments[0].payoutAutomatic.guaranteeContribution,49400);assert.deepEqual(prizes(s.tournaments[0]),[50000,25000]);
});


test('each saved structure snapshots its own appearance and new tournaments keep independent copies',()=>{
 let {s,event}=setup(3);const existing=clone(s.tournaments[0]);s=execute(s,{type:'clock-appearance-defaults',appearance:{background:'#112233',timerStyle:'separate'}});
 const first=clone(s.templates[0]);first.clockAppearance={background:'#07182e',timerStyle:'stripes'};s=execute(s,{type:'template-save',template:first});const second=clone(first);second.id='second-color-structure';second.name='Second color structure';second.clockAppearance={background:'#071b15',timerStyle:'gradient'};s=execute(s,{type:'template-save',template:second});
 s=execute(s,{type:'tournament-create',id:'blue-event',name:'Blue event',templateId:first.id});s=execute(s,{type:'tournament-create',id:'green-event',name:'Green event',templateId:second.id});assert.equal(s.tournaments[1].clockAppearance.background,'#07182e');assert.equal(s.tournaments[1].clockAppearance.timerStyle,'stripes');assert.equal(s.tournaments[2].clockAppearance.background,'#071b15');assert.equal(s.tournaments[2].clockAppearance.timerStyle,'gradient');assert.deepEqual(s.tournaments[0],existing);
 const updated=clone(s.templates[0]);updated.clockAppearance={background:'#331122',timerStyle:'solid'};s=execute(s,{type:'template-save',template:updated});assert.equal(s.tournaments[1].clockAppearance.background,'#07182e');s=execute(s,{type:'clock-appearance-defaults',appearance:{background:'#ffffff'}});s=execute(s,{type:'tournament-create',id:'blue-event-2',name:'Next blue event',templateId:first.id});assert.equal(s.tournaments[3].clockAppearance.background,'#331122');assert.equal(s.tournaments[2].clockAppearance.background,'#071b15');
 const invalid=clone(updated);invalid.clockAppearance.background='bad-color';assert.throws(()=>execute(s,{type:'template-save',template:invalid}),/clock color/);
});

test('legacy structures use preferred defaults until saved, then preserve their own appearance',()=>{
 let s=initialState();s=execute(s,{type:'clock-appearance-defaults',appearance:{background:'#112233'}});s=execute(s,{type:'tournament-create',id:'legacy-color',name:'Legacy color',templateId:s.templates[0].id});assert.equal(s.tournaments[0].clockAppearance.background,'#112233');s=execute(s,{type:'template-save',template:s.templates[0]});assert.equal(s.templates[0].clockAppearance.background,'#112233');s=execute(s,{type:'clock-appearance-defaults',appearance:{background:'#334455'}});s=execute(s,{type:'tournament-create',id:'saved-color',name:'Saved color',templateId:s.templates[0].id});assert.equal(s.tournaments[1].clockAppearance.background,'#112233');
});


test('tournament creation and settings can override clock appearance without changing the saved structure or running deadline',()=>{
 let {s,event}=setup(3);const template=clone(s.templates[0]);s=execute(s,{type:'tournament-create',id:'own-clock-event',name:'Own clock event',templateId:template.id,clockAppearance:{background:'#112233',timerStyle:'gradient'}});assert.equal(s.tournaments[1].clockAppearance.background,'#112233');assert.deepEqual(s.templates[0],template);s=act(s,event,{type:'clock',command:'start'});const clock=clone(s.tournaments[0].clock);s=act(s,event,{type:'tournament-settings',settings:s.tournaments[0].settings,clockAppearance:{background:'#334455',timerStyle:'separate'}});assert.equal(s.tournaments[0].clockAppearance.background,'#334455');assert.deepEqual(s.tournaments[0].clock,clock);assert.deepEqual(s.templates[0],template);assert.equal(s.tournaments[1].clockAppearance.background,'#112233');
});


test('explicit random balancing order selects eligible movers without shuffling retained seats or moving locks/pending players',()=>{
 let {s,event}=manualSeats(20);s=act(s,event,{type:'eliminate',entryId:s.tournaments[0].entries[19].id});s=act(s,event,{type:'eliminate',entryId:s.tournaments[0].entries[18].id});const before=clone(s),entries=s.tournaments[0].entries,chosen=entries[1].id;entries[0].seatLocked=true;entries[2].pendingElimination={id:'pending-reserved',requestedAt:start,expiresAt:start+5000};const order=[entries[0].id,entries[2].id,chosen,...entries.map(e=>e.id).filter(id=>![entries[0].id,entries[2].id,chosen].includes(id))];const result=act(s,event,{type:'combine-tables',mode:'combine',order});assert.equal(result.tournaments[0].entries[1].table,2);assert.equal(result.tournaments[0].entries[0].table,1);assert.deepEqual(result.tournaments[0].entries[2],entries[2]);for(let i=3;i<18;i++)assert.deepEqual(result.tournaments[0].entries[i],entries[i]);assertValidSeats(result.tournaments[0]);assert.equal(result.tournaments[0].entries.filter(e=>!e.eliminatedAt&&e.table===1).length,9);assert.equal(result.tournaments[0].entries.filter(e=>!e.eliminatedAt&&e.table===2).length,9);
});

test('saved clock layout library retains edits, rejects duplicate names, and protects assigned layouts',()=>{
 let state=initialState();
 assert.deepEqual(state.clockLayouts,[]);
 const appearance={...state.clockAppearanceDefaults,background:'#102030',timerFontScale:125};
 state=execute(state,{type:'clock-layout-save',layout:{id:'layout-one',name:'Feature Layout',appearance}});
 assert.equal(state.clockLayouts[0].name,'Feature Layout');
 assert.equal(state.clockLayouts[0].appearance.background,'#102030');
 assert.equal(state.clockLayouts[0].appearance.timerFontScale,125);
 assert.throws(()=>execute(state,{type:'clock-layout-save',layout:{id:'layout-two',name:'feature layout',appearance}}),/already exists/);
 assert.throws(()=>execute(state,{type:'clock-layout-save',layout:{name:'Default Layout',appearance}}),/reserved/);
 const template={...clone(state.templates[0]),levels:clone(state.templates[0].levels)};
 template.levels[0].layoutId='layout-one';
 state=execute(state,{type:'template-save',template});
 assert.throws(()=>execute(state,{type:'clock-layout-delete',id:'layout-one'}),/assigned/);
 template.levels[0].layoutId='';
 state=execute(state,{type:'template-save',template});
 state=execute(state,{type:'clock-layout-delete',id:'layout-one'});
 assert.equal(state.clockLayouts.length,0);
});
