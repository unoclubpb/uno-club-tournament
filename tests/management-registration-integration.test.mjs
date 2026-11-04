import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const registration=readFileSync(new URL('../src/tournament-registration-screen.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('Tournament Management uses one Players screen for registration and the roster',()=>{
  assert.match(source,/tab==='players'\?`<div class="management-registration-embedded">\$\{signup\(true\)\}/);
  assert.match(registration,/renderRegistrationTabs\(registrationPanel,t\.entries\.length\)/);
  assert.match(registration,/embedded\?'all':registrationPanel/);
  assert.match(registration,/Register a player/);
  assert.match(registration,/Registered players/);
  assert.match(registration,/entryRows\(t,embedded\)/);
  assert.match(registration,/management-players-combined/);
  assert.doesNotMatch(source,/data-player-subtab=/);
});

test('new tournaments open the combined Players screen with registration selected',()=>{
  const i=source.indexOf("if(form.id==='new-tournament-form')");
  assert.ok(i>=0);
  const block=source.slice(i,i+900);
  assert.match(block,/tab='players'/);
  assert.match(block,/go\('manage'\)/);
  assert.match(block,/registrationPanel='find'/);
  assert.match(block,/signupSearch=''/);
  assert.doesNotMatch(block,/go\('setup'\)/);
});

test('the registration screen module loads when Players opens inside Management',()=>{
  assert.match(source,/name==='signup'&&view==='manage'&&tab==='players'/);
  assert.match(source,/name==='signup'&&view==='manage'&&tab==='players'/);
  assert.match(registration,/data-panel="\$\{embedded\?'all':registrationPanel\}"/);
});
