import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderDesignSettings} from '../src/tournament-design-settings.mjs';

test('rebuy tracking uses a div rather than native fieldset and retains both radio options',()=>{
  const source=readFileSync(new URL('../src/tournament-design-settings.mjs',import.meta.url),'utf8');
  assert.match(source,/class="rebuy-tracking-box" role="group" aria-label="Rebuy Tracking"/);
  assert.doesNotMatch(source,/<fieldset aria-label="Rebuy Tracking"/);
  assert.match(source,/name="rebuyTracking" value="player"/);
  assert.match(source,/name="rebuyTracking" value="total"/);
  assert.match(source,/\$\{rebuyLocked\}>By Player/);
  assert.match(source,/\$\{rebuyLocked\}>Total/);
});
test('rebuy tracking border is drawn by the plain container, not a fieldset',()=>{
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/#structure-form \.rebuy-tracking-settings \.rebuy-tracking-box\s*\{/);
  assert.match(css,/border: 1px solid #d8ded6 !important/);
});
