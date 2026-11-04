import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('Tournament Management embeds registration under the Players subtab',()=>{
  assert.match(source,/data-player-subtab="registration"/);
  assert.match(source,/data-player-subtab="players"/);
  assert.match(source,/management-registration-embedded/);
  assert.match(source,/\$\{signup\(\)\}/);
  assert.doesNotMatch(source,/class="management-registration-entry"/);
});
test('newly created tournaments open registration, not the settings editor',()=>{
  const i=source.indexOf("if(form.id==='new-tournament-form')");
  assert.ok(i>=0);
  const block=source.slice(i, i+820);
  assert.match(block,/playerSubtab='registration'/);
  assert.match(block,/go\('manage'\)/);
  assert.doesNotMatch(block,/go\('setup'\)/);
});
test('the registration module is loaded when nested inside management',()=>{
  assert.match(source,/view==='manage'&&tab==='players'&&playerSubtab==='registration'\)ensureScreenModule\('signup'\)/);
  assert.match(css,/\.management-registration-embedded \.signup-layout/);
});
