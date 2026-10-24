// Optional browser QA. Supply PLAYWRIGHT_MODULE and CHROME_EXECUTABLE if not installed locally.
import {build} from 'esbuild';
import {initialState,execute,applyRemoteElimination,finalizePendingEliminations} from '../src/domain.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=fileURLToPath(new URL('../',import.meta.url)),output=process.env.QA_OUTPUT_DIR||'/tmp/uno-browser-qa';
await mkdir(output,{recursive:true});
let state,version=1;const streams=new Set();
function seed(count){
 let s=initialState();for(let i=1;i<=count*10;i++)s=execute(s,{type:'player-save',id:'p'+i,name:i%10===0?'An exceptionally long player name with multiple words and a very long surname '+i:'Player '+i});
 s=execute(s,{type:'tournament-create',id:'t1',templateId:s.templates[0].id,name:'Uno Club — Browser Verification'});
 for(let i=1;i<=count*10;i++)s=execute(s,{type:'register',id:'e'+i,tournamentId:'t1',playerId:'p'+i});
 s.tournaments[0].entries.forEach((e,i)=>{e.table=Math.floor(i/10)+1;e.seat=i%10+1;});return s;
}
const stub=`export const createClient=()=>{let notify,source;const query={select(){return query},eq(){return query},async maybeSingle(){return {data:await fetch('/state').then(r=>r.json())}}};return {auth:{getSession:async()=>({data:{session:{user:{id:'qa',email:'qa@example.test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>query,rpc:async(name,args)=>name==='td_server_time'?{data:new Date().toISOString()}:fetch('/save',{method:'POST',body:JSON.stringify({...args,rpc:name})}).then(r=>r.json()),channel:()=>({on(e,f,cb){notify=cb;return this},subscribe(){source=new EventSource('/events');source.onmessage=()=>notify();return this}}),removeChannel:async()=>source?.close()}};`;
const bundle=await build({entryPoints:[folder+'src/app.mjs'],bundle:true,write:false,format:'iife',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'stub',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js'}));}}]});
const html=await readFile(folder+'src/index.html','utf8'),css=await readFile(folder+'src/styles.css');
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/events')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': ready\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 if(req.url.startsWith('/state')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({state,version}));return;}
 if(req.url==='/save'){
  let body='';for await(const chunk of req)body+=chunk;const args=JSON.parse(body);res.setHeader('Content-Type','application/json');if(args.rpc==='td_remote_elimination'){try{state=applyRemoteElimination(state,{tournamentId:args.p_tournament_id,entryId:args.p_entry_id,requestId:args.p_request_id,command:args.p_command},Date.now());version++;res.end(JSON.stringify({data:{state,version}}));for(const stream of streams)stream.write('data: '+version+'\n\n');}catch(error){res.end(JSON.stringify({error:{message:error.message}}));}return;}if(args.p_expected_version!==version){res.end(JSON.stringify({error:{message:'TD_CONFLICT'}}));return;}
  state=args.p_state;version++;res.end(JSON.stringify({data:{state,version}}));for(const stream of streams)stream.write('data: '+version+'\n\n');return;
 }
 if(req.url.startsWith('/app.js')){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
 else if(req.url.startsWith('/styles.css')){res.setHeader('Content-Type','text/css');res.end(css);}
 else{res.setHeader('Content-Type','text/html');res.end(html);}
});
const remoteWorker=setInterval(()=>{if(!state)return;const next=finalizePendingEliminations(state,Date.now());if(JSON.stringify(next)!==JSON.stringify(state)){state=next;version++;for(const stream of streams)stream.write('data: '+version+'\n\n');}},50);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),headless:true,args:['--no-sandbox']});
const errors=[],context=await browser.newContext(),tv=await context.newPage();tv.on('pageerror',e=>errors.push(e.message));
async function checkScreen(){return tv.evaluate(()=>{
 const shell=document.querySelector('.tv-seating-shell'),failures=[];
 for(const n of shell.querySelectorAll('[data-tv-fit]')){
  const box=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);const text=range.getBoundingClientRect();
  if(n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1||text.left<box.left-1||text.right>box.right+1||text.top<box.top-1||text.bottom>box.bottom+1)failures.push({text:n.textContent,box:box.toJSON(),textBox:text.toJSON(),font:n.style.fontSize});
 }
 return {failures,scroll:document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1,seats:shell.querySelectorAll('[data-tv-seat]').length};
});}
try{
 for(const started of [false,true])for(const tables of [1,2,3])for(const [width,height] of [[1280,720],[1920,1080],[3840,2160],[1024,768]]){
  state=seed(tables);if(started)state=execute(state,{type:'clock',tournamentId:'t1',command:'start'});version++;
  await tv.setViewportSize({width,height});await tv.goto(base+'/?view=clock&tournament=t1');await tv.waitForSelector('.tv-seat-name');
  const result=await checkScreen();assert.equal(result.scroll,false,JSON.stringify({tables,width,height,result}));assert.deepEqual(result.failures,[],JSON.stringify({tables,width,height,result}));assert.equal(result.seats,tables*10);
  if(started&&tables===3&&width===1920)await tv.screenshot({path:output+'/three-tables.png'});
  console.log('PASS seating layout',started?'running':'pre-start',tables,width,height);
 }
 state=seed(1);state.tournaments[0].settings={...state.tournaments[0].settings,houseContribution:128000,payoutMode:'fixed',payouts:[100000,60000]};state=execute(state,{type:'clock',tournamentId:'t1',command:'start'});version++;
 await tv.goto(base+'/?view=clock&tournament=t1');await tv.waitForSelector('.tv-seat-name');
 const phone=await context.newPage();phone.on('pageerror',e=>errors.push(e.message));phone.on('dialog',d=>d.accept());
 for(const width of [320,390,768,1280]){
  await phone.setViewportSize({width,height:900});await phone.goto(base+'/?view=manage&tournament=t1');await phone.waitForSelector('.tv-display-controls');await phone.locator('[data-tab=tables]').click();
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Management horizontal overflow at '+width);
  const header=await phone.locator('.seat-table>h3').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));assert.ok(header.scroll<=header.width+1,'Table heading overflow at '+width);
  await phone.evaluate(()=>scrollTo(0,document.body.scrollHeight));const bounds=await phone.locator('.tv-display-controls').boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=900);
  const split=await phone.evaluate(()=>{const a=document.querySelector('.mini-clock').getBoundingClientRect(),b=document.querySelector('.management-clock-actions').getBoundingClientRect();return {left:a.width,right:b.width,sideBySide:b.left>=a.right};});assert.ok(split.sideBySide&&Math.abs(split.left-split.right)<1,'Clock readout and controls must share the panel equally at '+width);const widths=await phone.evaluate(()=>[document.querySelector('#clock-main').getBoundingClientRect().width,document.querySelector('#record-rebuys').getBoundingClientRect().width]);assert.ok(Math.abs(widths[0]-widths[1])<1,'Rebuy/Pause width mismatch');console.log('PASS management/table banner',width);
 }
 for(const width of [320,390,768,1280]){
  await phone.setViewportSize({width,height:900});await phone.goto(base+'/?view=manage&tournament=t1');await phone.locator('[data-tab=payouts]').click();
  const alignment=await phone.locator('.payout-formats').evaluate(node=>[...node.querySelectorAll('[type=radio]')].map(radio=>{const r=radio.getBoundingClientRect(),label=radio.nextElementSibling,box=label.getBoundingClientRect(),amount=label.querySelector?.('[name=guaranteeAmount]')?.getBoundingClientRect();return {width:r.width,height:r.height,offset:Math.abs(r.top+r.height/2-(amount?amount.top+amount.height/2:box.top+box.height/2))};}));
  for(const radio of alignment){assert.equal(radio.width,18);assert.equal(radio.height,18);assert.ok(radio.offset<2,'Radio label misalignment at '+width);}
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Payout guarantee horizontal overflow at '+width);
  await phone.locator('[name=guaranteeAmount]').fill('1750');await phone.locator('[name=guaranteePlayers]').fill('12');assert.match(await phone.locator('#guarantee-eligibility').innerText(),/\$1,750.*12 registered players/);assert.equal(state.tournaments[0].settings.payoutMode,'fixed');
  if(width===390)await phone.screenshot({path:output+'/guarantee-phone.png'});console.log('PASS editable guarantee and radio alignment',width);
 }
 await phone.goto(base+'/?view=manage&tournament=t1');await phone.waitForSelector('#clock-main');
 await phone.setViewportSize({width:1280,height:900});await phone.screenshot({path:output+'/clock-controls.png'});await phone.locator('[data-tab=payouts]').click();await phone.locator('#paid-places').fill('4');
 assert.deepEqual(await phone.locator('[data-payout-value]').evaluateAll(nodes=>nodes.map(n=>n.value)),['1,000','600','0','0']);assert.deepEqual(state.tournaments[0].settings.payouts,[100000,60000]);
 for(const [i,n] of [900,500,100,100].entries())await phone.locator(`[data-payout-value="${i}"]`).fill(String(n));
 await phone.locator('#payout-form button[type=submit],#payout-form>.button.primary').click();await phone.waitForFunction(()=>document.querySelector('#custom-payout-status')?.textContent==='Custom Payouts');assert.deepEqual(state.tournaments[0].settings.payouts,[90000,50000,10000,10000]);
 await phone.screenshot({path:output+'/custom-payouts.png'});console.log('PASS custom payout draft and save');
 await phone.locator('[data-go=setup]').click();await phone.locator('[data-action=clock-appearance]').click();await phone.locator('[name=preset]').selectOption('blue');
 for(const style of ['separate','gradient','stripes']){await phone.locator('[name=timerStyle]').selectOption(style);assert.equal(await phone.locator('.clock-appearance-preview').getAttribute('data-timer-style'),style);}
 for(const style of ['solid','separate','gradient','stripes']){
  if(!await phone.locator('#clock-appearance-form').isVisible())await phone.locator('[data-action=clock-appearance]').click();
  await phone.locator('[name=timerStyle]').selectOption(style);await phone.locator('[name=appearanceAction][value=tournament]').click();await tv.waitForFunction(value=>document.querySelector('.tv-shell')?.dataset.timerStyle===value,style);assert.equal(await tv.locator('.tv-shell').evaluate(n=>n.style.getPropertyValue('--clock-background')),'#07182e');
  await phone.locator('[data-go=manage]').click();
  for(const mode of ['full-clock','clock-seating']){await phone.locator(`[data-tv-display=${mode}]`).click();await tv.waitForFunction(value=>document.querySelector('.tv-shell')?.dataset.tvDisplayMode===value,mode);assert.ok(await tv.locator('#tv-time').textContent());if(style==='gradient'||style==='stripes')assert.notEqual(await tv.locator('#tv-time').evaluate(n=>getComputedStyle(n).backgroundImage),'none');}
  if(style==='stripes')await tv.screenshot({path:output+'/striped-clock.png'});
  await phone.locator('[data-go=setup]').click();console.log('PASS saved clock appearance in both TV modes',style);
 }
 await phone.locator('[data-go=manage]').click();await phone.locator('[data-tv-display=full-clock]').click();await tv.waitForSelector('.tv-grid');
 await tv.mouse.move(20,20);await tv.locator('[data-action=fullscreen]').click();await tv.waitForFunction(()=>!!document.fullscreenElement);const deadline=state.tournaments[0].clock.deadline;let loads=0;tv.on('load',()=>loads++);
 await phone.locator('[data-tv-display=clock-seating]').click();await tv.waitForSelector('.tv-seating-shell');assert.equal(await tv.evaluate(()=>!!document.fullscreenElement),true);assert.equal(state.tournaments[0].clock.deadline,deadline);assert.equal(loads,0);console.log('PASS fullscreen survives remote mode switching; deadline unchanged');
 await phone.locator('[data-tab=players]').click();await phone.locator('[data-eliminate=e10]').click();await phone.locator('#elimination-form').waitFor();assert.match(await phone.locator('#elimination-question').innerText(),/surname 10.*place/);await phone.screenshot({path:output+'/elimination-confirmation.png'});await phone.locator('#elimination-form [type=submit]').click();await tv.waitForFunction(()=>!document.querySelector('[data-tv-entry=e10]'));await phone.locator('[data-undo-elimination=e10]').click();await tv.waitForSelector('[data-tv-entry=e10]');assert.equal(state.tournaments[0].entries[9].seat,10);console.log('PASS elimination/individual undo live on TV');
 state=execute(seed(2),{type:'clock',tournamentId:'t1',command:'start'});version++;await tv.reload();await tv.waitForSelector('[data-tv-entry=e20]');
 const remote=await context.newPage();remote.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,390]){await remote.setViewportSize({width,height:844});await remote.goto(base+'/?view=home');await remote.waitForSelector('[data-go=remote]');assert.equal(await remote.locator('.home-menu .menu-card').count(),6);assert.equal(await remote.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await remote.locator('[data-go=remote]').click();await remote.waitForSelector('#remote-clock');assert.equal(await remote.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await remote.locator('#remote-clock').innerText(),'Pause Clock');}
 await phone.goto(base+'/?view=manage&tournament=t1');await phone.waitForSelector('#clock-main');await remote.locator('#remote-clock').click();await phone.waitForFunction(()=>document.querySelector('#clock-main')?.textContent==='Resume clock');assert.equal(state.tournaments[0].clock.status,'paused');await phone.locator('#clock-main').click();await remote.waitForFunction(()=>document.querySelector('#remote-clock')?.textContent==='Pause Clock');
 const remoteColors=await remote.evaluate(()=>Object.fromEntries([['pause','#remote-clock'],['eliminate','[data-remote-panel=eliminate]'],['payouts','[data-remote-panel=payouts]']].map(([key,selector])=>[key,getComputedStyle(document.querySelector(selector)).backgroundColor])));assert.deepEqual(remoteColors,{pause:'rgb(179, 52, 52)',eliminate:'rgb(179, 52, 52)',payouts:'rgb(33, 121, 74)'});
 await remote.locator('#remote-clock').click();await remote.waitForFunction(()=>document.querySelector('#remote-clock')?.textContent==='Resume Clock');assert.equal(await remote.locator('#remote-clock').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(33, 121, 74)');await remote.locator('#remote-clock').click();await remote.waitForFunction(()=>document.querySelector('#remote-clock')?.textContent==='Pause Clock');
 const appearanceDeadline=state.tournaments[0].clock.deadline;
 for(const style of ['solid','separate','gradient','stripes']){
  state=execute(state,{type:'clock-appearance',tournamentId:'t1',appearance:{timerStyle:style,background:'#112233',timer:'#abcdef',minutes:'#11aa22',seconds:'#3344ff',currentBlinds:'#ffcc00',nextBlinds:'#bb77ee',level:'#ff4477',text:'#ccddff'}});version++;for(const stream of streams)stream.write('data: '+version+'\n\n');
  await remote.waitForFunction(value=>document.querySelector('.remote-clock')?.dataset.timerStyle===value,style);await tv.waitForFunction(value=>document.querySelector('.tv-shell')?.dataset.timerStyle===value,style);
  assert.equal(await remote.locator('.remote-clock').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(17, 34, 51)');assert.equal(await remote.locator('#remote-blinds').evaluate(n=>getComputedStyle(n).color),await tv.locator('#tv-blinds').evaluate(n=>getComputedStyle(n).color));assert.equal(await remote.locator('#remote-next').evaluate(n=>getComputedStyle(n).color),await tv.locator('#tv-next').evaluate(n=>getComputedStyle(n).color));
  if(style==='separate'){assert.equal(await remote.locator('#remote-time .timer-minutes').evaluate(n=>getComputedStyle(n).color),'rgb(17, 170, 34)');assert.equal(await remote.locator('#remote-time .timer-seconds').evaluate(n=>getComputedStyle(n).color),'rgb(51, 68, 255)');}else if(style==='solid')assert.equal(await remote.locator('#remote-time').evaluate(n=>getComputedStyle(n).color),'rgb(171, 205, 239)');else assert.notEqual(await remote.locator('#remote-time').evaluate(n=>getComputedStyle(n).backgroundImage),'none');
  assert.equal(state.tournaments[0].clock.deadline,appearanceDeadline);console.log('PASS Remote action colors and matching TV appearance',style);
 }
 await remote.screenshot({path:output+'/tournament-remote-clock.png'});await remote.locator('[data-remote-panel=eliminate]').click();assert.deepEqual(await remote.locator('.remote-table>h3').allTextContents(),['TABLE 1','TABLE 2']);
 await remote.locator('[data-remote-eliminate=e18]').click();await remote.locator('[data-remote-undo=e18]').waitFor();assert.equal(state.tournaments[0].entries[17].seat,8);assert.equal(state.tournaments[0].entries[17].place,null);assert.ok(await tv.locator('[data-tv-entry=e18]').count());await remote.locator('[data-remote-undo=e18]').click();await remote.locator('[data-remote-eliminate=e18]').waitFor();assert.equal(state.tournaments[0].entries[17].pendingElimination,undefined);
 await remote.locator('[data-remote-eliminate=e20]').click();await remote.locator('[data-remote-undo=e20]').waitFor();await remote.locator('[data-remote-eliminate=e19]').click();await remote.locator('[data-remote-undo=e19]').waitFor();assert.equal(await remote.locator('#remote-balance-warning').innerText(),'');await remote.screenshot({path:output+'/tournament-remote-undo.png'});await remote.close();
 await tv.waitForFunction(()=>!document.querySelector('[data-tv-entry=e19]'),{timeout:10000});assert.equal(state.tournaments[0].entries[19].place,20);assert.equal(state.tournaments[0].entries[18].place,19);await phone.waitForSelector('.table-balance-alert');assert.equal(state.tournaments[0].entries.filter(e=>!e.eliminatedAt&&e.table===1).length,10);assert.equal(state.tournaments[0].entries.filter(e=>!e.eliminatedAt&&e.table===2).length,8);
 const remoteReturn=await context.newPage();await remoteReturn.setViewportSize({width:390,height:844});await remoteReturn.goto(base+'/?view=remote&tournament=t1&panel=eliminate');await remoteReturn.waitForSelector('.table-balance-alert');assert.equal(await remoteReturn.locator('[data-remote-entry=e19]').count(),0);assert.equal(await remoteReturn.locator('[data-remote-entry=e20]').count(),0);await remoteReturn.locator('[data-remote-panel=clock]').click();await remoteReturn.locator('[data-remote-panel=payouts]').click();await remoteReturn.waitForSelector('#payout-form');assert.ok(await remoteReturn.locator('[data-action=icm-chop]').count());await remoteReturn.screenshot({path:output+'/tournament-remote-payouts.png'});await remoteReturn.close();console.log('PASS Remote clock synchronization, reserved-seat Undo, deadline finalization after phone closes, balancing, payouts and navigation');
 await phone.setViewportSize({width:390,height:844});await phone.screenshot({path:output+'/phone-controls.png'});
 const onlineBeforeClear=JSON.stringify(state),versionBeforeClear=version;
 await phone.evaluate(value=>localStorage.setItem('uno-tournament-practice-v1',JSON.stringify(value)),state);await phone.reload();await phone.locator('[data-action=clear-device-copy]').click();await phone.locator('#clear-device-copy-form').waitFor();await phone.screenshot({path:output+'/clear-old-device-copy.png'});await phone.locator('#clear-device-copy-form [type=submit]').click();assert.equal(await phone.evaluate(()=>localStorage.getItem('uno-tournament-practice-v1')),null);assert.equal(JSON.stringify(state),onlineBeforeClear);assert.equal(version,versionBeforeClear);await phone.reload();await phone.waitForSelector('.connection');assert.equal(await phone.locator('[data-action=clear-device-copy]').count(),0);assert.equal(await phone.locator('[data-action=import-browser]').count(),0);console.log('PASS old device copy removed, absent after reload; online workspace unchanged');
 assert.deepEqual(errors,[]);console.log('PASS no uncaught browser errors. Windows wireless HDMI auto-placement/fullscreen remains PENDING hardware testing.');
}finally{clearInterval(remoteWorker);await browser.close();for(const stream of streams)stream.end();server.close();}
