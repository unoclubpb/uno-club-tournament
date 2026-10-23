import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {initialState,execute} from '../src/domain.mjs';
const flush=()=>new Promise(resolve=>setTimeout(resolve,15));
const key='uno-tournament-practice-v1';
async function boot(base,seed,view='home',selected='',options={}){
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:base+'?view='+view+(selected?'&tournament='+selected:''),runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;w.confirm=()=>true;let opened='';w.open=url=>{opened=url;return {focus(){}};};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 if(options.legacy)w.localStorage.setItem(key,JSON.stringify(options.legacy));
 w.__fixture={state:seed?structuredClone(seed):null,version:seed?1:0,session:options.signedOut?null:{user:{id:'organizer-1',email:'organizer@example.test'}},saveError:null,readError:null,saves:0};
 const stub=`export const createClient=()=>{
  const f=window.__fixture;
  const signIn=async()=>({data:{session:f.session={user:{id:'organizer-1',email:'organizer@example.test'}}}});
  const query={select(){return query;},eq(){return query;},async maybeSingle(){return {data:f.state?{state:structuredClone(f.state),version:f.version}:null,error:f.readError};}};
  return {auth:{getSession:async()=>({data:{session:f.session}}),onAuthStateChange:cb=>(f.auth=cb,{data:{subscription:{unsubscribe(){}}}}),signInWithPassword:signIn,signUp:async()=>f.confirmEmail?{data:{session:null}}:signIn(),signOut:async()=>{f.session=null;f.auth('SIGNED_OUT',null);return {error:null};}},from:()=>query,
   rpc:async(name,args)=>{if(name==='td_server_time')return {data:new Date().toISOString()};if(f.saveError)return {error:f.saveError};if(args.p_expected_version!==f.version)return {error:{message:'TD_CONFLICT: tournament changed on another device'}};f.state=structuredClone(args.p_state);f.version++;f.saves++;return {data:{state:structuredClone(f.state),version:f.version}};},
   channel:()=>({on(event,filter,cb){f.notify=cb;return this;},subscribe(){return this;}}),removeChannel:async()=>{}
  };
 };`;
 const out=await build({entryPoints:['src/app.mjs'],bundle:true,write:false,format:'iife',plugins:[{name:'local-auth-fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'auth-fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js'}));}}]});
 const errors=[];w.addEventListener('error',e=>errors.push(e.error));w.eval(out.outputFiles[0].text);await flush();
 const q=s=>w.document.querySelector(s),click=s=>{assert.ok(q(s),'Missing '+s);q(s).click();};
 const submit=async (f,action)=>{f.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:action?f.querySelector(`[value=${action}]`):null}));await flush();};
 const input=(el,value)=>{el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const storage=async value=>{w.__fixture.state=structuredClone(value);w.__fixture.version++;await w.__fixture.notify();await flush();};
 return {w,q,click,submit,input,storage,errors,opened:()=>opened,stored:()=>structuredClone(w.__fixture.state),close:()=>w.close()};
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
  click('[data-action="close-modal"]');click('[data-player]');form=q('#player-form');assert.equal(form.querySelector('[readonly]').value,'001');input(form.elements.name,'Alex S');await submit(form);assert.equal(ui.stored().players[0].id,pid);assert.equal(ui.stored().players[0].phone,'555-0100');
  click('[data-go="home"]');assert.equal(q('.home-tournament'),null);click('[data-go="setup"]');click('[data-action="new-tournament"]');form=q('#new-tournament-form');form.elements.name.value='Wednesday Tournament';await submit(form);
  assert.equal(q('h1').textContent,'Tournament Registration');assert.equal(ui.w.document.querySelectorAll('button[data-go="home"]').length,1);assert.equal(q('.nav [data-go="home"]').textContent,'Home');assert.doesNotMatch(ui.w.document.body.textContent,/Overview|Main menu/);click('[data-go="home"]');assert.equal(q('.home-tournament'),null);
  click('[data-go="signup"]');click('[data-register]');await flush();assert.equal(ui.stored().tournaments[0].entries[0].playerId,pid);
  click('[data-go="home"]');assert.match(q('.home-tournament').textContent,/Wednesday Tournament/);assert.match(q('.home-tournament').textContent,/1 registered players/);
  click('[data-action="open-clock"]');assert.ok(ui.opened().startsWith(new URL(base).pathname+'?view=clock&tournament='));
  click('[data-go="manage"]');click('[data-clock="start"]');await flush();assert.match(q('#mini-time').textContent,/14:5|15:00/);
  assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('TV display switches at cutoff without refresh, and follows remote account updates',async()=>{
 let s=initialState();s=execute(s,{type:'player-save',id:'p1',name:'Alex'});s=execute(s,{type:'tournament-create',id:'t1',name:'Wednesday Tournament',templateId:s.templates[0].id});s=execute(s,{type:'register',tournamentId:'t1',playerId:'p1',paid:true});
 const t=s.tournaments[0];t.clock={index:5,status:'running',remainingMs:100,deadline:Date.now()+1000};
 const ui=await boot('https://example.test/uno-club-tournament/',s,'clock','t1');
 try{
  assert.equal(ui.q('.tv-final-rebuy').textContent,'Final Rebuy Round');assert.match(ui.q('.tv-cutoff-detail').textContent,/close after this round/);assert.equal(ui.q('.tv-pool'),null);assert.equal(ui.q('.tv-rebuy-count'),null);
  await new Promise(resolve=>setTimeout(resolve,1250));assert.ok(ui.q('.tv-pool'));assert.match(ui.q('.tv-side').textContent,/Rebuys: 0/);assert.equal(ui.q('.tv-rebuys-open'),null);assert.match(ui.q('#tv-level').textContent,/ROUND 7/);assert.equal(ui.q('#tv-ante').textContent,'Antes off');
  t.clock={index:6,status:'paused',remainingMs:123000,deadline:null};t.entries[0].payments.push({id:'r1',kind:'rebuy',total:2500,dealerToke:0,chips:5000,paid:true});await ui.storage(s);assert.match(ui.q('.tv-rebuy-count').textContent,/Rebuys: 1/);assert.equal(ui.q('#tv-time').textContent,'2:03');assert.deepEqual(ui.errors,[]);
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
  t.clock.index=7;await ui.storage(s);assert.equal(ui.q('.tv-final-rebuy').textContent,'Final Rebuy Round');assert.match(ui.q('.tv-cutoff-detail').textContent,/remain open during the following break/);assert.equal(ui.q('.tv-pool'),null);
  t.clock.index=8;await ui.storage(s);assert.equal(ui.q('.tv-final-rebuy'),null);assert.match(ui.q('.tv-cutoff-detail').textContent,/close when this break ends/);assert.equal(ui.q('.tv-pool'),null);
  t.clock.index=9;await ui.storage(s);assert.equal(ui.q('.tv-rebuys-open'),null);assert.ok(ui.q('.tv-pool'));assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('clock transitions from final round to cutoff break and then prizes on timer ticks alone',async()=>{
 let s=initialState();s=execute(s,{type:'tournament-create',id:'t1',name:'Automatic cutoff',templateId:s.templates[0].id});const t=s.tournaments[0];t.settings.rebuyLastRound=1;t.settings.pauseBreaks=false;t.levels.splice(1,0,{kind:'break',minutes:0.01,sb:0,bb:0,ante:0,game:'',chipUp:false});t.clock={index:0,status:'running',remainingMs:0,deadline:Date.now()+700};
 // Short in-memory break is only a timer fixture; actual saved break lengths are validated as integers.
 const ui=await boot('https://example.test/',s,'clock','t1');
 try{assert.ok(ui.q('.tv-final-rebuy'));await new Promise(r=>setTimeout(r,850));assert.equal(ui.q('.tv-side').dataset.rebuyPhase,'final-break');assert.match(ui.q('.tv-cutoff-detail').textContent,/when this break ends/);await new Promise(r=>setTimeout(r,950));assert.equal(ui.q('.tv-side').dataset.rebuyPhase,'closed');assert.ok(ui.q('.tv-pool'));assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('starting chips is typed, formats thousands and saves the numeric value through editor changes',async()=>{
 const ui=await boot('https://example.test/'),{q,click,input,submit}=ui;
 try{
  click('[data-go="setup"]');click('[data-edit-template]');let field=q('[name=startingStack]');
  assert.equal(field.type,'text');assert.equal(field.inputMode,'numeric');assert.equal(field.value,'5,000');
  input(field,'1000');assert.equal(field.value,'1,000');assert.equal(field.checkValidity(),true);assert.equal(field.selectionStart,5);
  input(field,'1234567');assert.equal(field.value,'1,234,567');
  field.value='12,345';field.setSelectionRange(2,2);field.value='192,345';field.setSelectionRange(2,2);field.dispatchEvent(new ui.w.Event('input',{bubbles:true}));assert.equal(field.value,'192,345');assert.equal(field.selectionStart,2);
  input(field,'1.5');assert.equal(field.checkValidity(),false);await submit(q('#structure-form'));assert.equal(ui.stored().templates[0].settings.startingStack,5000);
  input(field,'0');assert.equal(field.checkValidity(),false);input(field,'');assert.equal(field.checkValidity(),false);
  input(field,'20000');assert.equal(field.value,'20,000');click('[data-action="add-break"]');field=q('[name=startingStack]');assert.equal(field.value,'20,000');
  await submit(q('#structure-form'));assert.equal(ui.stored().templates[0].settings.startingStack,20000);assert.equal(typeof ui.stored().templates[0].settings.startingStack,'number');
  click('[data-edit-template]');assert.equal(q('[name=startingStack]').value,'20,000');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('player database displays three-digit IDs and can search by the visible number',async()=>{
 let s=initialState();for(const [id,name] of [['long-legacy-id-alpha','Alpha'],['long-legacy-id-beta','Beta']])s=execute(s,{type:'player-save',id,name});
 const originalIds=s.players.map(p=>p.id);s.players.forEach(p=>delete p.playerNumber);
 const ui=await boot('https://example.test/',s,'players');
 try{
  assert.match(ui.q('[data-player="long-legacy-id-alpha"]').textContent,/ID: 001/);assert.match(ui.q('[data-player="long-legacy-id-beta"]').textContent,/ID: 002/);assert.doesNotMatch(ui.q('#player-results').textContent,/long-legacy-id/);
  ui.input(ui.q('#player-search'),'002');assert.equal(ui.w.document.querySelectorAll('[data-player]').length,1);ui.click('[data-player]');assert.equal(ui.q('#player-form [readonly]').value,'002');
  ui.input(ui.q('#player-form [name=name]'),'Beta Updated');await ui.submit(ui.q('#player-form'));assert.deepEqual(ui.stored().players.map(p=>p.id),originalIds);assert.deepEqual(ui.stored().players.map(p=>p.playerNumber),[1,2]);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('registration filtering and remote updates retain search focus and independent list position',async()=>{
 let s=initialState();for(let i=1;i<=20;i++)s=execute(s,{type:'player-save',id:'p'+i,name:'Player '+String(i).padStart(2,'0')});
 s=execute(s,{type:'tournament-create',id:'t1',name:'Registration test',templateId:s.templates[0].id});
 for(let i=1;i<=10;i++)s=execute(s,{type:'register',tournamentId:'t1',playerId:'p'+i,paid:true});
 const ui=await boot('https://example.test/uno-club-tournament/',s,'signup','t1');
 try{
  const search=ui.q('#signup-search'),registered=ui.q('#registered-results'),available=ui.q('#signup-results');
  search.focus();assert.equal(ui.q('#registration-paid'),null);assert.equal(ui.q('[data-paid]'),null);assert.equal(ui.q('[data-rebuy]'),null);registered.scrollTop=230;available.scrollTop=150;
  ui.input(search,'Player 20');assert.equal(ui.q('#signup-search'),search);assert.equal(ui.w.document.activeElement,search);assert.equal(registered.scrollTop,230);assert.equal(available.scrollTop,0);assert.equal(ui.w.document.querySelectorAll('[data-register]').length,1);
  search.setSelectionRange(3,6);await ui.storage(execute(s,{type:'player-save',id:'p21',name:'Player 21'}));
  assert.equal(ui.w.document.activeElement,ui.q('#signup-search'));assert.equal(ui.q('#signup-search').selectionStart,3);assert.equal(ui.q('#signup-search').selectionEnd,6);assert.equal(ui.q('#signup-search').value,'Player 20');assert.equal(ui.q('#registered-results').scrollTop,230);assert.equal(ui.q('#registration-paid'),null);
  ui.click('[data-registration-panel=registered]');assert.equal(ui.q('.signup-layout').dataset.panel,'registered');assert.equal(ui.q('[data-registration-panel=registered]').getAttribute('aria-pressed'),'true');
  ui.click('[data-registration-panel=find]');ui.click('[data-register="p20"]');await flush();
  const t=ui.stored().tournaments[0];assert.equal(t.entries.length,11);assert.equal(t.entries.find(e=>e.playerId==='p20').payments[0].paid,true);assert.equal(ui.q('#registered-results').scrollTop,230);assert.equal(ui.q('#signup-search').value,'');assert.equal(ui.q('#registration-paid'),null);
  assert.equal(ui.w.document.body.classList.contains('registration-page'),true);ui.click('[data-go=home]');assert.equal(ui.w.document.body.classList.contains('registration-page'),false);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});


test('signed-out program requires account access and never edits browser-local records',async()=>{
 let legacy=execute(initialState(),{type:'player-save',id:'legacy-1',name:'Existing Player'});
 const ui=await boot('https://example.test/',null,'players','',{signedOut:true,legacy});
 try{
  assert.equal(ui.q('#player-form'),null);assert.equal(ui.q('.home-menu'),null);assert.ok(ui.q('#auth-form'));assert.doesNotMatch(ui.w.document.body.textContent,/practice|try it first/i);assert.match(ui.w.document.body.textContent,/saved players and tournaments/);assert.equal(ui.w.__fixture.saves,0);
  let f=ui.q('#auth-form');ui.input(f.elements.email,'organizer@example.test');ui.input(f.elements.password,'fake-test-password');await ui.submit(f,'login');
  assert.equal(ui.stored().players[0].id,'legacy-1');assert.equal(ui.stored().players[0].playerNumber,1);assert.deepEqual(JSON.parse(ui.w.localStorage.getItem(key)),legacy);assert.equal(ui.w.localStorage.getItem('uno-tournament-browser-imported'),'organizer-1');
  ui.click('[data-action=account]');ui.click('[data-action=signout]');await flush();assert.ok(ui.q('#auth-form'));assert.equal(ui.q('[data-player]'),null);assert.equal(ui.w.__fixture.saves,1);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('email confirmation keeps existing browser data pending and creates no cloud workspace',async()=>{
 const legacy=execute(initialState(),{type:'player-save',name:'Keep Me'}),ui=await boot('https://example.test/',null,'home','',{signedOut:true,legacy});
 try{
  ui.w.__fixture.confirmEmail=true;const f=ui.q('#auth-form');ui.input(f.elements.email,'organizer@example.test');ui.input(f.elements.password,'fake-test-password');await ui.submit(f,'signup');
  assert.match(ui.q('#auth-feedback').textContent,/confirm/);assert.equal(ui.stored(),null);assert.equal(ui.w.localStorage.getItem('uno-tournament-browser-imported'),null);assert.deepEqual(JSON.parse(ui.w.localStorage.getItem(key)),legacy);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('a failed cloud save never falls back to local storage or claims success',async()=>{
 const ui=await boot('https://example.test/');
 try{
  ui.w.__fixture.saveError={message:'Network interrupted'};ui.click('[data-go=players]');ui.click('[data-action=add-player]');const f=ui.q('#player-form');ui.input(f.elements.name,'Do Not Lose');await ui.submit(f);
  assert.equal(ui.stored().players.length,0);assert.equal(ui.w.localStorage.getItem(key),null);assert.equal(ui.q('#dialog').open,true);assert.match(ui.q('#toast').textContent,/Network interrupted/);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('existing cloud records are not replaced by browser records and import assigns unused numbers',async()=>{
 const cloud=execute(initialState(),{type:'player-save',id:'cloud-1',name:'Cloud Player'}),legacy=execute(initialState(),{type:'player-save',id:'browser-1',name:'Browser Player'});
 const ui=await boot('https://example.test/',cloud,'players','',{legacy});
 try{
  assert.equal(ui.stored().players.length,1);assert.ok(ui.q('[data-action=import-browser]'));ui.click('[data-action=import-browser]');await flush();
  assert.deepEqual(ui.stored().players.map(p=>[p.id,p.playerNumber]),[['cloud-1',1],['browser-1',2]]);assert.equal(ui.q('[data-action=import-browser]'),null);assert.equal(ui.w.localStorage.getItem(key),JSON.stringify(legacy));assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('stale writes reload cloud state and require a retry without duplicating players',async()=>{
 const ui=await boot('https://example.test/');
 try{
  ui.click('[data-go=players]');ui.click('[data-action=add-player]');const f=ui.q('#player-form');ui.input(f.elements.name,'First Player');
  ui.w.__fixture.state=execute(ui.w.__fixture.state,{type:'player-save',id:'remote-1',name:'Remote Player'});ui.w.__fixture.version++;
  await ui.submit(f);assert.equal(ui.stored().players.length,1);assert.match(ui.q('#toast').textContent,/Another device/);assert.equal(ui.q('#dialog').open,true);
  await ui.submit(f);assert.deepEqual(ui.stored().players.map(p=>p.playerNumber),[1,2]);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('registration opens the active tournament without a chooser or a saved device selection',async()=>{
 let s=initialState();s=execute(s,{type:'player-save',id:'p1',name:'Alex'});s=execute(s,{type:'player-save',id:'p2',name:'Casey'});
 s=execute(s,{type:'tournament-create',id:'active-1',name:'This One',templateId:s.templates[0].id});s=execute(s,{type:'register',tournamentId:'active-1',playerId:'p1',paid:true});
 s=execute(s,{type:'tournament-create',id:'draft-1',name:'Next Week',templateId:s.templates[0].id});
 const ui=await boot('https://example.test/uno-club-tournament/',s,'signup');
 try{
  assert.equal(ui.q('#current-tournament'),null);assert.equal(ui.q('.current-tournament-name').textContent,'This One');assert.equal(ui.q('.signup-layout').dataset.tournament,'active-1');assert.equal(ui.q('.page-heading .muted'),null);
  ui.click('[data-register=p2]');await flush();assert.equal(ui.stored().tournaments.find(t=>t.id==='active-1').entries.length,2);assert.equal(ui.stored().tournaments.find(t=>t.id==='draft-1').entries.length,0);
  ui.click('[data-go=manage]');assert.equal(ui.q('.current-tournament-name').textContent,'This One');assert.equal(ui.q('#current-tournament'),null);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('opening a clock link retains its requested tournament while cloud records load',async()=>{
 let s=initialState();s=execute(s,{type:'player-save',id:'p1',name:'Alex'});s=execute(s,{type:'tournament-create',id:'active-1',name:'Active Event',templateId:s.templates[0].id});s=execute(s,{type:'register',tournamentId:'active-1',playerId:'p1',paid:true});s=execute(s,{type:'tournament-create',id:'draft-1',name:'Next Week',templateId:s.templates[0].id});
 const ui=await boot('https://example.test/',s,'clock','draft-1');
 try{assert.equal(ui.q('.tv-heading h1').textContent,'Next Week');assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});


test('management records an editable rebuy total from the cutoff break, with zero default and plus/minus input',async()=>{
 let s=initialState();for(const [id,name] of [['p1','Alex'],['p2','Casey']])s=execute(s,{type:'player-save',id,name});s=execute(s,{type:'tournament-create',id:'t1',name:'Rebuy total',templateId:s.templates[0].id});s=execute(s,{type:'register',tournamentId:'t1',playerId:'p1'});s=execute(s,{type:'register',tournamentId:'t1',playerId:'p2'});
 const t=s.tournaments[0];t.settings.rebuyLastRound=8;t.clock={index:7,status:'paused',remainingMs:900000,deadline:null};
 const ui=await boot('https://example.test/',s,'manage','t1');
 try{
  assert.equal(ui.q('#record-rebuys').disabled,true);assert.equal(ui.q('[data-paid]'),null);assert.equal(ui.q('[data-rebuy]'),null);
  t.clock.index=8;await ui.storage(s);assert.equal(ui.q('#record-rebuys').disabled,false);ui.click('#record-rebuys');let f=ui.q('#rebuy-count-form');assert.equal(f.elements.count.value,'0');
  ui.click('[data-rebuy-step="-1"]');assert.equal(f.elements.count.value,'0');ui.click('[data-rebuy-step="1"]');assert.equal(f.elements.count.value,'1');ui.click('[data-rebuy-step="1"]');ui.click('[data-rebuy-step="-1"]');assert.equal(f.elements.count.value,'1');
  ui.input(f.elements.count,'4');await ui.submit(f);assert.equal(ui.stored().tournaments[0].rebuyCount,4);assert.ok(ui.stored().tournaments[0].entries.every(e=>e.payments.length===1));assert.match(ui.q('.metrics').textContent,/4/);
  ui.click('#record-rebuys');f=ui.q('#rebuy-count-form');assert.equal(f.elements.count.value,'4');ui.input(f.elements.count,'2');await ui.submit(f);assert.equal(ui.stored().tournaments[0].rebuyCount,2);
  ui.click('#record-rebuys');f=ui.q('#rebuy-count-form');ui.input(f.elements.count,'1.5');await ui.submit(f);assert.equal(ui.stored().tournaments[0].rebuyCount,2);assert.equal(ui.q('#dialog').open,true);
  ui.input(f.elements.count,'0');await ui.submit(f);assert.equal(ui.stored().tournaments[0].rebuyCount,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('rebuy control becomes available as the cutoff break starts without a reload',async()=>{
 let s=initialState();s=execute(s,{type:'tournament-create',id:'t1',name:'Timed cutoff',templateId:s.templates[0].id});const t=s.tournaments[0];t.settings.rebuyLastRound=1;t.settings.pauseBreaks=false;t.levels.splice(1,0,{kind:'break',minutes:0.01,sb:0,bb:0,ante:0,game:'',chipUp:false});t.clock={index:0,status:'running',remainingMs:0,deadline:Date.now()+700};
 const ui=await boot('https://example.test/',s,'manage','t1');
 try{assert.equal(ui.q('#record-rebuys').disabled,true);await new Promise(r=>setTimeout(r,850));assert.equal(ui.q('#record-rebuys').disabled,false);await new Promise(r=>setTimeout(r,950));assert.equal(ui.q('#record-rebuys').disabled,false);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('completed player profiles show finishing history without money statistics or winnings',async()=>{
 let s=initialState();s=execute(s,{type:'player-save',id:'p1',name:'Alex'});s=execute(s,{type:'tournament-create',id:'t1',name:'Finished Event',templateId:s.templates[0].id});s=execute(s,{type:'register',tournamentId:'t1',playerId:'p1'});s=execute(s,{type:'finish',tournamentId:'t1'});
 const ui=await boot('https://example.test/',s,'players');
 try{ui.click('[data-player=p1]');assert.match(ui.q('.player-stats').textContent,/Wins1/);assert.match(ui.w.document.body.textContent,/Finished #1/);assert.doesNotMatch(ui.w.document.body.textContent,/winnings|net result|recorded costs|cashes|\$/i);assert.equal('winnings' in ui.stored().tournaments[0].entries[0],false);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});
