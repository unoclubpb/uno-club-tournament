import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {initialState,execute,applyRemoteElimination,finalizePendingEliminations} from '../src/domain.mjs';
const flush=()=>new Promise(resolve=>setTimeout(resolve,15));
const key='uno-tournament-practice-v1';
async function boot(base,seed,view='home',selected='',options={}){
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:base+'?view='+view+(selected?'&tournament='+selected:''),runScripts:'outside-only'}),w=dom.window;
 w.__remoteModel=(s,a,now)=>applyRemoteElimination(s,a,now);w.__finalizeModel=(s,now)=>finalizePendingEliminations(s,now);w.structuredClone=structuredClone;w.confirm=()=>true;let opened='';w.open=url=>{opened=url;return {focus(){}};};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 if(options.legacy)w.localStorage.setItem(key,JSON.stringify(options.legacy));
 w.__fixture={state:seed?structuredClone(seed):null,version:seed?1:0,session:options.signedOut?null:{user:{id:'organizer-1',email:'organizer@example.test'}},saveError:null,readError:null,saves:0};
 if(options.cloud)w.__fixture.cloud=options.cloud;
 const stub=`export const createClient=()=>{
  const f=window.__fixture;
  const signIn=async()=>({data:{session:f.session={user:{id:'organizer-1',email:'organizer@example.test'}}}});
  const query={select(){return query;},eq(){return query;},async maybeSingle(){const source=f.cloud||f;return {data:source.state?{state:structuredClone(source.state),version:source.version}:null,error:f.readError};}};
  return {auth:{getSession:async()=>({data:{session:f.session}}),onAuthStateChange:cb=>(f.auth=cb,{data:{subscription:{unsubscribe(){}}}}),signInWithPassword:signIn,signUp:async()=>f.confirmEmail?{data:{session:null}}:signIn(),signOut:async()=>{f.session=null;f.auth('SIGNED_OUT',null);return {error:null};}},from:()=>query,
   rpc:async(name,args)=>{if(name==='td_server_time')return {data:new Date().toISOString()};if(f.saveError)return {error:f.saveError};const target=f.cloud||f;if(name==='td_remote_elimination'){try{target.state=window.__remoteModel(target.state,{tournamentId:args.p_tournament_id,entryId:args.p_entry_id,requestId:args.p_request_id,command:args.p_command},Date.now());target.version++;f.saves++;if(f.cloud)for(const cb of target.listeners)queueMicrotask(cb);if(f.remoteReplyError)return {error:f.remoteReplyError};return {data:{state:structuredClone(target.state),version:target.version}};}catch(error){return {error:{message:error.message}};}}if(args.p_expected_version!==target.version)return {error:{message:'TD_CONFLICT: tournament changed on another device'}};target.state=structuredClone(args.p_state);target.version++;f.saves++;if(f.cloud)for(const cb of target.listeners)queueMicrotask(cb);return {data:{state:structuredClone(target.state),version:target.version}};},
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
  assert.equal(ui.w.document.querySelectorAll('.home-menu .menu-card').length,6);
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
  ui.click('[data-action=seat-remaining]');await flush();assert.deepEqual([...ui.w.document.querySelectorAll('.seat-table h3 small')].map(e=>e.textContent),['6 of 9 Seats Filled','6 of 9 Seats Filled']);assert.equal(ui.q('.seat-table .text-button').textContent,'Move');
  await ui.storage(execute(ui.stored(),{type:'register',tournamentId:'t1',playerId:'p13'}));form=ui.q('#seating-settings-form');ui.input(form.elements.seatsPerTable,'10');await ui.submit(form);assert.equal(ui.w.document.querySelectorAll('.seat-number').length,20);assert.equal(ui.q('.seating-plan'),null);
  ui.click('[data-action=seat-remaining]');await flush();assert.deepEqual([...ui.w.document.querySelectorAll('.seat-table h3 small')].map(e=>e.textContent),['7 of 10 Seats Filled','6 of 10 Seats Filled']);assert.equal(ui.stored().templates[0].settings.seatsPerTable,10);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

function manualSeatingFixture(players=10){let s=initialState();for(let i=1;i<=players;i++)s=execute(s,{type:'player-save',id:'p'+i,name:'Player '+i});s=execute(s,{type:'tournament-create',id:'t1',name:'Manual seating',templateId:s.templates[0].id});for(let i=1;i<=players;i++)s=execute(s,{type:'register',id:'e'+i,tournamentId:'t1',playerId:'p'+i});s.tournaments[0].entries.forEach((e,i)=>{e.table=Math.floor(i/10)+1;e.seat=i%10+1;});return s;}

test('table and unseated elimination uses confirmation, records finishes and preserves player records',async()=>{
 const seed=manualSeatingFixture(3);seed.tournaments[0].entries[0].seatLocked=true;seed.tournaments[0].entries[2].table=null;seed.tournaments[0].entries[2].seat=null;
 const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=tables]');assert.equal(ui.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'false');assert.equal(ui.w.document.querySelectorAll('[data-eliminate]').length,3);assert.ok(ui.q('.unseated-player-row [data-eliminate=e3]'));
  ui.w.confirm=()=>{throw new Error('Elimination must not use browser confirmation');};ui.click('[data-eliminate=e1]');assert.equal(ui.q('#dialog').open,true);assert.match(ui.q('#elimination-question').textContent,/Eliminate Player 1 in 3rd place/);assert.equal(ui.w.__fixture.saves,0);ui.click('[data-action=close-modal]');assert.deepEqual(ui.stored(),seed);
  ui.click('[data-eliminate=e1]');await ui.submit(ui.q('#elimination-form'));let t=ui.stored().tournaments[0];assert.equal(t.entries[0].place,3);assert.ok(t.entries[0].eliminatedAt);assert.equal(t.entries[0].seat,null);assert.equal(t.entries[0].table,null);assert.equal(t.entries[0].seatLocked,false);assert.equal(ui.q('[data-seat-grab=e1]'),null);assert.ok(ui.q('[data-seat-target][data-seat="1"] .seat-empty'));assert.equal(ui.q('.seat-table h3 small').textContent,'1 of 10 Seats Filled');
  ui.click('[data-eliminate=e3]');assert.match(ui.q('#elimination-question').textContent,/Player 3 in 2nd place/);await ui.submit(ui.q('#elimination-form'));t=ui.stored().tournaments[0];assert.equal(t.entries[2].place,2);assert.equal(ui.q('[data-eliminate=e3]'),null);assert.equal(ui.q('[data-eliminate=e2]').disabled,true);assert.deepEqual(ui.stored().players,seed.players);assert.equal(t.entries.filter(e=>!e.eliminatedAt).length,1);
  ui.w.confirm=()=>true;ui.click('[data-tab=players]');ui.click('[data-undo-elimination=e3]');await flush();ui.click('[data-undo-elimination=e1]');await flush();ui.click('[data-tab=tables]');t=ui.stored().tournaments[0];assert.equal(t.entries[0].seat,1);assert.equal(t.entries[0].seatLocked,true);assert.equal(t.entries[2].eliminatedAt,null);assert.equal(t.entries[2].seat,null);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('table settings reject more than ten seats and headers put table name left and occupancy right',async()=>{
 const seed=manualSeatingFixture(12),ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=tables]');let form=ui.q('#seating-settings-form'),field=form.elements.seatsPerTable;assert.equal(field.max,'10');assert.equal(form.querySelector('button').textContent,'Apply');ui.input(field,'11');assert.equal(field.checkValidity(),false);await ui.submit(form);assert.match(ui.q('#toast').textContent,/2–10/);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.stored(),seed);
  ui.input(field,'9');await ui.submit(form);form=ui.q('#seating-settings-form');ui.input(form.elements.seatsPerTable,'10');await ui.submit(form);assert.equal(ui.stored().tournaments[0].settings.seatsPerTable,10);
  const headers=[...ui.w.document.querySelectorAll('.seat-table>h3')];assert.deepEqual(headers.map(h=>h.firstElementChild.textContent),['TABLE 1','TABLE 2']);assert.deepEqual(headers.map(h=>h.lastElementChild.textContent),['9 of 10 Seats Filled','3 of 10 Seats Filled']);const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/\.seat-table>h3\{background:var\(--gold\)/);assert.deepEqual(ui.errors,[]);
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
  assert.equal(ui.q('.management-sidebar').getAttribute('aria-orientation'),'vertical');assert.deepEqual([...ui.w.document.querySelectorAll('.management-sidebar button')].map(b=>b.textContent),['Players','Tables & Seats','Payouts','Summary']);assert.ok(ui.q('.control-panel'));assert.equal(ui.q('.management-layout').contains(ui.q('.control-panel')),false);
  for(const [tab,selector] of [['tables','#seating-settings-form'],['payouts','#payout-form'],['summary','.summary-grid'],['players','[data-action=finish]']]){
   ui.click(`[data-tab=${tab}]`);const panel=ui.q('#management-panel');assert.ok(panel.querySelector(selector));assert.equal(panel.getAttribute('aria-labelledby'),'management-tab-'+tab);assert.equal(ui.q('.management-sidebar [aria-selected=true]').dataset.tab,tab);assert.equal(ui.w.document.activeElement.dataset.tab,tab);
  }
  ui.q('[data-tab=players]').dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.ok(ui.q('#seating-settings-form'));assert.equal(ui.w.document.activeElement.dataset.tab,'tables');ui.q('[data-tab=tables]').dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.ok(ui.q('.summary-grid'));ui.q('[data-tab=summary]').dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(ui.q('.management-sidebar [aria-selected=true]').dataset.tab,'players');assert.equal(ui.q('#payout-form'),null);assert.equal(ui.q('#seating-settings-form'),null);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('Tournament Summary shows the seven-line $420 ledger with separate colored dealer collection and payout',async()=>{
 const seed=manualSeatingFixture();seed.tournaments[0].rebuyCount=4;const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=summary]');const rows=[...ui.w.document.querySelectorAll('.financial-summary>div')];assert.deepEqual(rows.map(r=>r.querySelector('span').textContent),['Tournament Entries','Dealer Tokes (Buy-Ins Only)','Rebuys','Tournament Fee (20%)','Dealer Tokes Paid Out','House Contribution','Total Prize Pool']);assert.deepEqual(rows.map(r=>r.querySelector('strong').textContent),['+$400','+$100','+$100','−$80','−$100','$0','$420']);assert.ok(rows.slice(0,3).every(r=>r.classList.contains('financial-credit')));assert.ok(rows.slice(3,5).every(r=>r.classList.contains('financial-debit')));assert.doesNotMatch(ui.q('.financial-summary').textContent,/\$[\d,]+\.\d/);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('the guarantee remains selectable before ten and shows fully funded house contribution at eligibility',async()=>{
 let seed=manualSeatingFixture(9);seed=execute(seed,{type:'player-save',id:'p10',name:'Player 10'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');assert.equal(ui.w.document.querySelectorAll('#payout-form [name=payoutMode]').length,3);assert.equal(ui.q('[value=guaranteed]').disabled,false);await ui.storage(execute(seed,{type:'register',id:'e10',tournamentId:'t1',playerId:'p10'}));assert.equal(ui.q('[value=guaranteed]').disabled,false);
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

test('the pool sits above the right payout column and individual rows save a three-place percentage schedule',async()=>{
 const seed=manualSeatingFixture(),ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');assert.ok(ui.q('.payout-places-column .payout-current-pool #payout-pool'));assert.equal(ui.q('.paid-places-label').textContent,'Number of Places Paid');assert.ok(ui.q('.payout-editor-grid>.payout-format-column .payout-formats'));assert.ok(ui.q('.payout-editor-grid>.payout-places-column #payout-place-list'));assert.equal(ui.q('#payout-values-field'),null);assert.equal(ui.q('.management-panel .prize-preview'),null);assert.doesNotMatch(ui.q('.management-panel').textContent,/Amounts in finishing order/);
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
test('pre-start guarantee uses two places and percentage selection restores its default distribution',async()=>{
 const ui=await boot('https://example.test/',manualSeatingFixture(),'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.input(ui.q('#paid-places'),'3');for(const [i,v] of [50,30,20].entries())ui.input(ui.q(`[data-payout-value="${i}"]`),String(v));ui.click('[value=guaranteed]');assert.equal(ui.q('#paid-places').value,'2');assert.equal(ui.q('#paid-places').disabled,true);assert.ok([...ui.w.document.querySelectorAll('[data-payout-step]')].every(b=>b.disabled));assert.equal(ui.w.document.querySelectorAll('[data-payout-place]').length,2);assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-amount]')].map(e=>e.textContent),['$1,000','$0']);ui.click('[value=percent]');assert.equal(ui.q('#paid-places').disabled,false);assert.equal(ui.q('#paid-places').value,'2');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['65','35']);ui.input(ui.q('#paid-places'),'21');await ui.submit(ui.q('#payout-form'));assert.match(ui.q('#toast').textContent,/1–20/);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('phone TV buttons update a separate TV session live while preserving the clock and chosen mode',async()=>{
 const seed=manualSeatingFixture(20),cloud={state:structuredClone(seed),version:1,listeners:new Set()},phone=await boot('https://example.test/',seed,'manage','t1',{cloud}),tv=await boot('https://example.test/',seed,'clock','t1',{cloud});
 try{
  assert.ok(phone.q('.management-chrome .tv-display-controls'));assert.equal(phone.q('[data-tv-display=full-clock]').disabled,true);assert.equal(phone.q('[data-tv-display=clock-seating]').getAttribute('aria-pressed'),'true');assert.equal(tv.w.document.querySelectorAll('.tv-seat-table').length,2);assert.match(tv.q('.tv-seating-heading').textContent,/STARTS SOON/);assert.equal(tv.q('.tv-compact-clock'),null);assert.equal(tv.q('[data-tv-table="1"][data-tv-seat="1"] .tv-seat-name').textContent,'Player 1');
  phone.click('[data-clock=start]');await flush();assert.equal(tv.q('#tv-status').textContent,'');assert.ok(tv.q('.tv-seating-shell'));const deadline=cloud.state.tournaments[0].clock.deadline,clock=structuredClone(cloud.state.tournaments[0].clock);
  phone.click('[data-tv-display=full-clock]');await flush();assert.ok(tv.q('.tv-grid'));assert.equal(tv.q('.tv-seating-shell'),null);assert.equal(phone.q('[data-tv-display=full-clock]').getAttribute('aria-pressed'),'true');assert.deepEqual(cloud.state.tournaments[0].clock,clock);assert.equal(tv.q('#tv-time').textContent,phone.q('#mini-time').textContent);
  phone.click('[data-tab=tables]');phone.click('[data-eliminate=e20]');await phone.submit(phone.q('#elimination-form'));assert.ok(tv.q('.tv-grid'));assert.equal(cloud.state.tournaments[0].tvDisplayMode,'full-clock');assert.equal(cloud.state.tournaments[0].clock.deadline,deadline);
  phone.click('[data-tv-display=clock-seating]');await flush();assert.ok(tv.q('.tv-seating-shell'));assert.equal(tv.q('[data-tv-entry=e20]'),null);assert.equal(tv.q('[data-tv-table="2"][data-tv-seat="10"] .tv-seat-name').textContent,'');assert.equal(tv.q('[data-tv-table="2"][data-tv-seat="10"] .tv-seat-number').textContent,'10');
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

test('structure editor saves guarantee settings before registration and replaces comma fields with editable default rows',async()=>{
 const ui=await boot('https://example.test/');
 try{
  ui.click('[data-go=setup]');ui.click('[data-edit-template]');let form=ui.q('#structure-form');assert.equal(form.querySelector('[name=payoutValues]'),null);assert.equal(form.querySelector('[value=guaranteed]').disabled,false);
  for(const [count,expected] of [[1,['100']],[2,['65','35']],[3,['50','30','20']],[4,['45','30','15','10']],[5,['100','0','0','0','0']]]){ui.input(form.elements.paidPlaces,String(count));assert.deepEqual([...form.querySelectorAll('[data-payout-value]')].map(e=>e.value),expected);}
  ui.input(form.querySelector('[data-payout-value="0"]'),'60');ui.input(form.querySelector('[data-payout-value="1"]'),'40');await ui.submit(form);assert.deepEqual(ui.stored().templates[0].settings.payouts,[60,40,0,0,0]);
  ui.click('[data-edit-template]');form=ui.q('#structure-form');ui.click('[value=guaranteed]');assert.equal(form.elements.paidPlaces.value,'2');await ui.submit(form);assert.equal(ui.stored().templates[0].settings.payoutMode,'guaranteed');assert.deepEqual(ui.stored().templates[0].settings.payouts,[65,35]);ui.click('[data-create-template]');form=ui.q('#new-tournament-form');ui.input(form.elements.name,'Saved Guarantee');await ui.submit(form);assert.equal(ui.stored().tournaments[0].settings.payoutMode,'guaranteed');assert.deepEqual(ui.stored().players,[]);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('active custom payout expansion keeps $1000 and $600 until Save, with new places at zero',async()=>{
 let seed=manualSeatingFixture();seed.tournaments[0].settings={...seed.tournaments[0].settings,houseContribution:128000,payoutMode:'fixed',payouts:[100000,60000]};seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.input(ui.q('#paid-places'),'4');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['1,000','600','0','0']);assert.deepEqual(ui.stored(),seed);for(const [i,n] of [900,500,100,100].entries())ui.input(ui.q(`[data-payout-value="${i}"]`),String(n));assert.deepEqual(ui.stored(),seed);await ui.submit(ui.q('#payout-form'));const t=ui.stored().tournaments[0];assert.deepEqual(t.settings.payouts,[90000,50000,10000,10000]);assert.equal(t.payoutCustom,true);assert.match(ui.q('#custom-payout-status').textContent,/Custom Payouts/);assert.equal(ui.q('#payout-pool').textContent,'$1,600');assert.deepEqual(t.clock,seed.tournaments[0].clock);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('guarantee overrides require confirmation, retain funding, and only explicitly recalculate after revenue changes',async()=>{
 let seed=manualSeatingFixture();seed.tournaments[0].settings.payoutMode='guaranteed';seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.input(ui.q('#paid-places'),'4');assert.equal(ui.q('[value=fixed]').checked,true);assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['1,000','0','0','0']);assert.equal(ui.q('[name=houseContribution]').value,'680');for(const [i,n] of [800,100,50,50].entries())ui.input(ui.q(`[data-payout-value="${i}"]`),String(n));let prompt='';ui.w.confirm=message=>{prompt=message;return false;};await ui.submit(ui.q('#payout-form'));assert.match(prompt,/Guaranteed.*Custom Payouts/);assert.deepEqual(ui.stored(),seed);ui.w.confirm=()=>true;await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].payoutCustom,true);assert.equal(ui.stored().tournaments[0].settings.houseContribution,68000);
  const remote=ui.stored();remote.tournaments[0].rebuyCount=4;await ui.storage(remote);assert.deepEqual(ui.stored().tournaments[0].settings.payouts,[80000,10000,5000,5000]);assert.match(ui.q('#payout-feedback').textContent,/exactly match/);assert.equal(ui.q('#payout-pool').textContent,'$1,100');ui.click('[data-action=recalculate-payouts]');assert.equal(ui.q('[value=guaranteed]').checked,true);assert.equal(ui.stored().tournaments[0].payoutCustom,true);await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].payoutCustom,false);assert.equal(ui.stored().tournaments[0].settings.payoutMode,'guaranteed');assert.equal(ui.stored().tournaments[0].settings.houseContribution,0);assert.equal(ui.q('#payout-pool').textContent,'$1,000');assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('manual percentage edits in a running event become fixed custom dollar agreements after confirmation',async()=>{
 let seed=manualSeatingFixture();seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{ui.click('[data-tab=payouts]');ui.input(ui.q('[data-payout-value="0"]'),'75');ui.input(ui.q('[data-payout-value="1"]'),'25');let confirmed=false;ui.w.confirm=()=>{confirmed=true;return true;};await ui.submit(ui.q('#payout-form'));assert.equal(confirmed,true);assert.equal(ui.stored().tournaments[0].settings.payoutMode,'fixed');assert.deepEqual(ui.stored().tournaments[0].settings.payouts,[24000,8000]);assert.equal(ui.stored().tournaments[0].payoutCustom,true);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('individual Undo Elimination identifies the player, supports non-last restoration and blocks occupied original seats',async()=>{
 let seed=manualSeatingFixture(5);seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e1'},Date.now());seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e2'},Date.now()+1);const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  assert.equal(ui.q('[data-action=undo-elimination]'),null);assert.equal(ui.w.document.querySelectorAll('[data-undo-elimination]').length,2);let prompt='';ui.w.confirm=message=>{prompt=message;return false;};ui.click('[data-undo-elimination=e1]');await flush();assert.match(prompt,/sure.*Player 1.*Table 1, Seat 1/);assert.deepEqual(ui.stored(),seed);ui.w.confirm=()=>true;ui.click('[data-undo-elimination=e1]');await flush();assert.equal(ui.stored().tournaments[0].entries[0].seat,1);assert.equal(ui.stored().tournaments[0].entries[1].place,5);
  let remote=execute(ui.stored(),{type:'seat',tournamentId:'t1',entryId:'e3',table:1,seat:2});await ui.storage(remote);ui.click('[data-undo-elimination=e2]');await flush();assert.match(ui.q('#toast').textContent,/Seat 2 is occupied/);assert.deepEqual(ui.stored(),remote);assert.deepEqual(ui.stored().players,seed.players);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('balance alerts appear only at a two-player difference, and Combine Tables removes them after equalizing',async()=>{
 const seed=manualSeatingFixture(16);seed.tournaments[0].entries.forEach((e,i)=>{e.table=i<8?1:2;e.seat=i%8+1;});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{assert.equal(ui.q('.table-balance-alert'),null);ui.click('[data-eliminate=e16]');await ui.submit(ui.q('#elimination-form'));assert.equal(ui.q('.table-balance-alert'),null);ui.click('[data-eliminate=e15]');await ui.submit(ui.q('#elimination-form'));assert.equal(ui.q('.table-balance-alert').textContent,'Tables Need Balancing. Please move one player to balance the tables.');assert.equal(ui.stored().tournaments[0].entries[0].seat,1);ui.click('[data-tab=tables]');assert.equal(ui.q('[data-action=combine-tables]').textContent,'Balance Tables');ui.click('[data-action=combine-tables]');assert.equal(ui.q('#dialog h2').textContent,'Balance Tables');assert.equal(ui.q('[data-combine-mode=redraw]'),null);ui.click('[data-combine-mode=combine]');await flush();assert.equal(ui.q('#toast').textContent,'Tables balanced.');assert.equal(ui.q('.table-balance-alert'),null);assert.deepEqual([...ui.w.document.querySelectorAll('.seat-table h3 small')].map(n=>n.textContent),['7 of 10 Seats Filled','7 of 10 Seats Filled']);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('TV controls are directly before Open Clock in the banner and rebuy/summary layout removes obsolete text',async()=>{
 const seed=manualSeatingFixture();seed.tournaments[0].clock={index:6,status:'paused',remainingMs:900000,deadline:null};const ui=await boot('https://example.test/',seed,'manage','t1');
 try{assert.equal(ui.q('.context-actions>.tv-display-controls').nextElementSibling.dataset.action,'open-clock');assert.equal(ui.q('.nav').nextElementSibling,null);assert.equal(ui.q('#record-rebuys').classList.contains('rebuy-available'),true);assert.equal(ui.q('#rebuy-total-help'),null);assert.doesNotMatch(ui.q('.content').textContent,/Remote controls require a cloud connection/);ui.click('[data-tab=summary]');assert.equal(ui.q('[data-tab=summary]').textContent,'Summary');assert.equal(ui.q('.management-panel h2').textContent,'Tournament Summary');assert.equal(ui.q('.management-panel>p'),null);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('clock appearance is inside tournament settings and saves defaults or a tournament draft without changing other app colors',async()=>{
 const seed=manualSeatingFixture(),ui=await boot('https://example.test/',seed,'setup','t1');
 try{
  assert.equal(ui.q('[data-action=clock-appearance]'),null);ui.click('[data-action=event-settings]');ui.click('[data-action=structure-clock-appearance]');let form=ui.q('#clock-appearance-form');assert.equal(form.querySelectorAll('[name=timerStyle]').length,4);ui.input(form.elements.background,'#112233');form.elements.timerStyle.value='stripes';form.querySelector('[name=timerStyle]:checked').dispatchEvent(new ui.w.Event('change',{bubbles:true}));assert.equal(form.querySelector('.clock-appearance-preview').dataset.timerStyle,'stripes');assert.equal(form.querySelector('.clock-appearance-preview').style.getPropertyValue('--clock-background'),'#112233');await ui.submit(form,'defaults');assert.equal(ui.stored().clockAppearanceDefaults.background,'#112233');assert.deepEqual(ui.stored().tournaments[0],seed.tournaments[0]);ui.click('[data-action=structure-clock-appearance]');form=ui.q('#clock-appearance-form');ui.input(form.elements.background,'#223344');form.elements.timerStyle.value='separate';form.querySelector('[name=timerStyle]:checked').dispatchEvent(new ui.w.Event('change',{bubbles:true}));await ui.submit(form,'event');assert.deepEqual(ui.stored().tournaments[0],seed.tournaments[0]);await ui.submit(ui.q('#structure-form'));assert.equal(ui.stored().tournaments[0].clockAppearance.background,'#223344');assert.equal(ui.q('.header').style.getPropertyValue('--clock-background'),'');
  ui.click('[data-go=manage]');ui.click('[data-clock=start]');await flush();ui.w.history.pushState({},'','/?view=clock&tournament=t1');ui.w.dispatchEvent(new ui.w.PopStateEvent('popstate'));assert.equal(ui.q('.tv-shell').style.getPropertyValue('--clock-background'),'#223344');assert.equal(ui.q('.tv-shell').dataset.timerStyle,'separate');assert.ok(ui.q('#tv-time .timer-seconds'));assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('payout format toggles retain the correct house funding and manual edits after recalculation stay custom',async()=>{
 let seed=manualSeatingFixture();seed.tournaments[0].settings.payoutMode='guaranteed';seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.input(ui.q('#paid-places'),'3');assert.equal(ui.q('[name=houseContribution]').value,'680');ui.click('[value=guaranteed]');assert.equal(ui.q('[name=houseContribution]').value,'0');ui.click('[value=fixed]');assert.equal(ui.q('[name=houseContribution]').value,'680');await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].payoutCustom,true);
  ui.click('[data-action=recalculate-payouts]');ui.click('[value=percent]');ui.input(ui.q('[data-payout-value="0"]'),'75');ui.input(ui.q('[data-payout-value="1"]'),'25');await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].settings.payoutMode,'fixed');assert.equal(ui.stored().tournaments[0].payoutCustom,true);assert.deepEqual(ui.stored().tournaments[0].settings.payouts,[24000,8000]);assert.equal(ui.stored().tournaments[0].settings.houseContribution,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});


test('Combine Tables is named only when it can remove a table, including four tables down to three',async()=>{
 const keep=[0,1,2,3,4,10,11,12,13,14,20,21,22,23,24,30,31,32,33,34,35],seed=reducedSeatingFixture(40,keep),ui=await boot('https://example.test/',seed,'manage','t1');
 try{ui.click('[data-tab=tables]');assert.equal(ui.q('[data-action=combine-tables]').textContent,'Combine Tables');assert.equal(ui.w.document.querySelectorAll('.seat-table').length,4);ui.click('[data-action=combine-tables]');assert.equal(ui.q('#dialog h2').textContent,'Combine Tables');ui.click('[data-combine-mode=combine]');await flush();assert.equal(ui.q('#toast').textContent,'Tables combined.');assert.equal(ui.w.document.querySelectorAll('.seat-table').length,3);assert.deepEqual([...ui.w.document.querySelectorAll('.seat-table h3 small')].map(n=>n.textContent),['7 of 10 Seats Filled','7 of 10 Seats Filled','7 of 10 Seats Filled']);assert.equal(ui.q('[data-action=combine-tables]').textContent,'Balance Tables');assert.equal(ui.q('[data-action=combine-tables]').disabled,true);assert.deepEqual(ui.stored().players,seed.players);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});


test('Players elimination uses an in-app dialog, rejects stale places and retains failed saves for retry',async()=>{
 const seed=manualSeatingFixture(4),ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.w.confirm=()=>{throw new Error('Elimination must not use browser confirmation');};
  ui.click('[data-eliminate=e1]');assert.equal(ui.q('#dialog').open,true);assert.match(ui.q('#elimination-question').textContent,/Player 1 in 4th place/);assert.deepEqual(ui.stored(),seed);
  const remote=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e2'});await ui.storage(remote);await ui.submit(ui.q('#elimination-form'));assert.match(ui.q('#elimination-feedback').textContent,/Tournament changed/);assert.deepEqual(ui.stored(),remote);assert.equal(ui.w.__fixture.saves,0);
  ui.click('[data-action=close-modal]');ui.click('[data-eliminate=e1]');assert.match(ui.q('#elimination-question').textContent,/Player 1 in 3rd place/);
  ui.w.__fixture.saveError={message:'Connection interrupted'};await ui.submit(ui.q('#elimination-form'));assert.equal(ui.q('#dialog').open,true);assert.match(ui.q('#elimination-feedback').textContent,/Connection interrupted/);assert.deepEqual(ui.stored(),remote);
  ui.w.__fixture.saveError=null;await ui.submit(ui.q('#elimination-form'));assert.equal(ui.q('#dialog').open,false);assert.equal(ui.stored().tournaments[0].entries[0].place,3);assert.deepEqual(ui.stored().players,seed.players);assert.equal(ui.w.__fixture.saves,1);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});


test('Setup saves editable guarantee amount and count before registration and reuses the structure',async()=>{
 const ui=await boot('https://example.test/');
 try{
  ui.click('[data-go=setup]');ui.click('[data-edit-template]');let form=ui.q('#structure-form');assert.equal(form.querySelector('[value=guaranteed]').disabled,false);
  ui.input(form.elements.guaranteeAmount,'1250');ui.input(form.elements.guaranteePlayers,'12');ui.click('[value=guaranteed]');assert.equal(form.elements.guaranteeAmount.value,'1,250');assert.equal(form.elements.paidPlaces.value,'2');assert.match(ui.q('#guarantee-eligibility').textContent,/\$1,250.*12 registered players/);assert.equal(ui.q('[data-payout-amount="0"]').textContent,'$1,250 minimum at 12 players');assert.equal(ui.w.__fixture.saves,1);await ui.submit(form);
  const saved=ui.stored().templates[0];assert.equal(saved.settings.guaranteeAmount,125000);assert.equal(saved.settings.guaranteePlayers,12);ui.click('[data-edit-template]');form=ui.q('#structure-form');assert.equal(form.elements.guaranteeAmount.value,'1,250');assert.equal(form.elements.guaranteePlayers.value,'12');ui.click('[data-action=close-editor]');ui.click('[data-create-template]');form=ui.q('#new-tournament-form');ui.input(form.elements.name,'Variable Guarantee');await ui.submit(form);const t=ui.stored().tournaments[0];assert.equal(t.settings.guaranteeAmount,125000);assert.equal(t.settings.guaranteePlayers,12);assert.equal(t.settings.payoutMode,'guaranteed');assert.deepEqual(t.settings.payouts,[65,35]);assert.deepEqual(t.entries,[]);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('Management previews configured eligibility, saves on confirmation and restores guarantee terms after custom payouts',async()=>{
 let seed=manualSeatingFixture(10);seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});const ui=await boot('https://example.test/',seed,'manage','t1');
 try{
  ui.click('[data-tab=payouts]');ui.input(ui.q('[name=guaranteeAmount]'),'1500');ui.input(ui.q('[name=guaranteePlayers]'),'12');ui.click('[value=guaranteed]');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-amount]')].map(e=>e.textContent),['$208','$112']);assert.equal(ui.q('#guarantee-funding').textContent,'');
  ui.input(ui.q('[name=guaranteePlayers]'),'8');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-amount]')].map(e=>e.textContent),['$1,500','$0']);assert.match(ui.q('#guarantee-funding').textContent,/\$1,180/);ui.w.confirm=()=>false;await ui.submit(ui.q('#payout-form'));assert.deepEqual(ui.stored(),seed);ui.w.confirm=()=>true;await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].settings.guaranteeAmount,150000);assert.equal(ui.stored().tournaments[0].settings.guaranteePlayers,8);
  ui.input(ui.q('#paid-places'),'4');assert.deepEqual([...ui.w.document.querySelectorAll('[data-payout-value]')].map(e=>e.value),['1,500','0','0','0']);await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].payoutCustom,true);ui.input(ui.q('[name=guaranteeAmount]'),'2000');ui.input(ui.q('[name=guaranteePlayers]'),'20');await ui.submit(ui.q('#payout-form'));assert.deepEqual(ui.stored().tournaments[0].settings.payouts,[150000,0,0,0]);ui.click('[data-action=recalculate-payouts]');assert.equal(ui.q('[name=guaranteeAmount]').value,'1,500');assert.equal(ui.q('[name=guaranteePlayers]').value,'8');await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].settings.payoutMode,'guaranteed');assert.deepEqual(ui.stored().tournaments[0].clock,seed.tournaments[0].clock);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});


test('clearing a conflicting old device copy removes only that browser key and never writes to the online workspace',async()=>{
 const cloud=manualSeatingFixture(3);cloud.players[0].name='Goober';const legacy=execute(initialState(),{type:'player-save',id:'old-goober',name:'Goober'});const ui=await boot('https://example.test/',cloud,'home','t1',{legacy});
 try{
  ui.w.confirm=()=>{throw new Error('Use the in-app confirmation');};ui.w.localStorage.setItem('unrelated-setting','keep');ui.w.localStorage.setItem('sb-example-auth-token','keep-session');ui.click('[data-action=import-browser]');await flush();assert.match(ui.q('.mode-note.warning').textContent,/Goober already belongs/);assert.equal(ui.w.__fixture.saves,0);
  ui.click('[data-action=clear-device-copy]');assert.match(ui.q('#dialog').textContent,/Supabase will stay intact/);ui.click('[data-action=close-modal]');assert.equal(ui.w.localStorage.getItem(key),JSON.stringify(legacy));assert.deepEqual(ui.stored(),cloud);
  ui.click('[data-action=clear-device-copy]');await ui.submit(ui.q('#clear-device-copy-form'));assert.equal(ui.w.localStorage.getItem(key),null);assert.equal(ui.q('[data-action=import-browser]'),null);assert.equal(ui.q('[data-action=clear-device-copy]'),null);assert.equal(ui.q('#dialog').open,false);assert.equal(ui.w.localStorage.getItem('unrelated-setting'),'keep');assert.equal(ui.w.localStorage.getItem('sb-example-auth-token'),'keep-session');assert.deepEqual(ui.stored(),cloud);assert.equal(ui.w.__fixture.saves,0);assert.ok(ui.w.__fixture.session);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});

test('clearing the device copy retains it if storage removal fails or the cloud connection is unavailable',async()=>{
 const cloud=manualSeatingFixture(3),legacy=initialState(),ui=await boot('https://example.test/',cloud,'home','t1',{legacy});
 try{
  ui.click('[data-action=clear-device-copy]');const remove=ui.w.Storage.prototype.removeItem;ui.w.Storage.prototype.removeItem=function(){throw new Error('Storage blocked');};await ui.submit(ui.q('#clear-device-copy-form'));assert.match(ui.q('#clear-device-copy-feedback').textContent,/Could not clear/);assert.equal(ui.w.localStorage.getItem(key),JSON.stringify(legacy));assert.equal(ui.q('#dialog').open,true);ui.w.Storage.prototype.removeItem=remove;
  ui.w.__fixture.readError={message:'Connection interrupted'};await ui.w.__fixture.notify();await flush();await ui.submit(ui.q('#clear-device-copy-form'));assert.match(ui.q('#clear-device-copy-feedback').textContent,/Reconnect/);assert.equal(ui.w.localStorage.getItem(key),JSON.stringify(legacy));assert.deepEqual(ui.stored(),cloud);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});


test('Tournament Remote links from Home and navigation, controls the actual clock and reuses payouts/ICM',async()=>{
 let seed=manualSeatingFixture(3);seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});const ui=await boot('https://example.test/',seed,'home','t1');
 try{
  ui.click('[data-go=remote]');assert.equal(ui.q('.remote-header h1').textContent,'Tournament Remote');assert.equal(ui.q('.management-sidebar'),null);assert.equal(ui.q('#remote-clock').textContent,'Pause Clock');assert.equal(ui.q('#remote-clock').classList.contains('remote-action-red'),true);assert.equal(ui.q('[data-remote-panel=eliminate]').classList.contains('remote-action-red'),true);assert.equal(ui.q('[data-remote-panel=payouts]').classList.contains('remote-action-green'),true);assert.match(ui.q('#remote-blinds').textContent,/25 \/ 50/);assert.match(ui.q('#remote-next').textContent,/50 \/ 100/);ui.click('#remote-clock');await flush();assert.equal(ui.stored().tournaments[0].clock.status,'paused');assert.equal(ui.q('#remote-clock').textContent,'Resume Clock');assert.equal(ui.q('#remote-clock').classList.contains('remote-action-green'),true);assert.equal(ui.q('#remote-clock').classList.contains('remote-action-red'),false);
  await ui.storage(execute(ui.stored(),{type:'clock',tournamentId:'t1',command:'resume'}));assert.equal(ui.q('#remote-clock').textContent,'Pause Clock');ui.click('[data-remote-panel=payouts]');assert.ok(ui.q('#payout-form'));assert.ok(ui.q('[data-action=icm-chop]'));ui.input(ui.q('[data-payout-value="0"]'),'60');ui.input(ui.q('[data-payout-value="1"]'),'40');await ui.submit(ui.q('#payout-form'));assert.equal(ui.stored().tournaments[0].payoutCustom,true);ui.click('[data-remote-panel=clock]');ui.click('[data-remote-panel=eliminate]');assert.equal(ui.w.document.querySelectorAll('.remote-table').length,1);assert.deepEqual([...ui.w.document.querySelectorAll('[data-remote-entry]')].map(e=>e.dataset.remoteEntry),['e1','e2','e3']);ui.click('[data-remote-panel=clock]');ui.click('[data-go=home]');ui.click('[data-go=manage]');assert.ok(ui.q('.nav [data-go=remote]'));assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
test('Remote pending Undo preserves the seat, and deadline finalization removes only the row and supports management corrections',async()=>{
 const seed=manualSeatingFixture(3),ui=await boot('https://example.test/',seed,'remote','t1');
 try{
  ui.click('[data-remote-panel=eliminate]');ui.click('[data-remote-eliminate=e2]');await flush();let pending=ui.stored();assert.equal(pending.tournaments[0].entries[1].seat,2);assert.ok(ui.q('[data-remote-entry=e2] [data-remote-undo]'));assert.equal(ui.q('[data-remote-entry=e2] strong').textContent,'Player 2');assert.equal(ui.q('#remote-balance-warning').textContent,'');ui.click('[data-remote-undo=e2]');await flush();assert.deepEqual(ui.stored().tournaments[0].entries,seed.tournaments[0].entries);assert.ok(ui.q('[data-remote-eliminate=e2]'));
  ui.click('[data-remote-eliminate=e2]');await flush();pending=ui.stored();const deadline=pending.tournaments[0].entries[1].pendingElimination.expiresAt;await ui.storage(finalizePendingEliminations(pending,deadline));assert.equal(ui.q('[data-remote-entry=e2]'),null);assert.equal(ui.stored().tournaments[0].entries[1].place,3);ui.click('[data-remote-panel=clock]');ui.click('[data-go=home]');ui.click('[data-go=manage]');assert.ok(ui.q('[data-undo-elimination=e2]'));ui.click('[data-undo-elimination=e2]');await flush();assert.equal(ui.stored().tournaments[0].entries[1].seat,2);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});


test('Remote reconciles a lost server acknowledgement without duplicating the pending elimination',async()=>{
 const seed=manualSeatingFixture(3),ui=await boot('https://example.test/',seed,'remote','t1');
 try{ui.click('[data-remote-panel=eliminate]');ui.w.__fixture.remoteReplyError={message:'Connection lost after saving'};ui.click('[data-remote-eliminate=e2]');await flush();assert.equal(ui.stored().tournaments[0].remoteEliminationRequests.length,1);assert.ok(ui.q('[data-remote-undo=e2]'));assert.equal(ui.stored().tournaments[0].entries[1].seat,2);ui.w.__fixture.remoteReplyError=null;ui.click('[data-remote-undo=e2]');await flush();assert.equal(ui.stored().tournaments[0].remoteEliminationRequests.length,1);assert.equal(ui.stored().tournaments[0].remoteEliminationRequests[0].status,'canceled');assert.equal(ui.stored().tournaments[0].entries[1].place,null);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});


test('Remote accepts the shared ICM calculator, ends the clock and retains earlier eliminations',async()=>{
 let seed=manualSeatingFixture(4);seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e4'});seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});const ui=await boot('https://example.test/',seed,'remote','t1');
 try{ui.click('[data-remote-panel=payouts]');ui.click('[data-action=icm-chop]');for(const [i,n] of [300,200,100].entries())ui.input(ui.q(`[data-icm-entry="e${i+1}"] [data-icm-chips]`),String(n));ui.click('[data-action=icm-calculate]');assert.equal(ui.q('#icm-accept').disabled,false);await ui.submit(ui.q('#icm-form'));const t=ui.stored().tournaments[0];assert.equal(t.status,'completed');assert.equal(t.endedBy,'icm-chop');assert.equal(t.clock.status,'ended');assert.equal(t.entries[3].place,4);assert.ok(t.entries[3].eliminatedAt);assert.equal(t.icmChop.participants.length,3);assert.match(ui.q('.remote-shell').textContent,/Tournament complete/);assert.equal(t.finalPayouts.reduce((a,b)=>a+b),t.settlement.pool);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});


test('Remote uses the TV appearance, including separate countdown spans and live color updates without clock changes',async()=>{
 let seed=manualSeatingFixture(3);seed=execute(seed,{type:'clock',tournamentId:'t1',command:'start'});seed=execute(seed,{type:'clock-appearance',tournamentId:'t1',appearance:{timerStyle:'separate',background:'#112233',minutes:'#11aa22',seconds:'#3344ff',level:'#ff4477',currentBlinds:'#ffcc00',nextBlinds:'#bb77ee',text:'#ccddff'}});const ui=await boot('https://example.test/',seed,'remote','t1');
 try{assert.equal(ui.q('.remote-clock').dataset.timerStyle,'separate');assert.equal(ui.q('.remote-clock').style.getPropertyValue('--clock-background'),'#112233');assert.ok(ui.q('#remote-time .timer-minutes'));assert.ok(ui.q('#remote-time .timer-seconds'));const clock=ui.stored().tournaments[0].clock;for(const style of ['solid','gradient','stripes']){const remote=execute(ui.stored(),{type:'clock-appearance',tournamentId:'t1',appearance:{timerStyle:style,background:'#224466'}});await ui.storage(remote);assert.equal(ui.q('.remote-clock').dataset.timerStyle,style);assert.equal(ui.q('.remote-clock').style.getPropertyValue('--clock-background'),'#224466');assert.deepEqual(ui.stored().tournaments[0].clock,clock);}assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});


test('structure appearance is a draft until Save structure and is inherited without changing the current event',async()=>{
 const seed=manualSeatingFixture(3),ui=await boot('https://example.test/',seed,'setup','t1');
 try{
  ui.click('[data-edit-template]');let structure=ui.q('#structure-form');ui.input(structure.elements.structureName,'Blue Clock Structure');ui.input(structure.elements.startingStack,'12000');ui.click('[data-action=structure-clock-appearance]');let form=ui.q('#clock-appearance-form');assert.equal(ui.q('#dialog h2').textContent,'Structure Clock Appearance');assert.equal(form.querySelector('[value=tournament]'),null);ui.input(form.elements.background,'#112233');await ui.submit(form,'structure');assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.stored(),seed);structure=ui.q('#structure-form');assert.equal(structure.elements.structureName.value,'Blue Clock Structure');assert.equal(structure.elements.startingStack.value,'12,000');assert.equal(ui.q('.structure-clock-appearance .clock-appearance-preview').style.getPropertyValue('--clock-background'),'#112233');
  ui.click('[data-action=structure-clock-appearance]');form=ui.q('#clock-appearance-form');ui.input(form.elements.background,'#ffffff');ui.click('#clock-appearance-form [data-action=close-modal]');await ui.submit(structure);assert.equal(ui.stored().templates[0].clockAppearance.background,'#112233');assert.deepEqual(ui.stored().tournaments[0],seed.tournaments[0]);assert.equal(ui.stored().templates[0].settings.startingStack,12000);
  ui.click('[data-edit-template]');assert.equal(ui.q('.structure-clock-appearance .clock-appearance-preview').style.getPropertyValue('--clock-background'),'#112233');ui.click('[data-action=close-editor]');ui.click('[data-copy-template]');ui.click('[data-action=structure-clock-appearance]');form=ui.q('#clock-appearance-form');assert.equal(form.elements.background.value,'#112233');ui.input(form.elements.background,'#224466');await ui.submit(form,'structure');await ui.submit(ui.q('#structure-form'));assert.equal(ui.stored().templates[0].clockAppearance.background,'#112233');assert.equal(ui.stored().templates[1].clockAppearance.background,'#224466');ui.click(`[data-create-template="${ui.stored().templates[1].id}"]`);form=ui.q('#new-tournament-form');ui.input(form.elements.name,'Copied Structure Event');await ui.submit(form);assert.equal(ui.stored().tournaments[1].clockAppearance.background,'#224466');assert.deepEqual(ui.stored().tournaments[0],seed.tournaments[0]);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});


test('new tournament form includes optional clock colors, inherits the selected structure and saves only its own override',async()=>{
 const seed=manualSeatingFixture(3);seed.templates[0].clockAppearance={background:'#112233',timerStyle:'solid'};const other=structuredClone(seed.templates[0]);other.id='green-structure';other.name='Green Structure';other.clockAppearance={background:'#223344',timerStyle:'separate'};seed.templates.push(other);const ui=await boot('https://example.test/',seed,'setup','t1');
 try{assert.equal(ui.q('[data-action=clock-appearance]'),null);ui.click('[data-create-template]');let form=ui.q('#new-tournament-form');assert.ok(form.querySelector('.new-tournament-appearance'));assert.equal(form.elements.background.value,'#112233');form.elements.templateId.value='green-structure';form.elements.templateId.dispatchEvent(new ui.w.Event('change',{bubbles:true}));assert.equal(form.elements.background.value,'#223344');assert.equal(form.elements.timerStyle.value,'separate');ui.input(form.elements.background,'#334455');ui.input(form.elements.name,'Own Tournament Colors');await ui.submit(form);assert.equal(ui.stored().tournaments[1].clockAppearance.background,'#334455');assert.deepEqual(ui.stored().templates,seed.templates);assert.deepEqual(ui.stored().tournaments[0],seed.tournaments[0]);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});


test('visible clock style choices include stripes and a saved multicolor gradient with editable color stops',async()=>{
 const seed=manualSeatingFixture(3),ui=await boot('https://example.test/',seed,'setup','t1');
 try{ui.click('[data-edit-template]');ui.click('[data-action=structure-clock-appearance]');let form=ui.q('#clock-appearance-form');assert.equal(form.querySelectorAll('.clock-style-choice').length,4);assert.match(form.querySelector('.clock-style-options').textContent,/Multicolor Gradient/);assert.match(form.querySelector('.clock-style-options').textContent,/Multicolor Stripes/);ui.click('#clock-appearance-form [value=gradient]');ui.click('[data-gradient-preset=rainbow]');assert.equal(form.querySelector('[data-gradient-editor]').hidden,false);assert.equal(form.querySelectorAll('[data-gradient-stop]').length,5);assert.match(form.querySelector('.clock-appearance-preview').style.getPropertyValue('--clock-gradient'),/#ff3b30 0%.*#34c759 50%.*#af52de 100%/);ui.click('[data-action=gradient-add]');assert.equal(form.querySelectorAll('[data-gradient-stop]').length,6);ui.input(form.querySelectorAll('[data-gradient-color]')[1],'#112233');ui.input(form.querySelectorAll('[data-gradient-position]')[1],'10');assert.equal(form.querySelector('[data-appearance-feedback]').textContent,'');ui.click('[data-gradient-remove="2"]');assert.equal(form.querySelectorAll('[data-gradient-stop]').length,5);await ui.submit(form,'structure');assert.deepEqual(ui.stored(),seed);await ui.submit(ui.q('#structure-form'));assert.equal(ui.stored().templates[0].clockAppearance.gradientStops.length,5);assert.equal(ui.stored().templates[0].clockAppearance.gradientStops[1].color,'#112233');assert.equal(ui.stored().templates[0].clockAppearance.gradientStops[1].position,10);assert.deepEqual(ui.stored().tournaments[0],seed.tournaments[0]);ui.click('[data-edit-template]');ui.click('[data-action=structure-clock-appearance]');form=ui.q('#clock-appearance-form');assert.equal(form.querySelectorAll('[data-gradient-stop]').length,5);ui.input(form.querySelectorAll('[data-gradient-position]')[1],'100');assert.match(form.querySelector('[data-appearance-feedback]').textContent,/different positions/);const saved=ui.stored();await ui.submit(form,'structure');assert.deepEqual(ui.stored(),saved);assert.equal(ui.q('#dialog').open,true);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});


test('Remote exposes Balance Tables only for imbalance and its seating screen moves a chosen player without showing Management',async()=>{
 const seed=manualSeatingFixture(20),ui=await boot('https://example.test/',seed,'remote','t1');
 try{assert.equal(ui.q('[data-remote-panel=tables]'),null);let remote=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e20'});await ui.storage(remote);assert.equal(ui.q('[data-remote-panel=tables]'),null);remote=execute(remote,{type:'eliminate',tournamentId:'t1',entryId:'e19'});await ui.storage(remote);assert.equal(ui.q('#remote-balance-warning').textContent,'Balance Tables');ui.click('[data-remote-panel=tables]');assert.ok(ui.q('.remote-seating'));assert.equal(ui.q('.management-sidebar'),null);assert.equal(ui.q('#seating-settings-form'),null);assert.equal(ui.q('[data-eliminate]'),null);assert.equal(ui.q('[data-action=combine-tables]').textContent,'Balance Tables');assert.equal(ui.q('[data-action=toggle-move-players]').getAttribute('aria-pressed'),'false');ui.click('[data-action=toggle-move-players]');ui.click('[data-seat-grab=e1]');ui.click('[data-seat-target][data-table="2"][data-seat="9"] [data-seat-target-button]');await flush();const t=ui.stored().tournaments[0];assert.equal(t.entries[0].table,2);assert.equal(t.entries[0].seat,9);assert.deepEqual(t.entries.filter(e=>!e.eliminatedAt).reduce((counts,e)=>(counts[e.table]=(counts[e.table]||0)+1,counts),{}),{1:9,2:9});ui.click('[data-remote-panel=clock]');assert.equal(ui.q('[data-remote-panel=tables]'),null);assert.ok(ui.q('#remote-clock'));ui.w.history.pushState({},'','/?view=remote&tournament=t1&panel=tables');ui.w.dispatchEvent(new ui.w.PopStateEvent('popstate'));assert.equal(ui.q('.remote-seating'),null);assert.ok(ui.q('#remote-clock'));assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('Remote automatic balancing moves one randomly chosen eligible player and retains all other seats',async()=>{
 let seed=manualSeatingFixture(20);seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e20'});seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e19'});seed.tournaments[0].entries[0].seatLocked=true;const ui=await boot('https://example.test/',seed,'remote','t1');
 try{ui.click('[data-remote-panel=tables]');ui.click('[data-action=combine-tables]');assert.match(ui.q('#dialog').textContent,/Randomly select unlocked players/);assert.deepEqual(ui.stored(),seed);ui.click('[data-combine-mode=combine]');await flush();const t=ui.stored().tournaments[0],moved=t.entries.filter((e,i)=>e.table!==seed.tournaments[0].entries[i].table||e.seat!==seed.tournaments[0].entries[i].seat);assert.equal(moved.length,1);assert.notEqual(moved[0].id,'e1');assert.equal(t.entries.filter(e=>!e.eliminatedAt&&e.table===1).length,9);assert.equal(t.entries.filter(e=>!e.eliminatedAt&&e.table===2).length,9);assert.deepEqual(t.entries[0],seed.tournaments[0].entries[0]);assert.deepEqual(t.clock,seed.tournaments[0].clock);assert.equal(ui.q('#toast').textContent,'Tables balanced.');ui.click('[data-remote-panel=clock]');assert.equal(ui.q('[data-remote-panel=tables]'),null);assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

test('Remote balancing screen keeps the existing final-table combine choices',async()=>{
 const seed=manualSeatingFixture(4);seed.tournaments[0].entries[3].table=2;seed.tournaments[0].entries[3].seat=1;const ui=await boot('https://example.test/',seed,'remote','t1');
 try{ui.click('[data-remote-panel=tables]');assert.equal(ui.q('[data-action=combine-tables]').textContent,'Combine Tables');ui.click('[data-action=combine-tables]');assert.equal(ui.q('#dialog h2').textContent,'Form the final table');assert.ok(ui.q('[data-combine-mode=redraw]'));ui.click('[data-combine-mode=combine]');await flush();assert.equal(ui.w.document.querySelectorAll('.remote-seating .seat-table').length,1);assert.ok(ui.stored().tournaments[0].entries.every(e=>e.table===1));assert.deepEqual(ui.stored().tournaments[0].entries.slice(0,3),seed.tournaments[0].entries.slice(0,3));assert.equal(ui.q('#toast').textContent,'Tables combined.');assert.deepEqual(ui.errors,[]);}finally{ui.close();}
});

for(const pointerType of ['mouse','touch'])test(`Remote ${pointerType} gestures scroll without dragging, while tapping supports occupied-seat choices`,async()=>{
 let seed=manualSeatingFixture(20);seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e20'});seed=execute(seed,{type:'eliminate',tournamentId:'t1',entryId:'e19'});const ui=await boot('https://example.test/',seed,'remote','t1');
 try{
  ui.click('[data-remote-panel=tables]');ui.click('[data-action=toggle-move-players]');
  assert.equal(ui.q('#seat-move-instructions').textContent,'Tap a player, then tap the destination seat.');assert.equal(ui.q('.seat-grab-icon'),null);
  const handle=ui.q('[data-seat-grab=e1]');let captures=0;handle.setPointerCapture=()=>captures++;ui.w.document.elementFromPoint=()=>ui.q('[data-table="2"][data-seat="9"]');
  dispatchPointer(ui,handle,'pointerdown',{pointerType});const move=dispatchPointer(ui,ui.w.document,'pointermove',{x:130,y:200,pointerType});dispatchPointer(ui,ui.w.document,'pointerup',{x:130,y:200,pointerType});await flush();
  assert.equal(captures,0);assert.equal(move.defaultPrevented,false);assert.equal(ui.q('.seat-drag-ghost'),null);assert.equal(ui.q('.seat-drop-target'),null);assert.equal(ui.w.__fixture.saves,0);assert.deepEqual(ui.stored(),seed);
  ui.click('[data-seat=e1]');assert.equal(ui.q('#seat-form'),null);assert.equal(handle.getAttribute('aria-pressed'),'true');ui.click('[data-action=cancel-seat-pick]');assert.equal(ui.q('#seat-move-instructions').textContent,'Tap a player, then tap the destination seat.');
  ui.click('[data-seat-grab=e1]');ui.click('[data-seat-grab=e2]');assert.ok(ui.q('[data-seat-move-mode=swap]'));assert.equal(ui.w.__fixture.saves,0);ui.click('[data-seat-move-mode=swap]');await flush();assert.equal(ui.stored().tournaments[0].entries[0].seat,2);assert.equal(ui.stored().tournaments[0].entries[1].seat,1);assert.deepEqual(ui.errors,[]);
 }finally{ui.close();}
});
