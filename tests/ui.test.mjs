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
  assert.equal(q('h1').textContent,'Tournament Registration');click('[data-go="home"]');assert.equal(q('.home-tournament'),null);
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
  assert.match(ui.q('.tv-side').textContent,/Rebuys Open.*Through Level 6/);assert.equal(ui.q('.tv-pool'),null);assert.equal(ui.q('.tv-rebuy-count'),null);
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
