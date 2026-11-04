import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
test('management and archives retain a fixed footer and use viewport workspaces',()=>{
  assert.match(css,/body:has\(#app > \.management-chrome\) #app \{/);
  assert.match(css,/body:has\(#app > \.management-chrome\) #app > \.workspace > \.app-footer \{/);
  assert.match(css,/body:has\(\.management-layout\) \.management-layout \{/);
  assert.match(source,/--management-panel-height/);
});
test('archives scroll their list inside a height-constrained panel',()=>{
  assert.match(css,/\.archive-list > \.archive-results \{/);
  assert.match(css,/\.archive-detail \{/);
});
