import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {initialState,execute} from '../src/domain.mjs';
const flush=()=>new Promise(resolve=>setTimeout(resolve,15));
const key='uno-tournament-practice-v1';
async function boot(base,seed,view='home',selected=''){
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:base+'?view='+view+(selected?'&tournament='+selected:''),runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;w.confirm=()=>true;let opened='';w.open=url=>{opened=url;return {focus(){}};};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 if(seed)w.localStorage.setItem(key,JSON.stringify(seed));
 const stub=`export const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},removeChannel:async()=>{}});`;
 const out=await build({entryPoints:['src/app.mjs'],bundle:true,write:false,format:'iife',plugins:[{name:'local-auth-fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'auth-fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js'}));}}]});
 const errors=[];w.addEventListener('error',e=>errors.push(e.error));w.eval(out.outputFiles[0].text);await flush();
 const q=s=>w.document.querySelector(s),click=s=>{assert.ok(q(s),'Missing '+s);q(s).click();};
 const submit=async f=>{f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await flush();};
 const input=(el,value)=>{el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const storage=value=>{w.localStorage.setItem(key,JSON.stringify(value));w.dispatchEvent(new w.StorageEvent('storage',{key}));};
 return {w,q,click,submit,input,storage,errors,opened:()=>opened,stored:()=>JSON.parse(w.localStorage.getItem(key)),close:()=>w.close()};
}
for(const base of ['https://example.test/','https://example.test/uno-club-tournament/'])test('home, player records, registration and navigation at '+base,async()=>{
 const ui=await boot(base),{q,click,input,submit}=ui;
 try{
  assert.equal(ui.w.document.querySelectorAll('.home-menu .menu-card').length,5);
  assert.equal(q('.home-tournament'),null);assert.doesNotMatch(ui.w.document.body.textContent,/Welcome back|What would you like/);
  click('[data-go="players"]');assert.equal(q('.context'),null);assert.equal(q('[data-register]'),null);
  click('[data-action="add-player"]');let form=q('#player-form');input(form.elements.name,'  Alex   Smith  ');input(form.elements.phone,'555-0100');await submit(form);
  let p=ui.stored().players[0];assert.equal(p.name,'Alex Smith');assert.equal(p.phone,'555-0100');const pid=p.id;
  assert.equal(ui.stored().tournaments.length,0);
  click('[data-action="add-player"]');form=q('#player-form');input(form.elements.name,'alex SMITH');assert.match(q('.name-feedback').textContent,/already exists/);assert.equal(form.elements.name.checkValidity(),false);await submit(form);assert.equal(ui.stored().players.length,1);
  click('[data-action="close-modal"]');click('[data-player]');form=q('#player-form');assert.equal(form.querySelector('[readonly]').value,pid);input(form.elements.name,'Alex S');await submit(form);assert.equal(ui.stored().players[0].id,pid);assert.equal(ui.stored().players[0].phone,'555-0100');
  click('[data-go="home"]');assert.equal(q('.home-tournament'),null);click('[data-go="setup"]');click('[data-action="new-tournament"]');form=q('#new-tournament-form');form.elements.name.value='Wednesday Tournament';await submit(form);
  assert.equal(q('h1').textContent,'Tournament Registration');assert.equal(ui.w.document.querySelectorAll('button[data-go="home"]').length,1);assert.equal(q('.nav [data-go="home"]').textContent,'Home');assert.doesNotMatch(ui.w.document.body.textContent,/Overview|Main menu/);click('[data-go="home"]');assert.equal(q('.home-tournament'),null);
  click('[data-go="signup"]');click('[data-register]');await flush();assert.equal(ui.stored().tournaments[0].entries[0].playerId,pid);
  click('[data-go="home"]');assert.match(q('.home-tournament').textContent,/Wednesday Tournament/);assert.match(q('.home-tournament').textContent,/1 registered players/);
  click('[data-action="open-clock"]');assert.ok(ui.opened().startsWith(new URL(base).pathname+'?view=clock&tournament='));
  click('[data-go="manage"]');click('[data-clock="start"]');await flush();assert.match(q('#mini-time').textContent,/14:5|15:00/);
  assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('TV display switches at cutoff without refresh, and follows remote practice updates',async()=>{
 let s=initialState();s=execute(s,{type:'player-save',id:'p1',name:'Alex'});s=execute(s,{type:'tournament-create',id:'t1',name:'Wednesday Tournament',templateId:s.templates[0].id});s=execute(s,{type:'register',tournamentId:'t1',playerId:'p1',paid:true});
 const t=s.tournaments[0];t.clock={index:5,status:'running',remainingMs:100,deadline:Date.now()+1000};
 const ui=await boot('https://example.test/uno-club-tournament/',s,'clock','t1');
 try{
  assert.equal(ui.q('.tv-final-rebuy').textContent,'Final Rebuy Round');assert.match(ui.q('.tv-cutoff-detail').textContent,/close after this round/);assert.equal(ui.q('.tv-pool'),null);assert.equal(ui.q('.tv-rebuy-count'),null);
  await new Promise(resolve=>setTimeout(resolve,1250));assert.ok(ui.q('.tv-pool'));assert.match(ui.q('.tv-side').textContent,/Rebuys: 0/);assert.equal(ui.q('.tv-rebuys-open'),null);assert.match(ui.q('#tv-level').textContent,/ROUND 7/);assert.equal(ui.q('#tv-ante').textContent,'Antes off');
  t.clock={index:6,status:'paused',remainingMs:123000,deadline:null};t.entries[0].payments.push({id:'r1',kind:'rebuy',total:2500,dealerToke:0,chips:5000,paid:true});ui.storage(s);assert.match(ui.q('.tv-rebuy-count').textContent,/Rebuys: 1/);assert.equal(ui.q('#tv-time').textContent,'2:03');assert.deepEqual(ui.errors,[]);
 }
 finally{ui.close();}
});
test('player rename follows entries, duplicate rename and archived name reuse are blocked',async()=>{
 let s=initialState();for(const [id,name] of [['p1','Alex'],['p2','Casey']])s=execute(s,{type:'player-save',id,name});s=execute(s,{type:'tournament-create',id:'t1',name:'Test',templateId:s.templates[0].id});s=execute(s,{type:'register',tournamentId:'t1',playerId:'p1',paid:true});s=execute(s,{type:'player-archive',id:'p2'});
 const ui=await boot('https://example.test/',s,'players');
 try{ui.click('[data-player="p1"]');let f=ui.q('#player-form');ui.input(f.elements.name,' CASEY ');await ui.submit(f);assert.equal(ui.stored().players[0].name,'Alex');ui.input(f.elements.name,'Alex S');await ui.submit(f);assert.equal(ui.stored().players[0].id,'p1');assert.equal(ui.stored().tournaments[0].entries[0].playerId,'p1');assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('structure editor uses whole-minute breaks and copies a common game without changing mixed levels automatically',async()=>{
 const ui=await boot('https://example.test/'),{q,click,input,submit}=ui;
 try{
  click('[data-go="setup"]');click('[data-edit-template]');let f=q('#structure-form');
  assert.match(f.textContent,/Last round before rebuys end/);assert.match(f.textContent,/Last round before add-on ends/);assert.match(f.textContent,/rebuys remain open through that break/);assert.match(f.textContent,/add-ons remain available through that break/);
  const rows=[...f.querySelectorAll('[data-level]')],breakRow=rows.find(r=>r.querySelector('[name=kind]').value==='break'),duration=breakRow.querySelector('[name=minutes]');
  assert.equal(duration.step,'1');assert.equal(duration.min,'1');duration.value='3';duration.stepUp();assert.equal(duration.value,'4');duration.stepDown();assert.equal(duration.value,'3');duration.value='3.5';assert.equal(duration.checkValidity(),false);duration.value='3';
  input(q('#all-levels-game'),'Pot Limit Omaha');click('[data-action="copy-game"]');
  for(const row of rows)assert.equal(row.querySelector('[name=game]').value,row.querySelector('[name=kind]').value==='play'?'Pot Limit Omaha':'');
  rows[1].querySelector('[name=game]').value='Seven Card Stud';await submit(f);
  const saved=ui.stored().templates[0];assert.equal(saved.levels[0].game,'Pot Limit Omaha');assert.equal(saved.levels[1].game,'Seven Card Stud');assert.equal(saved.levels.find(l=>l.kind==='break').minutes,3);
  click('[data-edit-template]');assert.equal(q('[data-level="1"] [name=game]').value,'Seven Card Stud');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('clock announces the final rebuy round, stays open through its break, then reveals prizes',async()=>{
 let s=initialState();s=execute(s,{type:'tournament-create',id:'t1',name:'Cutoff display test',templateId:s.templates[0].id});const t=s.tournaments[0];t.settings.rebuyLastRound=8;t.clock={index:6,status:'paused',remainingMs:900000,deadline:null};
 const ui=await boot('https://example.test/',s,'clock','t1');
 try{
  assert.equal(ui.q('.tv-final-rebuy'),null);assert.match(ui.q('.tv-cutoff-detail').textContent,/Includes the following break/);
  t.clock.index=7;ui.storage(s);assert.equal(ui.q('.tv-final-rebuy').textContent,'Final Rebuy Round');assert.match(ui.q('.tv-cutoff-detail').textContent,/remain open during the following break/);assert.equal(ui.q('.tv-pool'),null);
  t.clock.index=8;ui.storage(s);assert.equal(ui.q('.tv-final-rebuy'),null);assert.match(ui.q('.tv-cutoff-detail').textContent,/close when this break ends/);assert.equal(ui.q('.tv-pool'),null);
  t.clock.index=9;ui.storage(s);assert.equal(ui.q('.tv-rebuys-open'),null);assert.ok(ui.q('.tv-pool'));assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('clock transitions from final round to cutoff break and then prizes on timer ticks alone',async()=>{
 let s=initialState();s=execute(s,{type:'tournament-create',id:'t1',name:'Automatic cutoff',templateId:s.templates[0].id});const t=s.tournaments[0];t.settings.rebuyLastRound=1;t.settings.pauseBreaks=false;t.levels.splice(1,0,{kind:'break',minutes:0.01,sb:0,bb:0,ante:0,game:'',chipUp:false});t.clock={index:0,status:'running',remainingMs:0,deadline:Date.now()+700};
 // Short in-memory break is only a timer fixture; actual saved break lengths are validated as integers.
 const ui=await boot('https://example.test/',s,'clock','t1');
 try{assert.ok(ui.q('.tv-final-rebuy'));await new Promise(r=>setTimeout(r,850));assert.equal(ui.q('.tv-side').dataset.rebuyPhase,'final-break');assert.match(ui.q('.tv-cutoff-detail').textContent,/when this break ends/);await new Promise(r=>setTimeout(r,650));assert.equal(ui.q('.tv-side').dataset.rebuyPhase,'closed');assert.ok(ui.q('.tv-pool'));assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('starting chips is typed, formats thousands and saves the numeric value through editor changes',async()=>{
 const ui=await boot('https://example.test/'),{q,click,input,submit}=ui;
 try{
  click('[data-go="setup"]');click('[data-edit-template]');let field=q('[name=startingStack]');
  assert.equal(field.type,'text');assert.equal(field.inputMode,'numeric');assert.equal(field.value,'5,000');
  input(field,'1000');assert.equal(field.value,'1,000');assert.equal(field.checkValidity(),true);assert.equal(field.selectionStart,5);
  input(field,'1234567');assert.equal(field.value,'1,234,567');
  field.value='12,345';field.setSelectionRange(2,2);field.value='192,345';field.setSelectionRange(2,2);field.dispatchEvent(new ui.w.Event('input',{bubbles:true}));assert.equal(field.value,'192,345');assert.equal(field.selectionStart,2);
  input(field,'1.5');assert.equal(field.checkValidity(),false);await submit(q('#structure-form'));assert.equal(ui.stored(),null);
  input(field,'0');assert.equal(field.checkValidity(),false);input(field,'');assert.equal(field.checkValidity(),false);
  input(field,'20000');assert.equal(field.value,'20,000');click('[data-action="add-break"]');field=q('[name=startingStack]');assert.equal(field.value,'20,000');
  await submit(q('#structure-form'));assert.equal(ui.stored().templates[0].settings.startingStack,20000);assert.equal(typeof ui.stored().templates[0].settings.startingStack,'number');
  click('[data-edit-template]');assert.equal(q('[name=startingStack]').value,'20,000');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
