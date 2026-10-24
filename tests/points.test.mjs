import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,execute,prizes,icmProposal,clone,upgradeState} from '../src/domain.mjs';
import {parsePoints,pointsLabel,finishBonus,chopPoints,pointPreview,pointsState,leaderboardRows,filteredAwards} from '../src/points.mjs';
const now=Date.parse('2026-10-24T22:00:00Z');
function fixture(n=12,date='2026-10-24',seed=initialState(),tid='t'){
 let s=execute(seed,{type:'tournament-create',id:tid,name:'Points '+tid,date,templateId:seed.templates[0].id},now);
 for(let i=1;i<=n;i++){if(!s.players.some(p=>p.id==='p'+i))s=execute(s,{type:'player-save',id:'p'+i,name:'Player '+i},now);s=execute(s,{type:'register',id:tid+'e'+i,tournamentId:tid,playerId:'p'+i},now);}return s;
}
function eliminateTo(s,count,tid='t'){for(let i=s.tournaments.find(t=>t.id===tid).entries.length;i>count;i--)s=execute(s,{type:'eliminate',tournamentId:tid,entryId:tid+'e'+i},now+i);return s;}
function finish(s,tid='t'){return execute(eliminateTo(s,1,tid),{type:'finish',tournamentId:tid},now+100);}
test('normal finishes award one participation point plus the exact ninth-through-first bonuses, once',()=>{
 let s=fixture();assert.equal(s.points,undefined);s=finish(s);const awards=s.points.awards;assert.deepEqual(awards.map(a=>a.hundredths),[1100,1000,900,800,700,600,500,400,300,100,100,100]);assert.equal(awards.length,12);assert.equal(new Set(awards.map(a=>a.id)).size,12);assert.throws(()=>execute(s,{type:'finish',tournamentId:'t'},now+200),/locked/);assert.equal(upgradeState(s).points.awards.length,12);assert.equal(finishBonus(10),0);
});
test('four-way and two-way manual chops share finishing points equally regardless of money, preserving previous eliminations',()=>{
 for(const [count,expected] of [[4,950],[2,1050],[11,591]]){
  let s=eliminateTo(fixture(),count),t=s.tournaments[0],pool=prizes(t).slice(0,count).reduce((a,b)=>a+b,0),before=clone(t.entries.filter(e=>e.eliminatedAt));
  s=execute(s,{type:'manual-chop-accept',tournamentId:'t',participants:t.entries.filter(e=>!e.eliminatedAt).map((e,i)=>({entryId:e.id,payout:i===0?pool:0}))},now+100);
  t=s.tournaments[0];assert.equal(t.endedBy,'manual-chop');assert.equal(t.clock.status,'ended');assert.deepEqual(t.entries.filter(e=>e.eliminatedAt),before);assert.ok(s.points.awards.slice(0,count).every(a=>a.hundredths===expected&&a.place===null&&a.chopSize===count));assert.equal(s.points.awards[11].hundredths,100);assert.throws(()=>execute(s,{type:'manual-chop-accept',tournamentId:'t',participants:[]}),/locked/);
 }
 assert.equal(chopPoints(4),950);assert.equal(chopPoints(2),1050);
});
test('ICM equities and negotiated payout amounts never affect points, and payout edits alone do not award points',()=>{
 let s=eliminateTo(fixture(),4),t=s.tournaments[0];const pool=prizes(t).reduce((a,b)=>a+b,0);s=execute(s,{type:'payout-settings',tournamentId:'t',custom:true,settings:{...t.settings,payoutMode:'fixed',payouts:[pool,0,0,0]}},now);assert.equal(s.points,undefined);t=s.tournaments[0];const proposal=icmProposal(t,t.entries.filter(e=>!e.eliminatedAt).map((e,i)=>({entryId:e.id,chips:(i+1)*1000})));s=execute(s,{type:'icm-accept',tournamentId:'t',participants:proposal.participants},now+100);assert.ok(s.points.awards.filter(a=>a.chopSize).every(a=>a.hundredths===950));assert.equal(s.tournaments[0].icmChop.participants.length,4);assert.ok(s.tournaments[0].icmChop.participants.every(p=>p.chips>0));
});
test('point entry rounding is decimal half-up, with no negative or invalid scores accepted',()=>{
 for(const [value,expected] of [['5.755',576],['1.005',101],['5.7549',575],['0.005',1],['0',0],['1,234.567',123457]])assert.equal(parsePoints(value),expected);assert.equal(pointsLabel(576),'5.76');for(const bad of ['-1','abc','NaN','Infinity','1e2','1,23','', '9999999999999999999999'])assert.throws(()=>parsePoints(bad));
});
test('profile corrections keep original scores and an audit, update totals, and reject stale/cross-player entries atomically',()=>{
 let s=finish(fixture()),a=s.points.awards[0],initial=clone(s.tournaments);s=execute(s,{type:'points-edit',playerId:'p1',changes:[{awardId:a.id,expectedHundredths:1100,value:'5.755'}],reason:'Corrected result'},now+200);a=s.points.awards[0];assert.equal(a.hundredths,576);assert.equal(a.originalHundredths,1100);assert.deepEqual(a.corrections,[{at:now+200,from:1100,to:576,reason:'Corrected result'}]);assert.equal(leaderboardRows(s,{period:'lifetime'}).find(r=>r.player.id==='p1').total,576);assert.deepEqual(s.tournaments,initial);const before=clone(s);assert.throws(()=>execute(s,{type:'points-edit',playerId:'p2',changes:[{awardId:a.id,expectedHundredths:576,value:'7'}]}),/this player/);assert.throws(()=>execute(s,{type:'points-edit',playerId:'p1',changes:[{awardId:a.id,expectedHundredths:1100,value:'7'}]}),/another device/);assert.deepEqual(s,before);
});
test('new seasons archive scores without resetting history; current, archived, month, year and lifetime filters agree',()=>{
 let s=finish(fixture(2,'2026-09-30')),original=clone(s.points.awards),oldSeason=s.points.currentSeasonId;s=execute(s,{type:'points-season-start',id:'winter',name:'Winter Season'},now+200);assert.equal(s.points.seasons[0].archivedAt,now+200);assert.deepEqual(s.points.awards,original);assert.ok(leaderboardRows(s,{period:'current'}).every(r=>r.total===0));s=finish(fixture(2,'2026-10-24',s,'t2'),'t2');assert.equal(filteredAwards(s,{period:'season',seasonId:oldSeason}).length,2);assert.equal(filteredAwards(s,{period:'month',month:'2026-09'}).length,2);assert.equal(filteredAwards(s,{period:'year',year:2026}).length,4);assert.equal(filteredAwards(s,{period:'lifetime'}).length,4);assert.equal(leaderboardRows(s,{period:'current'})[0].total,1100);assert.equal(leaderboardRows(s,{period:'lifetime'})[0].total,2200);assert.equal(s.tournaments.length,2);assert.throws(()=>execute(s,{type:'points-season-start',id:'winter2',name:'Winter Season'}),/already exists/);
});
test('pending eliminations and active tournaments cannot be bypassed by chopping or starting a season',()=>{
 const s=fixture(4);assert.throws(()=>execute(s,{type:'points-season-start',id:'next',name:'Next'}),/Finish the active/);const t=s.tournaments[0];t.entries[0].pendingElimination={id:'p',expiresAt:now+5000};assert.throws(()=>execute(s,{type:'manual-chop-accept',tournamentId:'t',participants:t.entries.map((e,i)=>({entryId:e.id,payout:prizes(t)[i]||0}))}),/pending/);assert.equal(s.points,undefined);
});
test('leaderboard ties share rank, archived players retain earned points, previews never write and older history is not backfilled',()=>{
 let s=eliminateTo(fixture(4),4),t=s.tournaments[0];const before=clone(s),preview=pointPreview(t,'manual-chop');assert.ok(preview.every(p=>p.hundredths===950));assert.deepEqual(s,before);s=execute(s,{type:'manual-chop-accept',tournamentId:'t',participants:t.entries.map((e,i)=>({entryId:e.id,payout:prizes(t)[i]||0}))},now+100);s.players[0].archived=true;const rows=leaderboardRows(s,{period:'current'});assert.ok(rows.every(r=>r.rank===1&&r.total===950));delete s.points;assert.equal(pointsState(s).awards.length,0);assert.equal(s.points,undefined);
});
