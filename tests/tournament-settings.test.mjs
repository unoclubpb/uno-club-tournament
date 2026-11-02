import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,execute,clone} from '../src/domain.mjs';
import * as published from '../chunks/chunk-CDIEYG7T.js';
for(const [label,initial,run] of [['source',initialState,execute],['published',published.C,published.X]])test(label+': tournament copy can be renamed and edited while saved structures are protected and layouts remain editable',()=>{
 let s=initial();const template=clone(s.templates[0]);s=run(s,{type:'tournament-create',id:'t',name:'Wednesday',templateId:template.id});assert.throws(()=>run(s,{type:'template-save',template:{...template,name:'Changed original'}}),/Saved structures are locked/);assert.throws(()=>run(s,{type:'template-delete',id:template.id}),/Saved structures are locked/);
 s=run(s,{type:'tournament-settings',updateExistingEntries:true,tournamentId:'t',name:'New Wednesday',settings:{...s.tournaments[0].settings,startingStack:12000,buyIn:7500}});assert.equal(s.tournaments[0].name,'New Wednesday');assert.equal(s.tournaments[0].settings.startingStack,12000);assert.deepEqual(s.templates[0],template);
 s=run(s,{type:'clock-layout-save',layout:{id:'new-layout',name:'New Layout'}});assert.ok(s.clockLayouts.some(l=>l.id==='new-layout'));
 s=run(s,{type:'tournament-delete',tournamentId:'t'});assert.doesNotThrow(()=>run(s,{type:'template-save',template}));
});
