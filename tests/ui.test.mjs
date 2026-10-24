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
 if(options.cloud)w.__fixture.cloud=options.cloud;
 const stub=`export const createClient=()=>{
  const f=window.__fixture;
  const signIn=async()=>({data:{session:f.session={user:{id:'organizer-1',email:'organizer@example.test'}}}});
  const query={select(){return query;},eq(){return query;},async maybeSingle(){const source=f.cloud||f;return {data:source.state?{state:structuredClone(source.state),version:source.version}:null,error:f.readError};}};
  return {auth:{getSession:async()=>({data:{session:f.session}}),onAuthStateChange:cb=>(f.auth=cb,{data:{subscription:{unsubscribe(){}}}}),signInWithPassword:signIn,signUp:async()=>f.confirmEmail?{data:{session:null}}:signIn(),signOut:async()=>{f.session=null;f.auth('SIGNED_OUT',null);return {error:null};}},from:()=>query,
   rpc:async(name,args)=>{if(name==='td_server_time')return {data:new Date().toISOString()};if(f.saveError)return {error:f.saveError};const target=f.cloud||f;if(args.p_expected_version!==target.version)return {error:{message:'TD_CONFLICT: tournament changed on another device'}};target.state=structuredClone(args.p_state);target.version++;f.saves++;if(f.cloud)for(const cb of target.listeners)queueMicrotask(cb);return {data:{state:structuredClone(target.state),version:target.version}};},
   channel:()=>({on(event,filter,cb){f.notify=cb;if(f.cloud)f.cloud.listeners.add(cb);return this;},subscribe(){return this;}}),removeChannel:async()=>{}
  };
 };`;
 const out=await build({entryPoints:['src/app.mjs'],bundle:true,write:false,format:'iife',plugins:[{name:'local-auth-fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'auth-fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js'}));}}]});
 const errors=[];w.addEventListener('error',e=>errors.push(e.error));w.eval(out.outputFiles[0].text);await flush();
 const q=s=>w.document.querySelector(s),click=s=>{assert.ok(q(s),'Missing '+s);q(s).click();};
 const submit=async (f,action)=>{f.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:action?f.querySelector(`[value=${action}]`):null}));await flush();};
 const input=(el,value)=>{el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const storage=async value=>{w.__fixture.state=structuredClone(value);w.__fixture.version++;await w.__fixture.notify();await flush();};
 return {w,q,click,submit,input,storage,errors,opened:()=>opened,stored:()=>structuredClone((w.__fixture.cloud||w.__fixture).state),close:()=>w.close()};
}
for(const base of ['https://example.test/','https://example.test/uno-club-tournament/'])test('home, player records, registration and navigation at '+base,async()=>{
 const ui=await boot(base),{q,click,input,submit}=ui;
 try{
  assert.equal(ui.w.document.querySelectorAll('.home-menu .menu-card').length,5);
  assert.equal(q('.home-tournament'),null);assert.doesNotMatch(ui.w.document.body.textContent,/Welcome back|What would you like/);
  click('[data-go="players"]');assert.equal(q('.context'),null);assert.equal(q('[data-register]'),null);
  click('[data-action="add-player"]');let form=q('#player-form');input(form.elements.name,'  Alex   Smith  ');input(form.elements.phone,'555-123-0100');await submit(form);
  let p=ui.stored().players[0];assert.equal(p.name,'Alex Smith');assert.equal(p.phone,'555-123-0100');const pid=p.id;
  assert.equal(ui.stored().tournaments.length,0);
  click('[data-action="add-player"]');form=q('#player-form');input(form.elements.name,'alex SMITH');assert.match(q('.name-feedback').textContent,/already exists/);assert.equal(form.elements.name.checkValidity(),false);await submit(form);assert.equal(ui.stored().players.length,1);
  click('[data-action="close-modal"]');click('[data-player]');form=q('#player-form');assert.equal(form.querySelector('[readonly]').value,'001');input(form.elements.name,'Alex S');await submit(form);assert.equal(ui.stored().players[0].id,pid);assert.equal(ui.stored().players[0].phone,'555-123-0100');
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
 const t=s.tournaments[0];t.tvDisplayMode='full-clock';t.clock={index:5,status:'running',remainingMs:100,deadline:Date.now()+1000};
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
 try{ui.click('[data-player="p1"]');let f=ui.q('#player-form');ui.input(f.elements.name,' CASEY ');await ui.submit(f);assert.equal(ui.stored().players[0].name,'Alex');ui.input(f.elements.name,'Alex S');await ui.submit(f);assert.equal(ui.stored().players[0].id,'p1');assert.equal(ui.stored().tournaments[0].entries[0].playerId,'p1');
 ui.q('#player-history-list').scrollTop=140;ui.click('[data-archive=p1]');await flush();assert.equal(ui.q('h1').textContent,'Alex S (Archived)');assert.equal(ui.q('h1 .archived-status').textContent,'(Archived)');assert.equal(ui.q('#player-form').elements.name.value,'Alex S');assert.equal(ui.q('#player-history-list').scrollTop,140);assert.equal(ui.q('[data-archive=p1]').textContent,'Restore player');
 ui.click('[data-archive=p1]');await flush();assert.equal(ui.q('h1').textContent,'Alex S');assert.equal(ui.stored().players[0].archived,false);assert.equal(ui.stored().tournaments[0].entries[0].playerId,'p1');assert.deepEqual(ui.errors,[]);}finally{ui.close();}
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
 let s=initialState();s=execute(s,{type:'tournament-create',id:'t1',name:'Cutoff display test',templateId:s.templates[0].id});const t=s.tournaments[0];t.tvDisplayMode='full-clock';t.settings.rebuyLastRound=8;t.clock={index:6,status:'paused',remainingMs:900000,deadline:null};
 const ui=await boot('https://example.test/',s,'clock','t1');
 try{
  assert.equal(ui.q('.tv-final-rebuy'),null);assert.match(ui.q('.tv-cutoff-detail').textContent,/Includes the following break/);
  t.clock.index=7;await ui.storage(s);assert.equal(ui.q('.tv-final-rebuy').textContent,'Final Rebuy Round');assert.match(ui.q('.tv-cutoff-detail').textContent,/remain open during the following break/);assert.equal(ui.q('.tv-pool'),null);
  t.clock.index=8;await ui.storage(s);assert.equal(ui.q('.tv-final-rebuy'),null);assert.match(ui.q('.tv-cutoff-detail').textContent,/close when this break ends/);assert.equal(ui.q('.tv-pool'),null);
  t.clock.index=9;await ui.storage(s);assert.equal(ui.q('.tv-rebuys-open'),null);assert.ok(ui.q('.tv-pool'));assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('clock transitions from final round to cutoff break and then prizes on timer ticks alone',async()=>{
 let s=initialState();s=execute(s,{type:'tournament-create',id:'t1',name:'Automatic cutoff',templateId:s.templates[0].id});const t=s.tournaments[0];t.tvDisplayMode='full-clock';t.settings.rebuyLastRound=1;t.settings.pauseBreaks=false;t.levels.splice(1,0,{kind:'break',minutes:0.01,sb:0,bb:0,ante:0,game:'',chipUp:false});t.clock={index:0,status:'running',remainingMs:0,deadline:Date.now()+700};
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
  input(field,'20000');assert.equal(field.value,'20,000');q('.structure-editor-body').scrollTop=420;click('[data-action="add-break"]');assert.equal(q('.structure-editor-body').scrollTop,420);field=q('[name=startingStack]');assert.equal(field.value,'20,000');
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
  ui.input(ui.q('#player-search'),'002');assert.equal(ui.w.document.querySelectorAll('[data-player]').length,1);ui.click('[data-player]');assert.equal(ui.q('#player-form [readonly]').value,'002');assert.equal(ui.q('[data-last-played]').value,'Not yet');
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
 try{assert.equal(ui.q('.tv-seating-heading h1').textContent,'Next Week');assert.deepEqual(ui.errors,[]);}finally{ui.close();}
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
 let s=initialState();s=execute(s,{type:'tournament-create',id:'t1',name:'Timed cutoff',templateId:s.templates[0].id});const t=s.tournaments[0];t.tvDisplayMode='full-clock';t.settings.rebuyLastRound=1;t.settings.pauseBreaks=false;t.levels.splice(1,0,{kind:'break',minutes:0.01,sb:0,bb:0,ante:0,game:'',chipUp:false});t.clock={index:0,status:'running',remainingMs:0,deadline:Date.now()+700};
 const ui=await boot('https://example.test/',s,'manage','t1');
 try{assert.equal(ui.q('#record-rebuys').disabled,true);await new Promise(r=>setTimeout(r,850));assert.equal(ui.q('#record-rebuys').disabled,false);await new Promise(r=>setTimeout(r,950));assert.equal(ui.q('#record-rebuys').disabled,false);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('completed player profiles show finishing history without money statistics or winnings',async()=>{
 let s=initialState();s=execute(s,{type:'player-save',id:'p1',name:'Alex'});s=execute(s,{type:'tournament-create',id:'t1',name:'Finished Event',date:'2026-10-20',templateId:s.templates[0].id});s=execute(s,{type:'register',tournamentId:'t1',playerId:'p1'});s=execute(s,{type:'finish',tournamentId:'t1'});
 const ui=await boot('https://example.test/',s,'players');
 try{ui.click('[data-player=p1]');assert.equal(ui.q('[data-last-played]').value,'Oct 20, 2026');assert.equal(ui.q('[data-last-played]').readOnly,true);assert.ok(ui.q('.player-notes').contains(ui.q('[name=notes]')));assert.match(ui.q('.player-stats').textContent,/Wins1/);assert.match(ui.w.document.body.textContent,/Finished #1/);assert.doesNotMatch(ui.w.document.body.textContent,/winnings|net result|recorded costs|cashes|\$/i);assert.equal('winnings' in ui.stored().tournaments[0].entries[0],false);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('player list filtering and cloud refresh preserve the fixed search and independent list position',async()=>{
 let s=initialState();for(let i=1;i<=30;i++)s=execute(s,{type:'player-save',id:'p'+i,name:'Player '+String(i).padStart(2,'0')});
 const ui=await boot('https://example.test/uno-club-tournament/',s,'players');
 try{
  const list=ui.q('#player-results'),search=ui.q('#player-search');list.scrollTop=250;search.focus();ui.input(search,'Player');assert.equal(list.scrollTop,0);assert.equal(ui.q('#player-search'),search);assert.equal(ui.w.document.activeElement,search);
  list.scrollTop=180;search.setSelectionRange(2,4);await ui.storage(execute(s,{type:'player-save',id:'p31',name:'Player 31'}));
  assert.equal(ui.q('#player-results').scrollTop,180);assert.equal(ui.w.document.activeElement,ui.q('#player-search'));assert.equal(ui.q('#player-search').selectionStart,2);assert.equal(ui.q('#player-search').selectionEnd,4);
  ui.input(ui.q('#player-search'),'Nobody');assert.equal(ui.q('#player-results').scrollTop,0);assert.match(ui.q('#player-results').textContent,/No matching players/);
  ui.click('[data-go=home]');assert.equal(ui.w.document.body.classList.contains('fixed-workspace'),false);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});


test('phone add and edit fields format plain digits and block invalid saves; archived list uses its status label',async()=>{
 let s=initialState();s=execute(s,{type:'player-save',id:'p1',name:'Archived Player'});s=execute(s,{type:'player-archive',id:'p1'});
 const ui=await boot('https://example.test/',s,'players');
 try{
  ui.q('#show-archived').checked=true;ui.q('#show-archived').dispatchEvent(new ui.w.Event('change',{bubbles:true}));assert.equal(ui.q('.player-row .archived-status').textContent,'Archived');
  ui.click('[data-action=add-player]');let form=ui.q('#player-form');ui.input(form.elements.name,'Phone Test');ui.input(form.elements.phone,'4045550123');assert.equal(form.elements.phone.value,'404-555-0123');assert.equal(form.elements.phone.checkValidity(),true);await ui.submit(form);
  const player=ui.stored().players.find(p=>p.name==='Phone Test');assert.equal(player.phone,'404-555-0123');ui.click('[data-player="'+player.id+'"]');form=ui.q('#player-form');
  for(const invalid of ['404555012','40455501234','abc5550123','404.555.0123','+14045550123']){ui.input(form.elements.phone,invalid);assert.equal(form.elements.phone.checkValidity(),false);await ui.submit(form);assert.equal(ui.stored().players.find(p=>p.id===player.id).phone,'404-555-0123');}
  ui.input(form.elements.phone,'7705550199');assert.equal(form.elements.phone.value,'770-555-0199');assert.equal(form.elements.phone.selectionStart,12);await ui.submit(form);assert.equal(ui.stored().players.find(p=>p.id===player.id).phone,'770-555-0199');
  form=ui.q('#player-form');ui.input(form.elements.phone,'');assert.equal(form.elements.phone.checkValidity(),true);await ui.submit(form);assert.equal(ui.stored().players.find(p=>p.id===player.id).phone,'');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('seats are configured in management, display capacity and balance twelve players six per table',async()=>{
 let s=initialState();for(let i=1;i<=13;i++)s=execute(s,{type:'player-save',id:'p'+i,name:'Seat Player '+i});s=execute(s,{type:'tournament-create',id:'t1',name:'Seating',templateId:s.templates[0].id});for(let i=1;i<=12;i++)s=execute(s,{type:'register',tournamentId:'t1',playerId:'p'+i});
 const ui=await boot('https://example.test/uno-club-tournament/',s,'setup','t1');
 try{
  ui.click('[data-edit-template]');assert.equal(ui.q('#structure-form [name=seatsPerTable]'),null);ui.click('[data-action=close-editor]');ui.click('[data-action=event-settings]');assert.equal(ui.q('#structure-form [name=seatsPerTable]'),null);ui.click('[data-action=close-editor]');
  ui.click('[data-go=manage]');ui.click('[data-tab=tables]');let form=ui.q('#seating-settings-form');assert.equal(form.elements.seatsPerTable.value,'10');ui.input(form.elements.seatsPerTable,'9');await ui.submit(form);
  assert.equal(ui.stored().tournaments[0].settings.seatsPerTable,9);assert.equal(ui.w.document.querySelectorAll('.seat-table').length,2);assert.equal(ui.w.document.querySelectorAll('.seat-number').length,18);assert.equal(ui.q('.seating-plan'),null);
  ui.click('[data-action=seat-remaining]');await flush();assert.deepEqual([...ui.w.document.querySelectorAll('.seat-table h3 small')].map(e=>e.textContent),['6 of 9 seats filled','6 of 9 seats filled']);assert.equal(ui.q('.seat-table .text-button').textContent,'Move');
  await ui.storage(execute(ui.stored(),{type:'register',tournamentId:'t1',playerId:'p13'}));form=ui.q('#seating-settings-form');ui.input(form.elements.seatsPerTable,'10');await ui.submit(form);assert.equal(ui.w.document.querySelectorAll('.seat-number').length,20);assert.equal(ui.q('.seating-plan'),null);
  ui.click('[data-action=seat-remaining]');await flush();assert.deepEqual([...ui.w.document.querySelectorAll('.seat-table h3 small')].map(e=>e.textContent),['7 of 10 seats filled','6 of 10 seats filled']);assert.equal(ui.stored().templates[0].settings.seatsPerTable,10);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

function manualSeatingFixture(players=10){let s=initialState();for(let i=1;i<=players;i++)s=execute(s,{type:'player-save',id:'p'+i,name:'Player '+i});s=execute(s,{type:'tournament-create',id:'t1',name:'Manual seating',templateId:s.templates[0].id});for(let i=1;i<=players;i++)s=execute(s,{type:'register',id:'e'+i,tournamentId:'t1',playerId:'p'+i});s.tournaments[0].entries.forEach((e,i)=>{e.table=Math.floor(i/10)+1;e.seat=i%10+1;});return s;}

test('table and unseated elimination uses confirmation, records finishes and preserves player records',async()=>{
 const seed=manualSeatingFixture(3);seed.tournaments[0].entries[0].seatLocked=true;seed.tournaments[0].entries[2].table=null;seed.tournaments[0].entries[2].seat=null;
 const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=tables]');assert.equal(ui.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'false');assert.equal(ui.w.document.querySelectorAll('[data-eliminate]').length,3);assert.ok(ui.q('.unseated-player-row [data-eliminate=e3]'));
  let prompt='';ui.w.confirm=message=>{prompt=message;return false;};ui.click('[data-eliminate=e1]');await flush();assert.match(prompt,/Eliminate Player 1 in 3rd place/);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.stored(),seed);
  ui.w.confirm=()=>true;ui.click('[data-eliminate=e1]');await flush();let t=ui.stored().tournaments[0];assert.equal(t.entries[0].place,3);assert.ok(t.entries[0].eliminatedAt);assert.equal(t.entries[0].seat,null);assert.equal(t.entries[0].table,null);assert.equal(t.entries[0].seatLocked,false);assert.equal(ui.q('[data-seat-grab=e1]'),null);assert.ok(ui.q('[data-seat-target][data-seat="1"] .seat-empty'));assert.equal(ui.q('.seat-table h3 small').textContent,'1 of 10 seats filled');
  ui.click('[data-eliminate=e3]');await flush();t=ui.stored().tournaments[0];assert.equal(t.entries[2].place,2);assert.equal(ui.q('[data-eliminate=e3]'),null);assert.equal(ui.q('[data-eliminate=e2]').disabled,true);assert.deepEqual(ui.stored().players,seed.players);assert.equal(t.entries.filter(e=>!e.eliminatedAt).length,1);
  ui.click('[data-tab=players]');ui.click('[data-action=undo-elimination]');await flush();ui.click('[data-action=undo-elimination]');await flush();ui.click('[data-tab=tables]');t=ui.stored().tournaments[0];assert.equal(t.entries[0].seat,1);assert.equal(t.entries[0].seatLocked,true);assert.equal(t.entries[2].eliminatedAt,null);assert.equal(t.entries[2].seat,null);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('table settings reject more than ten seats and headers put table name left and occupancy right',async()=>{
 const seed=manualSeatingFixture(12),ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=tables]');let form=ui.q('#seating-settings-form'),field=form.elements.seatsPerTable;assert.equal(field.max,'10');assert.equal(form.querySelector('button').textContent,'Apply');ui.input(field,'11');assert.equal(field.checkValidity(),false);await ui.submit(form);assert.match(ui.q('#toast').textContent,/2–10/);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.stored(),seed);
  ui.input(field,'9');await ui.submit(form);form=ui.q('#seating-settings-form');ui.input(form.elements.seatsPerTable,'10');await ui.submit(form);assert.equal(ui.stored().tournaments[0].settings.seatsPerTable,10);
  const headers=[...ui.w.document.querySelectorAll('.seat-table>h3')];assert.deepEqual(headers.map(h=>h.firstElementChild.textContent),['Table 1','Table 2']);assert.deepEqual(headers.map(h=>h.lastElementChild.textContent),['9 of 10 seats filled','3 of 10 seats filled']);const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/\.seat-table>h3\{background:var\(--gold\)/);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('completed tournaments disable seated elimination without altering saved results',async()=>{
 let seed=manualSeatingFixture(2);seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e2'});seed=execute(seed,{type:'finish',tournamentId:'t1'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{ui.click('[data-tab=tables]');assert.equal(ui.q('[data-eliminate=e1]').disabled,true);ui.click('[data-eliminate=e1]');await flush();assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.stored(),seed);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('selecting occupied seats offers swap or insertion slide without saving until chosen',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.click('[data-seat-grab=e7]');assert.equal(ui.q('[data-seat-grab=e7]').getAttribute('aria-pressed'),'true');ui.click('[data-seat-grab=e1]');assert.equal(ui.w.__fixture.saves,0);assert.equal(ui.q('[data-seat-move-mode=swap]').disabled,false);assert.equal(ui.q('[data-seat-move-mode=slide]').disabled,false);assert.match(ui.q('.seat-slide-preview').textContent,/Seat 6 → 7/);
  ui.click('[data-seat-move-mode=slide]');await flush();const entries=ui.stored().tournaments[0].entries;assert.equal(entries.find(e=>e.id==='e7').seat,1);assert.equal(entries.find(e=>e.id==='e1').seat,2);assert.equal(entries.find(e=>e.id==='e6').seat,7);assert.equal(entries.find(e=>e.id==='e10').seat,10);assert.equal(ui.w.__fixture.saves,1);assert.equal(ui.q('#dialog').open,false);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('a full tail blocks sliding, permits swapping, and cancellation keeps seating unchanged',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.click('[data-seat-grab=e1]');ui.click('[data-seat-grab=e7]');assert.equal(ui.q('[data-seat-move-mode=slide]').disabled,true);assert.match(ui.q('.seat-move-error').textContent,/Seat 10/);ui.click('[data-action=close-modal]');assert.equal(ui.w.__fixture.saves,0);
  ui.click('[data-seat-grab=e1]');ui.click('[data-seat-grab=e7]');ui.click('[data-seat-move-mode=swap]');await flush();assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e1').seat,7);assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e7').seat,1);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('empty-seat moves, selecting the original seat and canceling selections do not misplace players',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(7),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.click('[data-seat-grab=e7]');ui.click('[data-seat-grab=e7]');assert.equal(ui.w.__fixture.saves,0);assert.equal(ui.q('[data-seat-grab=e7]').getAttribute('aria-pressed'),'false');
  ui.click('[data-seat-grab=e7]');ui.click('[data-action=cancel-seat-pick]');assert.equal(ui.w.__fixture.saves,0);ui.click('[data-seat-grab=e7]');ui.click('[data-table="1"][data-seat="9"] [data-seat-target-button]');await flush();assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e7').seat,9);assert.equal(ui.q('[data-table="1"][data-seat="7"] [data-seat-target-button]').textContent.trim(),'7Empty');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('the Move menu supports occupied seats and stale confirmations cannot overwrite remote seating',async()=>{
 const s=manualSeatingFixture(),ui=await boot('https://example.test/',s,'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.click('[data-seat=e7]');let form=ui.q('#seat-form');assert.equal(form.elements.seat.querySelector('[value="1/1"]').disabled,false);form.elements.seat.value='1/1';await ui.submit(form);assert.ok(ui.q('[data-seat-move-mode=swap]'));
  const remote=execute(s,{type:'seat-move',tournamentId:'t1',entryId:'e2',table:1,seat:3,mode:'swap'});await ui.storage(remote);ui.click('[data-seat-move-mode=slide]');await flush();assert.equal(ui.w.__fixture.saves,0);assert.match(ui.q('#toast').textContent,/Seating changed/);assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e7').seat,7);assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e2').seat,3);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

function dispatchPointer(ui,target,type,{x=100,y=300,id=1,pointerType='mouse'}={}){const event=new ui.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:pointerType},isPrimary:{value:true}});target.dispatchEvent(event);return event;}
for(const pointerType of ['mouse','touch'])test(pointerType+' dragging highlights an occupied target, then asks before moving',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');const handle=ui.q('[data-seat-grab=e7]'),target=ui.q('[data-table="1"][data-seat="1"]');ui.w.document.elementFromPoint=()=>target;
  dispatchPointer(ui,handle,'pointerdown',{pointerType});dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:200,pointerType});assert.equal(ui.q('.seat-drop-target'),target);assert.ok(ui.q('.seat-drag-ghost'));assert.equal(ui.w.__fixture.saves,0);
  dispatchPointer(ui,ui.w.document,'pointerup',{x:130,y:200,pointerType});await flush();assert.equal(ui.q('.seat-drag-ghost'),null);assert.ok(ui.q('[data-seat-move-mode=swap]'));assert.equal(ui.w.__fixture.saves,0);ui.click('[data-seat-move-mode=swap]');await flush();assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e7').seat,1);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('canceling a drag, dropping outside seats and a remote update during dragging never save',async()=>{
 const s=manualSeatingFixture(),ui=await boot('https://example.test/',s,'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.w.document.elementFromPoint=()=>null;let handle=ui.q('[data-seat-grab=e7]');dispatchPointer(ui,handle,'pointerdown');dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:200});dispatchPointer(ui,ui.w.document,'pointerup',{x:130,y:200});await flush();assert.equal(ui.w.__fixture.saves,0);assert.equal(ui.q('.seat-drag-ghost'),null);
  handle=ui.q('[data-seat-grab=e7]');dispatchPointer(ui,handle,'pointerdown');dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:200});dispatchPointer(ui,ui.w.document,'pointercancel');assert.equal(ui.q('.seat-drag-ghost'),null);assert.equal(ui.w.__fixture.saves,0);
  dispatchPointer(ui,ui.q('[data-seat-grab=e7]'),'pointerdown');dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:200});await ui.storage(execute(s,{type:'seat-move',tournamentId:'t1',entryId:'e2',table:1,seat:3,mode:'swap'}));assert.equal(ui.q('.seat-drag-ghost'),null);dispatchPointer(ui,ui.w.document,'pointerup',{x:130,y:200});await flush();assert.equal(ui.w.__fixture.saves,0);assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e7').seat,7);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('a failed swap save leaves both players in place and can be retried explicitly',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.click('[data-seat-grab=e7]');ui.click('[data-seat-grab=e1]');ui.w.__fixture.saveError={message:'Connection interrupted during save'};ui.click('[data-seat-move-mode=swap]');await flush();assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e7').seat,7);assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e1').seat,1);assert.equal(ui.q('#dialog').open,true);assert.match(ui.q('#toast').textContent,/Connection interrupted/);
  ui.w.__fixture.saveError=null;ui.click('[data-seat-move-mode=swap]');await flush();assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e7').seat,1);assert.equal(ui.stored().tournaments[0].entries.find(e=>e.id==='e1').seat,7);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('dragging near the screen edge scrolls and Escape cancels the pending drag',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');const frames=[];let scrolled=0,canceled=0;ui.w.requestAnimationFrame=callback=>(frames.push(callback),frames.length);ui.w.cancelAnimationFrame=()=>{canceled++;};ui.w.scrollBy=(x,y)=>{scrolled+=y;};ui.w.document.elementFromPoint=()=>ui.q('[data-table="1"][data-seat="1"]');
  dispatchPointer(ui,ui.q('[data-seat-grab=e7]'),'pointerdown');dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:ui.w.innerHeight-10});frames.shift()();assert.ok(scrolled>0);assert.ok(ui.q('.seat-drag-ghost'));
  ui.w.document.dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(ui.q('.seat-drag-ghost'),null);assert.ok(canceled>0);dispatchPointer(ui,ui.w.document,'pointerup',{x:130,y:200});await flush();assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('a cloud update deferred while typing refreshes the displayed seats before another player is picked',async()=>{
 const s=manualSeatingFixture(),ui=await boot('https://example.test/',s,'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.q('#seating-settings-form [name=seatsPerTable]').focus();const remote=execute(s,{type:'seat-move',tournamentId:'t1',entryId:'e7',table:1,seat:1,mode:'swap'});await ui.storage(remote);
  assert.ok(ui.q('[data-table="1"][data-seat="7"] [data-seat-grab=e7]'));ui.click('[data-seat-grab=e7]');assert.equal(ui.w.__fixture.saves,0);assert.ok(ui.q('[data-table="1"][data-seat="1"] [data-seat-grab=e7]'));assert.match(ui.q('#toast').textContent,/Seating changed/);assert.equal(ui.q('[data-seat-grab=e7]').getAttribute('aria-pressed'),'false');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('Seat Players becomes Seat Remaining Players and preserves every already seated player',async()=>{
 const s=manualSeatingFixture(12);for(const e of s.tournaments[0].entries){e.table=null;e.seat=null;}
 const ui=await boot('https://example.test/',s,'manage','t1');
 try{
  ui.click('[data-tab=tables]');assert.equal(ui.q('[data-action=seat-remaining]').textContent,'Seat Players');assert.equal(ui.q('[data-action=combine-tables]').disabled,true);
  ui.click('[data-action=toggle-move-players]');ui.click('[data-seat=e1]');ui.q('#seat-form').elements.seat.value='1/9';await ui.submit(ui.q('#seat-form'));assert.equal(ui.q('[data-action=seat-remaining]').textContent,'Seat Remaining Players');
  ui.click('[data-seat-lock=e1]');await flush();ui.click('[data-action=seat-remaining]');await flush();const entries=ui.stored().tournaments[0].entries;assert.equal(entries[0].seat,9);assert.equal(entries[0].seatLocked,true);assert.ok(entries.every(e=>e.table));assert.equal(ui.q('[data-action=seat-remaining]').disabled,true);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
function reducedSeatingFixture(players,keep){const s=manualSeatingFixture(players);s.tournaments[0].entries.forEach((e,i)=>{if(!keep.includes(i)){e.eliminatedAt=Date.now();e.table=null;e.seat=null;}});return s;}
test('Combine Tables merges three into two only after confirmation and never offers a redraw',async()=>{
 const s=reducedSeatingFixture(30,[0,1,2,3,4,5,6,7,10,11,12,13,14,15,20,21]),ui=await boot('https://example.test/',s,'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=combine-tables]');assert.equal(ui.q('[data-combine-mode=redraw]'),null);assert.equal(ui.w.__fixture.saves,0);ui.click('[data-action=close-modal]');assert.equal(ui.w.__fixture.saves,0);
  ui.click('[data-action=combine-tables]');ui.click('[data-combine-mode=combine]');await flush();assert.equal(ui.w.document.querySelectorAll('.seat-table').length,2);assert.equal(ui.q('[data-action=combine-tables]').disabled,true);assert.deepEqual(ui.stored().tournaments[0].entries.slice(0,20),s.tournaments[0].entries.slice(0,20));assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('Lock in seat toggles to red Locked, persists after reload and stops manual moves until unlocked',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.click('[data-seat-lock=e3]');await flush();assert.equal(ui.q('[data-seat-lock=e3]').textContent,'Locked');assert.equal(ui.q('[data-seat-lock=e3]').classList.contains('is-locked'),true);assert.equal(ui.q('[data-seat-lock=e3]').getAttribute('aria-pressed'),'true');assert.equal(ui.q('[data-seat-grab=e3]').disabled,true);assert.equal(ui.q('[data-seat=e3]').disabled,true);
  ui.click('[data-seat-grab=e7]');ui.click('[data-seat-grab=e1]');assert.equal(ui.q('[data-seat-move-mode=slide]').disabled,true);assert.match(ui.q('.seat-move-error').textContent,/Unlock.*Seat 3/);ui.click('[data-action=close-modal]');
  const reloaded=await boot('https://example.test/',ui.stored(),'manage','t1');try{reloaded.click('[data-tab=tables]');assert.equal(reloaded.q('[data-seat-lock=e3]').textContent,'Locked');assert.equal(reloaded.q('[data-seat-grab=e3]').disabled,true);}finally{reloaded.close();}
  await ui.storage(ui.stored());ui.click('[data-seat-lock=e3]');await flush();assert.equal(ui.q('[data-seat-lock=e3]').textContent,'Lock in seat');assert.equal(ui.q('[data-seat-grab=e3]').disabled,false);assert.equal(ui.stored().tournaments[0].entries[2].seatLocked,false);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
for(const mode of ['combine','redraw'])test(`final-table ${mode} keeps Table 1 locks and blocks closing-table locks`,async()=>{
 const s=reducedSeatingFixture(20,[0,2,4,10,11,12]),ui=await boot('https://example.test/',s,'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-seat-lock=e11]');await flush();ui.click('[data-action=combine-tables]');assert.match(ui.q('#dialog').textContent,/Unlock.*Table 2, Seat 1/);assert.equal(ui.q('[data-combine-mode=redraw]'),null);assert.equal(ui.w.__fixture.saves,1);ui.click('[data-action=close-modal]');
  ui.click('[data-seat-lock=e11]');await flush();ui.click('[data-seat-lock=e1]');await flush();ui.click('[data-action=combine-tables]');assert.ok(ui.q('[data-combine-mode=combine]'));assert.ok(ui.q('[data-combine-mode=redraw]'));ui.click(`[data-combine-mode=${mode}]`);await flush();const entries=ui.stored().tournaments[0].entries;assert.equal(entries[0].table,1);assert.equal(entries[0].seat,1);assert.equal(entries[0].seatLocked,true);assert.ok(entries.filter(e=>!e.eliminatedAt).every(e=>e.table===1));if(mode==='combine'){assert.equal(entries[2].seat,3);assert.equal(entries[4].seat,5);}assert.equal(ui.q('#dialog').open,false);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('combining rejects stale final-table choices and a failed save allows explicit retry',async()=>{
 const s=reducedSeatingFixture(20,[0,2,10,11]),ui=await boot('https://example.test/',s,'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=combine-tables]');const remote=execute(s,{type:'seat-lock',tournamentId:'t1',entryId:'e11',locked:true});await ui.storage(remote);ui.click('[data-combine-mode=redraw]');await flush();assert.equal(ui.w.__fixture.saves,0);assert.match(ui.q('#toast').textContent,/Seating changed/);ui.click('[data-action=close-modal]');ui.click('[data-tab=tables]');ui.click('[data-seat-lock=e11]');await flush();
  ui.click('[data-action=combine-tables]');ui.w.__fixture.saveError={message:'Connection interrupted'};ui.click('[data-combine-mode=combine]');await flush();assert.equal(ui.q('#dialog').open,true);assert.equal(ui.stored().tournaments[0].entries[10].table,2);ui.w.__fixture.saveError=null;ui.click('[data-combine-mode=combine]');await flush();assert.equal(ui.stored().tournaments[0].entries[10].table,1);assert.equal(ui.q('#dialog').open,false);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('failed seat locks never appear saved and stale displayed seats require review before locking',async()=>{
 const s=manualSeatingFixture(),ui=await boot('https://example.test/',s,'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.w.__fixture.saveError={message:'Could not save lock'};ui.click('[data-seat-lock=e1]');await flush();assert.equal(ui.q('[data-seat-lock=e1]').textContent,'Lock in seat');assert.equal(ui.stored().tournaments[0].entries[0].seatLocked,undefined);assert.match(ui.q('#toast').textContent,/Could not save lock/);ui.w.__fixture.saveError=null;
  ui.q('#seating-settings-form [name=seatsPerTable]').focus();await ui.storage(execute(s,{type:'seat-move',tournamentId:'t1',entryId:'e1',table:1,seat:2,mode:'swap'}));ui.click('[data-seat-lock=e1]');await flush();assert.equal(ui.w.__fixture.saves,0);assert.match(ui.q('#toast').textContent,/Seating changed/);assert.equal(ui.q('[data-seat-lock=e1]').closest('[data-seat-target]').dataset.seat,'2');ui.click('[data-seat-lock=e1]');await flush();assert.equal(ui.stored().tournaments[0].entries[0].seatLocked,true);assert.equal(ui.stored().tournaments[0].entries[0].seat,2);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('tables show the retained drag instruction and movement toggle without the explanatory paragraphs',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(15),'manage','t1');
 try{
  ui.click('[data-tab=tables]');assert.doesNotMatch(ui.q('.seat-tables').parentElement.textContent,/This is the number of available seats|tables needed for|Balanced distribution|Seat Remaining Players keeps existing seats/);
  assert.equal(ui.q('#seat-move-instructions').textContent,'Drag a player to another seat, or select a player and then a seat.');assert.equal(ui.q('[data-action=toggle-move-players]').parentElement,ui.q('#seat-move-instructions').parentElement);assert.equal(ui.q('[aria-describedby=seating-capacity-help]'),null);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
for(const pointerType of ['mouse','touch'])test(`${pointerType} gestures while Move Players is off never capture pointers, block scrolling or change seats`,async()=>{
 const seed=manualSeatingFixture(7),ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=tables]');const toggle=ui.q('[data-action=toggle-move-players]');assert.equal(toggle.getAttribute('aria-pressed'),'false');assert.equal(toggle.classList.contains('is-active'),false);
  let captured=0;const handle=ui.q('[data-seat-grab=e7]');handle.setPointerCapture=()=>captured++;ui.w.document.elementFromPoint=()=>ui.q('[data-table="1"][data-seat="9"]');
  assert.equal(handle.disabled,true);assert.equal(ui.q('[data-seat=e7]').disabled,true);assert.equal(ui.q('[data-seat-target-button]').disabled,true);
  dispatchPointer(ui,handle,'pointerdown',{pointerType});const move=dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:100,pointerType});dispatchPointer(ui,ui.w.document,'pointerup',{x:130,y:100,pointerType});
  ui.click('[data-seat-grab=e7]');ui.click('[data-seat=e7]');await flush();assert.equal(move.defaultPrevented,false);assert.equal(captured,0);assert.equal(ui.q('.seat-drag-ghost'),null);assert.equal(ui.q('.seat-drop-target'),null);assert.equal(ui.q('#dialog').open,false);assert.equal(ui.q('[data-seat-grab=e7]').getAttribute('aria-pressed'),'false');assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.stored(),seed);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('the green toggle enables moves and turning it off cancels selections and touch drags',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(7),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');assert.equal(ui.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'true');assert.equal(ui.q('[data-action=toggle-move-players]').classList.contains('is-active'),true);assert.equal(ui.q('[data-seat-grab=e7]').disabled,false);assert.equal(ui.q('[data-seat=e7]').disabled,false);
  ui.click('[data-seat-grab=e7]');assert.equal(ui.q('[data-seat-grab=e7]').getAttribute('aria-pressed'),'true');ui.click('[data-action=toggle-move-players]');assert.equal(ui.q('[data-seat-grab=e7]').getAttribute('aria-pressed'),'false');assert.equal(ui.q('#cancel-seat-pick').hidden,true);
  ui.click('[data-action=toggle-move-players]');ui.w.document.elementFromPoint=()=>ui.q('[data-table="1"][data-seat="9"]');dispatchPointer(ui,ui.q('[data-seat-grab=e7]'),'pointerdown',{pointerType:'touch'});dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:100,pointerType:'touch'});assert.ok(ui.q('.seat-drag-ghost'));
  ui.click('[data-action=toggle-move-players]');assert.equal(ui.q('.seat-drag-ghost'),null);assert.equal(ui.q('.seat-drop-target'),null);dispatchPointer(ui,ui.w.document,'pointerup',{x:130,y:100,pointerType:'touch'});await flush();assert.equal(ui.stored().tournaments[0].entries[6].seat,7);assert.equal(ui.w.__fixture.saves,0);assert.equal(ui.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'false');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('movement stays enabled for consecutive moves but resets after leaving tables or reopening the app',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(7),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');ui.click('[data-seat-grab=e7]');ui.click('[data-table="1"][data-seat="9"] [data-seat-target-button]');await flush();assert.equal(ui.stored().tournaments[0].entries[6].seat,9);assert.equal(ui.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'true');assert.equal(ui.q('[data-seat-grab=e7]').disabled,false);
  ui.click('[data-tab=players]');ui.click('[data-tab=tables]');assert.equal(ui.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'false');ui.click('[data-action=toggle-move-players]');ui.click('[data-go=home]');ui.click('[data-go=manage]');assert.equal(ui.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'false');
  ui.click('[data-action=toggle-move-players]');const reopened=await boot('https://example.test/',ui.stored(),'manage','t1');try{reopened.click('[data-tab=tables]');assert.equal(reopened.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'false');assert.equal(reopened.q('[data-seat-grab=e7]').disabled,true);}finally{reopened.close();}assert.equal(ui.w.__fixture.saves,1);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('management keeps all three header rows together and dragging scrolls below the pinned menu without dropping through it',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=tables]');ui.click('[data-action=toggle-move-players]');const chrome=ui.q('.management-chrome');assert.ok(chrome.querySelector('.header'));assert.ok(chrome.querySelector('.context [data-action=open-clock]'));assert.ok(chrome.querySelector('.nav [data-go=home]'));assert.equal(chrome.contains(ui.q('.content')),false);assert.equal(ui.w.document.querySelectorAll('[data-action=open-clock]').length,1);
  chrome.getBoundingClientRect=()=>({top:0,bottom:320,height:320});const frames=[];let scrolled=0;ui.w.requestAnimationFrame=callback=>(frames.push(callback),frames.length);ui.w.cancelAnimationFrame=()=>{};ui.w.scrollBy=(x,y)=>{scrolled+=y;};const target=ui.q('[data-table="1"][data-seat="1"]');ui.w.document.elementFromPoint=(x,y)=>{assert.ok(y>=320,'Never hit-test seats hidden under the fixed header');return target;};
  dispatchPointer(ui,ui.q('[data-seat-grab=e7]'),'pointerdown',{x:130,y:500,pointerType:'touch'});dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:350,pointerType:'touch'});assert.equal(ui.q('.seat-drop-target'),target);frames.shift()();assert.ok(scrolled<0,'Scroll upward just below the fixed navigation');
  dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:200,pointerType:'touch'});assert.equal(ui.q('.seat-drop-target'),null);dispatchPointer(ui,ui.w.document,'pointerup',{x:130,y:200,pointerType:'touch'});await flush();assert.equal(ui.w.__fixture.saves,0);assert.equal(ui.q('#dialog').open,false);assert.equal(ui.q('.seat-drag-ghost'),null);
  ui.click('[data-go=players]');assert.equal(ui.q('.management-chrome'),null);assert.ok(ui.q('#player-search'));assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('TV controls hide while the clock keeps running, stay hidden through cloud refresh, and wake on touch',async()=>{
 const s=manualSeatingFixture();s.tournaments[0].tvDisplayMode='full-clock';s.tournaments[0].clock={index:0,status:'running',remainingMs:900000,deadline:Date.now()+900000};const ui=await boot('https://example.test/',s,'clock','t1');
 try{
  assert.equal(ui.q('.tv-toolbar').getAttribute('aria-hidden'),'false');const start=ui.q('#tv-time').textContent;await new Promise(resolve=>setTimeout(resolve,3100));assert.equal(ui.q('.tv-toolbar').getAttribute('aria-hidden'),'true');assert.notEqual(ui.q('#tv-time').textContent,start);assert.equal(ui.q('#tv-level').textContent,'ROUND 1');
  const remote=ui.stored();remote.tournaments[0].name='Updated tournament';await ui.storage(remote);assert.match(ui.q('.tv-heading h1').textContent,/Updated tournament/);assert.equal(ui.q('.tv-toolbar').getAttribute('aria-hidden'),'true');ui.w.document.dispatchEvent(new ui.w.Event('touchstart',{bubbles:true}));assert.equal(ui.q('.tv-toolbar').getAttribute('aria-hidden'),'false');assert.equal(ui.q('.tv-toolbar').hasAttribute('inert'),false);
  ui.click('[data-action=sound]');assert.equal(ui.q('[data-action=sound]').textContent,'Sound: on');let fullscreenCalls=0;ui.w.document.documentElement.requestFullscreen=async()=>{fullscreenCalls++;};ui.click('[data-action=fullscreen]');await flush();assert.equal(fullscreenCalls,1);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('main page titles and actions share the top banner while Home keeps its original layout',async()=>{
 const ui=await boot('https://example.test/uno-club-tournament/',manualSeatingFixture(),'home','t1');
 try{
  const homeHeader=ui.q('.header').outerHTML;assert.equal(ui.q('.page-banner'),null);
  for(const [page,title] of [['setup','Tournament Setup'],['players','Player Database'],['signup','Tournament Registration'],['manage','Tournament Management']]){
   ui.click(`[data-go=${page}]`);assert.equal(ui.q('.header h1').textContent,title);assert.equal(ui.w.document.querySelectorAll('h1').length,1);assert.equal(ui.q('.content .page-heading'),null);assert.equal(ui.w.document.querySelectorAll('.nav').length,1);
   if(page==='setup'){assert.ok(ui.q('.header [data-action=new-tournament]'));ui.click('.header [data-action=new-tournament]');assert.ok(ui.q('#new-tournament-form'));ui.click('[data-action=close-modal]');ui.click('[data-action=new-structure]');assert.equal(ui.q('.header h1').textContent,title);assert.equal(ui.q('.page-banner-title small').textContent,'New structure');ui.click('.header [data-action=close-editor]');assert.ok(ui.q('#saved-structures'));}
   if(page==='players'){assert.ok(ui.q('.header [data-action=add-player]'));ui.click('.header [data-action=add-player]');assert.ok(ui.q('#player-form'));ui.click('[data-action=close-modal]');}
  }
  assert.doesNotMatch(ui.w.document.body.textContent,/RUN THE ROOM/);ui.click('[data-go=home]');assert.equal(ui.q('.header').outerHTML,homeHeader);assert.equal(ui.q('.page-banner'),null);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('management sidebar replaces the right pane and supports keyboard section navigation',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  assert.equal(ui.q('.management-sidebar').getAttribute('aria-orientation'),'vertical');assert.deepEqual([...ui.w.document.querySelectorAll('.management-sidebar button')].map(b=>b.textContent),['Players','Tables & Seats','Payouts','Financial Summary']);assert.ok(ui.q('.control-panel'));assert.equal(ui.q('.management-layout').contains(ui.q('.control-panel')),false);
  for(const [tab,selector] of [['tables','#seating-settings-form'],['payouts','#payout-form'],['summary','.summary-grid'],['players','[data-action=undo-elimination]']]){
   ui.click(`[data-tab=${tab}]`);const panel=ui.q('#management-panel');assert.ok(panel.querySelector(selector));assert.equal(panel.getAttribute('aria-labelledby'),'management-tab-'+tab);assert.equal(ui.q('.management-sidebar [aria-selected=true]').dataset.tab,tab);assert.equal(ui.w.document.activeElement.dataset.tab,tab);
  }
  ui.q('[data-tab=players]').dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.ok(ui.q('#seating-settings-form'));assert.equal(ui.w.document.activeElement.dataset.tab,'tables');ui.q('[data-tab=tables]').dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.ok(ui.q('.summary-grid'));ui.q('[data-tab=summary]').dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(ui.q('.management-sidebar [aria-selected=true]').dataset.tab,'players');assert.equal(ui.q('#payout-form'),null);assert.equal(ui.q('#seating-settings-form'),null);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('Tournament Summary shows the seven-line $420 ledger with separate colored dealer collection and payout',async()=>{
 const seed=manualSeatingFixture();seed.tournaments[0].rebuyCount=4;const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=summary]');const rows=[...ui.w.document.querySelectorAll('.financial-summary>div')];assert.deepEqual(rows.map(r=>r.querySelector('span').textContent),['Tournament Entries','Dealer Tokes — Buy-Ins Only','Rebuys','Tournament Fee (20%)','Dealer Tokes Paid Out','House Contribution','Total Prize Pool']);assert.deepEqual(rows.map(r=>r.querySelector('strong').textContent),['+$400','+$100','+$100','−$80','−$100','$0','$420']);assert.ok(rows.slice(0,3).every(r=>r.classList.contains('financial-credit')));assert.ok(rows.slice(3,5).every(r=>r.classList.contains('financial-debit')));assert.doesNotMatch(ui.q('.financial-summary').textContent,/\$[\d,]+\.\d/);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('the tenth registration enables the guarantee and saving it shows fully funded automatic house contribution',async()=>{
 let seed=manualSeatingFixture(9);seed=execute(seed,{type:'player-save',id:'p10',name:'Player 10'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');assert.equal(ui.w.document.querySelectorAll('#payout-form [name=payoutMode]').length,3);assert.equal(ui.q('[value=guaranteed]').disabled,true);await ui.storage(execute(seed,{type:'register',id:'e10',tournamentId:'t1',playerId:'p10'}));assert.equal(ui.q('[value=guaranteed]').disabled,false);
  ui.click('[value=guaranteed]');assert.equal(ui.q('#payout-values-field'),null);assert.equal(ui.q('#paid-places').value,'2');assert.match(ui.q('#guarantee-funding').textContent,/Additional house contribution required: \$680/);assert.equal(ui.q('[data-action=icm-chop]').disabled,true);await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].settings.payoutMode,'guaranteed');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-amount]')].map(e=>e.textContent),['$1,000','$0']);ui.click('[data-tab=summary]');const row=[...ui.w.document.querySelectorAll('.financial-summary>div')].find(r=>r.querySelector('span').textContent==='House Contribution');assert.equal(row.querySelector('strong').textContent,'+$680');assert.match(row.textContent,/Includes \$680/);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('guaranteed payouts recalculate on house contribution changes, keep the selected mode, and reject fractional fixed payouts',async()=>{
 const seed=manualSeatingFixture();seed.tournaments[0].settings={...seed.tournaments[0].settings,payoutMode:'guaranteed',housePercent:0,houseContribution:110000};const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-amount]')].map(e=>e.textContent),['$1,000','$500']);ui.input(ui.q('[name=houseContribution]'),'1200');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-amount]')].map(e=>e.textContent),['$1,040','$560']);await ui.submit(ui.q('#payout-form'));assert.equal(ui.q('[value=guaranteed]').checked,true);assert.equal(ui.stored().tournaments[0].settings.houseContribution,120000);
  ui.click('[value=fixed]');ui.input(ui.q('[data-payout-value="0"]'),'1000.50');ui.input(ui.q('[data-payout-value="1"]'),'599.50');await ui.submit(ui.q('#payout-form'));assert.match(ui.q('#toast').textContent,/whole dollars/);assert.equal(ui.stored().tournaments[0].settings.payoutMode,'guaranteed');ui.input(ui.q('[data-payout-value="0"]'),'1000');ui.input(ui.q('[data-payout-value="1"]'),'500');await ui.submit(ui.q('#payout-form'));assert.match(ui.q('#toast').textContent,/exactly match/);assert.equal(ui.stored().tournaments[0].settings.payoutMode,'guaranteed');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('ICM dialog supports manual agreements, cancels without saves, then saves chips and completes without points',async()=>{
 let seed=manualSeatingFixture(4);seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e4'});const old=structuredClone(seed.tournaments[0].entries[3]),ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.click('[data-action=icm-chop]');ui.click('[data-action=close-modal]');assert.equal(ui.w.__fixture.saves,0);ui.click('[data-action=icm-chop]');const rows=[...ui.w.document.querySelectorAll('[data-icm-entry]')];for(let i=0;i<rows.length;i++)ui.input(rows[i].querySelector('[data-icm-chips]'),String([50000,30000,20000][i]));ui.click('[data-action=icm-calculate]');assert.equal(ui.q('#icm-accept').disabled,false);
  const first=rows[0].querySelector('[data-icm-payout]'),last=rows[2].querySelector('[data-icm-payout]'),firstValue=Number(first.value),lastValue=Number(last.value);ui.input(first,String(firstValue-1));assert.equal(ui.q('#icm-accept').disabled,true);ui.input(last,String(lastValue+1));assert.equal(ui.q('#icm-accept').disabled,false);await ui.submit(ui.q('#icm-form'));const t=ui.stored().tournaments[0];assert.equal(t.status,'completed');assert.equal(t.endedBy,'icm-chop');assert.equal(t.clock.status,'ended');assert.equal(t.entries[0].finalChipCount,50000);assert.equal(t.entries[0].agreedPayout,(firstValue-1)*100);assert.deepEqual(t.entries[3],old);assert.ok(t.entries.every(e=>!('points' in e)));assert.match(ui.q('.icm-results').textContent,/50,000 final chips/);assert.equal(ui.q('#dialog').open,false);assert.equal(ui.w.__fixture.saves,1);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('ICM recalculation is required after chip edits and stale agreements cannot overwrite another device',async()=>{
 const seed=manualSeatingFixture(3),ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.click('[data-action=icm-chop]');for(const row of ui.w.document.querySelectorAll('[data-icm-entry]'))ui.input(row.querySelector('[data-icm-chips]'),'1000');ui.click('[data-action=icm-calculate]');const chips=ui.q('[data-icm-chips]');ui.input(chips,'2000');assert.equal(ui.q('#icm-accept').disabled,true);ui.click('[data-action=icm-calculate]');assert.equal(ui.q('#icm-accept').disabled,false);await ui.storage(execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e3'}));await ui.submit(ui.q('#icm-form'));assert.match(ui.q('#toast').textContent,/Tournament changed/);assert.equal(ui.stored().tournaments[0].status,'open');assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('failed ICM acceptance leaves the event open and a retry saves the same agreement once',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(2),'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.click('[data-action=icm-chop]');for(const row of ui.w.document.querySelectorAll('[data-icm-entry]'))ui.input(row.querySelector('[data-icm-chips]'),'5000');ui.click('[data-action=icm-calculate]');ui.w.__fixture.saveError={message:'Save interrupted'};await ui.submit(ui.q('#icm-form'));assert.equal(ui.stored().tournaments[0].status,'open');assert.equal(ui.stored().tournaments[0].icmChop,undefined);assert.equal(ui.q('#dialog').open,true);assert.match(ui.q('#toast').textContent,/Save interrupted/);ui.w.__fixture.saveError=null;await ui.submit(ui.q('#icm-form'));assert.equal(ui.stored().tournaments[0].endedBy,'icm-chop');assert.equal(ui.w.__fixture.saves,1);assert.equal(ui.q('#dialog').open,false);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('live guarantee eligibility does not let a focused stale payout form overwrite the tenth registration',async()=>{
 let seed=manualSeatingFixture(9);seed=execute(seed,{type:'player-save',id:'p10',name:'Player 10'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.q('[name=houseContribution]').focus();await ui.storage(execute(seed,{type:'register',id:'e10',tournamentId:'t1',playerId:'p10'}));await new Promise(resolve=>setTimeout(resolve,275));assert.equal(ui.q('[value=guaranteed]').disabled,false);ui.click('[value=guaranteed]');await ui.submit(ui.q('#payout-form'));assert.match(ui.q('#toast').textContent,/Tournament changed/);assert.equal(ui.w.__fixture.saves,0);assert.equal(ui.stored().tournaments[0].entries.length,10);ui.click('[data-tab=payouts]');ui.click('[value=guaranteed]');await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].settings.payoutMode,'guaranteed');assert.equal(ui.stored().tournaments[0].entries.length,10);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('an accepted guaranteed ICM chop freezes full house funding and shows agreed awards rather than a first-place promise',async()=>{
 let seed=manualSeatingFixture();seed.tournaments[0].settings.payoutMode='guaranteed';for(let i=10;i>=3;i--)seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e'+i});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.click('[data-action=icm-chop]');for(const row of ui.w.document.querySelectorAll('[data-icm-entry]'))ui.input(row.querySelector('[data-icm-chips]'),'5000');ui.click('[data-action=icm-calculate]');await ui.submit(ui.q('#icm-form'));const t=ui.stored().tournaments[0];assert.equal(t.settlement.houseContribution,68000);assert.equal(t.settlement.pool,100000);assert.deepEqual(t.finalPayouts,[50000,50000]);assert.match(ui.q('#guarantee-funding').textContent,/accepted ICM agreement replaces/);assert.doesNotMatch(ui.q('#guarantee-funding').textContent,/First place is at least/);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('payout place count appears below the pool and individual rows save a three-place percentage schedule',async()=>{
 const seed=manualSeatingFixture(),ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');assert.equal(ui.q('#payout-form').previousElementSibling.contains(ui.q('#payout-pool')),true);assert.equal(ui.q('#payout-form').querySelector(':scope>label').textContent,'How many places are paid?');assert.ok(ui.q('.payout-editor-grid>.payout-format-column .payout-formats'));assert.ok(ui.q('.payout-editor-grid>.payout-places-column #payout-place-list'));assert.equal(ui.q('#payout-values-field'),null);assert.equal(ui.q('.management-panel .prize-preview'),null);assert.doesNotMatch(ui.q('.management-panel').textContent,/Amounts in finishing order/);
  assert.equal(ui.q('#paid-places').value,'2');ui.click('[data-payout-step="1"]');assert.equal(ui.q('#paid-places').value,'3');assert.deepEqual([...ui.w.document.querySelectorAll('.payout-place-label')].map(e=>e.textContent),['First Place','Second Place','Third Place']);for(const [i,v] of [50,30,20].entries())ui.input(ui.q(`[data-payout-value="${i}"]`),String(v));assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-amount]')].map(e=>e.textContent),['$160','$96','$64']);await ui.submit(ui.q('#payout-form'));assert.deepEqual(ui.stored().tournaments[0].settings.payouts,[50,30,20]);assert.equal(ui.q('#paid-places').value,'3');assert.deepEqual(ui.stored().tournaments[0].entries,seed.tournaments[0].entries);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('changing place count and format retains unsaved per-place values and fixed dollar schedules',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.input(ui.q('#paid-places'),'3');for(const [i,v] of [50,30,20].entries())ui.input(ui.q(`[data-payout-value="${i}"]`),String(v));ui.click('[data-payout-step="-1"]');assert.equal(ui.w.document.querySelectorAll('[data-payout-value]').length,2);ui.click('[data-payout-step="1"]');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['50','30','20']);
  ui.click('[value=fixed]');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['160','96','64']);for(const [i,v] of [150,100,70].entries())ui.input(ui.q(`[data-payout-value="${i}"]`),String(v));ui.click('[value=percent]');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['50','30','20']);ui.click('[value=fixed]');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['150','100','70']);await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].settings.payoutMode,'fixed');assert.deepEqual(ui.stored().tournaments[0].settings.payouts,[15000,10000,7000]);assert.equal(ui.q('#paid-places').value,'3');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('guaranteed mode fixes the count at two and restoring percentage mode recovers the previous place count',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.input(ui.q('#paid-places'),'3');for(const [i,v] of [50,30,20].entries())ui.input(ui.q(`[data-payout-value="${i}"]`),String(v));ui.click('[value=guaranteed]');assert.equal(ui.q('#paid-places').value,'2');assert.equal(ui.q('#paid-places').disabled,true);assert.ok([...ui.w.document.querySelectorAll('[data-payout-step]')].every(b=>b.disabled));assert.equal(ui.w.document.querySelectorAll('[data-payout-place]').length,2);assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-amount]')].map(e=>e.textContent),['$1,000','$0']);ui.click('[value=percent]');assert.equal(ui.q('#paid-places').disabled,false);assert.equal(ui.q('#paid-places').value,'3');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['50','30','20']);ui.input(ui.q('#paid-places'),'21');await ui.submit(ui.q('#payout-form'));assert.match(ui.q('#toast').textContent,/1–20/);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('phone TV buttons update a separate TV session live while preserving the clock and chosen mode',async()=>{
 const seed=manualSeatingFixture(20),cloud={state:structuredClone(seed),version:1,listeners:new Set()},phone=await boot('https://example.test/',seed,'manage','t1',{cloud}),tv=await boot('https://example.test/',seed,'clock','t1',{cloud});
 try{
  assert.ok(phone.q('.management-chrome .tv-display-controls'));assert.equal(phone.q('[data-tv-display=full-clock]').disabled,true);assert.equal(phone.q('[data-tv-display=clock-seating]').getAttribute('aria-pressed'),'true');assert.equal(tv.w.document.querySelectorAll('.tv-seat-table').length,2);assert.match(tv.q('.tv-seating-heading').textContent,/STARTS SOON/);assert.equal(tv.q('.tv-compact-clock'),null);assert.equal(tv.q('[data-tv-table="1"][data-tv-seat="1"] .tv-seat-name').textContent,'Player 1');
  phone.click('[data-clock=start]');await flush();assert.equal(tv.q('#tv-status').textContent,'');assert.ok(tv.q('.tv-seating-shell'));const deadline=cloud.state.tournaments[0].clock.deadline,clock=structuredClone(cloud.state.tournaments[0].clock);
  phone.click('[data-tv-display=full-clock]');await flush();assert.ok(tv.q('.tv-grid'));assert.equal(tv.q('.tv-seating-shell'),null);assert.equal(phone.q('[data-tv-display=full-clock]').getAttribute('aria-pressed'),'true');assert.deepEqual(cloud.state.tournaments[0].clock,clock);assert.equal(tv.q('#tv-time').textContent,phone.q('#mini-time').textContent);
  phone.click('[data-tab=tables]');phone.click('[data-eliminate=e20]');await flush();assert.ok(tv.q('.tv-grid'));assert.equal(cloud.state.tournaments[0].tvDisplayMode,'full-clock');assert.equal(cloud.state.tournaments[0].clock.deadline,deadline);
  phone.click('[data-tv-display=clock-seating]');await flush();assert.ok(tv.q('.tv-seating-shell'));assert.equal(tv.q('[data-tv-entry=e20]'),null);assert.equal(tv.q('[data-tv-table="2"][data-tv-seat="10"] .tv-seat-name').textContent,'Open seat');
  phone.click('[data-action=toggle-move-players]');phone.click('[data-seat-grab=e7]');phone.click('[data-seat-grab=e1]');phone.click('[data-seat-move-mode=swap]');await flush();assert.equal(tv.q('[data-tv-table="1"][data-tv-seat="1"] .tv-seat-name').textContent,'Player 7');assert.equal(tv.q('[data-tv-table="1"][data-tv-seat="7"] .tv-seat-name').textContent,'Player 1');assert.equal(cloud.state.tournaments[0].tvDisplayMode,'clock-seating');
  phone.click('[data-clock=pause]');await flush();assert.match(tv.q('#tv-status').textContent,/PAUSED/);phone.click('[data-clock=resume]');await flush();assert.ok(tv.q('.tv-seating-shell'));assert.deepEqual(tv.errors,[]);assert.deepEqual(phone.errors,[]);assert.equal(tv.w.__fixture.saves,0);
 }finally{phone.close();tv.close();}
});

for(const count of [1,2,3])test(`seating TV fits ${count} table columns and keeps every numbered seat and player`,async()=>{
 const seed=manualSeatingFixture(count*10),ui=await boot('https://example.test/',seed,'clock','t1');
 try{
  assert.equal(ui.w.document.querySelectorAll('.tv-seat-table').length,count);assert.equal(ui.w.document.querySelectorAll('[data-tv-seat]').length,count*10);assert.equal(ui.q('.tv-seating-tables').style.getPropertyValue('--tv-table-columns'),String(count));assert.equal(ui.w.document.querySelectorAll('[data-tv-entry]').length,count*10);assert.equal(ui.q(`[data-tv-table="${count}"][data-tv-seat="10"] .tv-seat-name`).textContent,'Player '+count*10);const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/body.tv .tv-seating-shell\{height:100dvh;min-height:0/);assert.match(css,/grid-template-rows:repeat\(var\(--tv-seat-count\),minmax\(0,1fr\)\)/);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('remote table combinations and player renames refresh seating while preserving the selected TV mode',async()=>{
 let seed=reducedSeatingFixture(30,[0,1,2,3,4,10,11,12,13,14,20,21,22,23,24]);seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});seed.tournaments[0].tvDisplayMode='clock-seating';const ui=await boot('https://example.test/',seed,'clock','t1');
 try{
  assert.equal(ui.w.document.querySelectorAll('.tv-seat-table').length,3);seed=execute(seed,{type:'combine-tables',tournamentId:'t1',mode:'combine'});await ui.storage(seed);assert.equal(ui.w.document.querySelectorAll('.tv-seat-table').length,2);assert.equal(ui.w.document.querySelectorAll('[data-tv-entry]').length,15);assert.equal(ui.stored().tournaments[0].tvDisplayMode,'clock-seating');seed=execute(seed,{type:'player-save',id:'p21',name:'Renamed Player'});await ui.storage(seed);assert.equal(ui.q('[data-tv-entry=e21] .tv-seat-name').textContent,'Renamed Player');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('unseated names appear on TV and failed mode saves do not change either display or clock',async()=>{
 let seed=manualSeatingFixture(3);seed.tournaments[0].entries[2].table=null;seed.tournaments[0].entries[2].seat=null;seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});const ui=await boot('https://example.test/',seed,'clock','t1');
 try{assert.equal(ui.q('.tv-unseated [data-tv-entry=e3]').textContent,'Player 3');assert.equal(ui.q('[data-tv-entry=e3][data-tv-seat]'),null);assert.equal(ui.w.__fixture.saves,0);}finally{ui.close();}
 const phone=await boot('https://example.test/',seed,'manage','t1');
 try{phone.w.__fixture.saveError={message:'Connection unavailable'};phone.click('[data-tv-display=full-clock]');await flush();assert.equal(phone.q('[data-tv-display=clock-seating]').getAttribute('aria-pressed'),'true');assert.deepEqual(phone.stored(),seed);assert.match(phone.q('#toast').textContent,/Connection unavailable/);assert.deepEqual(phone.errors,[]);}finally{phone.close();}
});
