import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPlayers} from '../modules/phase3-player-screen.mjs';
import {renderRegistration} from '../modules/phase3-registration-screen.mjs';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;');
test('published runtime loads the two production screens on demand',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/import\("\.\/modules\/phase3-player-screen\.mjs"\)/);
 assert.match(app,/import\("\.\/modules\/phase3-registration-screen\.mjs"\)/);
 assert.match(app,/REORGANIZATION · v0\.4\.0-reorg\.10/);
 assert.match(app,/function cl\(\)\{if\(!__playerScreenModule\)/);
 assert.match(app,/function _d\(\)\{if\(!__registrationScreenModule\)/);
});
test('production Player Database module preserves player list buttons and profile tabs',()=>{
 const C={players:[{id:'p1',name:'Amy',phone:'',archived:false}]};
 const base={C,zn:false,ce:s=>String(s).toLowerCase(),kt:p=>p.id,or:'',te:null,Ya:()=>({played:1,wins:0}),be:'details',w:esc,Kn:()=>'',Xo:()=>'<div>History</div>',dl:()=>'<div data-player="p1">Amy</div>',clearProfile:()=>{},renderFallback:()=>''};
 assert.match(renderPlayers(base),/id="player-search"/);
 assert.match(renderPlayers(base),/data-player="p1"/);
 const profile=renderPlayers({...base,te:'p1'});
 assert.match(profile,/data-profile-panel="details"/);
 assert.match(profile,/data-archive="p1"/);
});
test('production Registration module preserves controls and removed-player history',()=>{
 const t={id:'t1',status:'registration',entries:[{playerId:'p1'}],removedPlayers:[{name:'Pat',keepBuyIn:true,buyIn:3500}],settings:{buyIn:3500,startingStack:25000}};
 const ctx={_:()=>t,hl:()=>'',z:()=>({collected:3500}),C:{players:[{id:'p1',name:'Amy',archived:false},{id:'p2',name:'Bob',archived:false}]},ce:s=>String(s).toLowerCase(),kt:p=>p.id,Ct:'',At:'find',M:n=>'$'+n/100,F:n=>String(n),w:esc,pl:()=>'<div>Candidate</div>',el:()=>'<div class="metrics"></div>',ml:()=>'<div>Registered Amy</div>'};
 const html=renderRegistration(ctx);
 assert.match(html,/data-registration-panel="find"/);
 assert.match(html,/Candidate/);
 assert.match(html,/Removed players \(1\)/);
 assert.match(html,/Pat/);
 assert.match(html,/Registered Amy/);
});
