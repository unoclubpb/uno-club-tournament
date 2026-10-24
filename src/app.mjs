import {createClient} from '@supabase/supabase-js';
import {id,clone,initialState,sampleTemplate,execute,clockAt,roundAt,financials,prizes,statsFor,guaranteeSettings,guaranteeEligible,payoutBalance,icmProposal,planSeatMove,planTableSeating,canCombineTables,normalizePhone,tablesRequired,tablesInUse,upgradeState,normalizePlayerName,rebuyOpen,rebuyPhase,cutoffHasBreak,canRecordRebuys,playerNumberLabel,tvDisplayMode,tournamentStarted,defaultPayouts,tableBalanceNeeded} from './domain.mjs';
import {installSeatDragging} from './seat-dragging.mjs';
import {installClockToolbar} from './clock-toolbar.mjs';
import {tvSeating,fitTvSeating} from './tv-display.mjs';
import {createTvWindowController} from './tv-window.mjs';
import {ORIGINAL_CLOCK_APPEARANCE,CLOCK_PRESETS,clockAppearance,applyClockAppearance,setCountdown} from './clock-appearance.mjs';
import {mergeBrowserWorkspace} from './workspace.mjs';
import {SUPABASE_URL,SUPABASE_KEY} from './config.mjs';

const db=createClient(SUPABASE_URL,SUPABASE_KEY);
const APP_ROOT=new URL('.',location.href).pathname;
const $=q=>document.querySelector(q), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n/100);
const tvMoney=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n/100);
const num=n=>Number(n||0).toLocaleString('en-US');
const dollarNumber=value=>Number(String(value).replace(/,/g,''));
function wholeDollars(value){if(!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(String(value))||!Number.isSafeInteger(dollarNumber(value)))throw new Error('Enter monetary amounts as whole dollars.');return dollarNumber(value);}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const app=$('#app'),dlg=$('#dialog');
const legacyKey='uno-tournament-practice-v1',migrationKey='uno-tournament-browser-imported';
let state=initialState(),version=0,session=null,authReady=false,authError='',connectedUser='',legacyError='';
let legacy=readBrowserData(),legacyPending=!!legacy&&!localStorage.getItem(migrationKey);
let busy=false,channel=null,online=false,serverSample=null,lastSync=null,remoteError='',clockTimer,editor=null;
let selected=localStorage.getItem('uno-tournament-selected')||'',view=new URLSearchParams(location.search).get('view')||'home';
const tvWindow=createTvWindowController();
const automaticTvLaunch=new URLSearchParams(location.search).get('autotv')==='1';let tvLaunchAttempted=false;
const requestedTournament=new URLSearchParams(location.search).get('tournament');if(requestedTournament)selected=requestedTournament;
let movePlayersEnabled=false,movePlayersTournament='';
let icmReview=null;
const payoutDrafts=new WeakMap();
let clockToolbar,seatDragging,pickedSeat=null,seatMoveChoice=null,tableCombineChoice=null,renderedWorkspaceVersion=0;
let playerSearch='',signupSearch='',registrationPanel='find',profilePanel='details',playerDetail=null,showArchived=false,tab='players',lastClockKey='',sound=false;
const icons={home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',setup:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2Z"/><circle cx="12" cy="12" r="3"/>',players:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3M3 8a2 2 0 0 0 0 4m18-4a2 2 0 0 1 0 4M1 20v-2a4 4 0 0 1 4-4m18 6v-2a4 4 0 0 0-4-4"/>',signup:'<path d="M14 3H4v18h11M14 3l5 5v5M14 3v5h5M8 8h3m-3 5h5m-5 4h3"/><circle cx="18" cy="18" r="4"/><path d="M18 16v4m-2-2h4"/>',clock:'<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M12 17v4m-5 0h10"/>',manage:'<path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v5m-4 1h8"/>'};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[k]||icons.clock}</svg>`;
const names={home:'Home',setup:'Tournament Setup',players:'Player Database',signup:'Tournament Registration',manage:'Tournament Management',clock:'Clock Display'};
const current=()=>state.tournaments.find(t=>t.id===selected);
const pName=e=>state.players.find(p=>p.id===e.playerId)?.name||'Archived player';
const active=t=>t.entries.filter(e=>!e.eliminatedAt);
const tableActionName=t=>tablesInUse(t)>tablesRequired(t)?'Combine Tables':'Balance Tables';
const timeNow=()=>serverSample?serverSample.epoch+(performance.now()-serverSample.mono):Date.now();
function readBrowserData(){try{const raw=localStorage.getItem(legacyKey);if(!raw)return null;const value=JSON.parse(raw);if(value?.schemaVersion!==1||!['players','templates','tournaments'].every(k=>Array.isArray(value[k])))throw new Error();return upgradeState(value);}catch{legacyError='Saved data on this device could not be read. The original copy has been kept.';return null;}}
function authForm(){return `<form id="auth-form"><label>Email<input type="email" name="email" autocomplete="email" required></label><label>Password<input type="password" name="password" autocomplete="current-password" minlength="8" required></label><div class="button-row"><button class="button primary" name="authAction" value="login">Sign in</button><button class="button secondary" name="authAction" value="signup">Create account</button></div><p id="auth-feedback" class="muted" role="status">${esc(authError||'New here? Create an account, confirm your email if prompted, then sign in.')}</p></form>`;}
function signInScreen(){return `<div class="auth-shell"><a class="brand" href="${APP_ROOT}"><span>UNO CLUB<small>TOURNAMENT DIRECTOR</small></span></a><section class="panel auth-panel"><p class="eyebrow">COMPUTER & PHONE ACCESS</p><h1>${authReady?'Sign in to Uno Club':'Opening Uno Club…'}</h1><p class="muted">Use the same account on your computer and phone for your players, tournament structures and clock.</p>${authReady?authForm():'<p role="status">Checking your sign-in…</p>'}${legacyPending?'<p class="import-note">Your saved players and tournaments on this device will be brought into your account after sign-in. The browser copy will be kept.</p>':''}${legacyError?`<p class="import-note">${esc(legacyError)}</p>`:''}</section><p class="muted auth-footnote">Your tournament information saves to Supabase.</p></div>`;}
function importNotice(){
  if(!legacyPending&&!legacyError)return '';
  return `<div class="mode-note warning">${legacyPending?'An older copy of players and tournaments is still saved on this device. Your current app uses your online account data. <button data-action="import-browser" '+(busy||!online?'disabled':'')+'>Bring over saved data</button>':''}${legacyError?`<p>${esc(legacyError)}</p>`:''}<button data-action="clear-device-copy" ${busy||!online||version<1?'disabled':''}>Clear old device copy</button></div>`;
}

function toast(message,error=false){const el=$('#toast');el.textContent=message;el.className=error?'show error':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='',5000);}
function chooseTournament(value){selected=value;localStorage.setItem('uno-tournament-selected',value);editor=null;render();}
function go(next){view=next;editor=null;playerDetail=null;history.pushState({},'',`${APP_ROOT}?view=${encodeURIComponent(next)}${selected?'&tournament='+encodeURIComponent(selected):''}`);render();}
function dateLabel(value){return new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function statusLabel(t){if(t.status==='completed')return t.endedBy==='icm-chop'?'Completed · ICM chop':'Completed';return {ready:'Ready to start',running:'In progress',paused:'Paused',ended:'Clock finished'}[clockAt(t,timeNow()).status];}
function bannerDetails(){
  if(view==='home')return null;
  let title=esc(names[view]||names.home),context='',action='';
  if(view==='setup'){
    if(editor){context=editor.event?'Tournament settings':editor.isNew?'New structure':'Edit structure';action='<button class="button secondary small" data-action="close-editor">Cancel</button>';}
    else action='<button class="button primary small" data-action="new-tournament">+ New Tournament</button>';
  }
  if(view==='players'){
    const player=state.players.find(p=>p.id===playerDetail);
    if(player){title=esc(player.name)+(player.archived?' <span class="archived-status">(Archived)</span>':'');context='Player Database';action='<button class="button secondary small" data-action="players-back">Back to players</button>';}
    else action='<button class="button primary small" data-action="add-player">+ Add Player</button>';
  }
  return {title,context,action};
}
function header(){const showContext=!['home','players'].includes(view),banner=bannerDetails();return `<header class="header${banner?' page-banner':''}"><a class="brand" href="${APP_ROOT}?view=home" data-go="home"><span>UNO CLUB<small>TOURNAMENT DIRECTOR</small></span></a>${banner?`<div class="page-banner-title"><h1 id="page-title">${banner.title}</h1>${banner.context?`<small>${esc(banner.context)}</small>`:''}</div>`:''}<div class="header-right">${banner?.action||''}<button class="connection" data-action="account"><i class="dot ${online?'green':'red'}"></i>${online?'Connected':'Reconnect'}</button></div></header>${showContext?`<div class="context"><div><span class="eyebrow">TOURNAMENT</span><strong class="current-tournament-name" title="${esc(current()?.name||'No current tournament')}">${esc(current()?.name||'No current tournament')}</strong></div><div class="context-actions">${view==='manage'?tvDisplayControls(current()):''}<button class="button small dark" data-action="open-clock" title="Automatic TV placement and full screen: pending Windows wireless HDMI testing.">${icon('clock')} Open clock window</button></div></div>`:''}${!online?`<div class="mode-note warning">${esc(remoteError||'Connection interrupted. Reconnect to save changes.')} <button data-action="refresh">Retry</button></div>`:''}`;}


function nav(){return `<nav class="nav" aria-label="Tournament pages">${['home','setup','players','signup','manage'].map(k=>`<button class="${view===k?'active':''}" data-go="${k}">${icon(k)}<span>${names[k]}</span></button>`).join('')}</nav>`;}
function empty(title,text,button=''){return `<div class="empty"><span class="empty-icon">${icon('clock')}</span><h2>${title}</h2><p>${text}</p>${button}</div>`;}
function metrics(t){const f=financials(t);return `<div class="metrics"><div><span>Players remaining</span><strong>${active(t).length}<small> / ${t.entries.length}</small></strong></div><div><span>Prize pool</span><strong>${money(f.pool)}</strong></div><div><span>Rebuys</span><strong>${f.rebuyCount}</strong></div><div><span>Clock status</span><strong class="status-value" id="status-metric">${statusLabel(t)}</strong></div></div>`;}
function homeTournament(){const isActive=t=>t.status!=='completed'&&(t.entries.length>0||t.startedAt);return (current()&&isActive(current())?current():state.tournaments.slice().reverse().find(isActive));}
function home(){const t=homeTournament();return `${t?`<section class="home-tournament" aria-label="Current tournament"><div><span class="eyebrow">CURRENT TOURNAMENT</span><h2 title="${esc(t.name)}">${esc(t.name)}</h2></div><span class="pill light">${t.startedAt?esc(statusLabel(t)):'Registration open'}</span><span>${t.entries.length} registered players</span><span>${money(t.settings.buyIn)} buy-in</span><button class="button secondary small" data-resume="${t.id}">Open tournament</button></section>`:''}<div class="menu-grid home-menu">${[['setup','Tournament Setup','Create tournaments and edit structures'],['players','Player Database','Add, find, and edit player records'],['signup','Tournament Registration','Enter players into a tournament'],['manage','Tournament Management','Control the clock, rebuys, and eliminations'],['clock','Open Clock Display','Open the TV display in a separate window']].map(([k,title,desc])=>`<button class="menu-card ${k==='clock'?'clock-menu-card':''}" ${k==='clock'?'data-action="open-clock"':`data-go="${k}"`}>${icon(k)}<h3>${title}</h3><p>${desc}</p></button>`).join('')}</div>`;}

function settingsFields(s){const number=(label,key,value,{moneyInput=false,min=0,max}={})=>`<label>${label}<div class="input-wrap">${moneyInput?'<span>$</span>':''}<input type="${moneyInput?'text':'number'}" ${moneyInput?'inputmode="numeric"':''} name="${key}" value="${moneyInput?num(value/100):value}" min="${min}" ${max?'max="'+max+'"':''} step="${key==='housePercent'?'0.01':'1'}" required ${moneyInput?'data-money="true"':''}></div></label>`;
  return `<div class="form-section"><h3>Play settings</h3><div class="form-grid"><label>Starting chips<input type="text" inputmode="numeric" name="startingStack" data-chips="true" value="${num(s.startingStack)}" pattern="[0-9][0-9,]*" autocomplete="off" spellcheck="false" required></label><label>Antes<select name="anteMode"><option value="off" ${s.anteMode==='off'?'selected':''}>Off — keep amounts in structure</option><option value="big_blind" ${s.anteMode==='big_blind'?'selected':''}>Big blind ante</option><option value="per_player" ${s.anteMode==='per_player'?'selected':''}>Each player antes</option></select></label></div><p class="muted">Set seats per table in Tournament Management → Tables & seats.</p><label class="check"><input type="checkbox" name="pauseBreaks" ${s.pauseBreaks?'checked':''}>Pause at the beginning and end of breaks</label></div><div class="form-section"><h3>Buy-in</h3><p class="muted">Enter the full price the player pays. The dealer toke is included in that price.</p><div class="form-grid">${number('Full buy-in amount','buyIn',s.buyIn,{moneyInput:true})}${number('Dealer toke per buy-in','dealerToke',s.dealerToke,{moneyInput:true})}</div><p class="split-note" id="entry-split">${money(s.buyIn)} total − ${money(s.dealerToke)} dealer toke = ${money(s.buyIn-s.dealerToke)} before the tournament fee.</p></div><div class="form-section"><h3>Rebuys</h3><label class="check"><input type="checkbox" name="rebuyEnabled" ${s.rebuyEnabled?'checked':''}>Allow rebuys</label><div class="form-grid">${number('Full rebuy amount','rebuyAmount',s.rebuyAmount,{moneyInput:true})}${number('Chips per rebuy','rebuyChips',s.rebuyChips)}${number('Last round before rebuys end','rebuyLastRound',s.rebuyLastRound)}</div><p class="muted">No dealer toke is taken from rebuys. If a break immediately follows the last rebuy round, rebuys remain open through that break. Enter the tournament rebuy total in Tournament Management from the break after the final rebuy round onward.</p></div><div class="form-section"><h3>Add-ons</h3><label class="check"><input type="checkbox" name="addonEnabled" ${s.addonEnabled?'checked':''}>Allow one add-on per player</label><div class="form-grid">${number('Full add-on amount','addonAmount',s.addonAmount,{moneyInput:true})}${number('Chips per add-on','addonChips',s.addonChips)}${number('Last round before add-on ends','addonLastRound',s.addonLastRound)}</div><p class="muted">If a break immediately follows the last add-on round, add-ons remain available through that break.</p></div><div class="form-section"><h3>Tournament fee at settlement</h3><div class="form-grid">${number('Tournament fee percentage','housePercent',s.housePercent,{max:100})}${number('House contribution added to prizes','houseContribution',s.houseContribution,{moneyInput:true})}</div><p class="muted">The tournament fee applies only to initial buy-ins after dealer tokes. Rebuys, add-ons and house contributions are not charged this fee. Monetary amounts use whole dollars.</p></div>`;}
function readSettings(form,base){const s=clone(base),f=new FormData(form);for(const el of form.querySelectorAll('input[name],select[name]')){if(!(el.name in s))continue;if(el.type==='checkbox')s[el.name]=el.checked;else if(el.dataset.chips)s[el.name]=Number(el.value.replace(/,/g,''));else if(el.dataset.money){const dollars=wholeDollars(el.value);if(!el.value.trim()||!Number.isSafeInteger(dollars)||dollars<0)throw new Error('Enter monetary amounts as whole dollars.');s[el.name]=dollars*100;}else if(el.type==='number')s[el.name]=Number(el.value);else s[el.name]=el.value;}return s;}
function levelRows(levels){let round=0,br=0;return levels.map((l,i)=>`<tr data-level="${i}"><td class="level-title">${l.kind==='break'?'Break '+ ++br:'Round '+ ++round}<input type="hidden" name="kind" value="${l.kind}"></td><td><input aria-label="${l.kind} duration in minutes" type="number" name="minutes" min="${l.kind==='break'?1:0.1}" max="180" step="${l.kind==='break'?1:0.1}" required value="${l.minutes}"></td><td><input aria-label="Small blind" name="sb" type="number" min="0" step="1" value="${l.sb}" ${l.kind==='break'?'disabled':''}></td><td><input aria-label="Big blind" name="bb" type="number" min="0" step="1" value="${l.bb}" ${l.kind==='break'?'disabled':''}></td><td><input aria-label="Ante amount" name="ante" type="number" min="0" step="1" value="${l.ante}" ${l.kind==='break'?'disabled':''}></td><td><input aria-label="Game name" name="game" maxlength="100" value="${esc(l.game)}" ${l.kind==='break'?'disabled':''}></td><td><input aria-label="Chip-up reminder" name="chipUp" type="checkbox" ${l.chipUp?'checked':''}></td><td class="row-buttons"><button type="button" class="icon-button" data-level-up="${i}" aria-label="Move level up">↑</button><button type="button" class="icon-button" data-level-down="${i}" aria-label="Move level down">↓</button><button type="button" class="icon-button danger-text" data-level-delete="${i}" aria-label="Delete level">×</button></td></tr>`).join('');}
function readLevels(form){return [...form.querySelectorAll('[data-level]')].map(row=>{const get=n=>row.querySelector(`[name="${n}"]`);return {kind:get('kind').value,minutes:Number(get('minutes').value),sb:Number(get('sb').value),bb:Number(get('bb').value),ante:Number(get('ante').value),game:get('game').value,chipUp:get('chipUp').checked};});}
function setup(){if(editor){const e=editor.value;return `<form id="structure-form" class="panel"><div class="structure-editor-body" role="region" aria-label="Structure settings" tabindex="0"><label>Structure name<input name="structureName" value="${esc(e.name)}" required maxlength="100" ${editor.event?'disabled':''}></label>${settingsFields(e.settings)}${!editor.event||current()?.clock.status==='ready'?`<div class="form-section"><div class="section-label"><h3>Levels & breaks</h3><div class="button-row"><button type="button" class="button small secondary" data-action="add-level">+ Playing level</button><button type="button" class="button small secondary" data-action="add-break">+ Break</button></div></div><p class="muted">Durations are minutes from the actual start. Break lengths use whole minutes. Ante amounts remain saved when antes are off.</p><div class="game-copy-row"><label>Game for all playing levels<input id="all-levels-game" value="${esc(e.levels.find(l=>l.kind==='play')?.game||'')}" maxlength="100" placeholder="For example, No Limit Hold’em"></label><button type="button" class="button secondary" data-action="copy-game">Copy game to all levels</button></div><p class="muted small-copy">Use this for a single-game tournament, or edit individual game names below for a mixed tournament.</p><div class="table-scroll"><table class="level-table"><thead><tr><th>Level</th><th>Minutes</th><th>Small blind</th><th>Big blind</th><th>Ante</th><th>Game</th><th>Chip up</th><th>Order</th></tr></thead><tbody>${levelRows(e.levels)}</tbody></table></div></div>`:''}<div class="form-section"><h3>Default payouts</h3><p class="muted">You can change these during a tournament from Tournament Management.</p>${editor.event&&tournamentStarted(current())?'<p class="muted">Use Tournament Management → Payouts to change an active payout agreement.</p>':payoutFields(e.settings,editor.event?current():null)}</div></div><div class="sticky-save"><button class="button primary" type="submit">${editor.event?'Save tournament settings':'Save structure'}</button><button class="button secondary" type="button" data-action="close-editor">Cancel</button></div></form>`;}
return `${current()?`<div class="panel current-panel"><div><span class="eyebrow">SELECTED TOURNAMENT</span><h2>${esc(current().name)}</h2><p class="muted">${esc(current().templateName)} · Antes ${current().settings.anteMode==='off'?'off':current().settings.anteMode.replace('_',' ')}</p></div><button class="button secondary" data-action="event-settings" ${current().status==='completed'?'disabled':''}>Edit this tournament</button></div>`:''}<div class="section-label"><h2>Saved structures</h2><div class="button-row"><button type="button" class="button secondary small" data-action="clock-appearance">Clock Appearance</button><button class="text-button" data-action="new-structure">+ Create structure</button></div></div><div class="structure-grid" id="saved-structures" role="region" aria-label="Saved structures" tabindex="0">${state.templates.map(s=>`<article class="panel structure-card"><span class="eyebrow">SAVED STRUCTURE</span><h2>${esc(s.name)}</h2><p>${s.levels.filter(l=>l.kind==='play').length} playing rounds · ${s.levels.filter(l=>l.kind==='break').length} breaks</p><div class="structure-facts"><span>Starting chips <strong>${num(s.settings.startingStack)}</strong></span><span>Buy-in <strong>${money(s.settings.buyIn)}</strong></span><span>Antes <strong>${s.settings.anteMode==='off'?'Optional · Off':s.settings.anteMode.replace('_',' ')}</strong></span></div><div class="button-row"><button class="button primary small" data-create-template="${s.id}">Use structure</button><button class="button secondary small" data-edit-template="${s.id}">Edit</button><button class="text-button" data-copy-template="${s.id}">Duplicate</button><button class="text-button danger-text" data-delete-template="${s.id}">Delete</button></div></article>`).join('')}</div>`;}
function guaranteeEligibility(s,t=null){const {guaranteeAmount,guaranteePlayers}=guaranteeSettings(s);return `${t?`${t.entries.length} registered. `:''}${money(guaranteeAmount)} guaranteed to First Place with ${num(guaranteePlayers)} registered players. Below ${num(guaranteePlayers)}, two places are paid: 65% / 35%.`;}
function readGuarantee(form,s){
  if(!form.elements.guaranteeAmount)return s;
  s.guaranteeAmount=wholeDollars(form.elements.guaranteeAmount.value)*100;s.guaranteePlayers=Number(form.elements.guaranteePlayers.value);
  if(!Number.isSafeInteger(s.guaranteeAmount)||s.guaranteeAmount<=0)throw new Error('Enter a positive whole-dollar first-place guarantee.');
  if(!Number.isSafeInteger(s.guaranteePlayers)||s.guaranteePlayers<1)throw new Error('Enter a positive whole number of players for the guarantee.');return s;
}
function payoutFormats(s,t=null){
  const {guaranteeAmount,guaranteePlayers}=guaranteeSettings(s);
  return `<fieldset class="payout-formats" ${t?.status==='completed'?'disabled':''}><legend>Prize Format</legend>${[['percent','Percentage of Prize Pool'],['fixed','Fixed Dollar Amounts']].map(([value,label])=>`<label class="check"><input type="radio" name="payoutMode" value="${value}" ${s.payoutMode===value?'checked':''}><span>${label}</span></label>`).join('')}<div class="check guarantee-choice"><input id="guaranteed-format" type="radio" name="payoutMode" value="guaranteed" aria-label="Guaranteed to First Place" ${s.payoutMode==='guaranteed'?'checked':''}><div class="guarantee-settings"><div class="guarantee-amount"><span>$</span><input type="text" inputmode="numeric" data-money="true" name="guaranteeAmount" aria-label="First-place guarantee amount" value="${num(guaranteeAmount/100)}" required></div><label for="guaranteed-format">Guaranteed to First Place with</label><input type="number" name="guaranteePlayers" aria-label="Players required for guarantee" min="1" step="1" value="${guaranteePlayers}" required><label for="guaranteed-format">players</label></div></div></fieldset><p class="muted small-copy" id="guarantee-eligibility">${guaranteeEligibility(s,t)}</p>`;
}
function paidPlacesControl(s,t=null,live=false){
  const count=t?.icmChop?t.finalPayouts.length:s.payoutMode==='guaranteed'?2:s.payouts.length,locked=t?.status==='completed'||s.payoutMode==='guaranteed'&&!live;
  return `<label class="paid-places-label" for="paid-places">Number of Places Paid</label><div class="paid-places-control"><button type="button" class="button secondary" data-payout-step="-1" aria-label="Decrease paid places" ${locked||count===1?'disabled':''}>−</button><input id="paid-places" name="paidPlaces" type="number" min="1" max="20" step="1" value="${count}" required ${locked?'disabled':''}><button type="button" class="button secondary" data-payout-step="1" aria-label="Increase paid places" ${locked||count===20?'disabled':''}>+</button></div><p class="muted small-copy" id="paid-places-note">${s.payoutMode==='guaranteed'?'Automatic guarantee: two paid places.':''}</p>`;
}
function payoutFields(s,t=null){return `<div class="payout-editor-grid" data-setup-payouts><div class="payout-format-column">${paidPlacesControl(s,t)}${payoutFormats(s,t)}</div><section class="payout-places-column"><h3>Payouts</h3><div id="payout-place-list" data-mode="${s.payoutMode}">${payoutPlaceRows(t,s.payoutMode,s.payouts.map(n=>s.payoutMode==='fixed'?n/100:n),true,s)}</div></section></div><p id="setup-payout-feedback" class="muted" role="status"></p>`;}
function readPayout(form,s){
  const fd=new FormData(form),mode=fd.get('payoutMode');if(!mode)return s;readGuarantee(form,s);s.payoutMode=mode;
  if(mode==='guaranteed'){s.payouts=[65,35];return s;}
  const fields=[...form.querySelectorAll('[data-payout-value]')],count=Number(form.elements.paidPlaces.value);
  if(!Number.isInteger(count)||count<1||count>20||fields.length!==count)throw new Error('Choose 1–20 paid places.');
  const pattern=mode==='fixed'?/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/:/^\d+(?:\.\d{1,4})?$/;
  if(!fields.every(input=>pattern.test(input.value.trim())))throw new Error(mode==='fixed'?'Enter each payout in whole dollars.':'Enter a valid percentage for each place.');
  s.payouts=fields.map(input=>dollarNumber(input.value)*(mode==='fixed'?100:1));return s;
}
function readPayoutSettings(form,t){
  const settings=readPayout(form,clone(t.settings)),input=form.elements.houseContribution;
  if(input)settings.houseContribution=wholeDollars(input.value)*100;
  return settings;
}
function awardRows(t){
  if(t.icmChop)return `<p class="pill light">Ended by ICM chop</p><div class="icm-results">${t.icmChop.participants.map(v=>`<div class="result-row"><span>${esc(pName(v))}<small>${num(v.chips)} final chips</small></span><strong>${money(v.payout)}</strong></div>`).join('')}</div>${t.icmChop.reservedPayouts.length?`<p class="muted">Payouts for earlier eliminations: ${t.icmChop.reservedPayouts.map(money).join(', ')}</p>`:''}`;
  return `<div class="prize-preview">${prizes(t).map((v,i)=>`<div><span>${ordinal(i+1)} place</span><strong>${money(v)}</strong></div>`).join('')}</div>`;
}
function fundingNotice(t){
  const f=financials(t);if(!f.guaranteeActive)return '';
  if(t.endedBy==='icm-chop')return `<p class="guarantee-note">The accepted ICM agreement replaces the ordinary place payouts.${f.guaranteeContribution?` The chop includes ${money(f.guaranteeContribution)} additional house funding, recorded in House Contribution.`:''}</p>`;
  return `<p class="guarantee-note">First place is at least ${money(guaranteeSettings(t.settings).guaranteeAmount)}; a 65% / 35% split applies automatically when it pays more.${f.guaranteeContribution?` <strong>Additional house contribution required: ${money(f.guaranteeContribution)}.</strong> Included in total House Contribution of ${money(f.houseContribution)}; fully funded prize pool: ${money(f.pool)}.`:' The guarantee is fully funded.'}</p>`;
}
function placeName(index){return ['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth','Eleventh','Twelfth','Thirteenth','Fourteenth','Fifteenth','Sixteenth','Seventeenth','Eighteenth','Nineteenth','Twentieth'][index]+' Place';}
function payoutPlaceRows(t,mode,values,setup=false,settings=t?.settings||{}){
  if(t?.icmChop)return awardRows(t);
  let amounts=[];if(t)try{amounts=prizes({...t,settings:{...t.settings,payoutMode:mode,payouts:values.map(n=>dollarNumber(n)*(mode==='fixed'?100:1))}});}catch{}
  const count=mode==='guaranteed'?2:values.length,readonly=t?.status==='completed'||mode==='guaranteed';
  return Array.from({length:count},(_,i)=>`<div class="payout-place-row" data-payout-place="${i}">${readonly?`<span>${placeName(i)}</span><output data-payout-amount="${i}">${setup?(i===0?`${money(guaranteeSettings(settings).guaranteeAmount)} minimum at ${num(guaranteeSettings(settings).guaranteePlayers)} players`:'Remainder'):money(amounts[i]||0)}</output>`:`<label for="payout-place-${i}"><span class="payout-place-label">${placeName(i)}</span><div class="input-wrap ${mode==='percent'?'payout-percentage-input':''}">${mode==='fixed'?'<span>$</span>':''}<input id="payout-place-${i}" name="payoutPlace${i+1}" data-payout-value="${i}" aria-label="${placeName(i)} ${mode==='fixed'?'dollars':'percentage'}" type="${mode==='fixed'?'text':'number'}" ${mode==='fixed'?'inputmode="numeric" data-money="true"':''} min="0" ${mode==='percent'?'max="100"':''} step="${mode==='fixed'?'1':'0.0001'}" value="${mode==='fixed'?num(dollarNumber(values[i]??0)):values[i]??0}" required>${mode==='percent'?'<span>%</span>':''}</div></label>${mode==='percent'&&!setup?`<output data-payout-amount="${i}">${money(amounts[i]||0)}</output>`:''}`}</div>`).join('');
}
function payoutPanel(t){
  const f=financials(t),done=t.status==='completed',values=t.settings.payouts.map(n=>t.settings.payoutMode==='fixed'?n/100:n);
  return `<form id="payout-form" data-custom-draft="${!!t.payoutCustom}"><input type="hidden" name="tournamentId" value="${t.id}"><input type="hidden" name="version" value="${version}"><div class="payout-editor-grid"><div class="payout-format-column">${paidPlacesControl(t.settings,t,tournamentStarted(t))}${payoutFormats(t.settings,t)}<p class="custom-payout-status" id="custom-payout-status">${t.payoutCustom?'Custom Payouts':''}</p>${!done?'<button type="button" class="button secondary small" data-action="recalculate-payouts">Recalculate automatic payouts</button>':''}</div><section class="payout-places-column" aria-label="Payouts by finishing place"><div class="payout-current-pool"><span>Current Prize Pool</span><strong id="payout-pool">${money(f.pool)}</strong></div><h2>Payouts</h2><div id="payout-place-list" data-mode="${t.settings.payoutMode}">${payoutPlaceRows(t,t.settings.payoutMode,values)}</div></section></div><label class="payout-house-contribution">House Contribution<div class="input-wrap"><span>$</span><input type="text" inputmode="numeric" data-money="true" name="houseContribution" value="${num(t.settings.houseContribution/100)}" required ${done?'disabled':''}></div></label><button class="button primary" ${done?'disabled':''}>Save Payouts</button></form><div id="guarantee-funding">${fundingNotice(t)}</div><p id="payout-feedback" class="muted" role="status">${payoutBalance(t)?'Payouts must be updated to exactly match the prize pool.':''}</p>${done?'':`<button type="button" class="button secondary" data-action="icm-chop" ${active(t).length<2||active(t).length>20||payoutBalance(t)!==0?'disabled':''}>ICM Chop</button>`}`;
}
function payoutContext(form){return form.id==='payout-form'?current():editor?.event?current():null;}
function rememberPlaceValues(form){
  const list=form.querySelector('#payout-place-list'),mode=list.dataset.mode;let draft=payoutDrafts.get(form);if(!draft){draft={};payoutDrafts.set(form,draft);}
  const saved=draft[mode]||{values:[],count:0},inputs=[...list.querySelectorAll('[data-payout-value]')];inputs.forEach((input,i)=>saved.values[i]=input.value);
  saved.count=mode==='guaranteed'?2:inputs.length;if(form.id==='payout-form')saved.houseContribution=form.elements.houseContribution.value;draft[mode]=saved;return draft;
}
function writePlaceRows(form,mode,count,values){
  const t=payoutContext(form),setup=form.id!=='payout-form',live=!setup&&tournamentStarted(t),locked=t?.status==='completed'||mode==='guaranteed'&&!live;
  form.querySelector(`[name=payoutMode][value=${mode}]`).checked=true;form.elements.paidPlaces.value=String(count);form.elements.paidPlaces.disabled=locked;
  for(const button of form.querySelectorAll('[data-payout-step]'))button.disabled=locked||Number(button.dataset.payoutStep)<0&&count===1||Number(button.dataset.payoutStep)>0&&count===20;
  form.querySelector('#paid-places-note').textContent=mode==='guaranteed'?'Automatic guarantee: two paid places.':'';
  const list=form.querySelector('#payout-place-list');list.dataset.mode=mode;list.innerHTML=payoutPlaceRows(t,mode,values,setup,readGuarantee(form,{...(t?.settings||editor?.value.settings)}));
}
function changePlaceRows(form,mode,count){
  const drafts=rememberPlaceValues(form),list=form.querySelector('#payout-place-list'),previous=list.dataset.mode,old=drafts[previous],t=payoutContext(form),live=form.id==='payout-form'&&tournamentStarted(t),countChanged=count!==list.children.length;
  const snapshot=()=>{const settings=readGuarantee(form,{...t.settings,payoutMode:previous,payouts:previous==='guaranteed'?[65,35]:old.values.slice(0,old.count).map(n=>dollarNumber(n)*(previous==='fixed'?100:1)),houseContribution:wholeDollars(form.elements.houseContribution.value)*100});if(previous==='percent'&&Math.abs(settings.payouts.reduce((a,b)=>a+b,0)-100)>0.000001)throw new Error('Make the current percentages total 100% before adding places.');return {...t,settings};};
  if(live&&countChanged&&mode===previous&&previous!=='fixed'){
    const draft=snapshot();drafts.fixed={values:prizes(draft).map(n=>String(n/100)),count,houseContribution:num(financials(draft).houseContribution/100)};mode='fixed';
  }else if(mode==='fixed'&&!drafts.fixed){
    const draft=t?snapshot():null;drafts.fixed={values:draft?prizes(draft).map(n=>String(n/100)):[],count,...(draft?{houseContribution:num(financials(draft).houseContribution/100)}:{})};
  }
  if(mode==='guaranteed'){count=2;drafts.guaranteed={...drafts.guaranteed,values:['65','35'],count};}
  else if(mode==='percent'&&(!live&&(countChanged||mode!==previous)||!drafts.percent))drafts.percent={...drafts.percent,values:defaultPayouts(count).map(String),count};
  const saved=drafts[mode]||{values:[],count};
  if(live&&mode!==previous&&mode!=='fixed'&&saved.houseContribution==null)saved.houseContribution=num(Math.max(0,wholeDollars(form.elements.houseContribution.value)-(t.payoutCustom?(t.payoutAutomatic?.guaranteeContribution||0)/100:0)));
  if(mode!==previous&&mode!=='guaranteed'&&!countChanged)count=saved.count||count;
  const values=Array.from({length:count},(_,i)=>saved.values[i]??'0');saved.count=count;drafts[mode]=saved;
  if(form.id==='payout-form'&&mode!==previous&&saved.houseContribution!=null)form.elements.houseContribution.value=saved.houseContribution;
  if(live)form.dataset.customDraft=String(mode==='fixed');writePlaceRows(form,mode,count,values);
}
function refreshPayoutPreview(form){
  const list=form.querySelector('#payout-place-list');if(!list)return;
  try{
    let mode=form.querySelector('[name=payoutMode]:checked').value;const count=Number(form.elements.paidPlaces.value);
    if(!Number.isInteger(count)||count<1||count>20)throw new Error('Choose 1–20 paid places.');
    if(mode!==list.dataset.mode||count!==list.children.length)changePlaceRows(form,mode,count);
    mode=form.querySelector('[name=payoutMode]:checked').value;
    const settings=readPayoutSettings(form,payoutContext(form)||{settings:editor.value.settings});
    setText('#guarantee-eligibility',guaranteeEligibility(settings,payoutContext(form)));
    if(mode==='percent'&&Math.abs(settings.payouts.reduce((a,b)=>a+b,0)-100)>0.000001)throw new Error('Percentages must total 100%.');
    if(form.id!=='payout-form'){if(mode==='guaranteed')setText('[data-payout-amount="0"]',`${money(settings.guaranteeAmount)} minimum at ${num(settings.guaranteePlayers)} players`);setText('#setup-payout-feedback','');return;}
    const t={...current(),settings},f=financials(t),amounts=prizes(t);amounts.forEach((n,i)=>setText(`[data-payout-amount="${i}"]`,money(n)));$('#guarantee-funding').innerHTML=fundingNotice(t);setText('#payout-pool',money(f.pool));
    const dirty=JSON.stringify(settings)!==JSON.stringify(current().settings),icm=$('[data-action=icm-chop]');if(icm)icm.disabled=dirty||active(t).length<2||active(t).length>20||payoutBalance(t)!==0;
    setText('#custom-payout-status',form.dataset.customDraft==='true'?'Custom Payouts'+(dirty?' — Save to apply':''):'');
    setText('#payout-feedback',payoutBalance(t)?`Payouts differ from the prize pool by ${money(Math.abs(payoutBalance(t)))}. Adjust them before saving.`:dirty?'Save payout changes before calculating an ICM chop.':'');
  }catch(error){const icm=$('[data-action=icm-chop]');if(icm)icm.disabled=true;setText(form.id==='payout-form'?'#payout-feedback':'#setup-payout-feedback',error.message);}
}
function recalculatePayouts(){
  const form=$('#payout-form'),t=current(),source=t.payoutAutomatic||{payoutMode:t.settings.payoutMode==='fixed'?'percent':t.settings.payoutMode,payouts:t.settings.payoutMode==='fixed'?defaultPayouts(t.settings.payouts.length):t.settings.payouts,guaranteeContribution:0};
  form.elements.houseContribution.value=num(Math.max(0,t.settings.houseContribution-(t.payoutCustom?source.guaranteeContribution||0:0))/100);form.dataset.customDraft='false';form.dataset.recalculate='true';
  const guarantee=guaranteeSettings(source.guaranteeAmount==null?t.settings:source);form.elements.guaranteeAmount.value=num(guarantee.guaranteeAmount/100);form.elements.guaranteePlayers.value=String(guarantee.guaranteePlayers);
  payoutDrafts.delete(form);writePlaceRows(form,source.payoutMode,source.payoutMode==='guaranteed'?2:source.payouts.length,source.payouts.map(String));refreshPayoutPreview(form);
}
function summaryPanel(t){
  const f=financials(t),rows=[['Tournament Entries',f.tournamentEntries,'credit'],['Dealer Tokes (Buy-Ins Only)',f.dealerTokes,'credit'],['Rebuys',f.rebuyTotal,'credit'],...(f.addonTotal?[['Add-ons',f.addonTotal,'credit']]:[]),[`Tournament Fee${f.housePercent==null?'':` (${f.housePercent}%)`}`,-f.houseFee,'debit'],['Dealer Tokes Paid Out',-f.dealerTokesPaidOut,'debit'],['House Contribution',f.houseContribution,f.houseContribution>0?'credit':'neutral'],['Total Prize Pool',f.pool,'total']];
  return `<h2>Tournament Summary</h2><div class="summary-grid financial-summary">${rows.map(([label,value,kind])=>`<div class="financial-${kind}"><span>${label}</span><strong>${value<0?'−':kind==='credit'&&value>0?'+':''}${money(Math.abs(value))}</strong>${label==='House Contribution'&&f.guaranteeContribution?`<small>Includes ${money(f.guaranteeContribution)} additional funding for the guarantee.</small>`:''}</div>`).join('')}</div>`;
}
function players(){const rows=state.players.filter(p=>(showArchived||!p.archived)&&(normalizePlayerName(p.name)+' '+playerNumberLabel(p)+' '+(p.phone||'')).includes(normalizePlayerName(playerSearch))).sort((a,b)=>a.name.localeCompare(b.name));if(playerDetail){const p=state.players.find(p=>p.id===playerDetail);if(!p){playerDetail=null;return players();}const st=statsFor(state,p.id);return `<div class="player-profile-body" data-player-profile="${p.id}"><div class="metrics player-stats"><div><span>Tournaments</span><strong>${st.played}</strong></div><div><span>Wins</span><strong>${st.wins}</strong></div></div><div class="profile-tabs" role="group" aria-label="Player profile panels"><button type="button" class="button secondary" data-profile-panel="details" aria-pressed="${profilePanel==='details'}">Player details</button><button type="button" class="button secondary" data-profile-panel="history" aria-pressed="${profilePanel==='history'}">Tournament history</button></div><div class="two-col player-profile-panels" data-panel="${profilePanel}"><form id="player-form" class="panel player-details-panel"><h2>Player details</h2><div class="player-details-fields"><input type="hidden" name="id" value="${p.id}"><label>Player name<input name="name" value="${esc(p.name)}" required maxlength="100" autocomplete="off"></label><label>Player ID<input value="${playerNumberLabel(p)}" readonly aria-readonly="true"></label><label>Phone number (optional)<input type="tel" name="phone" value="${esc(p.phone)}" maxlength="40" autocomplete="tel" data-phone="true" pattern="([0-9]{10}|[0-9]{3}-[0-9]{3}-[0-9]{4})" placeholder="###-###-####" title="Enter exactly 10 digits, such as 555-123-4567."></label><label>Last played<input data-last-played value="${esc(st.lastPlayed?dateLabel(st.lastPlayed):'Not yet')}" readonly aria-readonly="true"></label><label class="player-notes">Notes<textarea name="notes" maxlength="1000">${esc(p.notes)}</textarea></label></div><div class="button-row"><button class="button primary">Save changes</button><button type="button" class="button secondary" data-archive="${p.id}">${p.archived?'Restore player':'Archive player'}</button></div></form><section class="panel player-history-panel"><h2 id="player-history-heading">Tournament history</h2><div id="player-history-list" role="region" aria-labelledby="player-history-heading" tabindex="0">${st.history.length?st.history.map(({t,e})=>`<div class="result-row"><span>${esc(t.name)}<small>${dateLabel(t.date)}</small></span><strong>${e.icmChopParticipant?'ICM chop':'Finished #'+e.place}</strong></div>`).join(''):'<p class="muted">No completed tournaments yet.</p>'}</div></section></div></div>`;}
return `<section class="panel player-database-panel"><div class="search-row"><label class="search"><span class="sr-only">Search players</span><input id="player-search" placeholder="Search by name, player ID, or phone…" value="${esc(playerSearch)}" autocomplete="off"></label><label class="check"><input id="show-archived" type="checkbox" ${showArchived?'checked':''}>Show archived</label></div><div id="player-results" role="region" aria-label="Player names and IDs" tabindex="0">${playerRows(rows)}</div></section>`;}
function playerRows(rows){return rows.length?rows.map(p=>`<button class="player-row" data-player="${p.id}"><span class="avatar">${esc(p.name.slice(0,1).toUpperCase())}</span><span><strong>${esc(p.name)}</strong><small>${p.archived?'<span class="archived-status">Archived</span> · ':''}ID: ${playerNumberLabel(p)}${p.phone?' · '+esc(p.phone):''}</small></span><span>View player →</span></button>`).join(''):empty(playerSearch?'No matching players':'Your player database is empty',playerSearch?'Try a different name or player ID.':'Add your first player to save their information.','<button class="button primary" data-action="add-player">Add player</button>');}
function noTournament(){return empty('No tournament is set up yet.','Create a tournament from one of your saved structures.','<button class="button primary" data-action="new-tournament">Create tournament</button>');}
function signup(){const t=current();if(!t)return noTournament();const f=financials(t),enrolled=new Set(t.entries.map(e=>e.playerId));const matches=state.players.filter(p=>!p.archived&&!enrolled.has(p.id)&&(normalizePlayerName(p.name)+' '+playerNumberLabel(p)).includes(normalizePlayerName(signupSearch))).sort((a,b)=>a.name.localeCompare(b.name));return `<div class="registration-tabs" role="group" aria-label="Registration lists"><button class="button secondary" data-registration-panel="find" aria-pressed="${registrationPanel==='find'}">Find a player</button><button class="button secondary" data-registration-panel="registered" aria-pressed="${registrationPanel==='registered'}">Registered (${t.entries.length})</button></div><div class="two-col signup-layout" data-tournament="${t.id}" data-panel="${registrationPanel}"><section class="panel registration-find" aria-labelledby="registration-find-heading"><h2 id="registration-find-heading">Register a player</h2><p class="muted">Buy-in ${money(t.settings.buyIn)} · ${num(t.settings.startingStack)} starting chips</p><label>Find a player<input id="signup-search" placeholder="Search by name or player ID…" value="${esc(signupSearch)}" autocomplete="off"></label><div id="signup-results" class="registration-list" role="region" aria-label="Available players" tabindex="0">${registrationRows(matches,t)}</div><button class="button secondary full" data-action="add-player">+ Add a new player</button></section>${metrics(t).replace('class="metrics"','class="metrics registration-summary"')}<section class="panel registration-enrolled" aria-labelledby="registration-enrolled-heading"><div class="section-label"><h2 id="registration-enrolled-heading">Registered players</h2><span>${t.entries.length} entries</span></div><div class="money-strip"><span>Collected <strong>${money(f.collected)}</strong></span></div><div id="registered-results" class="registered-list" role="region" aria-label="Registered players" tabindex="0">${t.entries.length?entryRows(t,false):'<p class="muted">Players appear here as you register them.</p>'}</div></section></div>`;}
function registrationRows(rows,t){return rows.length?rows.slice(0,80).map(p=>`<button class="register-row" data-register="${p.id}" ${t.status==='completed'?'disabled':''}><span>${esc(p.name)}</span><strong>+ Register</strong></button>`).join(''):'<p class="muted">No matching unregistered players. Add a new player below.</p>';}
function entryRows(t,management){return t.entries.slice().sort((a,b)=>Number(!!a.eliminatedAt)-Number(!!b.eliminatedAt)||pName(a).localeCompare(pName(b))).map(e=>`<div class="entry-row ${e.eliminatedAt?'out':''}"><div><strong>${esc(pName(e))}</strong><small>${e.icmChopParticipant?'ICM chop · '+num(e.finalChipCount)+' chips':e.place?'Finished #'+e.place:(e.table?'Table '+e.table+' · Seat '+e.seat:'Not seated')}</small></div><div class="entry-actions">${t.status==='completed'?'':!e.eliminatedAt?`${t.settings.addonEnabled?`<button class="button tiny secondary" data-addon="${e.id}">Add-on</button>`:''}${management?`<button class="button tiny danger" data-eliminate="${e.id}">Eliminate</button>`:''}`:management?`<button type="button" class="button tiny secondary" data-undo-elimination="${e.id}">Undo Elimination</button>`:'<span class="pill light">Eliminated</span>'}</div></div>`).join('');}
function rebuyCountHelp(t,c){return !t.settings.rebuyEnabled?'Rebuys are turned off for this tournament.':t.status==='completed'?'This tournament is finished.':canRecordRebuys(t,c)?'Enter the total number of rebuys for this tournament.':(cutoffHasBreak(t)?'Available when the break after the final rebuy round begins.':'Available after the final rebuy round.');}
function rebuyCountControl(t){const c=clockAt(t,timeNow());return `<div class="rebuy-total-controls"><button class="button secondary" id="record-rebuys" data-action="rebuy-count" ${!canRecordRebuys(t,c)?'disabled':''}>Rebuy</button></div>`;}
function controls(t){const c=clockAt(t,timeNow());return `<div class="clock-controls"><button class="button primary" id="clock-main" data-clock="${c.status==='running'?'pause':c.status==='ready'?'start':'resume'}" ${c.status==='ended'||t.status==='completed'?'disabled':''}>${c.status==='running'?'Pause clock':c.status==='ready'?'Start tournament':'Resume clock'}</button><button class="button secondary" data-clock="previous" ${c.index===0||t.status==='completed'?'disabled':''}>← Previous level</button><button class="button secondary" data-clock="next" ${c.index===t.levels.length-1||t.status==='completed'?'disabled':''}>Next level →</button><button class="button secondary" data-adjust="-60" ${t.status==='completed'?'disabled':''}>−1 minute</button><button class="button secondary" data-adjust="60" ${t.status==='completed'?'disabled':''}>+1 minute</button></div>`;}
function tvDisplayControls(t){
  if(!t)return '';
  const mode=tvDisplayMode(t),started=tournamentStarted(t);
  return `<section class="tv-display-controls" aria-label="TV Display"><strong>TV Display</strong><div class="tv-display-buttons" role="group" aria-label="TV display mode">${[['full-clock','Full Clock'],['clock-seating','Clock + Seating']].map(([value,label])=>`<button type="button" class="button small secondary ${mode===value?'is-selected':''}" data-tv-display="${value}" aria-pressed="${mode===value}" ${busy||!online||value==='full-clock'&&!started?'disabled':''}>${label}</button>`).join('')}</div></section>`;
}
function manage(){const t=current();if(!t)return noTournament();const f=financials(t);return `${metrics(t)}${tableBalanceNeeded(t)?'<p class="table-balance-alert" role="alert"><strong>Tables Need Balancing.</strong> Please move one player to balance the tables.</p>':''}<section class="panel control-panel"><div class="mini-clock"><span class="eyebrow" id="mini-level"></span><strong id="mini-time">15:00</strong><span id="mini-blinds"></span><small id="mini-note"></small></div><div class="management-clock-actions">${controls(t)}${rebuyCountControl(t)}</div></section><div class="management-layout"><div class="management-sidebar" role="tablist" aria-label="Management sections" aria-orientation="vertical">${[['players','Players'],['tables','Tables & Seats'],['payouts','Payouts'],['summary','Summary']].map(([k,label])=>`<button type="button" role="tab" id="management-tab-${k}" aria-selected="${tab===k}" aria-controls="management-panel" tabindex="${tab===k?'0':'-1'}" data-tab="${k}" class="${tab===k?'active':''}">${label}</button>`).join('')}</div><section class="panel management-panel" id="management-panel" role="tabpanel" aria-labelledby="management-tab-${tab}" tabindex="0">${tab==='players'?`<div class="section-label"><h2>Players</h2><div class="button-row"><button class="button small primary" data-action="finish" ${active(t).length!==1||t.status==='completed'?'disabled':''}>Confirm winner & finish</button></div></div>${t.entries.length?entryRows(t,true):'<p class="muted">Register players from the Sign-Up page.</p>'}`:tab==='tables'?tableManagement(t):tab==='payouts'?payoutPanel(t):summaryPanel(t)}</section></div>`;}
function tableManagement(t){
  const remaining=active(t);
  const seated=remaining.filter(e=>e.table),unseated=remaining.filter(e=>!e.table);
  return `<div class="section-label"><h2>Tables & seats</h2><div class="button-row"><button class="button secondary small" data-action="seat-remaining" ${t.status==='completed'||!unseated.length?'disabled':''}>${seated.length?'Seat Remaining Players':'Seat Players'}</button><button class="button secondary small" data-action="combine-tables" ${t.status==='completed'||!canCombineTables(t)?'disabled':''}>${tableActionName(t)}</button></div></div><form id="seating-settings-form" class="seating-settings-form"><input type="hidden" name="tournamentId" value="${t.id}"><label>Seats per table<input type="number" name="seatsPerTable" min="2" max="10" step="1" value="${t.settings.seatsPerTable}" required ${t.status==='completed'?'disabled':''}></label><button class="button secondary" ${t.status==='completed'?'disabled':''}>Apply</button></form><div class="seat-move-help"><p class="muted" id="seat-move-instructions" role="status">Drag a player to another seat, or select a player and then a seat.</p><button type="button" class="button secondary small move-players-toggle ${movePlayersEnabled?'is-active':''}" data-action="toggle-move-players" aria-pressed="${movePlayersEnabled}" ${t.status==='completed'?'disabled':''}>Move Players</button><button type="button" class="button secondary small" id="cancel-seat-pick" data-action="cancel-seat-pick" hidden>Cancel move</button></div><div class="seat-tables ${movePlayersEnabled?'moves-enabled':''}">${Array.from({length:tablesInUse(t)},(_,i)=>`<div class="seat-table"><h3><span class="seat-table-title">TABLE ${i+1}</span><small>${remaining.filter(e=>e.table===i+1).length} of ${t.settings.seatsPerTable} Seats Filled</small></h3>${Array.from({length:t.settings.seatsPerTable},(_,j)=>{const e=remaining.find(e=>e.table===i+1&&e.seat===j+1);return seatRow(t,i+1,j+1,e);}).join('')}</div>`).join('')}</div><h3>Unseated players</h3>${remaining.filter(e=>!e.table).map(e=>`<div class="result-row unseated-player-row"><span>${esc(pName(e))}</span><div class="unseated-player-actions"><button class="button small secondary" data-seat="${e.id}" ${!movePlayersEnabled||t.status==='completed'?'disabled':''}>Assign seat</button>${seatEliminateButton(t,e)}</div></div>`).join('')||'<p class="muted">All remaining players have seats.</p>'}`;
}
function seatEliminateButton(t,entry){return `<button type="button" class="seat-eliminate-button" data-eliminate="${entry.id}" aria-label="Eliminate ${esc(pName(entry))} from the tournament" ${t.status==='completed'||active(t).length<=1?'disabled':''}>Eliminate</button>`;}
function seatRow(t,table,seat,entry){
  const disabled=t.status==='completed'?'disabled':'',moveDisabled=disabled||(!movePlayersEnabled||entry?.seatLocked?'disabled':'');
  return `<div class="seat-row ${entry?.seatLocked?'seat-locked':''}" data-seat-target data-table="${table}" data-seat="${seat}">${entry?`<button type="button" class="seat-player-grip" data-seat-grab="${entry.id}" aria-pressed="false" aria-label="Move ${esc(pName(entry))} from Table ${table}, Seat ${seat}" title="Drag to another seat, or select then choose a seat" ${moveDisabled}><span class="seat-number" aria-hidden="true">${seat}</span><span class="seat-player-name">${esc(pName(entry))}</span><span class="seat-grab-icon" aria-hidden="true">⠿</span></button><div class="seat-player-actions"><button type="button" class="text-button" data-seat="${entry.id}" ${moveDisabled}>Move</button><button type="button" class="seat-lock-button ${entry.seatLocked?'is-locked':''}" data-seat-lock="${entry.id}" aria-pressed="${!!entry.seatLocked}" aria-label="${entry.seatLocked?'Unlock':'Lock'} ${esc(pName(entry))} at Table ${table}, Seat ${seat}" ${disabled}>${entry.seatLocked?'Locked':'Lock in seat'}</button>${seatEliminateButton(t,entry)}</div>`:`<button type="button" class="seat-empty" data-seat-target-button="true" aria-label="Table ${table}, Seat ${seat}, empty" ${disabled||(!movePlayersEnabled?'disabled':'')}><span class="seat-number" aria-hidden="true">${seat}</span><span class="muted">Empty</span></button>`}</div>`;
}
function ordinal(n){return n+(n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'})[n%10]||'th');}
function clockSidebar(t,c){
  const phase=rebuyPhase(t,c),open=phase!=='closed',count=active(t).length+' / '+t.entries.length,pool=tvMoney(financials(t).pool),withBreak=cutoffHasBreak(t);
  const notice=phase==='final-round'?`<strong class="tv-final-rebuy">Final Rebuy Round</strong><p class="tv-cutoff-detail">${withBreak?'Rebuys remain open during the following break':'Rebuys close after this round'}</p>`:phase==='final-break'?'<strong>Rebuys Open</strong><p class="tv-cutoff-detail">Rebuys close when this break ends</p>':`<strong>Rebuys Open</strong><p>Through Level ${t.settings.rebuyLastRound}</p>${withBreak?'<p class="tv-cutoff-detail">Includes the following break</p>':''}`;
  return `<div class="tv-players"><span>PLAYERS REMAINING</span><strong style="font-size:min(${open?9:7.5}vw,${52/count.length}vw)">${count}</strong>${!open?`<small class="tv-rebuy-count">Rebuys: ${financials(t).rebuyCount}</small>`:''}</div>${open?`<div class="tv-rebuys-open">${notice}</div>`:`<div class="tv-pool"><span>PRIZE POOL</span><strong style="font-size:min(7.5vw,${52/pool.length}vw)">${pool}</strong></div><div class="tv-prizes"><span>PAYOUTS</span><div class="tv-payout-list">${prizes(t).map((v,i)=>`<p><span>${t.icmChop?.participants[i]?esc(pName(t.icmChop.participants[i])):ordinal(i+1)}</span><strong>${tvMoney(v)}</strong></p>`).join('')}</div></div>`}`;
}

function tvToolbar(){return `${automaticTvLaunch?'<div class="tv-launch-fallback"><button type="button" class="button primary small" data-action="tv-fullscreen">Place TV & Enter Full Screen</button><small>If placement is blocked, move this window to the TV first.</small><small>Windows wireless HDMI: pending testing</small></div>':''}<div class="tv-toolbar"><button data-go="home">← Home</button><span class="tv-mode">${online?'CONNECTED':'CONNECTION INTERRUPTED'}</span><button data-action="sound">Sound: ${sound?'on':'off'}</button><button data-action="fullscreen">Full screen ⛶</button></div>`;}
function compactRebuyNotice(t,c){
  if(!rebuyOpen(t,c))return 'Rebuys closed';
  const phase=rebuyPhase(t,c);
  return phase==='final-round'?`Final Rebuy Round${cutoffHasBreak(t)?' · Open through the following break':''}`:phase==='final-break'?'Rebuys open until this break ends':`Rebuys Open · Through Level ${t.settings.rebuyLastRound}${cutoffHasBreak(t)?' + break':''}`;
}
function compactClock(t,c){return `<section class="tv-compact-clock" aria-label="Tournament clock"><div class="tv-compact-time-block"><div id="tv-level"></div><strong id="tv-time" class="tv-compact-time" data-tv-fit="110"></strong><span id="tv-status"></span></div><div class="tv-compact-blinds"><span id="tv-game"></span><strong id="tv-blinds" data-tv-fit="72"></strong><span id="tv-ante"></span></div><div class="tv-compact-next"><span id="tv-next-label"></span><strong id="tv-next" data-tv-fit="42"></strong><span class="tv-compact-rebuys ${rebuyPhase(t,c)==='final-round'?'final-rebuy':''}" data-rebuy-phase="${rebuyPhase(t,c)}">${esc(compactRebuyNotice(t,c))}</span></div></section>`;}
function seatingScreen(t,c){
  const seating=tvSeating(t),columns=Math.min(3,seating.tables.length||1),rows=Math.ceil(seating.tables.length/columns)||1;
  return `<div class="tv-shell tv-seating-shell" data-tv-display-mode="clock-seating">${tvToolbar()}<header class="tv-seating-heading"><h1 data-tv-fit="42">${esc(t.name)}</h1><span>${tournamentStarted(t)?'TABLES & SEATS':'SEATING · STARTS SOON'}</span><strong>${active(t).length} PLAYERS</strong></header>${tournamentStarted(t)?compactClock(t,c):''}<main class="tv-seating-area"><div class="tv-seating-tables" style="--tv-table-columns:${columns};--tv-table-rows:${rows}">${seating.tables.length?seating.tables.map(table=>`<section class="tv-seat-table" aria-label="Table ${table.number}" style="--tv-seat-count:${table.seats.length}"><h2><span>TABLE ${table.number}</span><small>${table.seats.filter(s=>s.entry).length} of ${table.seats.length} Seats Filled</small></h2><div class="tv-seat-list">${table.seats.map(seat=>`<div class="tv-seat ${seat.entry?'':'is-empty'}" data-tv-table="${table.number}" data-tv-seat="${seat.number}" ${seat.entry?`data-tv-entry="${seat.entry.id}"`:''}><span class="tv-seat-number">${seat.number}</span><span class="tv-seat-name" data-tv-fit="72">${esc(seat.entry?pName(seat.entry):'')}</span></div>`).join('')}</div></section>`).join(''):'<div class="tv-seating-empty">Register players to show table assignments.</div>'}</div>${seating.unseated.length?`<section class="tv-unseated"><h2>Awaiting seat assignment</h2><div style="--tv-unseated-columns:${Math.min(6,seating.unseated.length)}">${seating.unseated.map(e=>`<span data-tv-entry="${e.id}" data-tv-fit="32">${esc(pName(e))}</span>`).join('')}</div></section>`:''}</main><footer class="tv-seating-footer" id="tv-footer-status"></footer></div>`;
}
function clockScreen(){const t=current(),c=t?clockAt(t,timeNow()):null;if(t&&tvDisplayMode(t)==='clock-seating')return seatingScreen(t,c);return `<div class="tv-shell" data-tv-display-mode="full-clock">${tvToolbar()}${!t?`<div class="tv-empty"><h1>Choose a tournament</h1><p>Open a tournament in the control room, then open its clock display.</p><button class="button gold" data-go="home">Open home screen</button></div>`:`<header class="tv-heading"><div><span>UNO CLUB</span><h1>${esc(t.name)}</h1></div><div id="tv-level">ROUND 1</div></header><main class="tv-grid"><section class="tv-time-panel"><span class="tv-time-label">TIME REMAINING</span><div class="tv-status" id="tv-status"></div><div class="tv-time" id="tv-time">15:00</div><div class="tv-progress"><div id="tv-progress"></div></div><div class="tv-break" id="tv-break"></div></section><section class="tv-blinds-panel"><span id="tv-game">CURRENT BLINDS</span><strong id="tv-blinds">25 / 50</strong><div id="tv-ante">Antes off</div><p class="tv-next-row"><span id="tv-next-label">NEXT BLINDS</span><strong id="tv-next"></strong></p></section><aside class="tv-side ${rebuyOpen(t,c)?'pre-rebuys':'post-rebuys'}" data-rebuy-phase="${rebuyPhase(t,c)}">${clockSidebar(t,c)}</aside></main>`}</div>`;}

function registrationSnapshot(){
  if(view!=='signup'||$('.signup-layout')?.dataset.tournament!==selected)return null;
  const search=$('#signup-search');return {available:$('#signup-results').scrollTop,registered:$('#registered-results').scrollTop,focused:document.activeElement===search,start:search.selectionStart,end:search.selectionEnd};
}
function restoreRegistration(snapshot){
  if(!snapshot||!$('.signup-layout'))return;
  $('#signup-results').scrollTop=snapshot.available;$('#registered-results').scrollTop=snapshot.registered;
  if(snapshot.focused){const search=$('#signup-search');search.focus({preventScroll:true});search.setSelectionRange(snapshot.start,snapshot.end);}
}
function panelSnapshot(){
  const search=view==='players'&&!playerDetail?$('#player-search'):null;
  return {history: view==='players'&&playerDetail&&$('.player-profile-body')?.dataset.playerProfile===playerDetail?$('#player-history-list').scrollTop:null,playerId:playerDetail,playerList:search?$('#player-results').scrollTop:null,search:search?{focused:document.activeElement===search,start:search.selectionStart,end:search.selectionEnd}:null,editor: view==='setup'&&editor?$('.structure-editor-body')?.scrollTop:null};
}
function restorePanels(snapshot){
  if(snapshot.history!=null&&snapshot.playerId===playerDetail&&$('#player-history-list'))$('#player-history-list').scrollTop=snapshot.history;
  if(snapshot.playerList!==null&&$('#player-search')){$('#player-results').scrollTop=snapshot.playerList;if(snapshot.search.focused){const search=$('#player-search');search.focus({preventScroll:true});search.setSelectionRange(snapshot.search.start,snapshot.search.end);}}
  if(snapshot.editor!=null&&$('.structure-editor-body'))$('.structure-editor-body').scrollTop=snapshot.editor;
}
function fitAppViewport(){document.body.style.setProperty('--app-height',`${window.visualViewport?.height||window.innerHeight}px`);}
window.addEventListener('resize',fitAppViewport);window.visualViewport?.addEventListener('resize',fitAppViewport);fitAppViewport();
function selectCurrentTournament(){
  if(current()||!state.tournaments.length)return;
  const tournament=homeTournament()||state.tournaments.slice().reverse().find(t=>t.status!=='completed')||state.tournaments.at(-1);
  selected=tournament?.id||'';if(selected)localStorage.setItem('uno-tournament-selected',selected);
}
function workspaceScreen(){
  const banner=header()+importNotice(),menu=view==='home'?'':nav();
  const content=`<main class="content">${({home,setup,players,signup,manage}[view]||home)()}</main><footer class="app-footer"><span>UNO CLUB · TOURNAMENT DIRECTOR</span><span>v0.3.20 · ${online?'Saved online':'Connection interrupted'}</span></footer>`;
  if(view==='manage')return `<div class="management-chrome">${banner}<div class="workspace">${menu}</div></div><div class="workspace">${content}</div>`;
  return `${banner}<div class="workspace">${menu}${content}</div>`;
}
function render(){if(!session||view!=='manage'||tab!=='tables'||movePlayersTournament!==selected)movePlayersEnabled=false;seatDragging?.cancel();clearSeatPick();if(!session){clearInterval(clockTimer);document.body.classList.remove('registration-page','tv','home-page','fixed-workspace','setup-page','players-page','player-profile-page');app.innerHTML=signInScreen();clockToolbar?.sync();return;}selectCurrentTournament();if(movePlayersTournament!==selected||current()?.status==='completed')movePlayersEnabled=false;const registration=registrationSnapshot(),panels=panelSnapshot();clearInterval(clockTimer);document.body.classList.toggle('registration-page',view==='signup'&&!!current());document.body.classList.toggle('tv',view==='clock');document.body.classList.toggle('home-page',view==='home');document.body.classList.toggle('fixed-workspace',['setup','players'].includes(view));document.body.classList.toggle('setup-page',view==='setup');document.body.classList.toggle('players-page',view==='players');document.body.classList.toggle('player-profile-page',view==='players'&&!!playerDetail);if(view==='clock'){app.innerHTML=clockScreen();}else{app.innerHTML=workspaceScreen();}restoreRegistration(registration);restorePanels(panels);clockToolbar?.sync();renderedWorkspaceVersion=version;tick();clockTimer=setInterval(tick,250);if(view==='clock'){try{applyClockAppearance($('.tv-shell'),current()?.clockAppearance);}catch{applyClockAppearance($('.tv-shell'),ORIGINAL_CLOCK_APPEARANCE);}fitTvSeating();if(automaticTvLaunch&&!tvLaunchAttempted){tvLaunchAttempted=true;void tryTvFullscreen(false);}}}
function setText(selector,text){const el=$(selector);if(el&&el.textContent!==String(text)){el.textContent=text;if(el.hasAttribute('data-tv-fit'))fitTvSeating(document,[el]);}}
function formatTime(ms){const sec=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
function nextBreak(t,c){if(t.levels[c.index].kind==='break')return 'Break in progress';let ms=c.remainingMs;for(let i=c.index+1;i<t.levels.length;i++){if(t.levels[i].kind==='break')return 'Next break in '+formatTime(ms);ms+=t.levels[i].minutes*60000;}return 'No further breaks scheduled';}
function tick(){const t=current();if(!t)return;const c=clockAt(t,timeNow()),l=t.levels[c.index],round=roundAt(t,c.index);const level=l.kind==='break'?'BREAK':'ROUND '+round,blinds=l.kind==='break'?'Take a break':num(l.sb)+' / '+num(l.bb);const status=t.status==='completed'?(t.endedBy==='icm-chop'?'ENDED BY ICM CHOP':'TOURNAMENT COMPLETE'):({ready:'READY TO START',running:l.kind==='break'?'BREAK':'LEVEL IN PROGRESS',paused:'CLOCK PAUSED',ended:'SCHEDULE COMPLETE'})[c.status];
  setText('#hero-time',formatTime(c.remainingMs));setText('#hero-blinds',level+' · '+blinds);setText('#mini-level',level);setText('#mini-time',formatTime(c.remainingMs));setText('#mini-blinds',blinds);setText('#mini-note',status);setText('#status-metric',statusLabel(t));
  const notice=$('.tv-compact-rebuys');if(notice&&notice.dataset.rebuyPhase!==rebuyPhase(t,c)){notice.dataset.rebuyPhase=rebuyPhase(t,c);notice.textContent=compactRebuyNotice(t,c);notice.classList.toggle('final-rebuy',rebuyPhase(t,c)==='final-round');}
  const side=$('.tv-side');if(side&&side.dataset.rebuyPhase!==rebuyPhase(t,c)){side.dataset.rebuyPhase=rebuyPhase(t,c);side.className='tv-side '+(rebuyOpen(t,c)?'pre-rebuys':'post-rebuys');side.innerHTML=clockSidebar(t,c);}
  setText('#tv-level',level);setText('#tv-status',c.status==='running'?'':status);setCountdown($('#tv-time'),formatTime(c.remainingMs));if($('#tv-time')?.hasAttribute('data-tv-fit'))fitTvSeating(document,[$('#tv-time')]);setText('#tv-game',l.kind==='break'?(l.chipUp?'BREAK · CHIP UP':'BREAK'):'CURRENT BLINDS');setText('#tv-blinds',blinds);setText('#tv-ante',l.kind==='play'&&t.settings.anteMode!=='off'&&l.ante?'Ante '+num(l.ante)+' · '+(t.settings.anteMode==='big_blind'?'Big blind':'Each player'):'Antes off');setText('#tv-break',nextBreak(t,c));
  const next=t.levels[c.index+1];setText('#tv-next-label',next?.kind==='break'?'NEXT BREAK':'NEXT BLINDS');setText('#tv-next',next?(next.kind==='break'?`${next.minutes} minutes${next.chipUp?' · Chip up':''}`:`${num(next.sb)} / ${num(next.bb)}`):'Final level');
  $('#tv-time')?.classList.toggle('urgent',c.remainingMs<=60000&&c.status==='running');if($('#tv-progress'))$('#tv-progress').style.width=(100*Math.min(1,c.remainingMs/(l.minutes*60000)))+'%';
  const b=$('#clock-main');if(b){const command=c.status==='running'?'pause':c.status==='ready'?'start':'resume';b.dataset.clock=command;b.textContent=c.status==='running'?'Pause clock':c.status==='ready'?'Start tournament':'Resume clock';b.disabled=busy||c.status==='ended'||t.status==='completed';}
  const guarantee=$('#payout-form [name=payoutMode][value=guaranteed]');if(guarantee){guarantee.disabled=t.status==='completed';try{setText('#guarantee-eligibility',guaranteeEligibility(readGuarantee(guarantee.form,clone(t.settings)),t));}catch{ /* Keep the draft validation message while editing. */ }}
  const rebuyButton=$('#record-rebuys');if(rebuyButton){rebuyButton.disabled=busy||!online||!canRecordRebuys(t,c);rebuyButton.classList.toggle('rebuy-available',!rebuyButton.disabled);setText('#rebuy-total-help',rebuyCountHelp(t,c));}
  for(const button of document.querySelectorAll('[data-tv-display]')){const selectedMode=button.dataset.tvDisplay===tvDisplayMode(t);button.disabled=busy||!online||button.dataset.tvDisplay==='full-clock'&&!tournamentStarted(t);button.classList.toggle('is-selected',selectedMode);button.setAttribute('aria-pressed',String(selectedMode));}
  const key=`${t.id}/${c.index}/${c.status}`;if(lastClockKey&&key!==lastClockKey&&view==='clock'&&sound)beep();lastClockKey=key;
  const launchFallback=$('.tv-launch-fallback');if(launchFallback)launchFallback.hidden=!!document.fullscreenElement;
  if(view==='clock') {setText('#tv-footer-status',online?'Live · Connected':remoteError?'Offline · Clock continues; changes not received':'Connecting…');setText('.tv-mode',online?'CLOUD CONNECTED':'CONNECTION INTERRUPTED');}
}
function beep(){try{const C=window.AudioContext||window.webkitAudioContext;const ctx=new C();const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=660;g.gain.value=.12;o.start();o.stop(ctx.currentTime+.35);o.onended=()=>ctx.close();}catch{}}
async function commit(action){if(busy)return false;const user=session?.user.id;busy=true;document.body.classList.add('saving');try{
    if(!session)throw new Error('Sign in before making changes.');
    if(!online)throw new Error('Reconnect before making changes. The clock will continue.');
    const next=execute(state,action,timeNow());
    {
      const {data,error}=await db.rpc('td_save_workspace',{p_expected_version:version,p_state:next});
      if(session?.user.id!==user)return false;
      if(error){if(error.message.includes('TD_CONFLICT')){await refresh(true);throw new Error('Another device changed the tournament. Review the latest information and try again.');}throw error;}
      const saved=Array.isArray(data)?data[0]:data;if(!saved?.state)throw new Error('Save response was incomplete. Refresh before retrying.');
      state=upgradeState(saved.state);version=Number(saved.version);lastSync=Date.now();online=true;
    }
    render();return true;
  }catch(error){toast(error.message||'Could not save. Please retry.',true);return false;}finally{busy=false;document.body.classList.remove('saving');tick();}}
async function synchronizeTime(){if(!session)return;const user=session.user.id,before=performance.now();const {data,error}=await db.rpc('td_server_time');if(!error&&session?.user.id===user)serverSample={epoch:Date.parse(data),mono:(before+performance.now())/2};}
async function refresh(force=false){if(!session||(busy&&!force))return;const user=session.user.id;try{
    const {data,error}=await db.from('td_workspaces').select('state,version,updated_at').eq('owner_id',session.user.id).maybeSingle();if(session?.user.id!==user)return;if(error)throw error;
    let changed=false;if(data&&Number(data.version)>version){state=upgradeState(data.state);version=Number(data.version);changed=true;}
    const wasOffline=!online;online=true;remoteError='';lastSync=Date.now();
    if((changed||wasOffline)&&!dlg.open&&!editor&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))render();
  }catch(e){if(session?.user.id!==user)return;const changed=online;online=false;remoteError=e.message||'Could not reach Supabase.';if(changed&&!dlg.open&&!editor)render();}}
function markBrowserImported(){legacyPending=false;legacyError='';try{localStorage.setItem(migrationKey,session.user.id);}catch{}}
async function saveInitialWorkspace(){
  if(!session||!online||version!==0)return;
  const user=session.user.id;busy=true;
  try{
    const {data,error}=await db.rpc('td_save_workspace',{p_expected_version:0,p_state:legacyPending?legacy:state});
    if(session?.user.id!==user)return;if(error)throw error;const saved=Array.isArray(data)?data[0]:data;if(!saved?.state)throw new Error('Save response was incomplete.');
    state=upgradeState(saved.state);version=Number(saved.version);if(legacyPending){markBrowserImported();toast('Your saved players and tournaments are now saved online.');}
  }catch(error){if(error.message.includes('TD_CONFLICT'))await refresh(true);else{online=false;remoteError='Could not save your starting data. Retry the connection; your browser copy is kept.';}}
  finally{busy=false;render();}
}
async function importBrowserData(){
  if(!legacyPending||!session||!online||busy)return;busy=true;const user=session.user.id;
  try{
    const next=version===0?legacy:mergeBrowserWorkspace(state,legacy);
    const {data,error}=await db.rpc('td_save_workspace',{p_expected_version:version,p_state:next});
    if(session?.user.id!==user)return;if(error)throw error;const saved=Array.isArray(data)?data[0]:data;if(!saved?.state)throw new Error('Save response was incomplete.');
    state=upgradeState(saved.state);version=Number(saved.version);markBrowserImported();toast('Saved players and tournaments brought into your account.');
  }catch(error){if(error.message.includes('TD_CONFLICT')){await refresh(true);legacyError='Another device saved a change. Review your account and try bringing over the saved data again.';}else legacyError=error.message||'Could not bring over saved data. The browser copy is kept.';}
  finally{busy=false;render();}
}
async function enterCloud(){
  const user=session?.user.id;if(!user)return;if(channel){await db.removeChannel(channel);channel=null;}
  version=0;state=initialState();serverSample=null;online=false;remoteError='Opening your saved tournaments…';render();await synchronizeTime();if(session?.user.id!==user)return;await refresh();if(session?.user.id!==user)return;
  if(online&&version===0)await saveInitialWorkspace();if(session?.user.id!==user)return;
  channel=db.channel('workspace-'+user).on('postgres_changes',{event:'*',schema:'public',table:'td_workspaces',filter:'owner_id=eq.'+user},()=>refresh()).subscribe();render();
}
function acceptSession(next){
  authReady=true;authError='';const user=next?.user?.id||'';session=next;
  if(user===connectedUser){if(!user)render();return;}
  connectedUser=user;
  if(!user){const previous=channel;channel=null;if(previous)void db.removeChannel(previous);state=initialState();version=0;online=false;editor=null;serverSample=null;if(dlg.open)dlg.close();render();return;}
  return enterCloud();
}
function modal(title,body){dlg.removeAttribute('aria-labelledby');dlg.removeAttribute('aria-describedby');dlg.innerHTML=`<div class="modal-heading"><h2>${title}</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="Close dialog">×</button></div>${body}`;if(!dlg.open)dlg.showModal();}
function eliminationDialog(entryId){
  const t=current(),entry=t?.entries.find(e=>e.id===entryId&&!e.eliminatedAt),place=t?active(t).length:0;
  if(!entry||t.status==='completed')throw new Error('Choose an active player to eliminate.');
  if(place<=1)throw new Error('Use Finish Tournament to confirm the winner.');
  modal('Confirm Elimination',`<form id="elimination-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="tournamentId" value="${t.id}"><input type="hidden" name="entryId" value="${entry.id}"><input type="hidden" name="place" value="${place}"><p id="elimination-question">Eliminate <strong>${esc(pName(entry))}</strong> in <strong>${ordinal(place)} place</strong>?</p><p id="elimination-feedback" role="status"></p><div class="button-row"><button type="button" class="button secondary" data-action="close-modal" autofocus>Cancel</button><button type="submit" class="button danger">Confirm Elimination</button></div></form>`);
  dlg.setAttribute('aria-labelledby','elimination-title');dlg.querySelector('h2').id='elimination-title';dlg.setAttribute('aria-describedby','elimination-question');
}
function clearDeviceCopyDialog(){
  if(!session||!online||version<1||busy)throw new Error('Wait for your online account data to load before clearing the old device copy.');
  modal('Clear Old Device Copy',`<form id="clear-device-copy-form"><input type="hidden" name="userId" value="${esc(session.user.id)}"><p>Remove the old saved copy from this device?</p><p>Your current players, tournaments, structures and history in Supabase will stay intact. You will remain signed in.</p><p id="clear-device-copy-feedback" role="status"></p><div class="button-row"><button type="button" class="button secondary" data-action="close-modal" autofocus>Cancel</button><button type="submit" class="button danger">Clear Old Device Copy</button></div></form>`);
}
function showAccount(){if(!session){render();return;}modal('Your Uno Club account',`<div class="account-status"><strong>${esc(session.user.email)}</strong><p>Players, tournament structures and results save to your account. Sign in with this same account on your phone and computer.</p><button class="button secondary" data-action="signout">Sign out</button></div>`);}
function newTournament(templateId){modal('Create a tournament',`<form id="new-tournament-form"><label>Tournament name<input name="name" placeholder="Wednesday tournament" required maxlength="120"></label><label>Tournament date<input type="date" name="date" value="${today()}" required></label><label>Saved structure<select name="templateId">${state.templates.map(s=>`<option value="${s.id}" ${s.id===templateId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><p class="muted">This creates an independent copy. You can change its settings without changing the saved structure.</p><button class="button primary full">Create tournament</button></form>`);}
function newPlayer(){modal('Add a player',`<form id="player-form"><label>Player name<input name="name" value="${esc(view==='signup'?signupSearch:'')}" maxlength="100" placeholder="Name or nickname" autocomplete="off" required></label><p class="name-feedback" id="player-name-feedback" role="status"></p><label>Phone number (optional)<input type="tel" name="phone" maxlength="40" autocomplete="tel" data-phone="true" pattern="([0-9]{10}|[0-9]{3}-[0-9]{3}-[0-9]{4})" placeholder="###-###-####" title="Enter exactly 10 digits, such as 555-123-4567."></label><label>Notes (optional)<textarea name="notes" maxlength="1000"></textarea></label><button class="button primary full">Save player</button></form>`);}
function appearanceDialog(){
  if(editor)captureEditor();
  const t=current(),appearance=clockAppearance(t?.clockAppearance||state.clockAppearanceDefaults);
  const colors=[['background','Clock background'],['timer','Countdown solid color'],['minutes','Minutes color'],['seconds','Seconds color'],['gradientStart','Gradient start'],['gradientEnd','Gradient end'],['stripe1','Stripe color 1'],['stripe2','Stripe color 2'],['stripe3','Stripe color 3'],['currentBlinds','Current blinds'],['nextBlinds','Next blinds'],['level','Level text'],['text','Other clock text']];
  modal('Clock Appearance',`<form id="clock-appearance-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="tournamentId" value="${t?.id||''}"><label>Preset<select name="preset"><option value="custom">Custom colors</option><option value="original">Original Uno Club</option><option value="contrast">High Contrast</option><option value="blue">Blue</option><option value="green">Green</option></select></label><label>Countdown style<select name="timerStyle">${[['solid','Solid Color'],['separate','Separate Colors'],['gradient','Color Gradient'],['stripes','Multicolor Stripes']].map(([v,label])=>`<option value="${v}" ${appearance.timerStyle===v?'selected':''}>${label}</option>`).join('')}</select></label><div class="clock-appearance-preview clock-styled" aria-label="Clock appearance preview"><span class="preview-level">ROUND 1</span><strong class="preview-countdown" data-countdown><span class="timer-minutes">15</span><span class="timer-colon">:</span><span class="timer-seconds">00</span></strong><strong class="preview-current">100 / 200</strong><span class="preview-next">Next blinds: 200 / 400</span><small class="preview-other">Time remaining · Players remaining</small></div><div class="clock-color-grid">${colors.map(([key,label])=>`<label data-color-field="${key}">${label}<input type="color" name="${key}" value="${appearance[key]}"></label>`).join('')}</div><div class="button-row"><button type="button" class="button secondary small" data-action="restore-clock-appearance">Restore Original</button><button type="button" class="button secondary small" data-action="use-clock-defaults">Use Preferred Defaults</button></div><div class="button-row"><button class="button primary" name="appearanceAction" value="tournament" ${!t?'disabled':''}>Save for This Tournament</button><button class="button secondary" name="appearanceAction" value="defaults">Save Preferred Defaults</button></div><p class="muted small-copy">Preferred defaults apply to new tournaments. Clock colors apply only to the TV display.</p></form>`);refreshAppearancePreview();
}
function readAppearance(form){const values=Object.fromEntries(Object.keys(ORIGINAL_CLOCK_APPEARANCE).map(key=>[key,form.elements[key].value]));return clockAppearance(values);}
function fillAppearance(form,value){const appearance=clockAppearance(value);for(const [key,val] of Object.entries(appearance))form.elements[key].value=val;form.elements.preset.value='custom';refreshAppearancePreview();}
function refreshAppearancePreview(){const form=$('#clock-appearance-form');if(!form)return;const value=readAppearance(form);applyClockAppearance(form.querySelector('.clock-appearance-preview'),value);for(const field of form.querySelectorAll('[data-color-field]')){const key=field.dataset.colorField;field.hidden=['timer','minutes','seconds','gradientStart','gradientEnd','stripe1','stripe2','stripe3'].includes(key)&&!(value.timerStyle==='solid'&&key==='timer'||value.timerStyle==='separate'&&['minutes','seconds'].includes(key)||value.timerStyle==='gradient'&&key.startsWith('gradient')||value.timerStyle==='stripes'&&key.startsWith('stripe'));}}
function editTemplate(templateId,copy=false){const value=clone(state.templates.find(t=>t.id===templateId));if(copy){value.id=id();value.name+=' — copy';}editor={value,isNew:copy,event:false,version};view='setup';render();}
function captureEditor(){const form=$('#structure-form');if(!form)return;editor.value.name=form.elements.structureName.value;editor.value.settings=readPayout(form,readSettings(form,editor.value.settings));if(form.querySelector('[data-level]'))editor.value.levels=readLevels(form);}
function paymentDialog(entryId){const t=current(),e=t.entries.find(e=>e.id===entryId);modal('Record add-on',`<form id="payment-form"><input type="hidden" name="entryId" value="${entryId}"><p><strong>${esc(pName(e))}</strong></p><p>${money(t.settings.addonAmount)} · ${num(t.settings.addonChips)} chips</p><button class="button primary full">Record add-on</button></form>`);}
function rebuyCountDialog(){const t=current(),c=clockAt(t,timeNow());if(!canRecordRebuys(t,c)){toast(rebuyCountHelp(t,c),true);return;}modal('Tournament rebuys',`<form id="rebuy-count-form"><input type="hidden" name="tournamentId" value="${t.id}"><label for="rebuy-count">How many rebuys are there?</label><div class="rebuy-stepper"><button type="button" class="button secondary" data-rebuy-step="-1" aria-label="Decrease rebuys">−</button><input id="rebuy-count" name="count" type="number" inputmode="numeric" min="0" max="9007199254740991" step="1" value="${t.rebuyCount||0}" required><button type="button" class="button secondary" data-rebuy-step="1" aria-label="Increase rebuys">+</button></div><p class="muted">Enter the tournament total. Saving replaces the previous count.</p><button class="button primary full">Save rebuy total</button></form>`);}
function icmRows(){return [...$('#icm-form').querySelectorAll('[data-icm-entry]')].map(row=>{
  const chips=row.querySelector('[data-icm-chips]').value.replace(/,/g,''),amount=row.querySelector('[data-icm-payout]').value.replace(/,/g,'');
  if(!/^\d+$/.test(chips))throw new Error('Enter a positive whole chip count for every player.');
  return {entryId:row.dataset.icmEntry,chips:Number(chips),payout:/^\d+$/.test(amount)?Number(amount)*100:NaN};
});}
function checkIcmContext(context){if(!session||!online)throw new Error('Reconnect before accepting an ICM chop.');if(context.version!==version||context.tournamentId!==selected)throw new Error('Tournament changed. Close the ICM dialog and calculate again.');}
function icmDialog(){
  if(!online||busy)throw new Error('Reconnect and wait for the current save before opening an ICM chop.');
  const t=current();icmReview=null;
  modal('ICM Chop',`<form id="icm-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="tournamentId" value="${selected}"><p>Enter the final chip count for every remaining player. Calculate the ICM payouts, then adjust whole-dollar amounts if players agree.</p><div class="icm-player-list">${active(t).map(e=>`<div class="icm-player" data-icm-entry="${e.id}"><strong>${esc(pName(e))}</strong><label>Final chips<input type="text" inputmode="numeric" data-chips="true" data-icm-chips value="" autocomplete="off" required></label><label>Agreed payout ($)<input type="text" inputmode="numeric" data-money="true" data-icm-payout disabled></label></div>`).join('')}</div><p id="icm-feedback" class="muted" role="status">Payouts for previously eliminated players stay unchanged.</p><button type="button" class="button secondary" data-action="icm-calculate">Calculate ICM</button><p class="muted">Accepting saves the agreed payouts and chip counts, ends the tournament, and stops the clock. No points or finish rankings are assigned to chop participants.</p><button class="button primary full" id="icm-accept" disabled>Accept ICM Chop & End Tournament</button></form>`);
}
function calculateIcm(){
  const form=$('#icm-form'),context={version:Number(form.elements.version.value),tournamentId:form.elements.tournamentId.value};checkIcmContext(context);
  const proposal=icmProposal(current(),icmRows());icmReview={...context,proposal};
  for(const result of proposal.participants){const row=[...form.querySelectorAll('[data-icm-entry]')].find(row=>row.dataset.icmEntry===result.entryId),input=row.querySelector('[data-icm-payout]');input.disabled=false;input.value=num(result.payout/100);input.required=true;}
  updateIcmReview();
}
function updateIcmReview(target){
  if(target?.hasAttribute('data-icm-chips')){icmReview=null;$('#icm-accept').disabled=true;setText('#icm-feedback','Chip counts changed. Calculate ICM again before accepting.');return;}
  if(!icmReview)return;
  try{checkIcmContext(icmReview);const rows=icmRows();if(!rows.every(v=>Number.isSafeInteger(v.payout)&&v.payout>=0))throw new Error('Enter every agreed payout as whole dollars.');const total=rows.reduce((n,v)=>n+v.payout,0),pool=icmReview.proposal.chopPool;$('#icm-accept').disabled=total!==pool;setText('#icm-feedback',`Agreed payouts: ${money(total)} / ${money(pool)} available for the chop.${icmReview.proposal.reservedPayouts.length?' Earlier-place payouts remain reserved.':''}${total!==pool?' Adjust the amounts so the total matches exactly.':''}`);}catch(error){$('#icm-accept').disabled=true;setText('#icm-feedback',error.message);}
}
function seatSource(entryId){
  if(!movePlayersEnabled)throw new Error('Turn on Move Players before moving a player.');
  if(!session||!online)throw new Error('Reconnect before moving players.');
  if(busy)throw new Error('Wait for the current change to finish.');
  if(renderedWorkspaceVersion!==version){render();throw new Error('Seating changed. Review the updated seats and choose the player again.');}
  const t=current(),e=t?.entries.find(e=>e.id===entryId&&!e.eliminatedAt);
  if(!t||!e||t.status==='completed')throw new Error('Only remaining players in an open tournament can be moved.');
  if(e.seatLocked)throw new Error(`Unlock the player at Table ${e.table}, Seat ${e.seat} first.`);
  return {entryId,tournamentId:t.id,version,fromTable:e.table??null,fromSeat:e.seat??null};
}
function checkSeatSource(source){
  if(!movePlayersEnabled)throw new Error('Turn on Move Players before moving a player.');
  const t=current(),entry=t?.entries.find(e=>e.id===source.entryId);
  if(source.version!==version||t?.id!==source.tournamentId||!entry||entry.eliminatedAt||(entry.table??null)!==source.fromTable||(entry.seat??null)!==source.fromSeat)throw new Error('Seating changed. Cancel this move, review the seats, and choose again.');
  return t;
}
function clearSeatPick(){
  pickedSeat=null;document.querySelectorAll('.seat-player-grip[aria-pressed="true"]').forEach(el=>el.setAttribute('aria-pressed','false'));
  setText('#seat-move-instructions','Drag a player to another seat, or select a player and then a seat.');const cancel=$('#cancel-seat-pick');if(cancel)cancel.hidden=true;
}
function chooseSeatPlayer(entryId){
  if(pickedSeat?.entryId===entryId){clearSeatPick();return;}
  clearSeatPick();pickedSeat=seatSource(entryId);
  document.querySelectorAll('[data-seat-grab]').forEach(el=>{if(el.dataset.seatGrab===entryId)el.setAttribute('aria-pressed','true');});
  setText('#seat-move-instructions',`Choose a destination seat for ${pName(current().entries.find(e=>e.id===entryId))}.`);$('#cancel-seat-pick').hidden=false;
}
async function saveSeatMove(source,table,seat,mode){
  try{
    const t=checkSeatSource(source);planSeatMove(t,{entryId:source.entryId,table,seat,mode});
    if(await commit({type:'seat-move',tournamentId:source.tournamentId,entryId:source.entryId,table,seat,mode})){
      seatMoveChoice=null;if(dlg.open)dlg.close();toast(`Seating updated: Table ${table}, Seat ${seat}.`);
      document.querySelectorAll('[data-seat-grab]').forEach(el=>{if(el.dataset.seatGrab===source.entryId)el.focus({preventScroll:true});});return true;
    }
  }catch(error){toast(error.message,true);}return false;
}
async function requestSeatMove(source,table,seat){
  clearSeatPick();
  try{
    const t=checkSeatSource(source),entry=t.entries.find(e=>e.id===source.entryId);
    if(source.fromTable===table&&source.fromSeat===seat){if(dlg.open)dlg.close();return;}
    // Validate the destination even if it currently looks empty.
    const occupant=active(t).find(e=>e.id!==source.entryId&&e.table===table&&e.seat===seat);
    if(!occupant){await saveSeatMove(source,table,seat,'move');return;}
    let slide=[],slideError='',swapError='';
    try{slide=planSeatMove(t,{entryId:source.entryId,table,seat,mode:'slide'});}catch(error){slideError=error.message;}
    try{planSeatMove(t,{entryId:source.entryId,table,seat,mode:'swap'});}catch(error){swapError=error.message;}
    seatMoveChoice={source,table,seat};
    const changes=slide.filter(update=>update.entryId!==source.entryId);
    modal('Move '+esc(pName(entry)),`<p>Destination: <strong>Table ${table}, Seat ${seat}</strong>, currently occupied by <strong>${esc(pName(occupant))}</strong>.</p><div class="seat-move-choices"><button type="button" class="button primary" data-seat-move-mode="swap" ${swapError?'disabled':''}>Swap players</button><p class="muted">${swapError?esc(swapError):`${esc(pName(occupant))} moves to Table ${source.fromTable}, Seat ${source.fromSeat}.`}</p><button type="button" class="button secondary" data-seat-move-mode="slide" ${slideError?'disabled':''}>Slide players down</button>${slideError?`<p class="seat-move-error" role="status">${esc(slideError)}</p>`:`<p class="muted">${changes.length} ${changes.length===1?'player moves':'players move'} down one seat, stopping at the first empty seat.</p><details class="seat-slide-preview"><summary>Preview seat changes</summary><ul>${changes.map(update=>{const moved=t.entries.find(e=>e.id===update.entryId);return `<li>${esc(pName(moved))}: Seat ${moved.seat} → ${update.seat}</li>`;}).join('')}</ul></details>`}<button type="button" class="button secondary" data-action="close-modal">Cancel</button></div>`);
  }catch(error){toast(error.message,true);}
}
function seatDialog(entryId){const source=seatSource(entryId),t=current(),e=t.entries.find(e=>e.id===entryId);clearSeatPick();modal('Seat '+esc(pName(e)),`<form id="seat-form"><input type="hidden" name="entryId" value="${entryId}"><input type="hidden" name="tournamentId" value="${source.tournamentId}"><input type="hidden" name="version" value="${source.version}"><input type="hidden" name="fromTable" value="${source.fromTable??''}"><input type="hidden" name="fromSeat" value="${source.fromSeat??''}"><label>Seat<select name="seat"><option value="unseated">Unseated</option>${Array.from({length:tablesInUse(t)},(_,i)=>Array.from({length:t.settings.seatsPerTable},(_,j)=>{const occupied=active(t).find(v=>v.id!==e.id&&v.table===i+1&&v.seat===j+1);return `<option value="${i+1}/${j+1}" ${e.table===i+1&&e.seat===j+1?'selected':''}>Table ${i+1}, Seat ${j+1}${occupied?' · '+esc(pName(occupied)):''}</option>`;}).join('')).join('')}</select></label><p class="muted">An occupied seat offers swapping or sliding before anything is changed.</p><button class="button primary full">Move player</button></form>`);}

function seatingContext(){
  if(!session||!online)throw new Error('Reconnect before changing seats.');
  if(busy)throw new Error('Wait for the current change to finish.');
  if(renderedWorkspaceVersion!==version){render();throw new Error('Seating changed. Review the updated seats and choose again.');}
  return {tournamentId:selected,version};
}
function checkSeatingContext(context){
  if(context.version!==version||context.tournamentId!==selected)throw new Error('Seating changed. Close this dialog, review the seats, and choose again.');
}
function randomSeatOrder(t){
  const order=active(t).map(e=>e.id);
  for(let i=order.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[order[i],order[j]]=[order[j],order[i]];}
  return order;
}
function combineTablesDialog(){
  const context=seatingContext(),t=current(),count=tablesRequired(t),reducing=tablesInUse(t)>count,label=tableActionName(t),finalTable=reducing&&count===1;
  try{planTableSeating(t,{mode:'combine'});}catch(error){modal(reducing?'Cannot combine tables':'Cannot balance tables',`<p class="seat-move-error" role="alert">${esc(error.message)}</p><p>Unlock the indicated player, then try ${label} again. No seats have changed.</p><button class="button secondary" data-action="close-modal">Close</button>`);return;}
  tableCombineChoice=context;
  const buttons=finalTable?'<button class="button primary" data-combine-mode="combine">Keep existing seats</button><button class="button secondary" data-combine-mode="redraw">Redraw all seats</button>':`<button class="button primary" data-combine-mode="combine">${label}</button>`;
  const detail=finalTable?'The final table will be Table 1. Keep its existing seats and fill empty seats, or redraw everyone except its locked players.':reducing?`Keep Tables 1–${count} open and close the extra tables. Distribute remaining players evenly into available seats. Table 1 receives the extra player when the total is odd.`:'Keep the current tables open and distribute players evenly into available seats. Table 1 receives the extra player when the total is odd.';
  modal(finalTable?'Form the final table':label,`<p>${detail}</p><p class="muted">Locked players keep their exact table and seat.</p><div class="button-row">${buttons}<button class="button secondary" data-action="close-modal">Cancel</button></div>`);
}

async function tryTvFullscreen(feedback=true){const result=await tvWindow.fullscreen({automatic:!feedback});const fallback=$('.tv-launch-fallback');if(fallback)fallback.hidden=!!document.fullscreenElement;if(feedback&&!result.ok)toast(result.reason||'Use the TV window’s Full Screen button.',true);return result;}
function openClock(){const target=view==='home'?(homeTournament()||current()):current();if(target&&target.id!==selected){selected=target.id;localStorage.setItem('uno-tournament-selected',selected);}if(!target){toast('Choose or create a tournament first.',true);return;}const url=`${APP_ROOT}?view=clock&tournament=${encodeURIComponent(selected)}`;const win=tvWindow.open(url,'uno-clock-'+selected);if(!win)toast('Allow pop-ups for this site to open the clock window.',true);else win.focus();}

document.addEventListener('click',async event=>{const el=event.target.closest('button,a[data-go]');if(!el||el.disabled)return;try{
  if(!session&&el.dataset.action!=='account'&&el.dataset.action!=='close-modal')return;
  if(el.dataset.go){event.preventDefault();go(el.dataset.go);return;}
  if(el.dataset.registrationPanel){registrationPanel=el.dataset.registrationPanel;$('.signup-layout').dataset.panel=registrationPanel;for(const button of document.querySelectorAll('[data-registration-panel]'))button.setAttribute('aria-pressed',String(button.dataset.registrationPanel===registrationPanel));return;}
  if(el.dataset.resume){chooseTournament(el.dataset.resume);go('signup');return;}
  if(el.dataset.select){chooseTournament(el.dataset.select);return;}
  if(el.dataset.tab){tab=el.dataset.tab;render();$(`[data-tab="${tab}"]`)?.focus({preventScroll:true});return;}
  if(el.dataset.profilePanel){profilePanel=el.dataset.profilePanel;$('.player-profile-panels').dataset.panel=profilePanel;for(const button of document.querySelectorAll('[data-profile-panel]'))button.setAttribute('aria-pressed',String(button.dataset.profilePanel===profilePanel));return;}
  if(el.dataset.player){playerDetail=el.dataset.player;profilePanel='details';render();return;}
  if(el.dataset.createTemplate){newTournament(el.dataset.createTemplate);return;}
  if(el.dataset.editTemplate){editTemplate(el.dataset.editTemplate);return;}
  if(el.dataset.copyTemplate){editTemplate(el.dataset.copyTemplate,true);return;}
  if(el.dataset.deleteTemplate){if(confirm('Delete this saved structure? Existing tournaments keep their copies.'))await commit({type:'template-delete',id:el.dataset.deleteTemplate});return;}
  if(el.dataset.register){if(await commit({type:'register',tournamentId:selected,playerId:el.dataset.register})){signupSearch='';render();toast('Player registered.');}return;}
  if(el.dataset.addon){paymentDialog(el.dataset.addon);return;}
  if(el.dataset.tvDisplay){if(await commit({type:'tv-display',tournamentId:selected,mode:el.dataset.tvDisplay}))toast('TV display updated.');return;}
  if(el.dataset.payoutStep){const form=el.closest('form'),input=form.elements.paidPlaces;if(input.disabled)return;input.value=String(Math.max(1,Math.min(20,(Number(input.value)||1)+Number(el.dataset.payoutStep))));refreshPayoutPreview(form);return;}
  if(el.dataset.rebuyStep){const input=$('#rebuy-count'),value=Number(input.value);input.value=String(Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,(Number.isSafeInteger(value)?value:0)+Number(el.dataset.rebuyStep))));return;}
  if(el.dataset.undoElimination){const t=current(),e=t.entries.find(e=>e.id===el.dataset.undoElimination),seat=e.eliminationSeat||t.eliminationUndo.find(v=>v.entryId===e.id);if(confirm(`Are you sure you want to undo the elimination of ${pName(e)}? ${seat?.table?'Restore Table '+seat.table+', Seat '+seat.seat+'.':seat?'Restore as an active, unseated player.':'The original seat was not recorded for this older elimination. Restore as unseated?'}`))await commit({type:'undo-elimination',tournamentId:selected,entryId:e.id,allowUnseated:!seat});return;}
  if(el.dataset.eliminate){eliminationDialog(el.dataset.eliminate);return;}
  if(el.dataset.archive){await commit({type:'player-archive',id:el.dataset.archive});return;}
  if(el.dataset.seatLock){
    const context=seatingContext(),entry=current().entries.find(e=>e.id===el.dataset.seatLock);checkSeatingContext(context);
    await commit({type:'seat-lock',tournamentId:context.tournamentId,entryId:entry.id,locked:!entry.seatLocked});return;
  }
  if(el.dataset.combineMode){
    if(dlg.open&&tableCombineChoice){const context=tableCombineChoice,label=tableActionName(current());checkSeatingContext(context);
      if(await commit({type:'combine-tables',tournamentId:context.tournamentId,mode:el.dataset.combineMode,order:el.dataset.combineMode==='redraw'?randomSeatOrder(current()):[]})){tableCombineChoice=null;dlg.close();toast(label==='Combine Tables'?'Tables combined.':'Tables balanced.');}
    }return;
  }
  if(el.dataset.seatMoveMode){if(dlg.open&&seatMoveChoice){const {source,table,seat}=seatMoveChoice;await saveSeatMove(source,table,seat,el.dataset.seatMoveMode);}return;}
  if(el.dataset.seatGrab||el.dataset.seatTargetButton){
    if(!movePlayersEnabled||seatDragging?.shouldSuppressClick())return;
    const target=el.closest('[data-seat-target]');
    if(pickedSeat&&pickedSeat.entryId!==el.dataset.seatGrab){const source=pickedSeat;await requestSeatMove(source,Number(target.dataset.table),Number(target.dataset.seat));}
    else if(el.dataset.seatGrab)chooseSeatPlayer(el.dataset.seatGrab);
    else toast('Select a player first, then choose the destination seat.');return;
  }
  if(el.dataset.seat){seatDialog(el.dataset.seat);return;}
  if(el.dataset.clock){if(['next','previous'].includes(el.dataset.clock)&&!confirm('Change the current level and reset its countdown?'))return;await commit({type:'clock',tournamentId:selected,command:el.dataset.clock});return;}
  if(el.dataset.adjust){await commit({type:'clock',tournamentId:selected,command:'adjust',seconds:Number(el.dataset.adjust)});return;}
  if(el.dataset.levelDelete!==undefined||el.dataset.levelUp!==undefined||el.dataset.levelDown!==undefined){captureEditor();const l=editor.value.levels;if(el.dataset.levelDelete!==undefined)l.splice(Number(el.dataset.levelDelete),1);else{const i=Number(el.dataset.levelUp??el.dataset.levelDown),j=i+(el.dataset.levelUp!==undefined?-1:1);if(j>=0&&j<l.length)[l[i],l[j]]=[l[j],l[i]];}render();return;}
  switch(el.dataset.action){
    case 'toggle-move-players':{
      if(!movePlayersEnabled){seatingContext();if(current()?.status==='completed')break;}
      movePlayersEnabled=!movePlayersEnabled;movePlayersTournament=selected;
      if(!movePlayersEnabled){if(dlg.open&&(seatMoveChoice||$('#seat-form')))dlg.close();seatMoveChoice=null;}
      render();$('[data-action=toggle-move-players]')?.focus({preventScroll:true});break;
    }
    case 'icm-chop':icmDialog();break;
    case 'icm-calculate':calculateIcm();break;
    case 'rebuy-count':rebuyCountDialog();break;
    case 'cancel-seat-pick':clearSeatPick();break;case 'account':showAccount();break;case 'close-modal':seatMoveChoice=null;tableCombineChoice=null;dlg.close();break;case 'new-tournament':newTournament();break;case 'add-player':newPlayer();break;
    case 'players-back':playerDetail=null;render();break;case 'open-clock':openClock();break;case 'refresh':await refresh();if(online&&version===0)await saveInitialWorkspace();break;
    case 'import-browser':await importBrowserData();break;case 'clear-device-copy':clearDeviceCopyDialog();break;
    case 'signout':{const {error}=await db.auth.signOut();if(error)throw error;acceptSession(null);break;}
    case 'new-structure':{const value=sampleTemplate();value.name='New tournament structure';editor={value,isNew:true,event:false,version};view='setup';render();break;}
    case 'event-settings':{const t=current();editor={event:true,version,value:{id:t.id,name:t.name,settings:clone(t.settings),levels:clone(t.levels)}};view='setup';render();break;}
    case 'close-editor':editor=null;render();break;
    case 'copy-game':{const game=$('#all-levels-game').value.trim();if(!game){toast('Enter a game name to copy.',true);break;}for(const row of $('#structure-form').querySelectorAll('[data-level]')){if(row.querySelector('[name=kind]').value==='play')row.querySelector('[name=game]').value=game;}captureEditor();toast('Game copied to all playing levels. Save the structure to keep it.');break;}
    case 'add-level':case 'add-break':captureEditor();editor.value.levels.push({kind:el.dataset.action==='add-break'?'break':'play',minutes:el.dataset.action==='add-break'?10:15,sb:0,bb:0,ante:0,game:el.dataset.action==='add-break'?'':(editor.value.levels.slice().reverse().find(l=>l.kind==='play')?.game||''),chipUp:false});render();break;
    case 'recalculate-payouts':recalculatePayouts();break;case 'clock-appearance':appearanceDialog();break;case 'restore-clock-appearance':fillAppearance($('#clock-appearance-form'),ORIGINAL_CLOCK_APPEARANCE);break;case 'use-clock-defaults':fillAppearance($('#clock-appearance-form'),state.clockAppearanceDefaults);break;
    case 'seat-remaining':{const context=seatingContext();await commit({type:'seat-remaining',tournamentId:context.tournamentId,order:randomSeatOrder(current())});break;}
    case 'combine-tables':combineTablesDialog();break;
    case 'finish':if(confirm('Confirm the winner and finish? This locks the tournament results.'))await commit({type:'finish',tournamentId:selected});break;
    case 'tv-fullscreen':await tryTvFullscreen();break;case 'fullscreen':if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Use your browser’s full-screen option.');break;
    case 'sound':sound=!sound;if(sound)beep();render();break;

  }
}catch(e){toast(e.message||'Something went wrong.',true);}});
function formatDollarInput(input){
  const value=input.value,start=input.selectionStart??value.length;if(/[^0-9,]/.test(value)){input.setCustomValidity('Enter monetary amounts as whole dollars.');return;}
  const digits=value.replace(/,/g,''),amount=Number(digits);input.setCustomValidity(digits&&Number.isSafeInteger(amount)?'':'Enter monetary amounts as whole dollars.');if(!digits)return;
  const formatted=num(amount),digitsBefore=value.slice(0,start).replace(/,/g,'').length;let seen=0,position=formatted.length;for(let i=0;i<formatted.length;i++)if(/\d/.test(formatted[i])&&++seen===digitsBefore){position=i+1;break;}
  input.value=formatted;if(input.type==='text')input.setSelectionRange(position,position);
}
function formatChipInput(input){
  const value=input.value,start=input.selectionStart??value.length,end=input.selectionEnd??start;
  if(/[^0-9,]/.test(value)){input.setCustomValidity('Enter a whole number of chips.');return;}
  const digits=value.replace(/,/g,''),normalized=digits.replace(/^0+(?=\d)/,'');
  const formatted=normalized.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  input.setCustomValidity(digits&&Number.isSafeInteger(Number(digits))&&Number(digits)>0?'':'Enter a whole number of chips greater than zero.');
  if(value===formatted)return;
  const removed=digits.length-normalized.length;
  const position=offset=>{const target=Math.max(0,value.slice(0,offset).replace(/\D/g,'').length-removed);if(!target)return 0;let seen=0;for(let i=0;i<formatted.length;i++){if(/\d/.test(formatted[i])&&++seen===target)return i+1;}return formatted.length;};
  input.value=formatted;input.setSelectionRange(position(start),position(end));
}
function formatPhoneInput(input){
  const value=input.value,start=input.selectionStart,end=input.selectionEnd;
  if(/^[0-9]{10}$/.test(value)){
    const caret=offset=>offset+(offset>3?1:0)+(offset>6?1:0);
    input.value=normalizePhone(value);if(start!=null&&end!=null)input.setSelectionRange(caret(start),caret(end));
  }
  try{normalizePhone(input.value);input.setCustomValidity('');}catch(error){input.setCustomValidity(error.message);}
}
document.addEventListener('input',event=>{if(event.target.dataset.money)formatDollarInput(event.target);if(event.target.form?.id==='clock-appearance-form')refreshAppearancePreview();if(event.target.form?.querySelector('#payout-place-list')){if(event.target.form.id==='payout-form'&&tournamentStarted(current())&&event.target.hasAttribute('data-payout-value')){event.target.form.dataset.customDraft='true';event.target.form.dataset.recalculate='false';}refreshPayoutPreview(event.target.form);}if(event.target.closest('[data-icm-entry]'))updateIcmReview(event.target);if(event.target.dataset.phone)formatPhoneInput(event.target);if(event.target.dataset.chips)formatChipInput(event.target);if(event.target.form?.id==='player-form'&&event.target.name==='name'){const form=event.target.form,match=state.players.find(p=>p.id!==form.elements.id?.value&&normalizePlayerName(p.name)===normalizePlayerName(event.target.value));let feedback=form.querySelector('.name-feedback');if(!feedback){feedback=document.createElement('p');feedback.className='name-feedback';feedback.setAttribute('role','status');event.target.closest('label').append(feedback);}feedback.textContent=match?'That name already exists. Please choose a different name.':'';event.target.setCustomValidity(match?'That name already exists. Please choose a different name.':'');}if(['buyIn','dealerToke'].includes(event.target.name)&&$('#entry-split')){const form=event.target.form,buyIn=Math.round(dollarNumber(form.elements.buyIn.value)*100),toke=Math.round(dollarNumber(form.elements.dealerToke.value)*100);$('#entry-split').textContent=money(buyIn)+' total − '+money(toke)+' dealer toke = '+money(buyIn-toke)+' before the tournament fee.';}if(event.target.id==='player-search'){playerSearch=event.target.value;$('#player-results').scrollTop=0;$('#player-results').innerHTML=playerRows(state.players.filter(p=>(showArchived||!p.archived)&&(normalizePlayerName(p.name)+' '+playerNumberLabel(p)+' '+(p.phone||'')).includes(normalizePlayerName(playerSearch))).sort((a,b)=>a.name.localeCompare(b.name)));}if(event.target.id==='signup-search'){signupSearch=event.target.value;$('#signup-results').scrollTop=0;const t=current(),enrolled=new Set(t.entries.map(e=>e.playerId));$('#signup-results').innerHTML=registrationRows(state.players.filter(p=>!p.archived&&!enrolled.has(p.id)&&(normalizePlayerName(p.name)+' '+playerNumberLabel(p)).includes(normalizePlayerName(signupSearch))).sort((a,b)=>a.name.localeCompare(b.name)),t);}});
document.addEventListener('change',event=>{if(event.target.form?.id==='clock-appearance-form'){if(event.target.name==='preset'&&CLOCK_PRESETS[event.target.value])fillAppearance(event.target.form,CLOCK_PRESETS[event.target.value]);else refreshAppearancePreview();}if(event.target.name==='payoutMode')refreshPayoutPreview(event.target.form);if(event.target.id==='show-archived'){showArchived=event.target.checked;render();}});
document.addEventListener('submit',async event=>{event.preventDefault();const form=event.target,fd=new FormData(form);try{
  if(form.id==='auth-form'){
    const feedback=$('#auth-feedback');feedback.textContent='Connecting…';const method=event.submitter?.value==='signup'?'signUp':'signInWithPassword';
    const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
    try{const payload={email:String(fd.get('email')),password:String(fd.get('password'))};if(method==='signUp')payload.options={emailRedirectTo:location.origin+APP_ROOT};const {data,error}=await db.auth[method](payload);if(error)throw error;
      if(data.session){if(dlg.open)dlg.close();await acceptSession(data.session);toast('Signed in. Use this same account on your phone and computer.');}
      else feedback.textContent='Check your email to confirm the account, then return here and sign in.';
    }catch(e){feedback.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}return;
  }
  if(form.id==='clear-device-copy-form'){
    if(!dlg.open||busy)return;
    const feedback=form.querySelector('#clear-device-copy-feedback');
    if(!session||fd.get('userId')!==session.user.id||!online||version<1){feedback.textContent='Reconnect and load your online account before clearing the old device copy.';return;}
    try{localStorage.removeItem(legacyKey);}catch{feedback.textContent='Could not clear the old device copy. Check that this browser allows site storage, then try again.';return;}
    legacy=null;legacyPending=false;legacyError='';dlg.close();render();toast('Old device copy cleared. Your online account data is unchanged.');return;
  }
  if(form.id==='elimination-form'){
    if(busy||!dlg.open)return;
    const t=current(),entry=t?.entries.find(e=>e.id===fd.get('entryId')),feedback=form.querySelector('#elimination-feedback');
    if(Number(fd.get('version'))!==version||t?.id!==fd.get('tournamentId')||!entry||entry.eliminatedAt||t.status==='completed'||active(t).length!==Number(fd.get('place'))){feedback.textContent='Tournament changed. Cancel and select the player again to confirm the current finishing place.';return;}
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try{
      if(await commit({type:'eliminate',tournamentId:t.id,entryId:entry.id})){
        dlg.close();if(tableBalanceNeeded(current()))toast('Tables Need Balancing. Please move one player to balance the tables.');
      }else feedback.textContent=$('#toast').textContent||'Could not save the elimination. Please retry.';
    }finally{button.disabled=false;}return;
  }
  if(form.id==='player-form'){if(await commit({type:'player-save',id:fd.get('id')||id(),name:fd.get('name'),phone:fd.get('phone'),notes:fd.get('notes')})){if(dlg.open)dlg.close();toast('Player saved.');render();}return;}
  if(form.id==='new-tournament-form'){const eventId=id();if(await commit({type:'tournament-create',id:eventId,name:fd.get('name'),date:fd.get('date'),templateId:fd.get('templateId')})){dlg.close();chooseTournament(eventId);go('signup');toast('Tournament created.');}return;}
  if(form.id==='structure-form'){
    if(editor.version!==version)throw new Error('Data changed on another device. Reopen this editor before saving.');captureEditor();const saved=clone(editor);
    const action=saved.event?{type:'tournament-settings',tournamentId:saved.value.id,settings:saved.value.settings,...(form.querySelector('[data-level]')?{levels:saved.value.levels}:{})}:{type:'template-save',template:saved.value};
    if(await commit(action)){editor=null;render();toast(saved.event?'Tournament settings saved.':'Structure saved.');}return;
  }
  if(form.id==='clock-appearance-form'){
    if(Number(fd.get('version'))!==version)throw new Error('Data changed. Reopen Clock Appearance before saving.');const appearance=readAppearance(form),defaults=event.submitter?.value==='defaults';
    if(await commit(defaults?{type:'clock-appearance-defaults',appearance}:{type:'clock-appearance',tournamentId:fd.get('tournamentId'),appearance})){if(editor)editor.version=version;dlg.close();toast(defaults?'Preferred clock defaults saved.':'Tournament clock appearance saved.');}return;
  }
  if(form.id==='seating-settings-form'){if(await commit({type:'seating-settings',tournamentId:fd.get('tournamentId'),seatsPerTable:Number(fd.get('seatsPerTable'))})){toast('Seats per table updated.');}return;}
  if(form.id==='icm-form'){
    if(!icmReview)throw new Error('Calculate the ICM payouts before accepting.');checkIcmContext(icmReview);
    const participants=icmRows();for(const row of participants){const original=icmReview.proposal.participants.find(v=>v.entryId===row.entryId);if(!original||original.chips!==row.chips)throw new Error('Chip counts changed. Calculate ICM again.');}
    if(!confirm('Accept these agreed payouts and end the tournament by ICM chop?'))return;
    if(await commit({type:'icm-accept',tournamentId:icmReview.tournamentId,participants})){icmReview=null;dlg.close();toast('Tournament ended by ICM chop.');}return;
  }
  if(form.id==='payout-form'){
    const t=current();if(Number(fd.get('version'))!==version||fd.get('tournamentId')!==selected)throw new Error('Tournament changed. Reopen Payouts and review before saving.');
    let settings=readPayoutSettings(form,t),custom=tournamentStarted(t)&&(settings.payoutMode==='fixed'||form.dataset.customDraft==='true'&&form.dataset.recalculate!=='true');
    const changed=settings.payoutMode!==t.settings.payoutMode||JSON.stringify(settings.payouts)!==JSON.stringify(t.settings.payouts)||JSON.stringify(guaranteeSettings(settings))!==JSON.stringify(guaranteeSettings(t.settings));
    if(custom&&settings.payoutMode!=='fixed'){const draft={...t,settings};settings={...settings,payoutMode:'fixed',payouts:prizes(draft),houseContribution:financials(draft).houseContribution};}
    if(payoutBalance({...t,settings})!==0)throw new Error('Payouts must exactly match the prize pool.');
    if(tournamentStarted(t)&&(changed||custom!==!!t.payoutCustom)&&(!t.payoutCustom&&t.settings.payoutMode!=='fixed'||!custom)&&!confirm(`Replace the existing ${t.payoutCustom?'Custom':t.settings.payoutMode==='guaranteed'?'Guaranteed':'Automatic'} Payouts with ${custom?'Custom Payouts':settings.payoutMode==='guaranteed'?'the automatic guarantee':'automatic payouts'}? ${prizes({...t,settings}).map((n,i)=>placeName(i)+': '+money(n)).join('; ')}`))return;
    if(await commit({type:'payout-settings',tournamentId:selected,settings,custom})){toast('Payouts updated.');}return;
  }
  if(form.id==='rebuy-count-form'){const raw=String(fd.get('count')).trim();if(!/^\d+$/.test(raw))throw new Error('Enter a whole number of rebuys, zero or greater.');if(await commit({type:'rebuy-count',tournamentId:fd.get('tournamentId'),count:Number(raw)})){dlg.close();toast('Tournament rebuy total saved.');}return;}
  if(form.id==='payment-form'){if(await commit({type:'payment',tournamentId:selected,entryId:fd.get('entryId'),kind:'addon'})){dlg.close();toast('Add-on recorded.');}return;}
  if(form.id==='seat-form'){
    const source={entryId:fd.get('entryId'),tournamentId:fd.get('tournamentId'),version:Number(fd.get('version')),fromTable:fd.get('fromTable')===''?null:Number(fd.get('fromTable')),fromSeat:fd.get('fromSeat')===''?null:Number(fd.get('fromSeat'))};checkSeatSource(source);
    const value=fd.get('seat');if(value==='unseated'){if(await commit({type:'seat',tournamentId:source.tournamentId,entryId:source.entryId,table:null,seat:null})){dlg.close();toast('Player is now unseated.');}}
    else{const [table,seat]=value.split('/').map(Number);await requestSeatMove(source,table,seat);}return;
  }
}catch(e){toast(e.message,true);}});
window.addEventListener('popstate',()=>{view=new URLSearchParams(location.search).get('view')||'home';editor=null;render();});
window.addEventListener('online',()=>refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){synchronizeTimeIfSignedIn();refresh();tick();}});
function synchronizeTimeIfSignedIn(){if(session)synchronizeTime();}
setInterval(()=>refresh(),2500);setInterval(synchronizeTimeIfSignedIn,60000);
void tvWindow.prime();
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.opener&&event.data?.type==='uno-tv-fullscreen'&&view==='clock')void tryTvFullscreen(false);});
window.addEventListener('resize',()=>fitTvSeating());
document.addEventListener('fullscreenchange',()=>fitTvSeating());
clockToolbar=installClockToolbar();
seatDragging=installSeatDragging({getScrollBounds:()=>({top:Math.min(innerHeight,Math.max(0,$('.management-chrome')?.getBoundingClientRect().bottom||0)),bottom:innerHeight}),getSource:entryId=>!movePlayersEnabled||dlg.open?null:seatSource(entryId),getLabel:source=>`Seat ${source.fromSeat} · ${pName(current().entries.find(e=>e.id===source.entryId))}`,onStart:clearSeatPick,onDrop:(source,target)=>requestSeatMove(source,target.table,target.seat),onError:error=>toast(error.message,true)});
document.addEventListener('keydown',event=>{
  const button=event.target.closest?.('.management-sidebar [data-tab]');if(!button)return;
  const tabs=[...document.querySelectorAll('.management-sidebar [data-tab]')],index=tabs.indexOf(button);
  const next=event.key==='ArrowDown'?(index+1)%tabs.length:event.key==='ArrowUp'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next!==null){event.preventDefault();tabs[next].click();}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')clearSeatPick();});
render();
let authEventSeen=false;
db.auth.onAuthStateChange((event,newSession)=>{authEventSeen=true;setTimeout(()=>{if(event==='TOKEN_REFRESHED'){session=newSession;void refresh();}else void acceptSession(newSession);},0);});
db.auth.getSession().then(({data,error})=>{if(authEventSeen)return;if(error){authReady=true;authError='Could not restore your sign-in. Please sign in again.';render();return;}void acceptSession(data.session);}).catch(()=>{authReady=true;authError='Could not connect to sign-in. Please try again.';render();});
