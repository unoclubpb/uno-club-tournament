import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,execute,clone} from '../src/domain.mjs';
import {mergeBrowserWorkspace} from '../src/workspace.mjs';

test('import keeps cloud identities and numbers while bringing across browser histories intact',()=>{
 let cloud=execute(initialState(),{type:'player-save',id:'cloud-1',name:'Cloud Player'});cloud=execute(cloud,{type:'player-archive',id:'cloud-1'});
 let browser=execute(initialState(),{type:'player-save',id:'browser-1',name:'Browser Player'});browser=execute(browser,{type:'tournament-create',id:'event-1',name:'Existing Event',templateId:browser.templates[0].id});browser=execute(browser,{type:'register',tournamentId:'event-1',playerId:'browser-1',paid:true});
 const original=clone(browser),merged=mergeBrowserWorkspace(cloud,browser);
 assert.deepEqual(merged.players.map(p=>[p.id,p.playerNumber]),[['cloud-1',1],['browser-1',2]]);assert.equal(merged.players[0].archived,true);assert.deepEqual(merged.tournaments,browser.tournaments);assert.deepEqual(browser,original);assert.deepEqual(mergeBrowserWorkspace(merged,browser),merged);
});

test('import refuses conflicting names, changed records and changed tournament versions without partial changes',()=>{
 const cloud=execute(initialState(),{type:'player-save',id:'cloud-1',name:'Alex'}),before=clone(cloud);
 let browser=execute(initialState(),{type:'player-save',id:'browser-1',name:' ALEX '});assert.throws(()=>mergeBrowserWorkspace(cloud,browser),/already belongs/);assert.deepEqual(cloud,before);
 browser=clone(cloud);browser.players[0].phone='555-123-0100';assert.throws(()=>mergeBrowserWorkspace(cloud,browser),/versions.*differ/);assert.deepEqual(cloud,before);
 let event=execute(cloud,{type:'tournament-create',id:'event-1',name:'Event',templateId:cloud.templates[0].id});browser=clone(event);browser.tournaments[0].name='Changed';assert.throws(()=>mergeBrowserWorkspace(event,browser),/versions.*differ/);
});
