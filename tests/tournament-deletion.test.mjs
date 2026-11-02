import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,execute,clone} from '../src/domain.mjs';
import * as published from '../chunks/chunk-CDIEYG7T.js';
import {leaderboardRows} from '../src/points.mjs';
for(const [label,initial,run] of [['source',initialState,execute],['published',published.C,published.X]]){
 const setup=()=>{let s=initial();s=run(s,{type:'tournament-create',id:'t',name:'Delete test',templateId:s.templates[0].id});for(let i=1;i<=3;i++){s=run(s,{type:'player-save',id:'p'+i,name:'Player '+i});s=run(s,{type:'register',id:'e'+i,tournamentId:'t',playerId:'p'+i});}s.tournaments[0].entries.forEach((e,i)=>{e.table=1;e.seat=i+1;});return s;};
 for(const stage of ['ready','running','paused','completed'])test(`${label}: delete ${stage} tournament voids its results and points, retaining archives and players`,()=>{
  let s=setup();if(stage!=='ready')s=run(s,{type:'clock',tournamentId:'t',command:'start'});
  if(stage==='paused')s=run(s,{type:'clock',tournamentId:'t',command:'pause'});
  if(stage==='completed'){for(const id of ['e3','e2'])s=run(s,{type:'eliminate',tournamentId:'t',entryId:id});s=run(s,{type:'finish',tournamentId:'t'});assert.equal(s.points.awards.length,3);}
  // Include previously archived history and unrelated points to verify targeted rollback.
  const archive={...clone(s.tournaments[0]),id:'past',status:'completed',archivedAt:1};s.tournaments.unshift(archive);
  s.points||={version:1,currentSeasonId:'season-initial',seasons:[{id:'season-initial',name:'Season 1'}],awards:[]};
  s.points.awards.push({id:'past-point',tournamentId:'past',playerId:'p1',seasonId:s.points.currentSeasonId,date:'2026-10-01',hundredths:100});
  const players=clone(s.players),before=clone(s);const result=run(s,{type:'tournament-delete',tournamentId:'t'});
  assert.deepEqual(s,before);assert.deepEqual(result.players,players);assert.deepEqual(result.tournaments,[archive]);assert.deepEqual(result.points.awards,[s.points.awards.at(-1)]);assert.equal(leaderboardRows(result,{period:'lifetime'}).find(p=>p.player.id==='p1').total,100);
  assert.doesNotThrow(()=>run(result,{type:'tournament-create',id:'next',name:'Next',templateId:result.templates[0].id}));
 });
 test(`${label}: archived tournaments cannot be deleted and unarchived completed tournaments block creation`,()=>{
  let s=setup();for(const status of ['open','completed']){s.tournaments[0].status=status;const before=clone(s);assert.throws(()=>run(s,{type:'tournament-create',id:'next',name:'Next',templateId:s.templates[0].id}),/must archive/);assert.deepEqual(s,before);}
  s=run(s,{type:'tournament-archive',tournamentId:'t'});assert.throws(()=>run(s,{type:'tournament-delete',tournamentId:'t'}),/Archived tournaments cannot/);assert.doesNotThrow(()=>run(s,{type:'tournament-create',id:'next',name:'Next',templateId:s.templates[0].id}));
 });
}
