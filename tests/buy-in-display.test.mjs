import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialState} from '../src/domain.mjs';
import {renderDesignSettings} from '../src/tournament-design-settings.mjs';

test('buy-in settings remove the helper note and center the fee breakdown at the bottom', async()=>{
  const settings={...initialState().templates[0].settings,buyIn:5000,dealerToke:1000,entryFeeType:'admin'};
  const html=renderDesignSettings(settings,{num:value=>String(value),money:cents=>`$${(cents/100).toFixed(2)}`});
  assert.doesNotMatch(html,/The selected Dealer Toke or Admin Fee is included/);
  assert.ok(html.indexOf('class="split-note"')>html.indexOf('class="form-grid transaction-settings"'));
  assert.match(html,/\$50\.00 total − \$10\.00 admin fee = \$40\.00 before the tournament fee<\/p>/);
  const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\.split-note\{[^}]*text-align:center[^}]*font-weight:700[^}]*font-size:18px/);
  assert.match(css,/#structure-form \.form-section>\.split-note\{margin-top:9px\}/);
});
