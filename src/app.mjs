import {renderLayoutEditor,renderClockLayoutScreen} from '../modules/clock-layout-editor.js';
import {renderClockAppearance} from '../modules/clock-appearance-controls.js';
import {renderPlayerProfileTabs} from './player-profile-tabs.mjs';
import {renderRegistrationTabs} from './registration-tabs.mjs';
import {renderRegistrationRows} from './registration-rows.mjs';
import {matchingPlayers} from './player-data.mjs';
import {registrationCandidates} from './registration-data.mjs';
import {createClient} from '@supabase/supabase-js';
import {id,clone,initialState,sampleTemplate,execute,clockAt,roundAt,financials,prizes,statsFor,guaranteeSettings,guaranteeEligible,payoutBalance,icmProposal,manualChopProposal,planSeatMove,planTableSeating,canCombineTables,normalizePhone,tablesRequired,tablesInUse,upgradeState,normalizePlayerName,rebuyOpen,rebuyPhase,cutoffHasBreak,canRecordRebuys,canEditRebuys,registrationOpen,tournamentRebuyCount,playerNumberLabel,tvDisplayMode,tournamentStarted,defaultPayouts,tableBalanceNeeded,hasPendingEliminations} from './domain.mjs';
import {pointsState,pointsLabel,parsePoints,chopPoints,pointPreview,leaderboardRows,filteredAwards} from './points.mjs';
import {calculatePayoutRules,payoutOrderError,validatePayoutOrder} from './payout-rules.mjs';
import {installSeatDragging} from './seat-dragging.mjs';
import {installClockToolbar} from './clock-toolbar.mjs';
import {tvSeating,fitTvSeating} from './tv-display.mjs';
import {createTvWindowController} from './tv-window.mjs';
import {ORIGINAL_CLOCK_APPEARANCE,CLOCK_PRESETS,clockAppearance,applyClockAppearance,setCountdown} from './clock-appearance.mjs';
import {mergeBrowserWorkspace} from './workspace.mjs';
import {SUPABASE_URL,SUPABASE_KEY} from './config.mjs';
import {registerScreen,loadScreen} from '../modules/screen-loader.js';

const db=createClient(SUPABASE_URL,SUPABASE_KEY);
const APP_VERSION='0.4.0-reorg.15 · Reorganization';
let homeModule=null,homeLoadError='';
registerScreen('home',()=>import('./home-screen.mjs'));
registerScreen('players',()=>import('./player-database-screen.mjs'));
registerScreen('signup',()=>import('./tournament-registration-screen.mjs'));
let playerScreenModule=null,registrationScreenModule=null;
const moduleErrors={};
function ensureScreenModule(name){const loaded=name==='players'?playerScreenModule:registrationScreenModule;if(loaded||moduleErrors[name])return;moduleErrors[name]='loading';void loadScreen(name).then(module=>{if(name==='players')playerScreenModule=module;else registrationScreenModule=module;delete moduleErrors[name];if(view===name&&session&&app?.isConnected)render();}).catch(error=>{moduleErrors[name]=error.message||'Screen could not load';if(view===name&&session&&app?.isConnected)render();});}
function screenPlaceholder(name){if(moduleErrors[name]&&moduleErrors[name]!=='loading')return '<section class="panel" role="alert"><h2>Screen could not load</h2><p>'+esc(moduleErrors[name])+'</p><button class="button secondary" data-action="retry-screen" data-screen="'+name+'">Retry</button></section>';return '<section class="panel" role="status" aria-live="polite"><p>Loading '+(name==='players'?'Player Database':'Tournament Registration')+'…</p></section>';}

function ensureHomeModule(){if(homeModule||homeLoadError)return;homeLoadError='loading';void loadScreen('home').then(module=>{homeModule=module;homeLoadError='';if(view==='home'&&session&&app?.isConnected)render();}).catch(error=>{homeLoadError=error.message||'Home could not load';if(view==='home'&&session&&app?.isConnected)render();});}
const APP_ROOT=new URL('.',location.href).pathname;
const NAV_ROOT=location.pathname.endsWith('/remote.html')?location.pathname:APP_ROOT;
const $=q=>document.querySelector(q), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n/100);
function allocationFeedback(pool,total){const difference=pool-total;return difference>0?`${money(difference)} left to distribute`:difference<0?`${money(-difference)} over the prize pool`:`All ${money(pool)} allocated`;}
const tvMoney=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n/100);
const num=n=>Number(n||0).toLocaleString('en-US');
const dollarNumber=value=>Number(String(value).replace(/,/g,''));
function wholeDollars(value){if(!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(String(value))||!Number.isSafeInteger(dollarNumber(value)))throw new Error('Enter monetary amounts as whole dollars.');return dollarNumber(value);}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const app=$('#app'),dlg=$('#dialog');
const legacyKey='uno-tournament-practice-v1',migrationKey='uno-tournament-browser-imported';
let state=initialState(),version=0,session=null,authReady=false,authError='',connectedUser='',legacyError='';
let legacy=readBrowserData(),legacyPending=!!legacy&&!localStorage.getItem(migrationKey);
let busy=false,channel=null,online=false,serverSample=null,lastSync=null,remoteError='',clockTimer,editor=null,setupLibraryTab='structures',layoutDraft=null;
let selected=localStorage.getItem('uno-tournament-selected')||'',view=new URLSearchParams(location.search).get('view')||'home';
const tvWindow=createTvWindowController();
const automaticTvLaunch=new URLSearchParams(location.search).get('autotv')==='1';let tvLaunchAttempted=false;
const requestedTournament=new URLSearchParams(location.search).get('tournament');if(requestedTournament)selected=requestedTournament;
let reviewingHistory=view==='manage'&&requestedTournament?requestedTournament:'';
let historyTournamentId=new URLSearchParams(location.search).get('view')==='history-summary'?requestedTournament||'':'';
let historyReturnPlayer=new URLSearchParams(location.search).get('player')||'';
let movePlayersEnabled=false,movePlayersTournament='';
let icmReview=null;let remotePanel=new URLSearchParams(location.search).get('panel')||'clock';const remoteRequests=new Map();let remoteTablesTournament='';
const payoutDrafts=new WeakMap();
let clockToolbar,seatDragging,pickedSeat=null,seatMoveChoice=null,tableCombineChoice=null,renderedWorkspaceVersion=0;
let playerSearch='',signupSearch='',registrationPanel='find',profilePanel='details',playerDetail=null,showArchived=false,tab='players',lastClockKey='',sound=false;
const icons={home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',setup:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2Z"/><circle cx="12" cy="12" r="3"/>',players:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3M3 8a2 2 0 0 0 0 4m18-4a2 2 0 0 1 0 4M1 20v-2a4 4 0 0 1 4-4m18 6v-2a4 4 0 0 0-4-4"/>',signup:'<path d="M14 3H4v18h11M14 3l5 5v5M14 3v5h5M8 8h3m-3 5h5m-5 4h3"/><circle cx="18" cy="18" r="4"/><path d="M18 16v4m-2-2h4"/>',clock:'<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M12 17v4m-5 0h10"/>',manage:'<path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v5m-4 1h8"/>',archives:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>'};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[k]||icons.clock}</svg>`;
const names={home:'Home',setup:'Tournament Design',players:'Player Database',signup:'Tournament Registration',manage:'Tournament Management',remote:'Tournament Remote',archives:'Tournament Archives',leaderboard:'Leaderboard',clock:'Clock Display'};
const current=()=>state.tournaments.find(t=>t.id===selected);
const pName=e=>state.players.find(p=>p.id===e.playerId)?.name||'Archived player';
const active=t=>t.entries.filter(e=>!e.eliminatedAt);
const tableActionName=t=>tablesInUse(t)>tablesRequired(t)?'Combine Tables':'Balance Tables';
const timeNow=()=>serverSample?serverSample.epoch+(performance.now()-serverSample.mono):Date.now();
function readBrowserData(){try{const raw=localStorage.getItem(legacyKey);if(!raw)return null;const value=JSON.parse(raw);if(value?.schemaVersion!==1||!['players','templates','tournaments'].every(k=>Array.isArray(value[k])))throw new Error();return upgradeState(value);}catch{legacyError='Saved data on this device could not be read. The original copy has been kept.';return null;}}
function authForm(){return `<form id="auth-form"><label>Email<input type="email" name="email" autocomplete="email" required></label><label>Password<input type="password" name="password" autocomplete="current-password" minlength="8" required></label><div class="button-row"><button class="button primary" name="authAction" value="login">Sign in</button><button class="button secondary" name="authAction" value="signup">Create account</button></div><p id="auth-feedback" class="muted" role="status">${esc(authError||'New here? Create an account, confirm your email if prompted, then sign in.')}</p></form>`;}
let archiveFilter={period:'all',search:'',seasonId:''},archiveDetail='';
let leaderboardFilter={period:'current',seasonId:'',month:today().slice(0,7),year:today().slice(0,4)},profileHistoryMode='tournaments',pointsEditor=null,pointsSaveChoice=null,finishChoice=null,manualChopReview=null;
function pointsResult(award){return award.chopSize?`${award.chopSize}-way ${award.result==='icm-chop'?'ICM':'manual'} chop`:`Finished #${award.place}`;}
function summaryPointsBreakdown(a){
  const original=a.originalHundredths??a.hundredths,kind=a.chopSize?'chop':a.place===1?'1st place':a.place===2?'2nd place':a.place===3?'3rd place':a.place?String(a.place)+'th place':'placement';
  const base=`${pointsLabel(Math.max(0,original-100))} pts (${kind}) + 1 pt (play) = ${pointsLabel(original)} pts`;
  const delta=a.hundredths-original;
  if(!delta)return esc(base);
  const signed=`${delta>0?'+':'−'}${pointsLabel(Math.abs(delta))} pts`;
  return `${esc(base)}<span class="points-adjustment">${esc(signed)} (<button type="button" class="text-button" data-points-adjustment="${esc(a.id)}">adjusted</button>) = ${pointsLabel(a.hundredths)} pts</span>`;
}
function tournamentPoints(t){
  const rows=pointsState(state).awards.filter(a=>a.tournamentId===t.id).sort((a,b)=>b.hundredths-a.hundredths||(a.place??0)-(b.place??0)||pName(a).localeCompare(pName(b)));
  if(!rows.length)return t.status==='completed'?'<p class="muted">No points recorded for this earlier tournament.</p>':'';
  const season=pointsState(state).seasons.find(s=>s.id===t.pointsSeasonId);
  return `<section class="tournament-points"><h3>Tournament Points</h3><p class="muted">${esc(season?.name||'Season')}</p>${rows.map(a=>`<div class="result-row" data-summary-points="${a.playerId}"><span>${esc(pName(a))}<small>${esc(pointsResult(a))}</small></span><strong>${summaryPointsBreakdown(a)}</strong></div>`).join('')}</section>`;
}
function pointsPreviewHtml(t,kind){
  const rows=pointPreview(t,kind),choppers=rows.filter(r=>r.chopSize);
  return `<section class="points-preview"><h3>Points Preview</h3>${choppers.length?`<p>Each of the ${choppers.length} chopping players receives <strong>${pointsLabel(choppers[0].hundredths)} points</strong>, including play. Points are split equally regardless of the money split.</p>`:''}<details><summary>View every player’s points</summary>${rows.map(r=>`<div class="result-row"><span>${esc(pName(r))}<small>${esc(pointsResult(r))}</small></span><strong>${pointsLabel(r.hundredths)}</strong></div>`).join('')}</details>${!choppers.length?`<p>Winner: <strong>${esc(pName(rows.find(r=>r.place===1)))} · 11.00 points</strong></p>`:''}</section>`;
}
function leaderboard(){
  const points=pointsState(state),filter=leaderboardFilter;if(!filter.seasonId||!points.seasons.some(s=>s.id===filter.seasonId))filter.seasonId=points.currentSeasonId;
  const currentSeason=points.seasons.find(s=>s.id===points.currentSeasonId),rows=leaderboardRows(state,filter);
  const scope=filter.period==='current'?currentSeason.name:filter.period==='season'?points.seasons.find(s=>s.id===filter.seasonId)?.name:filter.period==='month'?new Date(filter.month+'-01T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'}):filter.period==='year'?filter.year:'Lifetime';
  return `<section class="panel leaderboard-panel"><div class="section-label"><div><span class="eyebrow">POINTS LEADERBOARD</span><h2>${esc(scope)}</h2></div><button class="button secondary small" data-action="new-points-season" ${!online||busy?'disabled':''}>Start New Season</button></div><form id="leaderboard-filter" class="leaderboard-filters"><label>Show<select name="period">${[['current','Current Season'],['season','Season'],['month','Month'],['year','Year'],['lifetime','Lifetime']].map(([v,label])=>`<option value="${v}" ${filter.period===v?'selected':''}>${label}</option>`).join('')}</select></label>${filter.period==='season'?`<label>Season<select name="seasonId">${points.seasons.slice().reverse().map(s=>`<option value="${s.id}" ${filter.seasonId===s.id?'selected':''}>${esc(s.name)}${s.archivedAt?' (Archived)':''}</option>`).join('')}</select></label>`:filter.period==='month'?`<label>Month<input name="month" type="month" value="${filter.month}" required></label>`:filter.period==='year'?`<label>Year<input name="year" type="number" min="1" max="9999" step="1" value="${filter.year}" required></label>`:''}</form><div class="leaderboard-table" role="region" aria-label="Player point standings" tabindex="0"><table><thead><tr><th>Rank</th><th>Player</th><th>Played</th><th>Points</th></tr></thead><tbody>${rows.map(row=>`<tr data-leaderboard-row="${row.player.id}"><td>${row.rank}</td><td><button type="button" class="text-button" data-leaderboard-player="${row.player.id}">${esc(row.player.name)}${row.player.archived?' <span class="archived-status">(Archived)</span>':''}</button></td><td>${row.played}</td><td><strong>${pointsLabel(row.total)}</strong></td></tr>`).join('')}</tbody></table>${!filteredAwards(state,filter).length?'<p class="muted leaderboard-empty">No points recorded for this period yet. Points are recorded when a tournament finishes.</p>':''}</div></section>`;
}
function playerHistoryContents(p,st=statsFor(state,p.id)){
  const points=profileHistoryMode==='points',awards=pointsState(state).awards.filter(a=>a.playerId===p.id).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.awardedAt-a.awardedAt),editing=points&&pointsEditor?.playerId===p.id;
  const tabs=`<div class="player-history-tabs" role="group" aria-label="Player history"><button type="button" class="text-button ${!points?'active':''}" data-player-history="tournaments">Tournament History</button><button type="button" class="text-button ${points?'active':''}" data-player-history="points">Points History</button></div>`;
  if(!points)return `${tabs}<h2 id="player-history-heading" class="sr-only">Tournament history</h2><div id="player-history-list" role="region" aria-labelledby="player-history-heading" tabindex="0">${st.history.length?st.history.map(({t,e})=>`<button type="button" class="result-row history-tournament" data-review-tournament="${t.id}"><span>${esc(t.name)}<small>${dateLabel(t.date)}</small></span><strong>${e.icmChopParticipant?'ICM chop':e.manualChopParticipant?'Manual chop':'Finished #'+e.place}</strong></button>`).join(''):'<p class="muted">No completed tournaments yet.</p>'}</div>`;
  const total=awards.reduce((n,a)=>n+a.hundredths,0),seasonTotal=awards.filter(a=>a.seasonId===pointsState(state).currentSeasonId).reduce((n,a)=>n+a.hundredths,0);
  return `${tabs}<div class="section-label points-profile-heading"><div><h2 id="player-history-heading">Points History</h2><small>Current season: ${pointsLabel(seasonTotal)} · Lifetime: ${pointsLabel(total)}</small></div>${!editing?`<button type="button" class="button secondary small" data-action="edit-player-points" ${!awards.length||!online?'disabled':''}>Edit Points</button>`:''}</div><form id="points-edit-form"><div id="player-history-list" role="region" aria-labelledby="player-history-heading" tabindex="0">${awards.map(a=>{const t=state.tournaments.find(t=>t.id===a.tournamentId),season=pointsState(state).seasons.find(s=>s.id===a.seasonId);return `<div class="points-history-entry" data-point-award="${a.id}"><div class="result-row"><span><strong>${esc(t?.name||'Tournament')}</strong><small>${dateLabel(a.date)} · ${esc(season?.name||'Season')}<br>${esc(pointsResult(a))}</small></span>${editing?`<label><span class="sr-only">Points for ${esc(t?.name)} on ${a.date}</span><input type="text" inputmode="decimal" data-point-value="${a.id}" value="${esc(pointsEditor.values[a.id])}" required></label>`:`<strong>${pointsLabel(a.hundredths)} pts</strong>`}</div>${a.corrections.length?`<details class="points-corrections"><summary>Corrections (${a.corrections.length})</summary>${a.corrections.map(c=>`<p>${new Date(c.at).toLocaleString('en-US')} · ${pointsLabel(c.from)} → ${pointsLabel(c.to)}<br>${esc(c.reason)}</p>`).join('')}</details>`:''}</div>`;}).join('')||'<p class="muted">No point entries yet.</p>'}</div>${editing?`<label class="points-correction-note">Correction note (optional)<input name="reason" maxlength="300" value="${esc(pointsEditor.reason)}"></label><div class="button-row"><button class="button primary">Save Points</button><button type="button" class="button secondary" data-action="cancel-points-edit">Cancel</button></div>`:''}</form>`;
}
function showPlayerHistory(){document.body.classList.toggle('points-editing',!!pointsEditor);const p=state.players.find(p=>p.id===playerDetail);if(p&&$('.player-history-panel'))$('.player-history-panel').innerHTML=playerHistoryContents(p);}
function editPointsDialog(){
  if(!pointsEditor||pointsEditor.version!==version||pointsEditor.playerId!==playerDetail)throw new Error('Points changed. Cancel editing and reopen Points History before saving.');
  const awards=pointsState(state).awards.filter(a=>a.playerId===playerDetail),changes=awards.map(a=>({awardId:a.id,expectedHundredths:a.hundredths,value:pointsEditor.values[a.id],hundredths:parsePoints(pointsEditor.values[a.id])})).filter(c=>c.hundredths!==c.expectedHundredths);
  if(!changes.length){toast('No point changes to save.');return;}
  pointsSaveChoice={playerId:playerDetail,changes,reason:pointsEditor.reason,version};const p=state.players.find(p=>p.id===playerDetail);
  modal('Save Point Changes?',`<p>Are you sure you want to save these point changes for <strong>${esc(p.name)}</strong>?</p><ul>${changes.map(c=>{const a=awards.find(a=>a.id===c.awardId);return `<li>${dateLabel(a.date)}: ${pointsLabel(c.expectedHundredths)} → <strong>${pointsLabel(c.hundredths)}</strong></li>`;}).join('')}</ul><p>The original scores and this correction will be kept in the history.</p><div class="button-row"><button class="button primary" data-action="confirm-points-edit">Save Changes</button><button class="button secondary" data-action="close-modal">Cancel</button></div>`);
}
function newSeasonDialog(){
  const points=pointsState(state),current=points.seasons.find(s=>s.id===points.currentSeasonId);
  modal('Start New Season?',`<form id="new-season-form"><input type="hidden" name="version" value="${version}"><p>Archive <strong>${esc(current.name)}</strong> and start a new season at 0 points. All old scores, corrections, players and tournament records will be preserved.</p><label>New season name<input name="name" required maxlength="80" placeholder="For example, 2027 Season"></label><p class="muted" id="season-feedback" role="status"></p><div class="button-row"><button class="button primary">Archive Current & Start New Season</button><button type="button" class="button secondary" data-action="close-modal">Cancel</button></div></form>`);
}
function finishDialog(){
  const t=current();finishChoice={tournamentId:t.id,version};
  modal('Confirm Winner & Finish?',`<p>Confirm the winner and finish this tournament? The results and points will be saved together.</p>${pointsPreviewHtml(t,'winner')}<div class="button-row"><button class="button primary" data-action="confirm-tournament-finish">Confirm Winner & Finish</button><button class="button secondary" data-action="close-modal">Cancel</button></div>`);
}
function chopPointsBreakdown(size){const total=chopPoints(size);return `${pointsLabel(total-100)} pts (chop) + 1 pt (play) = ${pointsLabel(total)} pts`;}
function manualChopDialog(){
  if(!online||busy||renderedWorkspaceVersion!==version)throw new Error('Tournament changed or disconnected. Refresh before opening a manual chop.');
  const t=current(),remaining=active(t),schedule=prizes(t);manualChopReview=null;
  manualChopProposal(t,remaining.map((e,i)=>({entryId:e.id,payout:schedule[i]||0})));
  modal('Manual Chop',`<form id="manual-chop-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="tournamentId" value="${t.id}"><p>Enter each remaining player’s agreed payout. Previously eliminated players keep their payouts and points.</p><div class="manual-chop-players">${remaining.map((e,i)=>`<label>${esc(pName(e))}<small class="muted">${chopPointsBreakdown(remaining.length)}</small><div class="input-wrap"><span>$</span><input type="text" inputmode="numeric" data-money="true" data-manual-payout="${e.id}" value="${num((schedule[i]||0)/100)}" required></div></label>`).join('')}</div><p id="manual-chop-feedback" role="status"></p><button class="button primary full">Review Manual Chop</button></form>`);updateManualChop();
}
function manualRows(){return [...$('#manual-chop-form').querySelectorAll('[data-manual-payout]')].map(input=>({entryId:input.dataset.manualPayout,payout:wholeDollars(input.value)*100}));}
function updateManualChop(){try{const proposal=manualChopProposal(current(),manualRows());setText('#manual-chop-feedback',`All ${money(proposal.chopPool)} allocated.${proposal.reservedPayouts.length?' Earlier payouts remain reserved.':''}`);}catch(error){setText('#manual-chop-feedback',error.message);}}

function signInScreen(){return `<div class="auth-shell"><a class="brand" href="${APP_ROOT}"><span>UNO CLUB<small>TOURNAMENT DIRECTOR</small></span></a><section class="panel auth-panel"><p class="eyebrow">COMPUTER & PHONE ACCESS</p><h1>${authReady?'Sign in to Uno Club':'Opening Uno Club…'}</h1><p class="muted">Use the same account on your computer and phone for your players, tournament structures and clock.</p>${authReady?authForm():'<p role="status">Checking your sign-in…</p>'}${legacyPending?'<p class="import-note">Your saved players and tournaments on this device will be brought into your account after sign-in. The browser copy will be kept.</p>':''}${legacyError?`<p class="import-note">${esc(legacyError)}</p>`:''}</section><p class="muted auth-footnote">Your tournament information saves to Supabase.</p></div>`;}
function importNotice(){
  if(!legacyPending&&!legacyError)return '';
  return `<div class="mode-note warning">${legacyPending?'An older copy of players and tournaments is still saved on this device. Your current app uses your online account data. <button data-action="import-browser" '+(busy||!online?'disabled':'')+'>Bring over saved data</button>':''}${legacyError?`<p>${esc(legacyError)}</p>`:''}<button data-action="clear-device-copy" ${busy||!online||version<1?'disabled':''}>Clear old device copy</button></div>`;
}

function toast(message,error=false){const el=$('#toast');el.textContent=message;el.className=error?'show error':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='',5000);}
function chooseTournament(value){selected=value;localStorage.setItem('uno-tournament-selected',value);editor=null;render();}
function go(next){reviewingHistory='';if(next!=='archives')archiveDetail='';if(next==='remote'){const t=homeTournament();if(t){selected=t.id;localStorage.setItem('uno-tournament-selected',selected);}remotePanel='clock';remoteTablesTournament='';}view=next;editor=null;pointsEditor=null;playerDetail=null;history.pushState({},'',`${NAV_ROOT}?view=${encodeURIComponent(next)}${selected?'&tournament='+encodeURIComponent(selected):''}`);render();}
function dateLabel(value){return new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function statusLabel(t){if(t.status==='completed')return t.endedBy==='icm-chop'?'Completed · ICM chop':t.endedBy==='manual-chop'?'Completed · manual chop':'Completed';return {ready:'Ready to start',running:'In progress',paused:'Paused',ended:'Clock finished'}[clockAt(t,timeNow()).status];}
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
  if(view==='signup')action='<button class="button secondary small" data-go="manage">Back to Tournament Management</button>';
  if(view==='archives'&&archiveDetail)action='<button class="button secondary small" data-action="archives-back">Back to Tournament Archives</button>';
  return {title,context,action};
}
function header(){const showContext=!['home','players','leaderboard','archives'].includes(view)&&(view!=='signup'||!!current()),banner=bannerDetails();return `<header class="header${banner?' page-banner':''}"><a class="brand" href="${APP_ROOT}?view=home" data-go="home"><span>UNO CLUB<small>TOURNAMENT DIRECTOR</small></span></a>${banner?`<div class="page-banner-title"><h1 id="page-title">${banner.title}</h1>${banner.context?`<small>${esc(banner.context)}</small>`:''}</div>`:''}<div class="header-right">${banner?.action||''}</div></header>${showContext?`<div class="context"><div><span class="eyebrow">TOURNAMENT</span><strong class="current-tournament-name" title="${esc(current()?.name||'No current tournament')}">${esc(current()?.name||'No current tournament')}</strong></div><div class="context-actions">${view==='manage'&&current()&&current().status!=='completed'&&!current().archivedAt?'<button type="button" class="button secondary small context-edit-tournament" data-action="event-settings">Edit This Tournament</button>':''}${view==='manage'?tvDisplayControls(current()):''}<button class="button small dark" data-action="open-clock" title="Automatic TV placement and full screen: pending Windows wireless HDMI testing.">${icon('clock')} Open clock window</button></div></div>`:''}${!online?`<div class="mode-note warning">${esc(remoteError||'Connection interrupted. Reconnect to save changes.')} <button data-action="refresh">Retry</button></div>`:''}`;}


function nav(){return `<nav class="nav" aria-label="Tournament pages">${['home','players','setup','manage','archives','leaderboard'].map(k=>`<button class="${(view===k||view==='signup'&&k==='manage')?'active':''}" data-go="${k}">${icon(k)}<span>${names[k]}</span></button>`).join('')}</nav>`;}
function empty(title,text,button=''){return `<div class="empty"><span class="empty-icon">${icon('clock')}</span><h2>${title}</h2><p>${text}</p>${button}</div>`;}
function metrics(t){const f=financials(t);return `<div class="metrics"><div><span>Players remaining</span><strong>${active(t).length}<small> / ${t.entries.length}</small></strong></div><div><span>Prize pool</span><strong>${money(f.pool)}</strong></div><div><span>Rebuys</span><strong>${f.rebuyCount}</strong></div><div><span>Clock status</span><strong class="status-value" id="status-metric">${statusLabel(t)}</strong></div></div>`;}
function homeTournament(){const isActive=t=>!t.archivedAt&&t.status!=='completed'&&(t.entries.length>0||t.startedAt);return (current()&&isActive(current())?current():state.tournaments.slice().reverse().find(isActive));}
// Home is now a separately loaded screen. Other screens remain in place for later phases.
function home(){return homeModule?homeModule.renderHome({t:homeTournament(),icon,esc,money,statusLabel}):homeLoadError&&homeLoadError!=='loading'?'<section class="panel" role="alert"><h2>Home could not load</h2><p>'+esc(homeLoadError)+'</p><button class="button secondary" data-action="retry-home">Retry</button></section>':'<section class="panel" role="status" aria-live="polite"><p>Loading Home…</p></section>'+nav();}

function settingsFields(s){const number=(label,key,value,{moneyInput=false,min=0,max}={})=>`<label>${label}<div class="input-wrap">${moneyInput?'<span>$</span>':''}<input type="${moneyInput?'text':'number'}" ${moneyInput?'inputmode="numeric"':''} name="${key}" value="${moneyInput?num(value/100):value}" min="${min}" ${max?'max="'+max+'"':''} step="${key==='housePercent'?'0.01':'1'}" required ${moneyInput?'data-money="true"':''}></div></label>`;
  return `<div class="form-section"><h3>Play settings</h3><div class="form-grid"><label>Starting chips<input type="text" inputmode="numeric" name="startingStack" data-chips="true" value="${num(s.startingStack)}" pattern="[0-9][0-9,]*" autocomplete="off" spellcheck="false" required></label><label>Antes<select name="anteMode"><option value="off" ${s.anteMode==='off'?'selected':''}>Off — keep amounts in structure</option><option value="big_blind" ${s.anteMode==='big_blind'?'selected':''}>Big blind ante</option><option value="per_player" ${s.anteMode==='per_player'?'selected':''}>Each player antes</option></select></label></div><p class="muted">Set seats per table in Tournament Management → Tables & Seating.</p><label class="check"><input type="checkbox" name="pauseBreaks" ${s.pauseBreaks?'checked':''}>Pause at the beginning and end of breaks</label></div><div class="form-section"><h3>Buy-in</h3><p class="muted">Enter the full price the player pays. The dealer toke is included in that price.</p><div class="form-grid">${number('Full buy-in amount','buyIn',s.buyIn,{moneyInput:true})}${number('Dealer toke per buy-in','dealerToke',s.dealerToke,{moneyInput:true})}</div><p class="split-note" id="entry-split">${money(s.buyIn)} total − ${money(s.dealerToke)} dealer toke = ${money(s.buyIn-s.dealerToke)} before the tournament fee.</p></div><div class="form-section"><h3>Rebuys</h3><label class="check"><input type="checkbox" name="rebuyEnabled" ${s.rebuyEnabled?'checked':''}>Allow rebuys</label><div class="form-grid">${number('Full rebuy amount','rebuyAmount',s.rebuyAmount,{moneyInput:true})}${number('Chips per rebuy','rebuyChips',s.rebuyChips)}${number('Last round before rebuys end','rebuyLastRound',s.rebuyLastRound)}</div><p class="muted">No dealer toke is taken from rebuys. A break is required immediately after the final rebuy round. Rebuys remain open through that break. Enter the tournament rebuy total in Tournament Management after that break.</p><div id="rebuy-break-notice" aria-live="polite"></div></div><div class="form-section"><h3>Add-ons</h3><label class="check"><input type="checkbox" name="addonEnabled" ${s.addonEnabled?'checked':''}>Allow one add-on per player</label><div class="form-grid">${number('Full add-on amount','addonAmount',s.addonAmount,{moneyInput:true})}${number('Chips per add-on','addonChips',s.addonChips)}${number('Last round before add-on ends','addonLastRound',s.addonLastRound)}</div><p class="muted">If a break immediately follows the last add-on round, add-ons remain available through that break.</p></div><div class="form-section"><h3>Tournament fee at settlement</h3><div class="form-grid">${number('Tournament fee percentage','housePercent',s.housePercent,{max:100})}${number('House contribution added to prizes','houseContribution',s.houseContribution,{moneyInput:true})}</div><p class="muted">The tournament fee applies only to initial buy-ins after dealer tokes. Rebuys, add-ons and house contributions are not charged this fee. Monetary amounts use whole dollars.</p></div>`;}
function readSettings(form,base){const s=clone(base),f=new FormData(form);for(const el of form.querySelectorAll('input[name],select[name]')){if(!(el.name in s))continue;if(el.type==='checkbox')s[el.name]=el.checked;else if(el.dataset.chips)s[el.name]=Number(el.value.replace(/,/g,''));else if(el.dataset.money){const dollars=wholeDollars(el.value);if(!el.value.trim()||!Number.isSafeInteger(dollars)||dollars<0)throw new Error('Enter monetary amounts as whole dollars.');s[el.name]=dollars*100;}else if(el.type==='number')s[el.name]=Number(el.value);else s[el.name]=el.value;}return s;}
function levelRows(levels){let round=0,br=0;return levels.map((l,i)=>`<tr data-level="${i}"><td class="level-title">${l.kind==='break'?'Break '+ ++br:'Round '+ ++round}<input type="hidden" name="kind" value="${l.kind}"></td><td><input aria-label="${l.kind} duration in minutes" type="number" name="minutes" min="${l.kind==='break'?1:0.1}" max="180" step="${l.kind==='break'?1:0.1}" required value="${l.minutes}"></td><td><input aria-label="Small blind" name="sb" type="number" min="0" step="1" value="${l.sb}" ${l.kind==='break'?'disabled':''}></td><td><input aria-label="Big blind" name="bb" type="number" min="0" step="1" value="${l.bb}" ${l.kind==='break'?'disabled':''}></td><td><input aria-label="Ante amount" name="ante" type="number" min="0" step="1" value="${l.ante}" ${l.kind==='break'?'disabled':''}></td><td><input aria-label="Game name" name="game" maxlength="100" value="${esc(l.game)}" ${l.kind==='break'?'disabled':''}></td><td><select aria-label="Clock layout" name="layoutId" data-layout-selector="true"><option value="" ${!l.layoutId?'selected':''}>Default Layout</option>${(state.clockLayouts||[]).map(saved=>`<option value="${esc(saved.id)}" ${l.layoutId===saved.id?'selected':''}>${esc(saved.name)}</option>`).join('')}</select></td><td><input aria-label="Chip-up reminder" name="chipUp" type="checkbox" ${l.chipUp?'checked':''}></td><td class="row-buttons"><button type="button" class="icon-button" data-level-up="${i}" aria-label="Move level up">↑</button><button type="button" class="icon-button" data-level-down="${i}" aria-label="Move level down">↓</button><button type="button" class="icon-button danger-text" data-level-delete="${i}" aria-label="Delete level">×</button></td></tr>`).join('');}
function readLevels(form){return [...form.querySelectorAll('[data-level]')].map(row=>{const get=n=>row.querySelector(`[name="${n}"]`);return {kind:get('kind').value,minutes:Number(get('minutes').value),sb:Number(get('sb').value),bb:Number(get('bb').value),ante:Number(get('ante').value),game:get('game').value,layoutId:get('layoutId').value,chipUp:get('chipUp').checked};});}
function savedLayoutView(){
 if(layoutDraft)return renderLayoutEditor(layoutDraft,{Al:()=>'', $l:(v)=>renderClockAppearance(v,esc),w:esc});
 return `<div class="section-label"><h2>Saved Layouts</h2><button type="button" class="button primary small" data-action="create-layout">+ Create Layout</button></div><div class="structure-grid" id="saved-layouts" role="region" aria-label="Saved layouts" tabindex="0"><article class="panel structure-card"><span class="eyebrow">BUILT-IN · PROTECTED</span><h2>Default Layout</h2><div class="setup-clock-preview saved-tv-screen" data-saved-layout-preview="default">${renderClockLayoutScreen()}</div><div class="button-row layout-card-actions"><button class="text-button" data-action="duplicate-default-layout">Duplicate</button></div></article>${(state.clockLayouts||[]).map(l=>`<article class="panel structure-card"><span class="eyebrow">SAVED CLOCK LAYOUT</span><h2>${esc(l.name)}</h2><div class="setup-clock-preview saved-tv-screen" data-saved-layout-preview="${l.id}">${renderClockLayoutScreen()}</div><div class="button-row layout-card-actions"><button type="button" class="button secondary small" data-edit-layout="${l.id}">Edit</button><button type="button" class="text-button danger-text" data-delete-layout="${l.id}">Delete</button><button type="button" class="text-button" data-copy-layout="${l.id}">Duplicate</button></div></article>`).join('')}</div>`;
}
function openLayout(layout=null,duplicate=false){const original=layout||{name:'New Layout',appearance:clockAppearance(state.clockAppearanceDefaults)};layoutDraft={id:duplicate?'':original.id||'',name:duplicate?original.name+' Copy':original.name,appearance:clockAppearance(original.appearance)};setupLibraryTab='layouts';view='setup';render();}
function setup(){if(layoutDraft)return savedLayoutView();if(editor){const e=editor.value;return `<form id="structure-form" class="panel"><div class="structure-editor-body" role="region" aria-label="Structure settings" tabindex="0"><label>Structure name<input name="structureName" value="${esc(e.name)}" required maxlength="100" ${editor.event?'disabled':''}></label>${structureClockAppearance()}${settingsFields(e.settings)}${!editor.event||current()?.clock.status==='ready'?`<div class="form-section"><div class="section-label"><h3>Levels & breaks</h3><div class="button-row"><button type="button" class="button small secondary" data-action="add-level">+ Playing level</button><button type="button" class="button small secondary" data-action="add-break">+ Break</button></div></div><p class="muted">Durations are minutes from the actual start. Break lengths use whole minutes. Ante amounts remain saved when antes are off.</p><div class="game-copy-row"><label>Game for all playing levels<input id="all-levels-game" value="${esc(e.levels.find(l=>l.kind==='play')?.game||'')}" maxlength="100" placeholder="For example, No Limit Hold’em"></label><button type="button" class="button secondary" data-action="copy-game">Copy game to all levels</button></div><p class="muted small-copy">Use this for a single-game tournament, or edit individual game names below for a mixed tournament.</p><div class="table-scroll"><table class="level-table"><thead><tr><th>Level</th><th>Minutes</th><th>Small blind</th><th>Big blind</th><th>Ante</th><th>Game</th><th>Layout</th><th>Chip up</th><th>Order</th></tr></thead><tbody>${levelRows(e.levels)}</tbody></table></div></div>`:''}<div class="form-section"><h3>Default payouts</h3><p class="muted">You can change these during a tournament from Tournament Management.</p>${editor.event&&tournamentStarted(current())?'<p class="muted">Use Tournament Management → Payouts to change an active payout agreement.</p>':payoutFields(e.settings,editor.event?current():null)}</div></div><div class="sticky-save"><button class="button primary" type="submit">${editor.event?'Save tournament settings':'Save structure'}</button><button class="button secondary" type="button" data-action="close-editor">Cancel</button></div></form>`;}
return `<div class="setup-library-layout"><nav class="panel" aria-label="Setup library"><button type="button" class="button ${setupLibraryTab==='structures'?'primary':'secondary'}" data-action="show-structures">Saved Structures</button><button type="button" class="button ${setupLibraryTab==='layouts'?'primary':'secondary'}" data-action="show-layouts">Saved Layouts</button></nav><section class="setup-library-results">${setupLibraryTab==='layouts'?savedLayoutView():`${current()?`<div class="panel current-panel"><div><span class="eyebrow">SELECTED TOURNAMENT</span><h2>${esc(current().name)}</h2><p class="muted">${esc(current().templateName)} · Antes ${current().settings.anteMode==='off'?'off':current().settings.anteMode.replace('_',' ')}</p></div><button class="button secondary" data-action="event-settings" ${current().status==='completed'?'disabled':''}>Edit this tournament</button></div>`:''}<div class="section-label"><h2>Saved structures</h2><div class="button-row"><button class="text-button" data-action="new-structure">+ Create structure</button></div></div><div class="structure-grid" id="saved-structures" role="region" aria-label="Saved structures" tabindex="0">${state.templates.map(s=>`<article class="panel structure-card"><span class="eyebrow">SAVED STRUCTURE</span><h2>${esc(s.name)}</h2><p>${s.levels.filter(l=>l.kind==='play').length} playing rounds · ${s.levels.filter(l=>l.kind==='break').length} breaks</p><div class="structure-facts"><span>Starting chips <strong>${num(s.settings.startingStack)}</strong></span><span>Buy-in <strong>${money(s.settings.buyIn)}</strong></span><span>Antes <strong>${s.settings.anteMode==='off'?'Optional · Off':s.settings.anteMode.replace('_',' ')}</strong></span></div><div class="button-row"><button class="button primary small" data-create-template="${s.id}">Use structure</button><button class="button secondary small" data-edit-template="${s.id}">Edit</button><button class="text-button" data-copy-template="${s.id}">Duplicate</button><button class="text-button danger-text" data-delete-template="${s.id}">Delete</button></div></article>`).join('')}</div>`}</section></div>`;}
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
function payoutFields(s,t=null){if(s.payoutRules)return '<p class="muted">Custom payouts are managed in Tournament Management or Tournament Remote.</p>';return `<div class="payout-editor-grid" data-setup-payouts><div class="payout-format-column">${paidPlacesControl(s,t)}${payoutFormats(s,t)}</div><section class="payout-places-column"><h3>Payouts</h3><div id="payout-place-list" data-mode="${s.payoutMode}">${payoutPlaceRows(t,s.payoutMode,s.payouts.map(n=>s.payoutMode==='fixed'?n/100:n),true,s)}</div></section></div><p id="setup-payout-feedback" class="muted" role="status"></p>`;}
function readPayout(form,s){
  if(form.dataset.ruleEditor)return readRuleSettings(form,{...current(),settings:s});
  const fd=new FormData(form),mode=fd.get('payoutMode');if(!mode)return s;readGuarantee(form,s);s.payoutMode=mode;delete s.payoutRules;
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
  if(t.icmChop||t.manualChop)return `<p class="pill light">Ended by ${t.icmChop?'ICM':'manual'} chop</p><div class="icm-results">${(t.icmChop||t.manualChop).participants.map(v=>`<div class="result-row"><span>${esc(pName(v))}<small>${v.chips!=null?num(v.chips)+' final chips':'Agreed payout'}</small></span><strong>${money(v.payout)}</strong></div>`).join('')}</div>${(t.icmChop||t.manualChop).reservedPayouts.length?`<p class="muted">Payouts for earlier eliminations: ${(t.icmChop||t.manualChop).reservedPayouts.map(money).join(', ')}</p>`:''}`;
  return `<div class="prize-preview">${prizes(t).map((v,i)=>`<div><span>${ordinal(i+1)} place</span><strong>${money(v)}</strong></div>`).join('')}</div>`;
}
function fundingNotice(t){
  const f=financials(t);if(!f.guaranteeActive)return '';
  if(['icm-chop','manual-chop'].includes(t.endedBy))return `<p class="guarantee-note">The accepted ${t.icmChop?'ICM':'manual chop'} agreement replaces the ordinary place payouts.${f.guaranteeContribution?` The chop includes ${money(f.guaranteeContribution)} additional house funding, recorded in House Contribution.`:''}</p>`;
  return `<p class="guarantee-note">First place is at least ${money(guaranteeSettings(t.settings).guaranteeAmount)}; a 65% / 35% split applies automatically when it pays more.${f.guaranteeContribution?` <strong>Additional house contribution required: ${money(f.guaranteeContribution)}.</strong> Included in total House Contribution of ${money(f.houseContribution)}; fully funded prize pool: ${money(f.pool)}.`:' The guarantee is fully funded.'}</p>`;
}
function placeName(index){return ['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth','Eleventh','Twelfth','Thirteenth','Fourteenth','Fifteenth','Sixteenth','Seventeenth','Eighteenth','Nineteenth','Twentieth'][index]+' Place';}
function payoutPlaceRows(t,mode,values,setup=false,settings=t?.settings||{}){
  if(t?.icmChop)return awardRows(t);
  let amounts=[];if(t)try{amounts=prizes({...t,settings:{...t.settings,payoutMode:mode,payouts:values.map(n=>dollarNumber(n)*(mode==='fixed'?100:1))}});}catch{}
  const count=mode==='guaranteed'?2:values.length,readonly=t?.status==='completed'||mode==='guaranteed';
  return Array.from({length:count},(_,i)=>`<div class="payout-place-row" data-payout-place="${i}">${readonly?`<span>${placeName(i)}</span><output data-payout-amount="${i}">${setup?(i===0?`${money(guaranteeSettings(settings).guaranteeAmount)} minimum at ${num(guaranteeSettings(settings).guaranteePlayers)} players`:'Remainder'):money(amounts[i]||0)}</output>`:`<label for="payout-place-${i}"><span class="payout-place-label">${placeName(i)}</span><div class="input-wrap ${mode==='percent'?'payout-percentage-input':''}">${mode==='fixed'?'<span>$</span>':''}<input id="payout-place-${i}" name="payoutPlace${i+1}" data-payout-value="${i}" aria-label="${placeName(i)} ${mode==='fixed'?'dollars':'percentage'}" type="${mode==='fixed'?'text':'number'}" ${mode==='fixed'?'inputmode="numeric" data-money="true"':''} min="0" ${mode==='percent'?'max="100"':''} step="${mode==='fixed'?'1':'0.0001'}" value="${mode==='fixed'?num(dollarNumber(values[i]??0)):values[i]??0}" required>${mode==='percent'?'<span>%</span>':''}</div></label>${mode==='percent'&&!setup?`<output data-payout-amount="${i}">${money(amounts[i]||0)}</output>`:''}`}</div>`).join('');
}
// Confirmation styling is local UI state; only an acknowledged cloud save can
// mark a schedule saved. A new edit clears it without changing tournament data.
const payoutSaveReceipts=new Map();
function payoutFingerprint(t){return JSON.stringify({mode:t.settings.payoutMode,payouts:t.settings.payouts,rules:t.settings.payoutRules,guarantee:guaranteeSettings(t.settings),house:t.settings.houseContribution,pool:financials(t).pool,amounts:prizes(t)});}
function updatePayoutSaveButton(form=$('#payout-form')){
  const button=form?.querySelector('[data-payout-save]'),t=current();if(!button||!t)return;
  const dirty=form.dataset.payoutChanged==='true',saved=!dirty&&payoutSaveReceipts.get(t.id)===payoutFingerprint(t);
  button.classList.toggle('payout-save-dirty',dirty);button.classList.toggle('payout-save-saved',saved);button.textContent=saved?'Payouts Saved':'Save Payouts';
}
function markPayoutChanged(form){
  if(form?.id!=='payout-form')return;form.dataset.payoutChanged='true';updatePayoutSaveButton(form);
}

function manualChopButton(t){return t.status==='completed'?'':`<button type="button" class="button secondary manual-chop-button ${view==='remote'?'full':''}" data-action="manual-chop" ${active(t).length<2||payoutBalance(t)!==0||payoutOrderError(prizes(t))||hasPendingEliminations(t)?'disabled':''} >Manual Chop</button>`;}
function payoutPanel(t,forceStandard=false){
  if(!forceStandard)return rulePayoutPanel(t);
  const f=financials(t),done=t.status==='completed',orderError=done?'':payoutOrderError(prizes(t)),values=t.settings.payouts.map(n=>t.settings.payoutMode==='fixed'?n/100:n);
  return `<form id="payout-form" data-custom-draft="${!!t.payoutCustom}"><input type="hidden" name="tournamentId" value="${t.id}"><input type="hidden" name="version" value="${version}"><div class="payout-editor-grid"><div class="payout-format-column">${paidPlacesControl(t.settings,t,tournamentStarted(t))}${payoutFormats(t.settings,t)}<p class="custom-payout-status" id="custom-payout-status">${t.payoutCustom?'Custom Payouts':''}</p>${!done?'<button type="button" class="button secondary small" data-action="recalculate-payouts">Use Structure Payouts</button>':''}</div><section class="payout-places-column" aria-label="Payouts by finishing place"><div class="payout-current-pool"><span>Current Prize Pool</span><strong id="payout-pool">${money(f.pool)}</strong></div><h2>Payouts</h2><div id="payout-place-list" data-mode="${t.settings.payoutMode}">${payoutPlaceRows(t,t.settings.payoutMode,values)}</div></section></div><label class="payout-house-contribution">House Contribution<div class="input-wrap"><span>$</span><input type="text" inputmode="numeric" data-money="true" name="houseContribution" value="${num(t.settings.houseContribution/100)}" required ${done?'disabled':''}></div></label><button type="submit" data-payout-save class="button primary" ${done||orderError?'disabled':''}>Save Payouts</button></form><div id="guarantee-funding">${fundingNotice(t)}</div><p id="payout-feedback" class="muted ${orderError?'payout-order-error':''}" role="status">${orderError||(payoutBalance(t)?'Payouts must be updated to exactly match the prize pool.':'')}</p>${done?'':`<button type="button" class="button secondary" data-action="icm-chop" ${active(t).length<2||active(t).length>20||payoutBalance(t)!==0||payoutOrderError(prizes(t))||hasPendingEliminations(t)?'disabled':''}>ICM Chop</button>`}${manualChopButton(t)}`;
}
// Remote and saved mixed arrangements use the same rules and domain calculator.
function rulesForTournament(t){
  const s=t.settings;
  if(s.payoutRules)return clone(s.payoutRules);
  if(s.payoutMode==='fixed')return s.payouts.map(value=>({mode:'fixed',value}));
  if(s.payoutMode==='guaranteed'){
    const f=financials(t),amounts=prizes(t);
    if(f.guaranteeActive&&amounts[0]===guaranteeSettings(s).guaranteeAmount)return [{mode:'fixed',value:amounts[0]},{mode:'percent',value:100}];
    return [65,35].map(value=>({mode:'percent',value}));
  }
  return s.payouts.map(value=>({mode:'percent',value}));
}
function ruleRows(rules,done=false){
  return rules.map((rule,i)=>`<div class="payout-place-row payout-rule-row" data-payout-place="${i}"><strong class="payout-place-label">${placeName(i)}</strong><div class="payout-rule-toggle" role="group" aria-label="${placeName(i)} payout type">${[['percent','Percentage'],['fixed','Fixed']].map(([mode,label])=>`<button type="button" data-rule-place="${i}" data-rule-mode="${mode}" aria-pressed="${rule.mode===mode}" ${done?'disabled':''}>${label}</button>`).join('')}</div><label class="input-wrap ${rule.mode==='percent'?'payout-percentage-input':''}">${rule.mode==='fixed'?'<span>$</span>':''}<input name="payoutPlace${i+1}" data-payout-value="${i}" aria-label="${placeName(i)} ${rule.mode==='percent'?'percentage':'dollars'}" type="${rule.mode==='percent'?'number':'text'}" ${rule.mode==='fixed'?'inputmode="numeric" data-money="true"':'min="0" max="100" step="0.0001"'} value="${rule.mode==='fixed'?num(rule.value/100):rule.value}" required ${done?'disabled':''}>${rule.mode==='percent'?'<span>%</span>':''}</label><output data-payout-amount="${i}"></output></div>`).join('');
}
function rulePayoutPanel(t){
  const remote=view==='remote',done=t.status==='completed',rules=rulesForTournament(t),format=rules.every(r=>r.mode==='fixed')?'fixed':rules.every(r=>r.mode==='percent')?'percent':'mixed';
  const pool=`<div class="payout-current-pool"><span>Current Prize Pool</span><strong id="payout-pool">${money(financials(t).pool)}</strong></div>`;
  if(t.icmChop||t.manualChop)return `${pool}${awardRows(t)}${fundingNotice(t)}`;
  const controls=`${paidPlacesControl({...t.settings,payoutMode:format,payouts:rules},t,true)}<fieldset class="payout-formats" ${done?'disabled':''}><legend>Prize Format</legend>${[['percent','Percentage of Prize Pool'],['fixed','Fixed Dollar Amounts']].map(([value,label])=>`<label class="check"><input type="radio" name="payoutMode" value="${value}" ${format===value?'checked':''}><span>${label}</span></label>`).join('')}</fieldset><p id="custom-payout-status" class="custom-payout-status"></p>${!remote&&!done?'<button type="button" class="button secondary small" data-action="recalculate-payouts">Use Structure Payouts</button>':''}`;
  return `<form id="payout-form" data-rule-editor="true" data-rules-edited="false" data-overall-format="${format}"><input type="hidden" name="tournamentId" value="${t.id}"><input type="hidden" name="version" value="${version}">${remote?pool:''}<div class="payout-editor-grid"><div class="payout-format-column">${controls}</div><section class="payout-places-column" aria-label="Payouts by finishing place">${remote?'':pool}<h2>Payouts</h2><div id="payout-place-list">${ruleRows(rules,done)}</div><p id="mixed-payout-note" class="muted small-copy"></p></section></div><details class="payout-house-details"><summary>House Contribution</summary><label class="payout-house-contribution">House Contribution<div class="input-wrap"><span>$</span><input type="text" inputmode="numeric" data-money="true" name="houseContribution" value="${num(t.settings.houseContribution/100)}" required ${done?'disabled':''}></div></label></details><p id="payout-feedback" class="payout-allocation" role="status"></p><button type="submit" data-payout-save class="button primary ${remote?'full':''}" ${done?'disabled':''}>Save Payouts</button></form><div id="guarantee-funding">${fundingNotice(t)}</div>${done?'':`<button type="button" class="button secondary ${remote?'full':''}" data-action="icm-chop" ${active(t).length<2||active(t).length>20||payoutBalance(t)!==0||payoutOrderError(prizes(t))||hasPendingEliminations(t)?'disabled':''}>ICM Chop</button>`}${manualChopButton(t)}`;
}
function readRuleRows(form){
  return [...form.querySelectorAll('[data-payout-place]')].map(row=>{
    const mode=row.querySelector('[data-rule-mode][aria-pressed=true]').dataset.ruleMode,input=row.querySelector('[data-payout-value]');
    if(mode==='fixed')return {mode,value:wholeDollars(input.value)*100};
    if(!/^\d+(?:\.\d{1,4})?$/.test(input.value))throw new Error('Enter a valid percentage for each percentage place.');
    return {mode,value:Number(input.value)};
  });
}
function markRuleDraft(form){
  markPayoutChanged(form);
  if(form.dataset.rulesEdited!=='true'){
    // Carry already-funded guarantee money into the agreed custom prize pool.
    const t={...current(),settings:{...current().settings,houseContribution:wholeDollars(form.elements.houseContribution.value)*100}};
    form.elements.houseContribution.value=num(financials(t).houseContribution/100);
  }
  form.dataset.rulesEdited='true';form.dataset.rulesDirty='true';
}
function readRuleSettings(form,t){
  const count=Number(form.elements.paidPlaces.value);if(!Number.isInteger(count)||count<1||count>20||form.querySelectorAll('[data-payout-place]').length!==count)throw new Error('Choose 1–20 paid places.');
  const settings={...clone(t.settings),houseContribution:wholeDollars(form.elements.houseContribution.value)*100};
  if(form.dataset.rulesEdited!=='true')return settings;
  const rules=readRuleRows(form),mode=rules.every(r=>r.mode==='fixed')?'fixed':rules.every(r=>r.mode==='percent')?'percent':'mixed';
  delete settings.payoutRules;settings.payoutMode=mode;
  const amounts=calculatePayoutRules(financials({...t,settings}).pool,rules);
  settings.payoutRules=rules;settings.payouts=mode==='mixed'?amounts:rules.map(r=>r.value);return settings;
}
function writeRuleRows(form,rules){
  const format=rules.every(r=>r.mode==='fixed')?'fixed':rules.every(r=>r.mode==='percent')?'percent':'mixed';form.dataset.overallFormat=format;for(const radio of form.querySelectorAll('[name=payoutMode]'))radio.checked=radio.value===format;
  form.querySelector('#payout-place-list').innerHTML=ruleRows(rules,current().status==='completed');form.elements.paidPlaces.value=String(rules.length);
  for(const button of form.querySelectorAll('[data-payout-step]'))button.disabled=Number(button.dataset.payoutStep)<0?rules.length===1:rules.length===20;
  refreshRulePreview(form);
}
function refreshRulePreview(form){
  const manual=$('[data-action=manual-chop]');if(manual)manual.disabled=true;
  const icm=$('[data-action=icm-chop]');if(icm)icm.disabled=true;
  try{
    const count=Number(form.elements.paidPlaces.value);if(!Number.isInteger(count)||count<1||count>20)throw new Error('Choose 1–20 paid places.');
    let rules=readRuleRows(form);
    if(count!==rules.length){markRuleDraft(form);rules=Array.from({length:count},(_,i)=>rules[i]||{mode:'fixed',value:0});writeRuleRows(form,rules);return;}
    const t=current(),settings=readRuleSettings(form,t),draft={...t,settings},f=financials(draft),amounts=prizes(draft),total=amounts.reduce((sum,n)=>sum+n,0),difference=f.pool-total;
    if(form.dataset.rulesEdited!=='true'){
      const updated=rulesForTournament(draft);if(JSON.stringify(updated)!==JSON.stringify(rules)){form.querySelector('#payout-place-list').innerHTML=ruleRows(updated,t.status==='completed');rules=updated;}
    }
    amounts.forEach((amount,i)=>setText(`[data-payout-amount="${i}"]`,money(amount)));setText('#payout-pool',money(f.pool));$('#guarantee-funding').innerHTML=fundingNotice(draft);
    const orderError=t.status==='completed'?'':payoutOrderError(amounts);form.querySelector('[type=submit],button.button.primary').disabled=t.status==='completed'||!!orderError;
    const mixed=rules.some(r=>r.mode==='fixed')&&rules.some(r=>r.mode==='percent'),custom=t.payoutCustom||form.dataset.rulesEdited==='true',dirty=JSON.stringify(settings)!==JSON.stringify(t.settings)||form.dataset.rulesEdited==='true';
    setText('#custom-payout-status',custom?(mixed?'Mixed Payouts · ':'')+'Custom Payouts'+(dirty?' — Save to apply':''):mixed?'Structure guarantee':'');
    setText('#mixed-payout-note',mixed?'Fixed awards are set aside first. Percentages divide the remaining prize pool.':'');
    setText('#payout-feedback',allocationFeedback(f.pool,total)+(difference===0&&dirty?' — Save to apply':''));
    $('#payout-feedback').classList.toggle('payout-order-error',!!orderError);
    if(orderError)setText('#payout-feedback',orderError+(difference!==0?' '+$('#payout-feedback').textContent:''));
    if(manual)manual.disabled=!!orderError||dirty||difference!==0||active(t).length<2||hasPendingEliminations(t);
    if(icm)icm.disabled=!!orderError||dirty||difference!==0||active(t).length<2||active(t).length>20||hasPendingEliminations(t);
  }catch(error){
    // Keep the last valid dollar preview while a payout entry is incomplete.
    // Never allow an invalid draft to be saved or accepted as a chop.
    const save=form.querySelector('[data-payout-save]');if(save)save.disabled=true;
    if(manual)manual.disabled=true;if(icm)icm.disabled=true;
    $('#payout-feedback').classList.add('payout-order-error');
    setText('#payout-feedback',error.message+' — Showing the last valid payout preview until the entries are corrected.');
    const outputs=[...form.querySelectorAll('[data-payout-amount]')];
    if(outputs.some(output=>!output.textContent.trim())){
      const saved=prizes(current());
      outputs.forEach((output,i)=>{if(!output.textContent.trim())output.textContent=money(saved[i]||0);});
    }
  }
}
function changeRuleType(form,index,mode){
  const rules=readRuleRows(form);if(rules[index].mode===mode)return;
  let amounts=[];try{amounts=prizes({...current(),settings:readRuleSettings(form,current())});}catch{}
  markRuleDraft(form);rules[index]={mode,value:mode==='fixed'?(amounts[index]||0):0};writeRuleRows(form,rules);
}
let payoutFormatChoice=null,payoutSaveChoice=null;
function requestRuleFormat(form){
  const mode=form.querySelector('[name=payoutMode]:checked').value,old=form.dataset.overallFormat;
  if(mode===old)return;for(const radio of form.querySelectorAll('[name=payoutMode]'))radio.checked=radio.value===old;
  payoutFormatChoice={form,mode,version,tournamentId:selected};
  modal('Change Prize Format?',`<p>Replace the individual payout entries with ${mode==='fixed'?'fixed dollar amounts based on the current payouts':'the default percentages for this number of paid places'}?</p><div class="button-row"><button type="button" class="button primary" data-action="confirm-payout-format">Replace Entries</button><button type="button" class="button secondary" data-action="close-modal">Cancel</button></div>`);
}
function confirmRuleFormat(){
  const choice=payoutFormatChoice;if(!choice||!dlg.open)return;
  if(choice.version!==version||choice.tournamentId!==selected||!choice.form.isConnected)throw new Error('Tournament changed. Reopen Payouts and review before changing the format.');
  const {form,mode}=choice,count=Number(form.elements.paidPlaces.value),amounts=mode==='fixed'?prizes({...current(),settings:readRuleSettings(form,current())}):[];
  markRuleDraft(form);const values=mode==='fixed'?amounts:defaultPayouts(count);form.dataset.overallFormat=mode;form.querySelector(`[name=payoutMode][value=${mode}]`).checked=true;
  writeRuleRows(form,values.map(value=>({mode,value})));payoutFormatChoice=null;dlg.close();
}
async function saveRulePayouts(form){
  const t=current(),settings=readRuleSettings(form,t),custom=t.payoutCustom||form.dataset.rulesEdited==='true';
  validatePayoutOrder(prizes({...t,settings}));
  if(payoutBalance({...t,settings})!==0)throw new Error('Payouts must exactly match the prize pool.');
  if(form.dataset.rulesEdited==='true'&&!t.payoutCustom&&['percent','guaranteed'].includes(t.settings.payoutMode)){
    payoutSaveChoice={version,tournamentId:selected,settings,custom};
    modal('Save Custom Payouts?',`<p>Replace the tournament’s ${t.settings.payoutMode==='guaranteed'?'guarantee and automatic payout rules':'automatic payout rules'} with these Custom Payouts?</p><ul>${prizes({...t,settings}).map((amount,i)=>`<li>${placeName(i)}: <strong>${money(amount)}</strong></li>`).join('')}</ul><p>These agreed rules stay in place until you change them.${t.settings.payoutMode==='guaranteed'&&prizes({...t,settings})[0]<guaranteeSettings(t.settings).guaranteeAmount?' <strong>First place will be below the configured guarantee.</strong>':''}</p><div class="button-row"><button type="button" class="button primary" data-action="confirm-custom-payouts">Save Payouts</button><button type="button" class="button secondary" data-action="close-modal">Cancel</button></div>`);return;
  }
  if(await commit({type:'payout-settings',tournamentId:selected,settings,custom}))toast('Payouts updated.');
}
async function confirmRulePayouts(){
  const choice=payoutSaveChoice;if(!choice||!dlg.open)return;
  if(choice.version!==version||choice.tournamentId!==selected)throw new Error('Tournament changed. Reopen Payouts and review before saving.');
  if(await commit({type:'payout-settings',...choice})){payoutSaveChoice=null;dlg.close();toast('Payouts updated.');}
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
  const manual=$('[data-action=manual-chop]');if(manual)manual.disabled=true;
  if(form.dataset.ruleEditor)return refreshRulePreview(form);
  const list=form.querySelector('#payout-place-list');if(!list)return;
  try{
    let mode=form.querySelector('[name=payoutMode]:checked').value;const count=Number(form.elements.paidPlaces.value);
    if(!Number.isInteger(count)||count<1||count>20)throw new Error('Choose 1–20 paid places.');
    if(mode!==list.dataset.mode||count!==list.children.length)changePlaceRows(form,mode,count);
    mode=form.querySelector('[name=payoutMode]:checked').value;
    const settings=readPayoutSettings(form,payoutContext(form)||{settings:editor.value.settings});
    setText('#guarantee-eligibility',guaranteeEligibility(settings,payoutContext(form)));
    if(mode==='percent'&&Math.abs(settings.payouts.reduce((a,b)=>a+b,0)-100)>0.000001)throw new Error('Percentages must total 100%.');
    if(form.id!=='payout-form'){$('#setup-payout-feedback').classList.remove('payout-order-error');if(mode==='percent'||mode==='fixed')validatePayoutOrder(settings.payouts,mode==='percent'?'percent':'dollars');if(mode==='guaranteed')setText('[data-payout-amount="0"]',`${money(settings.guaranteeAmount)} minimum at ${num(settings.guaranteePlayers)} players`);setText('#setup-payout-feedback','');return;}
    const t={...current(),settings},f=financials(t),amounts=prizes(t);amounts.forEach((n,i)=>setText(`[data-payout-amount="${i}"]`,money(n)));$('#guarantee-funding').innerHTML=fundingNotice(t);setText('#payout-pool',money(f.pool));
    const orderError=t.status==='completed'?'':payoutOrderError(amounts);form.querySelector('button.button.primary').disabled=t.status==='completed'||!!orderError;
    const dirty=JSON.stringify(settings)!==JSON.stringify(current().settings),icm=$('[data-action=icm-chop]');if(icm)icm.disabled=!!orderError||dirty||active(t).length<2||active(t).length>20||payoutBalance(t)!==0||hasPendingEliminations(t);
    if(manual)manual.disabled=!!orderError||dirty||active(t).length<2||payoutBalance(t)!==0||hasPendingEliminations(t);
    setText('#custom-payout-status',form.dataset.customDraft==='true'?'Custom Payouts'+(dirty?' — Save to apply':''):'');
    $('#payout-feedback').classList.toggle('payout-order-error',!!orderError);
    setText('#payout-feedback',orderError||(payoutBalance(t)?`Payouts differ from the prize pool by ${money(Math.abs(payoutBalance(t)))}. Adjust them before saving.`:dirty?'Save payout changes before calculating an ICM chop.':''));
  }catch(error){const icm=$('[data-action=icm-chop]');if(icm)icm.disabled=true;$(form.id==='payout-form'?'#payout-feedback':'#setup-payout-feedback')?.classList.toggle('payout-order-error',error.code==='PAYOUT_ORDER');setText(form.id==='payout-form'?'#payout-feedback':'#setup-payout-feedback',error.message);}
}
async function recalculatePayouts(){
  if(!await confirmApp('Replace your payout entries with the tournament structure payouts? Save Payouts will apply the change.'))return;
  let form=$('#payout-form'),t=current(),source=t.payoutAutomatic||{payoutMode:['percent','guaranteed'].includes(t.settings.payoutMode)?t.settings.payoutMode:'percent',payouts:['percent','guaranteed'].includes(t.settings.payoutMode)?t.settings.payouts:defaultPayouts(t.settings.payouts.length),guaranteeContribution:0};
  if(form.dataset.ruleEditor){const holder=document.createElement('div');holder.innerHTML=payoutPanel({...t,settings:{...t.settings,...source,payoutRules:undefined}},true);form.replaceWith(holder.querySelector('form'));form=$('#payout-form');}
  form.elements.houseContribution.value=num(Math.max(0,t.settings.houseContribution-(t.payoutCustom?source.guaranteeContribution||0:0))/100);form.dataset.customDraft='false';form.dataset.recalculate='true';
  const guarantee=guaranteeSettings(source.guaranteeAmount==null?t.settings:source);form.elements.guaranteeAmount.value=num(guarantee.guaranteeAmount/100);form.elements.guaranteePlayers.value=String(guarantee.guaranteePlayers);
  markPayoutChanged(form);payoutDrafts.delete(form);writePlaceRows(form,source.payoutMode,source.payoutMode==='guaranteed'?2:source.payouts.length,source.payouts.map(n=>String(source.payoutMode==='fixed'?n/100:n)));refreshPayoutPreview(form);
}
function summaryPrizes(t){
  if(t.status!=='completed')return '';
  const schedule=prizes(t),rows=t.entries.map(e=>({e,amount:e.agreedPayout??(e.place?schedule[e.place-1]||0:0)})).filter(r=>r.amount>0).sort((a,b)=>b.amount-a.amount||(a.e.place??0)-(b.e.place??0)||pName(a.e).localeCompare(pName(b.e)));
  return `<section class="summary-prizes"><h3>Prizes Paid Out</h3>${rows.map(({e,amount})=>`<div class="result-row" data-summary-prize="${e.playerId}"><span>${esc(pName(e))}${e.place?`<small>${placeName(e.place-1)}</small>`:''}</span><strong>${money(amount)}</strong></div>`).join('')}</section>`;
}
function summaryPanel(t){
  const f=financials(t),rows=[['Tournament Entries',f.tournamentEntries,'credit'],['Dealer Tokes (Buy-Ins Only)',f.dealerTokes,'credit'],['Rebuys',f.rebuyTotal,'credit'],...(f.addonTotal?[['Add-ons',f.addonTotal,'credit']]:[]),[`Tournament Fee${f.housePercent==null?'':` (${f.housePercent}%)`}`,-f.houseFee,'debit'],['Dealer Tokes Paid Out',-f.dealerTokesPaidOut,'debit'],['House Contribution',f.houseContribution,f.houseContribution>0?'credit':'neutral'],['Total Prize Pool',f.pool,'total']];
  return `<div class="section-label summary-heading"><h2>Tournament Summary</h2>${t.status==='completed'&&!t.archivedAt?'<button type="button" class="button secondary small" data-action="archive-tournament">Archive Tournament</button>':t.archivedAt?'<span class="pill light">Archived</span>':''}</div><div class="summary-grid financial-summary">${rows.map(([label,value,kind])=>`<div class="financial-${kind}"><span>${label}</span><strong>${value<0?'−':kind==='credit'&&value>0?'+':''}${money(Math.abs(value))}</strong>${label==='House Contribution'&&f.guaranteeContribution?`<small>Includes ${money(f.guaranteeContribution)} additional funding for the guarantee.</small>`:''}</div>`).join('')}</div>${summaryPrizes(t)}${tournamentPoints(t)}`;
}
function players(){if(!playerScreenModule)return screenPlaceholder('players');return playerScreenModule.renderPlayerDatabase({state,playerSearch,showArchived,playerDetail,profilePanel,esc,dateLabel,playerHistoryContents,empty,onMissingProfile:()=>{playerDetail=null;return players();}});}
function playerRows(rows){return playerScreenModule?.renderPlayerRows?playerScreenModule.renderPlayerRows(rows,{esc,empty,playerSearch}):'';}
function noTournament(title='No tournament is set up yet.'){return empty(title,'Create a tournament from one of your saved structures.','<button class="button primary" data-action="new-tournament">Create tournament</button>');}
function signup(){if(!registrationScreenModule)return screenPlaceholder('signup');return registrationScreenModule.renderTournamentRegistration({state,current,noTournament,financials,registrationPanel,signupSearch,money,num,esc,registrationRows,metrics,entryRows});}
function registrationRows(rows,t){return renderRegistrationRows(rows,t,esc);}
function goRemote(panel){if(panel==='tables'){if(!current()||!tableBalanceNeeded(current()))return;remoteTablesTournament=selected;}else remoteTablesTournament='';if(panel!==remotePanel)movePlayersEnabled=false;remotePanel=panel;history.pushState({},'',`${NAV_ROOT}?view=remote&tournament=${encodeURIComponent(selected)}&panel=${panel}`);render();}
function remoteScreen(){
  const t=current(),valid=t&&t.status!=='completed'&&(t.entries.length||t.startedAt);
  if(remotePanel==='tables'){if(t&&tableBalanceNeeded(t))remoteTablesTournament=t.id;else if(remoteTablesTournament!==t?.id){remotePanel='clock';movePlayersEnabled=false;}}
  const back=remotePanel==='clock'?'<button class="button secondary small" data-go="home">← Home</button>':'<button class="button secondary small" data-remote-panel="clock">← Clock</button>';
  const versionFooter=`<div class="remote-version" aria-label="App version">v${APP_VERSION}</div>`;
  const heading=`<header class="remote-header">${back}<div><span class="eyebrow">UNO CLUB</span><h1>Tournament Remote</h1></div><button class="connection" data-action="account"><i class="dot ${online?'green':'red'}"></i>${online?'Connected':'Offline'}</button></header>`;
  if(!valid)return `<div class="remote-shell">${heading}<main>${empty(t?.status==='completed'?'Tournament complete':'No active tournament',t?.status==='completed'?(t.endedBy==='icm-chop'?'Ended by ICM chop.':t.endedBy==='manual-chop'?'Ended by manual chop.':'Open Tournament Management to review the results.'):'Register players to open Tournament Remote.')}</main>${versionFooter}</div>`;
  let body='';
  if(remotePanel==='eliminate'){
    const remaining=active(t),tables=[...new Set(remaining.filter(e=>e.table).map(e=>e.table))].sort((a,b)=>a-b);
    const rows=entries=>entries.map(e=>`<div class="remote-player" data-remote-entry="${e.id}"><span class="seat-badge">${e.seat||'—'}</span><div><strong>${esc(pName(e))}</strong>${e.pendingElimination?'<small>Pending Elimination</small>':''}</div>${e.pendingElimination?`<button class="button secondary remote-undo" data-remote-undo="${e.id}" data-request="${e.pendingElimination.id}" data-expiry="${e.pendingElimination.expiresAt}">Undo</button>`:`<button class="button danger" data-remote-eliminate="${e.id}" ${remaining.filter(v=>!v.pendingElimination).length<=1||!online||busy?'disabled':''}>Eliminate</button>`}</div>`).join('');
    body=`<h2>Eliminate Player</h2>${tables.map(table=>`<section class="remote-table"><h3>TABLE ${table}</h3>${rows(remaining.filter(e=>e.table===table).sort((a,b)=>a.seat-b.seat))}</section>`).join('')}${remaining.some(e=>!e.table)?`<section class="remote-table"><h3>UNSEATED PLAYERS</h3>${rows(remaining.filter(e=>!e.table))}</section>`:''}`;
  }else if(remotePanel==='tables')body=`<section class="remote-seating">${tableManagement(t,true)}</section>`;
  else if(remotePanel==='payouts')body=`<h2>Payouts / ICM</h2><section class="panel remote-payouts">${payoutPanel(t)}</section>`;
  else{const c=clockAt(t,timeNow());body=`<section class="remote-clock panel clock-styled" aria-label="Tournament clock"><span id="remote-level" class="eyebrow"></span><strong id="remote-time" data-countdown></strong><span class="remote-blind-label">CURRENT BLINDS</span><strong id="remote-blinds"></strong><div class="remote-next"><span id="remote-next-label">NEXT BLINDS</span><strong id="remote-next"></strong></div><button id="remote-clock" class="button primary" data-clock="pause">Pause Clock</button></section><div class="remote-main-buttons"><button class="button remote-action-orange" data-remote-panel="eliminate">Eliminate Player</button><button class="button remote-action-purple" data-remote-panel="payouts">Payouts / ICM</button></div>`;}
  return `<div class="remote-shell">${heading}<main><p class="remote-tournament-name">${esc(t.name)}</p>${remotePanel!=='tables'?`<div id="remote-balance-warning" role="status">${balanceWarning(t)}</div>`:''}${!online?`<p class="mode-note warning" role="status">${esc(remoteError||'Reconnect to save changes.')}</p>`:''}${body}</main>${versionFooter}</div>`;
}
function balanceWarning(t){return tableBalanceNeeded(t)?'<button type="button" class="button remote-action-red remote-balance-button" data-remote-panel="tables">Balance Tables</button>':'';}
async function remoteElimination(entryId,undo=false){
  if(busy)return;if(!session||!online){toast('Reconnect before changing an elimination.',true);return;}
  const user=session.user.id,t=current(),entry=t?.entries.find(e=>e.id===entryId);if(!entry)return;
  const requestId=undo?entry.pendingElimination?.id:remoteRequests.get(entryId)||id();if(!requestId)return;
  if(!undo)remoteRequests.set(entryId,requestId);busy=true;document.body.classList.add('saving');tick();
  try{
    const {data,error}=await db.rpc('td_remote_elimination',{p_tournament_id:t.id,p_entry_id:entryId,p_request_id:requestId,p_command:undo?'undo':'start'});
    if(session?.user.id!==user)return;if(error)throw error;const saved=Array.isArray(data)?data[0]:data;if(!saved?.state)throw new Error('Could not confirm the elimination. Reconnect and review the player.');
    if(Number(saved.version)>=version){state=upgradeState(saved.state);version=Number(saved.version);}lastSync=Date.now();remoteRequests.delete(entryId);render();
    if(undo&&current()?.entries.find(e=>e.id===entryId)?.eliminatedAt)toast('Undo time expired. Use Tournament Management → Players to correct this elimination.',true);
  }catch(error){toast(error.message||'Could not save. Reconnect and retry.',true);await refresh(true);}
  finally{busy=false;document.body.classList.remove('saving');tick();}
}
function entryRows(t,management){return t.entries.slice().sort((a,b)=>Number(!!a.eliminatedAt)-Number(!!b.eliminatedAt)||pName(a).localeCompare(pName(b))).map(e=>`<div class="entry-row ${e.eliminatedAt?'out':''}"><div><strong>${esc(pName(e))}</strong><small>${e.icmChopParticipant?'ICM chop · '+num(e.finalChipCount)+' chips':e.manualChopParticipant?'Manual chop':e.place?'Finished #'+e.place:(e.table?'Table '+e.table+' · Seat '+e.seat:'Not seated')}</small></div><div class="entry-actions">${t.status==='completed'?'':!e.eliminatedAt?`${t.settings.addonEnabled?`<button class="button tiny secondary" data-addon="${e.id}">Add-on</button>`:''}${management?(e.pendingElimination?'<span class="pill light">Pending Elimination</span>':`<button class="button tiny danger" data-eliminate="${e.id}">Eliminate</button>`):''}`:management?`<button type="button" class="button tiny secondary" data-undo-elimination="${e.id}">Undo Elimination</button>`:'<span class="pill light">Eliminated</span>'}</div></div>`).join('');}
function rebuyCountHelp(t,c){return !t.settings.rebuyEnabled?'Rebuys are turned off for this tournament.':t.status==='completed'?'This tournament is finished.':canRecordRebuys(t,c)?'Enter the total number of rebuys for this tournament.':(cutoffHasBreak(t)?'Available when the break after the final rebuy round begins.':'Available after the final rebuy round.');}
function rebuyCountControl(t){const c=clockAt(t,timeNow());return `<div class="rebuy-total-controls"><button class="button secondary" id="record-rebuys" data-action="rebuy-count" ${!canEditRebuys(t,c)?'disabled':''}>Rebuy (${tournamentRebuyCount(t)})</button></div>`;}
function controls(t){const c=clockAt(t,timeNow()),needsSeats=c.status==='ready'&&t.entries.filter(e=>!e.eliminatedAt&&Number.isInteger(e.table)&&e.table>0&&Number.isInteger(e.seat)&&e.seat>0).length<2;return `<div class="clock-controls"><button class="button ${c.status==='running'?'remote-action-red':c.status==='paused'?'remote-action-green':'primary'}" id="clock-main" data-clock="${c.status==='running'?'pause':c.status==='ready'?'start':'resume'}" ${c.status==='ended'||t.status==='completed'||needsSeats?'disabled':''}>${c.status==='running'?'Pause Clock':c.status==='ready'?'Start Tournament':'Resume Clock'}</button>${needsSeats?'<p class="muted" role="status">Seat at least two players before starting the tournament.</p>':''}<button class="button secondary" data-clock="previous" ${c.index===0||t.status==='completed'?'disabled':''}>← Previous level</button><button class="button secondary" data-clock="next" ${c.index===t.levels.length-1||t.status==='completed'?'disabled':''}>Next level →</button><button class="button secondary" data-adjust="-60" ${t.status==='completed'?'disabled':''}>−1 minute</button><button class="button secondary" data-adjust="60" ${t.status==='completed'?'disabled':''}>+1 minute</button></div>`;}
function tvDisplayControls(t){
  if(!t)return '';
  const mode=tvDisplayMode(t),started=tournamentStarted(t);
  return `<section class="tv-display-controls" aria-label="TV Display"><strong>TV Display</strong><div class="tv-display-buttons" role="group" aria-label="TV display mode">${[['full-clock','Full Clock'],['clock-seating','Clock + Seating']].map(([value,label])=>`<button type="button" class="button small secondary ${mode===value?'is-selected':''}" data-tv-display="${value}" aria-pressed="${mode===value}" ${busy||!online||value==='full-clock'&&!started?'disabled':''}>${label}</button>`).join('')}</div></section>`;
}
function manage(){const t=current();if(!t)return noTournament('No active tournament');const f=financials(t);return `<div class="management-registration-entry"><button type="button" class="button primary" data-go="signup">Tournament Registration</button></div>${metrics(t)}${tableBalanceNeeded(t)?'<p class="table-balance-alert" role="alert"><strong>Tables Need Balancing.</strong> Please move one player to balance the tables.</p>':''}<section class="panel control-panel"><div class="mini-clock"><span class="eyebrow" id="mini-level"></span><strong id="mini-time">15:00</strong><span id="mini-blinds"></span><small id="mini-note"></small></div><div class="management-clock-actions">${controls(t)}${rebuyCountControl(t)}</div></section><div class="management-layout"><div class="management-sidebar" role="tablist" aria-label="Management sections" aria-orientation="vertical">${[['players','Players'],['tables','Tables & Seating'],['payouts','Payouts'],['summary','Summary']].map(([k,label])=>`<button type="button" role="tab" id="management-tab-${k}" aria-selected="${tab===k}" aria-controls="management-panel" tabindex="${tab===k?'0':'-1'}" data-tab="${k}" class="${tab===k?'active':''}">${label}</button>`).join('')}</div><section class="panel management-panel" id="management-panel" role="tabpanel" aria-labelledby="management-tab-${tab}" tabindex="0">${tab==='players'?`<div class="section-label"><h2>Players</h2><div class="button-row"><button class="button small primary" data-action="finish" ${active(t).length!==1||t.status==='completed'?'disabled':''}>Confirm winner & finish</button></div></div>${t.entries.length?entryRows(t,true):'<p class="muted">Register players from Tournament Registration.</p>'}`:tab==='tables'?tableManagement(t):tab==='payouts'?payoutPanel(t):summaryPanel(t)}</section></div>${!tournamentStarted(t)&&t.status==='open'?`<section class="panel tournament-danger-zone"><h3>Tournament Actions</h3><p class="muted">Created the wrong tournament? Delete it before the tournament starts. Registered players will be removed from this tournament; player records and points remain unchanged.</p><button type="button" class="button danger" data-action="delete-tournament" ${busy||!online?'disabled':''}>Delete Tournament</button></section>`:''}`;}
function tableManagement(t,remote=false){
  const remaining=active(t);
  const seated=remaining.filter(e=>e.table),unseated=remaining.filter(e=>!e.table);
  return `<div class="section-label"><h2>Tables & Seating</h2><div class="management-table-actions"><div class="button-row">${!remote||unseated.length?`<button class="button secondary small" data-action="seat-remaining" ${t.status==='completed'||!unseated.length?'disabled':''}>${seated.length?'Seat Remaining Players':'Seat Players'}</button>`:''}<button class="button secondary small" data-action="combine-tables" ${t.status==='completed'||!canCombineTables(t)?'disabled':''}>${tableActionName(t)}</button></div>${!remote&&tableBalanceNeeded(t)&&t.status!=='completed'?`<button type="button" class="button management-balance-button" data-action="balance-tables">Balance Tables</button>`:''}</div></div>${remote?'':`<form id="seating-settings-form" class="seating-settings-form"><input type="hidden" name="tournamentId" value="${t.id}"><label>Seats per table<input type="number" name="seatsPerTable" min="2" max="10" step="1" value="${t.settings.seatsPerTable}" required ${t.status==='completed'?'disabled':''}></label><button class="button secondary" ${t.status==='completed'?'disabled':''}>Apply</button></form>`}<div class="seat-move-help"><p class="muted" id="seat-move-instructions" role="status">${seatMoveInstructions(remote)}</p>${remote?'':`<button type="button" class="button secondary small move-players-toggle ${movePlayersEnabled?'is-active':''}" data-action="toggle-move-players" aria-pressed="${movePlayersEnabled}" ${t.status==='completed'?'disabled':''}>Move Players</button>`}<button type="button" class="button secondary small" id="cancel-seat-pick" data-action="cancel-seat-pick" hidden>Cancel move</button></div><div class="seat-tables ${remote||movePlayersEnabled?'moves-enabled':''}">${Array.from({length:tablesInUse(t)},(_,i)=>`<div class="seat-table"><h3><span class="seat-table-title">TABLE ${i+1}</span><small>${remaining.filter(e=>e.table===i+1).length} of ${t.settings.seatsPerTable} Seats Filled</small></h3>${Array.from({length:t.settings.seatsPerTable},(_,j)=>{const e=remaining.find(e=>e.table===i+1&&e.seat===j+1);return seatRow(t,i+1,j+1,e,remote);}).join('')}</div>`).join('')}</div><h3>Unseated players</h3>${remaining.filter(e=>!e.table).map(e=>`<div class="result-row unseated-player-row"><span>${esc(pName(e))}</span><div class="unseated-player-actions"><button class="button small secondary" data-seat="${e.id}" ${!remote&&!movePlayersEnabled||t.status==='completed'?'disabled':''}>Assign seat</button>${remote?'':seatEliminateButton(t,e)}</div></div>`).join('')||'<p class="muted">All remaining players have seats.</p>'}`;
}
function seatMovesEnabled(){return view==='remote'?remotePanel==='tables'&&current()?.status!=='completed':movePlayersEnabled;}
function seatMoveInstructions(remote=view==='remote'){return remote?'Tap a player, then tap the destination seat.':'Drag a player to another seat, or select a player and then a seat.';}
function seatEliminateButton(t,entry){return `<button type="button" class="seat-eliminate-button" data-eliminate="${entry.id}" aria-label="Eliminate ${esc(pName(entry))} from the tournament" ${t.status==='completed'||entry.pendingElimination||active(t).length<=1?'disabled':''}>Eliminate</button>`;}
function seatRow(t,table,seat,entry,remote=false){
  const disabled=t.status==='completed'?'disabled':'',moveDisabled=disabled||(!remote&&!movePlayersEnabled||entry?.seatLocked||entry?.pendingElimination?'disabled':'');
  return `<div class="seat-row ${entry?.seatLocked?'seat-locked':''}" data-seat-target data-table="${table}" data-seat="${seat}">${entry?`<button type="button" class="seat-player-grip" data-seat-grab="${entry.id}" aria-pressed="false" aria-label="Move ${esc(pName(entry))} from Table ${table}, Seat ${seat}" title="${remote?'Tap this player, then tap the destination seat':'Drag to another seat, or select then choose a seat'}" ${moveDisabled}><span class="seat-number" aria-hidden="true">${seat}</span><span class="seat-player-name">${esc(pName(entry))}</span>${remote?'':'<span class="seat-grab-icon" aria-hidden="true">⠿</span>'}</button><div class="seat-player-actions"><button type="button" class="text-button" data-seat="${entry.id}" ${moveDisabled}>Move</button><button type="button" class="seat-lock-button ${entry.seatLocked?'is-locked':''}" data-seat-lock="${entry.id}" aria-pressed="${!!entry.seatLocked}" aria-label="${entry.seatLocked?'Unlock':'Lock'} ${esc(pName(entry))} at Table ${table}, Seat ${seat}" ${disabled}>${entry.seatLocked?'Locked':'Lock in seat'}</button>${remote?'':seatEliminateButton(t,entry)}</div>`:`<button type="button" class="seat-empty" data-seat-target-button="true" aria-label="Table ${table}, Seat ${seat}, empty" ${disabled||(!remote&&!movePlayersEnabled?'disabled':'')}><span class="seat-number" aria-hidden="true">${seat}</span><span class="muted">Empty</span></button>`}</div>`;
}
function ordinal(n){return n+(n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'})[n%10]||'th');}
function clockSidebar(t,c){
  const phase=rebuyPhase(t,c),open=phase!=='closed',count=active(t).length+' / '+t.entries.length,pool=tvMoney(financials(t).pool),withBreak=cutoffHasBreak(t);
  const notice=phase==='final-round'?`<strong class="tv-final-rebuy">Final Rebuy Round</strong><p class="tv-cutoff-detail">${withBreak?'Rebuys remain open during the following break':'Rebuys close after this round'}</p>`:phase==='final-break'?'<strong>Rebuys Open</strong><p class="tv-cutoff-detail">Rebuys close when this break ends</p>':`<strong>Rebuys Open</strong><p>Through Level ${t.settings.rebuyLastRound}</p>${withBreak?'<p class="tv-cutoff-detail">Includes the following break</p>':''}`;
  return `<div class="tv-players"><span>PLAYERS REMAINING</span><strong style="font-size:min(${open?9:7.5}vw,${52/count.length}vw)">${count}</strong>${!open?`<small class="tv-rebuy-count">Rebuys: ${financials(t).rebuyCount}</small>`:''}</div>${open?`<div class="tv-rebuys-open">${notice}</div>`:`<div class="tv-pool"><span>PRIZE POOL</span><strong style="font-size:min(7.5vw,${52/pool.length}vw)">${pool}</strong></div><div class="tv-prizes"><span>PAYOUTS</span><div class="tv-payout-list">${prizes(t).map((v,i)=>`<p><span>${(t.icmChop||t.manualChop)?.participants[i]?esc(pName((t.icmChop||t.manualChop).participants[i])):ordinal(i+1)}</span><strong>${tvMoney(v)}</strong></p>`).join('')}</div></div>`}`;
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
  if(!state.tournaments.length)return;
  if(current()&&(!current().archivedAt||view==='manage'&&reviewingHistory===selected))return;
  const tournament=homeTournament()||state.tournaments.slice().reverse().find(t=>!t.archivedAt&&t.status!=='completed')||state.tournaments.slice().reverse().find(t=>!t.archivedAt);
  selected=tournament?.id||'';if(selected)localStorage.setItem('uno-tournament-selected',selected);else localStorage.removeItem('uno-tournament-selected');
  signupSearch='';registrationPanel='find';
}
function historicalSummaryScreen(){const t=state.tournaments.find(t=>t.id===historyTournamentId);const heading=t?`${esc(t.name)} · ${dateLabel(t.date)}`:'Tournament not found';const summary=t?summaryPanel(t).replace(/<button[^>]*data-action="archive-tournament"[^>]*>.*?<\/button>/,''):'<p>This tournament is no longer available.</p>';return `<header class="header page-banner"><button type="button" class="button secondary small" data-action="history-summary-back" aria-label="Back to player">←</button><div class="page-banner-title"><h1 id="page-title">${heading}</h1></div></header><div class="workspace"><main class="content"><section class="panel">${summary}</section></main></div>`;}
function archives(){
  const seasons=pointsState(state).seasons;
  const now=new Date(),lastMonth=new Date(now.getFullYear(),now.getMonth()-1,1);
  const list=state.tournaments.filter(t=>!!t.archivedAt).filter(t=>{
    const date=new Date((t.date||'')+'T12:00:00');
    if(archiveFilter.period==='month'&&(date.getFullYear()!==lastMonth.getFullYear()||date.getMonth()!==lastMonth.getMonth()))return false;
    if(archiveFilter.period==='year'&&date.getFullYear()!==now.getFullYear()-1)return false;
    if(archiveFilter.period==='season'&&t.pointsSeasonId!==archiveFilter.seasonId)return false;
    return !archiveFilter.search||`${t.name} ${t.date}`.toLowerCase().includes(archiveFilter.search.toLowerCase());
  }).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||String(b.archivedAt).localeCompare(String(a.archivedAt)));
  const filter=`<form id="archive-filter" class="leaderboard-filters"><label>Show<select name="period">${[['all','All History'],['month','Last Month'],['season','Last Season'],['year','Last Year']].map(([v,n])=>`<option value="${v}" ${archiveFilter.period===v?'selected':''}>${n}</option>`).join('')}</select></label>${archiveFilter.period==='season'?`<label>Season<select name="seasonId">${seasons.filter(x=>x.id!==pointsState(state).currentSeasonId).slice().reverse().map(x=>`<option value="${x.id}" ${archiveFilter.seasonId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`:''}<label>Search<input type="search" name="search" value="${esc(archiveFilter.search)}" placeholder="Tournament name or date"></label><button class="button secondary small" type="submit">Search</button></form>`;
  if(archiveDetail){const t=state.tournaments.find(t=>t.id===archiveDetail&&t.archivedAt);return `<section class="panel archive-detail">${t?`<h2>${esc(t.name)} · ${dateLabel(t.date)}</h2><p class="muted">Archived tournament · Read-only</p><h3>Registered Players & Results</h3>${entryRows(t,false)}${summaryPanel(t)}`:'<p>This archived tournament could not be found.</p>'}</section>`;}
  return `<section class="panel archive-list"><div class="section-label"><h2>Tournament Archives</h2></div>${filter}<div class="archive-results">${list.length?list.map(t=>`<button type="button" class="result-row history-tournament" data-archive-tournament="${t.id}"><span><strong>${esc(t.name)}</strong><small>${dateLabel(t.date)} · ${t.entries.length} players</small></span><strong>View Summary</strong></button>`).join(''):'<p class="muted">No archived tournaments match these filters.</p>'}</div></section>`;
}
function workspaceScreen(){
  const banner=header()+importNotice(),menu=view==='home'?'':nav();
  const content=`<main class="content">${({home,setup,players,signup,manage,archives,leaderboard}[view]||home)()}</main><footer class="app-footer"><span>UNO CLUB · TOURNAMENT DIRECTOR</span><button type="button" class="connection footer-connection" data-action="account"><i class="dot ${online?'green':'red'}"></i>${online?'Connected':'Reconnect'}</button><span>v${APP_VERSION} · ${online?'Saved online':'Connection interrupted'}</span></footer>`;
  if(view==='manage')return `<div class="management-chrome">${banner}<div class="workspace">${menu}</div></div><div class="workspace">${content}</div>`;
  return `${banner}<div class="workspace">${menu}${content}</div>`;
}
function render(){if(session&&view==='home')ensureHomeModule();if(session&&(view==='players'||view==='signup'))ensureScreenModule(view);if(!session||!(view==='manage'&&tab==='tables'||view==='remote'&&remotePanel==='tables')||movePlayersTournament!==selected)movePlayersEnabled=false;seatDragging?.cancel();clearSeatPick();if(!session){clearInterval(clockTimer);document.body.classList.remove('registration-page','tv','home-page','fixed-workspace','setup-page','players-page','player-profile-page','remote-page','leaderboard-page','points-editing');app.innerHTML=signInScreen();clockToolbar?.sync();return;}selectCurrentTournament();if(movePlayersTournament!==selected||current()?.status==='completed')movePlayersEnabled=false;const registration=registrationSnapshot(),panels=panelSnapshot();clearInterval(clockTimer);document.body.classList.toggle('points-editing',view==='players'&&!!pointsEditor);document.body.classList.toggle('leaderboard-page',view==='leaderboard');document.body.classList.toggle('registration-page',view==='signup'&&!!current());document.body.classList.toggle('tv',view==='clock');document.body.classList.toggle('remote-page',view==='remote');document.body.classList.toggle('home-page',view==='home');document.body.classList.toggle('fixed-workspace',['setup','players','leaderboard'].includes(view));document.body.classList.toggle('setup-page',view==='setup');document.body.classList.toggle('players-page',view==='players');document.body.classList.toggle('player-profile-page',view==='players'&&!!playerDetail);if(view==='history-summary'){app.innerHTML=historicalSummaryScreen();}else if(view==='clock'){app.innerHTML=clockScreen();}else if(view==='remote'){app.innerHTML=remoteScreen();}else{app.innerHTML=workspaceScreen();}restoreRegistration(registration);restorePanels(panels);clockToolbar?.sync();renderedWorkspaceVersion=version;if($('#payout-form')?.dataset.ruleEditor)refreshRulePreview($('#payout-form'));updatePayoutSaveButton();if(view==='setup'&&editor)applyClockAppearance($('.structure-clock-appearance .clock-appearance-preview'),editor.value.clockAppearance||state.clockAppearanceDefaults);if(view==='remote'){try{applyClockAppearance($('.remote-clock'),current()?.clockAppearance);}catch{applyClockAppearance($('.remote-clock'),ORIGINAL_CLOCK_APPEARANCE);}}tick();clockTimer=setInterval(tick,250);if(view==='clock'){try{applyClockAppearance($('.tv-shell'),scheduledClockAppearance(current()));}catch{applyClockAppearance($('.tv-shell'),ORIGINAL_CLOCK_APPEARANCE);}fitTvSeating();if(automaticTvLaunch&&!tvLaunchAttempted){tvLaunchAttempted=true;void tryTvFullscreen(false);}}}
function setText(selector,text){const el=$(selector);if(el&&el.textContent!==String(text)){el.textContent=text;if(el.hasAttribute('data-tv-fit'))fitTvSeating(document,[el]);}}
function formatTime(ms){const sec=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
function nextBreak(t,c){if(t.levels[c.index].kind==='break')return 'Break in progress';let ms=c.remainingMs;for(let i=c.index+1;i<t.levels.length;i++){if(t.levels[i].kind==='break')return 'Next break in '+formatTime(ms);ms+=t.levels[i].minutes*60000;}return 'No further breaks scheduled';}
function scheduledClockAppearance(t,c=t?.clock){if(!t)return state.clockAppearanceDefaults||ORIGINAL_CLOCK_APPEARANCE;const level=t.levels[c?.index??0],saved=level?.layoutId?(state.clockLayouts||[]).find(l=>l.id===level.layoutId):null;return saved?.appearance||t.clockAppearance||state.clockAppearanceDefaults||ORIGINAL_CLOCK_APPEARANCE;}
function tick(){const t=current();if(!t)return;const c=clockAt(t,timeNow()),l=t.levels[c.index],round=roundAt(t,c.index);const tv=$('.tv-shell');if(tv){const key=c.index+':'+(l.layoutId||'')+':'+JSON.stringify((state.clockLayouts||[]).map(x=>[x.id,x.appearance]))+':'+JSON.stringify(t.clockAppearance);if(tv.dataset.appliedLayoutKey!==key){applyClockAppearance(tv,scheduledClockAppearance(t,c));tv.dataset.appliedLayoutKey=key;}}const level=l.kind==='break'?'BREAK':'ROUND '+round,blinds=l.kind==='break'?'Take a break':num(l.sb)+' / '+num(l.bb);const status=t.status==='completed'?(t.endedBy==='icm-chop'?'ENDED BY ICM CHOP':t.endedBy==='manual-chop'?'ENDED BY MANUAL CHOP':'TOURNAMENT COMPLETE'):({ready:'READY TO START',running:l.kind==='break'?'BREAK':'LEVEL IN PROGRESS',paused:'CLOCK PAUSED',ended:'SCHEDULE COMPLETE'})[c.status];
  setText('#hero-time',formatTime(c.remainingMs));setText('#hero-blinds',level+' · '+blinds);setText('#mini-level',level);setText('#mini-time',formatTime(c.remainingMs));setText('#mini-blinds',blinds);setText('#mini-note',status);setText('#status-metric',statusLabel(t));
  const notice=$('.tv-compact-rebuys');if(notice&&notice.dataset.rebuyPhase!==rebuyPhase(t,c)){notice.dataset.rebuyPhase=rebuyPhase(t,c);notice.textContent=compactRebuyNotice(t,c);notice.classList.toggle('final-rebuy',rebuyPhase(t,c)==='final-round');}
  const side=$('.tv-side');if(side&&side.dataset.rebuyPhase!==rebuyPhase(t,c)){side.dataset.rebuyPhase=rebuyPhase(t,c);side.className='tv-side '+(rebuyOpen(t,c)?'pre-rebuys':'post-rebuys');side.innerHTML=clockSidebar(t,c);}
  setText('#tv-level',level);setText('#tv-status',c.status==='running'?'':status);setCountdown($('#tv-time'),formatTime(c.remainingMs));if($('#tv-time')?.hasAttribute('data-tv-fit'))fitTvSeating(document,[$('#tv-time')]);setText('#tv-game',l.kind==='break'?(l.chipUp?'BREAK · CHIP UP':'BREAK'):'CURRENT BLINDS');setText('#tv-blinds',blinds);setText('#tv-ante',l.kind==='play'&&t.settings.anteMode!=='off'&&l.ante?'Ante '+num(l.ante)+' · '+(t.settings.anteMode==='big_blind'?'Big blind':'Each player'):'Antes off');setText('#tv-break',nextBreak(t,c));
  const next=t.levels[c.index+1];setText('#tv-next-label',next?.kind==='break'?'NEXT BREAK':'NEXT BLINDS');setText('#tv-next',next?(next.kind==='break'?`${next.minutes} minutes${next.chipUp?' · Chip up':''}`:`${num(next.sb)} / ${num(next.bb)}`):'Final level');
  $('#tv-time')?.classList.toggle('urgent',c.remainingMs<=60000&&c.status==='running');if($('#tv-progress'))$('#tv-progress').style.width=(100*Math.min(1,c.remainingMs/(l.minutes*60000)))+'%';
  setCountdown($('#remote-time'),formatTime(c.remainingMs));setText('#remote-level',level);setText('#remote-blinds',l.kind==='break'?'Take a break':num(l.sb)+' / '+num(l.bb));setText('#remote-next-label',next?.kind==='break'?'NEXT BREAK':'NEXT BLINDS');setText('#remote-next',next?(next.kind==='break'?next.minutes+' minutes':num(next.sb)+' / '+num(next.bb)):'Final level');
  const b=$('#clock-main')||$('#remote-clock');if(b){const command=c.status==='running'?'pause':c.status==='ready'?'start':'resume';b.dataset.clock=command;b.textContent=c.status==='running'?'Pause clock':c.status==='ready'?'Start tournament':'Resume clock';b.disabled=busy||!online||c.status==='ended'||t.status==='completed'||command==='start'&&t.entries.filter(e=>!e.eliminatedAt&&Number.isInteger(e.table)&&e.table>0&&Number.isInteger(e.seat)&&e.seat>0).length<2;if(b.id==='remote-clock'){b.classList.toggle('remote-action-red',c.status==='running');b.classList.toggle('remote-action-green',c.status==='paused');b.textContent=c.status==='running'?'Pause Clock':c.status==='ready'?'Start Tournament':'Resume Clock';}}
  for(const button of document.querySelectorAll('[data-remote-undo]')){const left=Number(button.dataset.expiry)-timeNow();button.disabled=busy||!online||left<=0;button.textContent=left>0?'Undo ('+Math.ceil(left/1000)+')':'Finalizing…';}for(const button of document.querySelectorAll('[data-remote-eliminate]'))button.disabled=busy||!online||active(t).filter(e=>!e.pendingElimination).length<=1;
  const guarantee=$('#payout-form [name=payoutMode][value=guaranteed]');if(guarantee){guarantee.disabled=t.status==='completed';try{setText('#guarantee-eligibility',guaranteeEligibility(readGuarantee(guarantee.form,clone(t.settings)),t));}catch{ /* Keep the draft validation message while editing. */ }}
  const balanceNotice=$('#remote-balance-warning');if(view==='remote'&&balanceNotice){const html=balanceWarning(t);if(balanceNotice.innerHTML!==html)balanceNotice.innerHTML=html;}
  const rebuyButton=$('#record-rebuys');if(rebuyButton){rebuyButton.disabled=busy||!online||!canEditRebuys(t,c);rebuyButton.classList.toggle('rebuy-available',!rebuyButton.disabled&&canRecordRebuys(t,c));rebuyButton.textContent=`Rebuy (${tournamentRebuyCount(t)})`;setText('#rebuy-total-help',rebuyCountHelp(t,c));}
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
    if(action.type==='payout-settings'){const savedTournament=state.tournaments.find(t=>t.id===action.tournamentId);if(savedTournament)payoutSaveReceipts.set(savedTournament.id,payoutFingerprint(savedTournament));}
    render();return true;
  }catch(error){toast(error.message||'Could not save. Please retry.',true);return false;}finally{busy=false;document.body.classList.remove('saving');tick();}}
async function synchronizeTime(){if(!session)return;const user=session.user.id,before=performance.now();const {data,error}=await db.rpc('td_server_time');if(!error&&session?.user.id===user)serverSample={epoch:Date.parse(data),mono:(before+performance.now())/2};}
async function refresh(force=false){if(!session||(busy&&!force))return;const user=session.user.id;try{
    const {data,error}=await db.from('td_workspaces').select('state,version,updated_at').eq('owner_id',session.user.id).maybeSingle();if(session?.user.id!==user)return;if(error)throw error;
    let changed=false;if(data&&Number(data.version)>version){state=upgradeState(data.state);version=Number(data.version);changed=true;}
    const wasOffline=!online;online=true;remoteError='';lastSync=Date.now();
    if((changed||wasOffline)&&!dlg.open&&!$('#confirmation-dialog')?.open&&!editor&&!$('#payout-form')?.dataset.rulesDirty&&!$('#payout-form')?.dataset.payoutChanged&&!pointsEditor&&(view==='signup'&&(!current()||current()?.archivedAt||current()?.status==='completed')||!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)))render();
  }catch(e){if(session?.user.id!==user)return;const changed=online;online=false;remoteError=e.message||'Could not reach Supabase.';if(changed&&!dlg.open&&!$('#confirmation-dialog')?.open&&!editor)render();}}
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
  if(connectedUser&&connectedUser!==user)reviewingHistory='';connectedUser=user;$('#confirmation-dialog')?.dispatchEvent(new Event('cancel',{cancelable:true}));payoutSaveReceipts.clear();pointsEditor=null;pointsSaveChoice=null;finishChoice=null;manualChopReview=null;
  if(!user){const previous=channel;channel=null;if(previous)void db.removeChannel(previous);state=initialState();version=0;online=false;editor=null;serverSample=null;if(dlg.open)dlg.close();render();return;}
  return enterCloud();
}
async function confirmApp(message,title='Are You Sure?',yesLabel='Confirm'){
  let box=$('#confirmation-dialog');if(box?.open)return false;
  if(!box){box=document.createElement('dialog');box.id='confirmation-dialog';document.body.append(box);}
  const context={version,selected,user:session?.user.id};
  box.setAttribute('aria-labelledby','confirmation-title');box.setAttribute('aria-describedby','confirmation-message');
  box.innerHTML=`<div class="modal-heading"><h2 id="confirmation-title">${esc(title)}</h2></div><p id="confirmation-message">${esc(message)}</p><div class="button-row"><button type="button" class="button secondary" data-confirm-answer="no">Cancel</button><button type="button" class="button primary" data-confirm-answer="yes">${esc(yesLabel)}</button></div>`;
  const answer=await new Promise(resolve=>{
    const finish=value=>{box.removeEventListener('click',click);box.removeEventListener('cancel',cancel);box.removeEventListener('close',cancel);if(box.open)box.close();resolve(value);};
    const click=event=>{const button=event.target.closest('[data-confirm-answer]');if(button){event.stopPropagation();finish(button.dataset.confirmAnswer==='yes');}};
    const cancel=event=>{event?.preventDefault();finish(false);};box.addEventListener('click',click);box.addEventListener('cancel',cancel);box.addEventListener('close',cancel);box.showModal();
  });
  if(answer&&(context.version!==version||context.selected!==selected||context.user!==session?.user.id))throw new Error('Tournament changed. Review the latest information and try again.');
  return answer;
}
async function registrationPermission(t=current(),creating=false){
  if(!t||t.status==='completed'||t.archivedAt)throw new Error('This tournament is finished.');
  if(registrationOpen(t,clockAt(t,timeNow())))return {allowed:true,overrideCutoff:false};
  const allowed=await confirmApp(creating?'Registration is closed. Override and add a new player?':'Registration is closed. Override and register this player?','Registration Closed','Override');return {allowed,overrideCutoff:allowed};
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
function newTournament(templateId){const template=state.templates.find(t=>t.id===templateId)||state.templates[0],appearance=clockAppearance(template?.clockAppearance||state.clockAppearanceDefaults);modal('Create a tournament',`<form id="new-tournament-form"><label>Tournament name<input name="name" placeholder="Wednesday tournament" required maxlength="120"></label><label>Tournament date<input type="date" name="date" value="${today()}" required></label><label>Saved structure<select name="templateId">${state.templates.map(s=>`<option value="${s.id}" ${s.id===template?.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><p class="muted">This creates an independent copy. You can change its settings without changing the saved structure.</p><details class="new-tournament-appearance"><summary>Clock Appearance (optional)</summary>${appearanceFields(appearance)}</details><button class="button primary full">Create tournament</button></form>`);refreshAppearancePreview($('#new-tournament-form'));}
async function newPlayer(){const t=view==='signup'?current():null,permission=t&&(t.status==='completed'||!registrationOpen(t,clockAt(t,timeNow())))?await registrationPermission(t,true):{allowed:true,overrideCutoff:false};if(!permission.allowed)return;modal('Add a player',`<form id="player-form">${t?`<input type="hidden" name="registrationTournamentId" value="${t.id}"><input type="hidden" name="overrideCutoff" value="${permission.overrideCutoff}">`:''}<label>Player name<input name="name" value="${esc(view==='signup'?signupSearch:'')}" maxlength="100" placeholder="Name or nickname" autocomplete="off" required></label><p class="name-feedback" id="player-name-feedback" role="status"></p><label>Phone number (optional)<input type="tel" name="phone" maxlength="40" autocomplete="tel" data-phone="true" pattern="([0-9]{10}|[0-9]{3}-[0-9]{3}-[0-9]{4})" placeholder="###-###-####" title="Enter exactly 10 digits, such as 555-123-4567."></label><label>Notes (optional)<textarea name="notes" maxlength="1000"></textarea></label><button class="button primary full">Save player</button></form>`);}
function appearancePreview(){return `<div class="clock-appearance-preview clock-styled" aria-label="Clock appearance preview"><span class="preview-level">ROUND 1</span><strong class="preview-countdown" data-countdown><span class="timer-minutes">15</span><span class="timer-colon">:</span><span class="timer-seconds">00</span></strong><strong class="preview-current">100 / 200</strong><span class="preview-next">Next blinds: 200 / 400</span><small class="preview-other">Time remaining · Players remaining</small></div>`;}
function structureClockAppearance(){return `<div class="form-section structure-clock-appearance"><div class="section-label"><h3>Clock Appearance</h3><button type="button" class="button secondary small" data-action="structure-clock-appearance">Customize Clock Appearance</button></div>${appearancePreview()}<p class="muted small-copy">${editor?.event?'Applies to this tournament’s TV and Remote clock.':'Used by new tournaments created from this structure.'}</p></div>`;}
function appearanceFields(appearance){
  const colors=[['background','Clock background'],['timer','Countdown solid color'],['minutes','Minutes color'],['seconds','Seconds color'],['gradientStart','Gradient start'],['gradientEnd','Gradient end'],['stripe1','Stripe color 1'],['stripe2','Stripe color 2'],['stripe3','Stripe color 3'],['currentBlinds','Current blinds'],['nextBlinds','Next blinds'],['level','Level text'],['text','Other clock text']];
  return `<label>Preset<select name="preset"><option value="custom">Custom colors</option><option value="original">Original Uno Club</option><option value="contrast">High Contrast</option><option value="blue">Blue</option><option value="green">Green</option></select></label><fieldset class="clock-style-options"><legend>Countdown style</legend>${[['solid','Solid Color','One color'],['separate','Separate Colors','Different minutes and seconds'],['gradient','Multicolor Gradient','Smoothly blend 2–8 colors'],['stripes','Multicolor Stripes','Three colors in repeating bands']].map(([v,label,description])=>`<label class="clock-style-choice"><input type="radio" name="timerStyle" value="${v}" ${appearance.timerStyle===v?'checked':''}><span><strong>${label}</strong><small>${description}</small></span></label>`).join('')}</fieldset>${appearancePreview()}<section class="gradient-editor" data-gradient-editor ${appearance.timerStyle==='gradient'?'':'hidden'}><h3>Smooth Color Blend</h3><div class="gradient-blend-bar" data-gradient-bar aria-label="Gradient blend preview"></div><div class="button-row gradient-presets"><button type="button" class="button secondary small" data-gradient-preset="rainbow">Rainbow Blend</button><button type="button" class="button secondary small" data-gradient-preset="sunset">Sunset Blend</button></div><div data-gradient-stops>${gradientStopRows(appearance.gradientStops)}</div><button type="button" class="button secondary small" data-action="gradient-add" ${appearance.gradientStops.length>=8?'disabled':''}>+ Add Color</button><p class="muted small-copy">Choose each color and where it blends across the clock, from 0% to 100%.</p></section><p class="appearance-feedback" data-appearance-feedback role="status"></p><div class="clock-color-grid">${colors.map(([key,label])=>`<label data-color-field="${key}">${label}<input type="color" name="${key}" value="${appearance[key]}"></label>`).join('')}</div><div class="button-row"><button type="button" class="button secondary small" data-action="restore-clock-appearance">Restore Original</button><button type="button" class="button secondary small" data-action="use-clock-defaults">Use Preferred Defaults</button></div>`;
}
function appearanceDialog(){
  if(!editor)throw new Error('Open a structure or tournament to customize its clock.');captureEditor();
  const target=editor.event?'event':'structure',appearance=clockAppearance(editor.value.clockAppearance||state.clockAppearanceDefaults);
  modal(editor.event?'Tournament Clock Appearance':'Structure Clock Appearance',`<form id="clock-appearance-form"><input type="hidden" name="appearanceTarget" value="${target}"><input type="hidden" name="templateId" value="${esc(editor.value.id)}"><input type="hidden" name="version" value="${version}">${appearanceFields(appearance)}<div class="button-row"><button class="button primary" name="appearanceAction" value="${target}">Use for This ${editor.event?'Tournament':'Structure'}</button><button class="button secondary" name="appearanceAction" value="defaults">Save Preferred Defaults</button><button type="button" class="button secondary" data-action="close-modal">Cancel</button></div><p class="muted small-copy">${editor.event?'Save tournament settings':'Save the structure'} to keep these clock colors.</p></form>`);refreshAppearancePreview();
}
function gradientStopRows(stops){return stops.map((stop,i)=>`<div class="gradient-stop" data-gradient-stop><label>Color ${i+1}<input type="color" data-gradient-color aria-label="Gradient color ${i+1}" value="${stop.color}"></label><label>Position (%)<input type="number" data-gradient-position aria-label="Gradient color ${i+1} position" min="0" max="100" step="0.1" value="${stop.position}" ${i===0||i===stops.length-1?'readonly':''} required></label><button type="button" class="button secondary small" data-gradient-remove="${i}" aria-label="Remove gradient color ${i+1}" ${stops.length<=2?'disabled':''}>Remove</button></div>`).join('');}
function writeGradientStops(form,stops){form.querySelector('[data-gradient-stops]').innerHTML=gradientStopRows(stops);form.querySelector('[data-action=gradient-add]').disabled=stops.length>=8;}
function readAppearance(form){const values=Object.fromEntries(Object.keys(ORIGINAL_CLOCK_APPEARANCE).map(key=>[key,form.elements[key].value]));for(const key of ['backgroundImage','fontFamily','timerShadow','blindsShadow','timerFontColor','blindsFontColor'])if(form.elements[key])values[key]=form.elements[key].value;for(const key of ['backgroundOpacity','timerFontScale','blindsFontScale'])if(form.elements[key])values[key]=Number(form.elements[key].value);values.gradientStops=[...form.querySelectorAll('[data-gradient-stop]')].map(row=>({color:row.querySelector('[data-gradient-color]').value,position:Number(row.querySelector('[data-gradient-position]').value)}));return clockAppearance(values);}
function fillAppearance(form,value){const appearance=clockAppearance(value);for(const [key,val] of Object.entries(appearance))if(key!=='gradientStops'&&form.elements[key])form.elements[key].value=val;writeGradientStops(form,appearance.gradientStops);form.elements.preset.value='custom';refreshAppearancePreview(form);}
function refreshAppearancePreview(form=$('#clock-appearance-form')){
  if(!form)return;const feedback=form.querySelector('[data-appearance-feedback]');
  try{
    const value=readAppearance(form);applyClockAppearance(form.querySelector('.clock-appearance-preview'),value);form.querySelector('[data-gradient-editor]').hidden=value.timerStyle!=='gradient';form.querySelector('[data-gradient-bar]').style.background=`linear-gradient(90deg,${value.gradientStops.map(stop=>stop.color+' '+stop.position+'%').join(',')})`;
    for(const field of form.querySelectorAll('[data-color-field]')){const key=field.dataset.colorField;field.hidden=['timer','minutes','seconds','gradientStart','gradientEnd','stripe1','stripe2','stripe3'].includes(key)&&!(value.timerStyle==='solid'&&key==='timer'||value.timerStyle==='separate'&&['minutes','seconds'].includes(key)||value.timerStyle==='stripes'&&key.startsWith('stripe'));}
    feedback.textContent='';
  }catch(error){feedback.textContent=error.message;}
}
function changeGradient(form,kind,index){
  const appearance=readAppearance(form);let stops=appearance.gradientStops;
  if(kind==='rainbow'||kind==='sunset'){const colors=kind==='rainbow'?['#ff3b30','#ffcc00','#34c759','#007aff','#af52de']:['#ff3b30','#ff9500','#ffcc00','#ff2d55'];stops=colors.map((color,i)=>({color,position:Math.round(1000*i/(colors.length-1))/10}));form.elements.timerStyle.value='gradient';}
  else if(kind==='add'){
    if(stops.length>=8)return;let gap=0;for(let i=1;i<stops.length-1;i++)if(stops[i+1].position-stops[i].position>stops[gap+1].position-stops[gap].position)gap=i;
    const a=stops[gap],b=stops[gap+1],color='#'+[1,3,5].map(start=>Math.round((parseInt(a.color.slice(start,start+2),16)+parseInt(b.color.slice(start,start+2),16))/2).toString(16).padStart(2,'0')).join('');stops.splice(gap+1,0,{color,position:Math.round((a.position+b.position)*5)/10});
  }else{if(stops.length<=2)return;stops.splice(index,1);stops[0].position=0;stops.at(-1).position=100;}
  writeGradientStops(form,stops);refreshAppearancePreview(form);
}
function editTemplate(templateId,copy=false){const value=clone(state.templates.find(t=>t.id===templateId));value.clockAppearance=clockAppearance(value.clockAppearance||state.clockAppearanceDefaults);if(copy){value.id=id();value.name+=' — copy';}editor={value,isNew:copy,event:false,version};view='setup';render();}
function rebuyBreakCheck(settings,levels){if(!settings.rebuyEnabled)return null;const round=Number(settings.rebuyLastRound);if(!Number.isInteger(round)||round<1)return null;let n=0,index=-1;for(let i=0;i<levels.length;i++)if(levels[i].kind==='play'&&++n===round){index=i;break;}return {round,index,missing:index<0||levels[index+1]?.kind!=='break'};}
function rebuyBreakNotice(){const form=$('#structure-form'),target=$('#rebuy-break-notice');if(!form||!target||!editor)return;const settings=readSettings(form,editor.value.settings),levels=form.querySelector('[data-level]')?readLevels(form):editor.value.levels,check=rebuyBreakCheck(settings,levels);target.innerHTML=check?.missing?`<div role="alert" class="mode-note warning"><strong>Break Required</strong><p>A break must immediately follow Round ${check.round}.</p><button type="button" class="button primary" data-action="required-rebuy-break">Add Break</button> <button type="button" class="button secondary" data-action="go-rebuy-levels">Go to Levels</button></div>`:'';}
function addRequiredRebuyBreak(){captureEditor();const check=rebuyBreakCheck(editor.value.settings,editor.value.levels);if(!check?.missing)return;if(check.index<0){toast('Add playing rounds through Round '+check.round+' first.',true);return;}const levels=editor.value.levels,pos=check.index+1;levels.splice(pos,0,{kind:'break',minutes:10,sb:0,bb:0,ante:0,game:'',chipUp:false});let n=0;const rounds=levels.map(l=>l.kind==='play'?++n:n),nearby=levels.map((l,i)=>({i,kind:l.kind,distance:Math.abs(rounds[i]-rounds[pos])})).filter(v=>v.kind==='break'&&v.i!==pos&&v.distance<=4);render();if(!nearby.length){toast('Required break added. Save to keep it.');return;}modal('Another Break Is Nearby',`<p>Other breaks are within four playing rounds of the required break. Select any to delete or keep all breaks.</p>${nearby.map(v=>`<label class="check"><input type="checkbox" data-remove-nearby-break="${v.i}"> Break after Round ${rounds[v.i]}</label>`).join('')}<div class="button-row"><button type="button" class="button danger" data-action="delete-nearby-rebuy-breaks">Delete Selected Breaks</button><button type="button" class="button secondary" data-action="keep-nearby-rebuy-breaks">Keep Both Breaks</button></div>`);}
function captureEditor(){const form=$('#structure-form');if(!form)return;editor.value.name=form.elements.structureName.value;editor.value.settings=readPayout(form,readSettings(form,editor.value.settings));if(form.querySelector('[data-level]'))editor.value.levels=readLevels(form);}
function paymentDialog(entryId){const t=current(),e=t.entries.find(e=>e.id===entryId);modal('Record add-on',`<form id="payment-form"><input type="hidden" name="entryId" value="${entryId}"><p><strong>${esc(pName(e))}</strong></p><p>${money(t.settings.addonAmount)} · ${num(t.settings.addonChips)} chips</p><button class="button primary full">Record add-on</button></form>`);}
async function rebuyCountDialog(){const t=current(),c=clockAt(t,timeNow());if(!canEditRebuys(t,c)){toast(rebuyCountHelp(t,c),true);return;}const overrideCutoff=!canRecordRebuys(t,c);if(overrideCutoff&&!await confirmApp('Rebuys are closed. Override and change the rebuy total?','Rebuys Closed','Override'))return;modal('Tournament rebuys',`<form id="rebuy-count-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="overrideCutoff" value="${overrideCutoff}"><input type="hidden" name="tournamentId" value="${t.id}"><label for="rebuy-count">How many rebuys are there?</label><div class="rebuy-stepper"><button type="button" class="button secondary" data-rebuy-step="-1" aria-label="Decrease rebuys">−</button><input id="rebuy-count" name="count" type="number" inputmode="numeric" min="0" max="9007199254740991" step="1" value="${t.rebuyCount||0}" required><button type="button" class="button secondary" data-rebuy-step="1" aria-label="Increase rebuys">+</button></div><p class="muted">Enter the tournament total. Saving replaces the previous count.</p><button class="button primary full">Save rebuy total</button></form>`);}
function icmRows(){return [...$('#icm-form').querySelectorAll('[data-icm-entry]')].map(row=>{
  const chips=row.querySelector('[data-icm-chips]').value.replace(/,/g,''),amount=row.querySelector('[data-icm-payout]').value.replace(/,/g,'');
  if(!/^\d+$/.test(chips))throw new Error('Enter a positive whole chip count for every player.');
  return {entryId:row.dataset.icmEntry,chips:Number(chips),payout:/^\d+$/.test(amount)?Number(amount)*100:NaN};
});}
function checkIcmContext(context){if(!session||!online)throw new Error('Reconnect before accepting an ICM chop.');if(context.version!==version||context.tournamentId!==selected)throw new Error('Tournament changed. Close the ICM dialog and calculate again.');}
function icmDialog(){
  if(!online||busy)throw new Error('Reconnect and wait for the current save before opening an ICM chop.');
  const t=current(),remaining=active(t);if(remaining.length<2||remaining.length>20)throw new Error('Calculate an ICM chop with 2–20 remaining players.');icmReview=null;
  const expectedPoints=chopPointsBreakdown(remaining.length);
  modal('ICM Chop',`<form id="icm-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="tournamentId" value="${selected}"><div class="icm-player-list">${remaining.map(e=>`<div class="icm-player" data-icm-entry="${e.id}"><strong>${esc(pName(e))}</strong><span class="icm-points" title="Expected tournament points, including play" aria-label="${expectedPoints} expected points">${expectedPoints}</span><label>Chip count<input type="text" inputmode="numeric" data-chips="true" data-icm-chips aria-label="Chip count for ${esc(pName(e))}" value="" autocomplete="off" required></label><label>Proposed payout ($)<input type="text" inputmode="numeric" data-money="true" data-icm-payout aria-label="Proposed payout for ${esc(pName(e))}" disabled></label></div>`).join('')}</div><p id="icm-feedback" class="payout-allocation" role="status"></p><button type="button" class="button secondary" data-action="icm-calculate">Calculate ICM</button><button class="button primary full" id="icm-accept" disabled>Accept ICM Chop & End Tournament</button></form>`);
}
function calculateIcm(){
  const form=$('#icm-form'),context={version:Number(form.elements.version.value),tournamentId:form.elements.tournamentId.value};checkIcmContext(context);
  const proposal=icmProposal(current(),icmRows());icmReview={...context,proposal};
  for(const result of proposal.participants){const row=[...form.querySelectorAll('[data-icm-entry]')].find(row=>row.dataset.icmEntry===result.entryId),input=row.querySelector('[data-icm-payout]');input.disabled=false;input.value=num(result.payout/100);input.required=true;}
  updateIcmReview();form.querySelector('.icm-player-list').scrollTop=0;
}
function updateIcmReview(target){
  if(target?.hasAttribute('data-icm-chips')){icmReview=null;$('#icm-accept').disabled=true;setText('#icm-feedback','Calculate ICM again.');return;}
  if(!icmReview)return;
  try{checkIcmContext(icmReview);const rows=icmRows();if(!rows.every(v=>Number.isSafeInteger(v.payout)&&v.payout>=0))throw new Error('Enter every proposed payout as whole dollars.');const total=rows.reduce((n,v)=>n+v.payout,0),pool=icmReview.proposal.chopPool;$('#icm-accept').disabled=total!==pool;setText('#icm-feedback',allocationFeedback(pool,total));}catch(error){$('#icm-accept').disabled=true;setText('#icm-feedback',error.message);}
}
function seatSource(entryId){
  if(!seatMovesEnabled())throw new Error('Turn on Move Players before moving a player.');
  if(!session||!online)throw new Error('Reconnect before moving players.');
  if(busy)throw new Error('Wait for the current change to finish.');
  if(renderedWorkspaceVersion!==version){render();throw new Error('Seating changed. Review the updated seats and choose the player again.');}
  const t=current(),e=t?.entries.find(e=>e.id===entryId&&!e.eliminatedAt);
  if(!t||!e||t.status==='completed')throw new Error('Only remaining players in an open tournament can be moved.');
  if(e.seatLocked)throw new Error(`Unlock the player at Table ${e.table}, Seat ${e.seat} first.`);
  return {entryId,tournamentId:t.id,version,fromTable:e.table??null,fromSeat:e.seat??null};
}
function checkSeatSource(source){
  if(!seatMovesEnabled())throw new Error('Turn on Move Players before moving a player.');
  const t=current(),entry=t?.entries.find(e=>e.id===source.entryId);
  if(source.version!==version||t?.id!==source.tournamentId||!entry||entry.eliminatedAt||(entry.table??null)!==source.fromTable||(entry.seat??null)!==source.fromSeat)throw new Error('Seating changed. Cancel this move, review the seats, and choose again.');
  return t;
}
function clearSeatPick(){
  pickedSeat=null;document.querySelectorAll('.seat-player-grip[aria-pressed="true"]').forEach(el=>el.setAttribute('aria-pressed','false'));
  setText('#seat-move-instructions',seatMoveInstructions());const cancel=$('#cancel-seat-pick');if(cancel)cancel.hidden=true;
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
  tableCombineChoice={...context,randomBalance:view==='remote'&&!reducing};
  const buttons=finalTable?'<button class="button primary" data-combine-mode="combine">Keep existing seats</button><button class="button secondary" data-combine-mode="redraw">Redraw all seats</button>':`<button class="button primary" data-combine-mode="combine">${label}</button>`;
  const detail=finalTable?'The final table will be Table 1. Keep its existing seats and fill empty seats, or redraw everyone except its locked players.':reducing?`Keep Tables 1–${count} open and close the extra tables. Distribute remaining players evenly into available seats. Table 1 receives the extra player when the total is odd.`:(view==='remote'?'Keep the current tables open. Randomly select unlocked players to move into open seats until the tables are balanced. Table 1 receives the extra player when the total is odd.':'Keep the current tables open and distribute players evenly into available seats. Table 1 receives the extra player when the total is odd.');
  modal(finalTable?'Form the final table':label,`<p>${detail}</p><p class="muted">Locked players keep their exact table and seat.</p><div class="button-row">${buttons}<button class="button secondary" data-action="close-modal">Cancel</button></div>`);
}

async function tryTvFullscreen(feedback=true){const result=await tvWindow.fullscreen({automatic:!feedback});const fallback=$('.tv-launch-fallback');if(fallback)fallback.hidden=!!document.fullscreenElement;if(feedback&&!result.ok)toast(result.reason||'Use the TV window’s Full Screen button.',true);return result;}
function openClock(){const target=view==='home'?(homeTournament()||current()):current();if(target&&target.id!==selected){selected=target.id;localStorage.setItem('uno-tournament-selected',selected);}if(!target){toast('Choose or create a tournament first.',true);return;}const url=`${APP_ROOT}?view=clock&tournament=${encodeURIComponent(selected)}`;const win=tvWindow.open(url,'uno-clock-'+selected);if(!win)toast('Allow pop-ups for this site to open the clock window.',true);else win.focus();}

document.addEventListener('submit',event=>{if(event.target.id==='archive-filter'){event.preventDefault();const f=new FormData(event.target);archiveFilter={period:String(f.get('period')||'all'),search:String(f.get('search')||''),seasonId:String(f.get('seasonId')||archiveFilter.seasonId)};render();}},true);
document.addEventListener('click',async event=>{const el=event.target.closest('button,a[data-go]');if(!el||el.disabled)return;try{
  if(!session&&el.dataset.action!=='account'&&el.dataset.action!=='close-modal')return;
  if(el.dataset.action==='retry-home'){homeLoadError='';ensureHomeModule();render();return;}
  if(el.dataset.leaderboardPlayer){go('players');playerDetail=el.dataset.leaderboardPlayer;profileHistoryMode='points';profilePanel='points';render();return;}
  if(el.dataset.playerHistory){if(pointsEditor){toast('Save or cancel your point edits first.');return;}profileHistoryMode=el.dataset.playerHistory;profilePanel=profileHistoryMode==='points'?'points':'history';$('.player-profile-panels').dataset.panel=profilePanel;for(const button of document.querySelectorAll('[data-profile-panel]'))button.setAttribute('aria-pressed',String(button.dataset.profilePanel===profilePanel));showPlayerHistory();return;}
  if(el.dataset.action==='new-points-season'){newSeasonDialog();return;}
  if(el.dataset.action==='edit-player-points'){const awards=pointsState(state).awards.filter(a=>a.playerId===playerDetail);pointsEditor={playerId:playerDetail,version,values:Object.fromEntries(awards.map(a=>[a.id,pointsLabel(a.hundredths)])),reason:''};showPlayerHistory();return;}
  if(el.dataset.action==='cancel-points-edit'){pointsEditor=null;showPlayerHistory();return;}
  if(el.dataset.action==='confirm-points-edit'){
    if(!pointsSaveChoice||!dlg.open||pointsSaveChoice.version!==version)throw new Error('Points changed. Cancel and reopen Points History before saving.');
    if(await commit({type:'points-edit',...pointsSaveChoice})){pointsEditor=null;pointsSaveChoice=null;dlg.close();render();toast('Point corrections saved.');}return;
  }
  if(el.dataset.action==='confirm-tournament-finish'){
    if(!finishChoice||!dlg.open||finishChoice.version!==version||finishChoice.tournamentId!==selected)throw new Error('Tournament changed. Reopen the finish confirmation.');
    if(await commit({type:'finish',tournamentId:selected})){finishChoice=null;dlg.close();toast('Tournament completed and points recorded.');}return;
  }
  if(el.dataset.action==='manual-chop'){manualChopDialog();return;}
  if(el.dataset.action==='confirm-manual-chop'){
    if(!manualChopReview||!dlg.open||manualChopReview.version!==version||manualChopReview.tournamentId!==selected)throw new Error('Tournament changed. Reopen the manual chop.');
    if(await commit({type:'manual-chop-accept',tournamentId:selected,participants:manualChopReview.participants})){manualChopReview=null;dlg.close();toast('Manual chop saved, tournament ended and points recorded.');}return;
  }
  if(el.dataset.rulePlace!==undefined){changeRuleType(el.closest('form'),Number(el.dataset.rulePlace),el.dataset.ruleMode);return;}
  if(el.dataset.action==='confirm-payout-format'){confirmRuleFormat();return;}
  if(el.dataset.action==='confirm-custom-payouts'){await confirmRulePayouts();return;}
  if(el.dataset.gradientPreset){changeGradient(el.closest('form'),el.dataset.gradientPreset);return;}
  if(el.dataset.gradientRemove!==undefined){changeGradient(el.closest('form'),'remove',Number(el.dataset.gradientRemove));return;}
  if(el.dataset.action==='gradient-add'){changeGradient(el.closest('form'),'add');return;}
  if(el.dataset.action==='required-rebuy-break'){addRequiredRebuyBreak();return;}if(el.dataset.action==='go-rebuy-levels'){captureEditor();editor.setupTab='levels';render();document.querySelector('.level-table')?.scrollIntoView({block:'start'});return;}if(el.dataset.action==='keep-nearby-rebuy-breaks'){dlg.close();return;}if(el.dataset.action==='delete-nearby-rebuy-breaks'){const indexes=[...dlg.querySelectorAll('[data-remove-nearby-break]:checked')].map(e=>Number(e.dataset.removeNearbyBreak)).sort((a,b)=>b-a);captureEditor();for(const i of indexes)if(editor.value.levels[i]?.kind==='break')editor.value.levels.splice(i,1);dlg.close();render();toast(indexes.length?'Selected breaks removed. Save to keep changes.':'No breaks selected.');return;}if(el.dataset.go){event.preventDefault();go(el.dataset.go);return;}
  if(el.dataset.remotePanel){goRemote(el.dataset.remotePanel);return;}
  if(el.dataset.remoteEliminate){await remoteElimination(el.dataset.remoteEliminate);return;}
  if(el.dataset.remoteUndo){await remoteElimination(el.dataset.remoteUndo,true);return;}
  if(el.dataset.registrationPanel){registrationPanel=el.dataset.registrationPanel;$('.signup-layout').dataset.panel=registrationPanel;for(const button of document.querySelectorAll('[data-registration-panel]'))button.setAttribute('aria-pressed',String(button.dataset.registrationPanel===registrationPanel));return;}
  if(el.dataset.pointsAdjustment){const a=pointsState(state).awards.find(a=>a.id===el.dataset.pointsAdjustment);if(a){const changes=a.corrections||[];modal('Points Adjustment',changes.length?changes.map(c=>`<p><strong>${pointsLabel(c.from)} → ${pointsLabel(c.to)} pts</strong><br>${esc(c.reason&&c.reason!=='Points correction'?c.reason:'No reason given')}</p>`).join(''):'<p>No reason given</p>');}return;}
  if(el.dataset.action==='history-summary-back'){view='players';playerDetail=historyReturnPlayer;profilePanel='history';profileHistoryMode='tournaments';historyTournamentId='';history.pushState({},'',`${NAV_ROOT}?view=players&player=${encodeURIComponent(playerDetail)}`);render();return;}
  if(el.dataset.reviewTournament){historyTournamentId=el.dataset.reviewTournament;historyReturnPlayer=playerDetail;view='history-summary';history.pushState({},'',`${NAV_ROOT}?view=history-summary&tournament=${encodeURIComponent(historyTournamentId)}&player=${encodeURIComponent(historyReturnPlayer)}`);render();return;}
  if(el.dataset.action==='archives-back'){archiveDetail='';render();return;}
  if(el.dataset.archiveTournament){archiveDetail=el.dataset.archiveTournament;render();return;}
  if(el.dataset.resume){chooseTournament(el.dataset.resume);go('manage');return;}
  if(el.dataset.select){chooseTournament(el.dataset.select);return;}
  if(el.dataset.tab){tab=el.dataset.tab;render();$(`[data-tab="${tab}"]`)?.focus({preventScroll:true});return;}
  if(el.dataset.profilePanel){if(pointsEditor){toast('Save or cancel your point edits first.');return;}profilePanel=el.dataset.profilePanel;if(profilePanel!=='details'){profileHistoryMode=profilePanel==='points'?'points':'tournaments';showPlayerHistory();}$('.player-profile-panels').dataset.panel=profilePanel;for(const button of document.querySelectorAll('[data-profile-panel]'))button.setAttribute('aria-pressed',String(button.dataset.profilePanel===profilePanel));return;}
  if(el.dataset.player){pointsEditor=null;profileHistoryMode='tournaments';playerDetail=el.dataset.player;profilePanel='details';render();return;}
  if(el.dataset.createTemplate){newTournament(el.dataset.createTemplate);return;}
  if(el.dataset.layoutTab){for(const node of document.querySelectorAll('[data-layout-panel]'))node.hidden=node.dataset.layoutPanel!==el.dataset.layoutTab;for(const button of document.querySelectorAll('[data-layout-tab]'))button.classList.toggle('primary',button.dataset.layoutTab===el.dataset.layoutTab);return;}
  if(el.dataset.editLayout||el.dataset.copyLayout){const layout=(state.clockLayouts||[]).find(l=>l.id===(el.dataset.editLayout||el.dataset.copyLayout));if(layout)openLayout(layout,!!el.dataset.copyLayout);return;}
  if(el.dataset.deleteLayout){if(await confirmApp('Delete this saved layout?'))await commit({type:'clock-layout-delete',id:el.dataset.deleteLayout});return;}
  if(el.dataset.editTemplate){editTemplate(el.dataset.editTemplate);return;}
  if(el.dataset.copyTemplate){editTemplate(el.dataset.copyTemplate,true);return;}
  if(el.dataset.deleteTemplate){if(await confirmApp('Delete this saved structure? Existing tournaments keep their copies.'))await commit({type:'template-delete',id:el.dataset.deleteTemplate});return;}
  if(el.dataset.register){const t=current(),permission=await registrationPermission(t);if(!permission.allowed)return;if(await commit({type:'register',tournamentId:t.id,playerId:el.dataset.register,overrideCutoff:permission.overrideCutoff})){signupSearch='';render();toast('Player registered.');}return;}
  if(el.dataset.addon){paymentDialog(el.dataset.addon);return;}
  if(el.dataset.tvDisplay){if(await commit({type:'tv-display',tournamentId:selected,mode:el.dataset.tvDisplay}))toast('TV display updated.');return;}
  if(el.dataset.payoutStep){const form=el.closest('form'),input=form.elements.paidPlaces;if(input.disabled)return;markPayoutChanged(form);input.value=String(Math.max(1,Math.min(20,(Number(input.value)||1)+Number(el.dataset.payoutStep))));refreshPayoutPreview(form);return;}
  if(el.dataset.rebuyStep){const input=$('#rebuy-count'),value=Number(input.value);input.value=String(Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,(Number.isSafeInteger(value)?value:0)+Number(el.dataset.rebuyStep))));return;}
  if(el.dataset.undoElimination){const t=current(),e=t.entries.find(e=>e.id===el.dataset.undoElimination),seat=e.eliminationSeat||t.eliminationUndo.find(v=>v.entryId===e.id);if(await confirmApp(`Are you sure you want to undo the elimination of ${pName(e)}? ${seat?.table?'Restore Table '+seat.table+', Seat '+seat.seat+'.':seat?'Restore as an active, unseated player.':'The original seat was not recorded for this older elimination. Restore as unseated?'}`))await commit({type:'undo-elimination',tournamentId:selected,entryId:e.id,allowUnseated:!seat});return;}
  if(el.dataset.eliminate){eliminationDialog(el.dataset.eliminate);return;}
  if(el.dataset.archive){await commit({type:'player-archive',id:el.dataset.archive});return;}
  if(el.dataset.seatLock){
    const context=seatingContext(),entry=current().entries.find(e=>e.id===el.dataset.seatLock);checkSeatingContext(context);
    await commit({type:'seat-lock',tournamentId:context.tournamentId,entryId:entry.id,locked:!entry.seatLocked});return;
  }
  if(el.dataset.combineMode){
    if(dlg.open&&tableCombineChoice){const context=tableCombineChoice,label=tableActionName(current());checkSeatingContext(context);
      if(await commit({type:'combine-tables',tournamentId:context.tournamentId,mode:el.dataset.combineMode,order:el.dataset.combineMode==='redraw'||context.randomBalance?randomSeatOrder(current()):[]})){tableCombineChoice=null;dlg.close();toast(label==='Combine Tables'?'Tables combined.':'Tables balanced.');}
    }return;
  }
  if(el.dataset.seatMoveMode){if(dlg.open&&seatMoveChoice){const {source,table,seat}=seatMoveChoice;await saveSeatMove(source,table,seat,el.dataset.seatMoveMode);}return;}
  if(el.dataset.seatGrab||el.dataset.seatTargetButton){
    if(!seatMovesEnabled()||seatDragging?.shouldSuppressClick())return;
    const target=el.closest('[data-seat-target]');
    if(pickedSeat&&pickedSeat.entryId!==el.dataset.seatGrab){const source=pickedSeat;await requestSeatMove(source,Number(target.dataset.table),Number(target.dataset.seat));}
    else if(el.dataset.seatGrab)chooseSeatPlayer(el.dataset.seatGrab);
    else toast('Select a player first, then choose the destination seat.');return;
  }
  if(el.dataset.seat){if(view==='remote')chooseSeatPlayer(el.dataset.seat);else seatDialog(el.dataset.seat);return;}
  if(el.dataset.clock){const t=current(),expectedIndex=clockAt(t,timeNow()).index;if(['next','previous'].includes(el.dataset.clock)&&!await confirmApp('Change the current level and reset its countdown?'))return;await commit({type:'clock',tournamentId:t.id,command:el.dataset.clock,expectedIndex});return;}
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
    case 'rebuy-count':await rebuyCountDialog();break;
    case 'cancel-seat-pick':clearSeatPick();break;case 'account':showAccount();break;case 'close-modal':seatMoveChoice=null;tableCombineChoice=null;dlg.close();break;case 'new-tournament':newTournament();break;case 'add-player':await newPlayer();break;
    case 'players-back':playerDetail=null;render();break;case 'open-clock':openClock();break;case 'refresh':await refresh();if(online&&version===0)await saveInitialWorkspace();break;
    case 'import-browser':await importBrowserData();break;case 'clear-device-copy':clearDeviceCopyDialog();break;
    case 'signout':{const {error}=await db.auth.signOut();if(error)throw error;acceptSession(null);break;}
    case 'show-structures':setupLibraryTab='structures';render();break;
    case 'show-layouts':setupLibraryTab='layouts';render();break;
    case 'create-layout':openLayout();break;
    case 'duplicate-default-layout':openLayout({name:'Default Layout Copy',appearance:clockAppearance(state.clockAppearanceDefaults)},false);break;
    case 'cancel-layout':layoutDraft=null;setupLibraryTab='layouts';render();break;
    case 'new-structure':{const value=sampleTemplate();value.name='New tournament structure';value.clockAppearance=clockAppearance(state.clockAppearanceDefaults);editor={value,isNew:true,event:false,version};view='setup';render();break;}
    case 'event-settings':{const t=current();editor={event:true,version,value:{id:t.id,name:t.name,settings:clone(t.settings),levels:clone(t.levels),clockAppearance:clockAppearance(t.clockAppearance)}};view='setup';render();break;}
    case 'close-editor':editor=null;render();break;
    case 'copy-game':{const game=$('#all-levels-game').value.trim();if(!game){toast('Enter a game name to copy.',true);break;}for(const row of $('#structure-form').querySelectorAll('[data-level]')){if(row.querySelector('[name=kind]').value==='play')row.querySelector('[name=game]').value=game;}captureEditor();toast('Game copied to all playing levels. Save the structure to keep it.');break;}
    case 'add-level':case 'add-break':captureEditor();editor.value.levels.push({kind:el.dataset.action==='add-break'?'break':'play',minutes:el.dataset.action==='add-break'?10:15,sb:0,bb:0,ante:0,game:el.dataset.action==='add-break'?'':(editor.value.levels.slice().reverse().find(l=>l.kind==='play')?.game||''),chipUp:false});render();break;
    case 'recalculate-payouts':await recalculatePayouts();break;case 'clock-appearance':appearanceDialog();break;case 'structure-clock-appearance':appearanceDialog();break;case 'restore-clock-appearance':fillAppearance(el.closest('form'),ORIGINAL_CLOCK_APPEARANCE);break;case 'use-clock-defaults':fillAppearance(el.closest('form'),state.clockAppearanceDefaults);break;
    case 'seat-remaining':{const context=seatingContext();await commit({type:'seat-remaining',tournamentId:context.tournamentId,order:randomSeatOrder(current())});break;}
    case 'combine-tables':combineTablesDialog();break;
    case 'balance-tables':movePlayersEnabled=true;render();break;
    case 'delete-tournament':{const t=current();if(!t||t.status!=='open'||tournamentStarted(t))throw new Error('Only a tournament that has never started can be deleted.');if(await confirmApp(`Permanently delete ${t.name} and its ${t.entries.length} registered player(s)? This cannot be undone. Player records and points will not change.`,'Delete Tournament','Yes, Delete Tournament')){if(await commit({type:'tournament-delete',tournamentId:t.id})){selected=state.tournaments.find(v=>v.status!=='completed'&&!v.archivedAt)?.id||state.tournaments[0]?.id||'';if(selected)localStorage.setItem('uno-tournament-selected',selected);else localStorage.removeItem('uno-tournament-selected');go('home');toast('Tournament deleted. Player points unchanged.');}}break;}
    case 'archive-tournament':{const t=current();if(await confirmApp(`Archive ${t.name}? Its results, payouts, points and player history will remain saved.`,'Archive Tournament','Archive Tournament')){reviewingHistory='';if(await commit({type:'tournament-archive',tournamentId:t.id})){toast('Tournament archived.');}}break;}
    case 'finish':finishDialog();break;
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
document.addEventListener('input',event=>{if(event.target.hasAttribute('data-point-value')&&pointsEditor)pointsEditor.values[event.target.dataset.pointValue]=event.target.value;if(event.target.form?.id==='points-edit-form'&&event.target.name==='reason'&&pointsEditor)pointsEditor.reason=event.target.value;if(event.target.hasAttribute('data-manual-payout'))updateManualChop();if(event.target.dataset.money)formatDollarInput(event.target);if(event.target.form?.id==='structure-form'&&['rebuyLastRound','rebuyEnabled'].includes(event.target.name))rebuyBreakNotice();if(['clock-appearance-form','saved-layout-form','new-tournament-form'].includes(event.target.form?.id))refreshAppearancePreview(event.target.form);if(event.target.form?.querySelector('#payout-place-list')){if(event.target.name!=='payoutMode')markPayoutChanged(event.target.form);if(event.target.form.dataset.ruleEditor){if(event.target.name==='payoutMode')return;if(event.target.hasAttribute('data-payout-value'))markRuleDraft(event.target.form);if(event.target.name==='houseContribution')event.target.form.dataset.rulesDirty='true';}if(event.target.form.id==='payout-form'&&tournamentStarted(current())&&event.target.hasAttribute('data-payout-value')){event.target.form.dataset.customDraft='true';event.target.form.dataset.recalculate='false';}refreshPayoutPreview(event.target.form);}if(event.target.closest('[data-icm-entry]'))updateIcmReview(event.target);if(event.target.dataset.phone)formatPhoneInput(event.target);if(event.target.dataset.chips)formatChipInput(event.target);if(event.target.form?.id==='player-form'&&event.target.name==='name'){const form=event.target.form,match=state.players.find(p=>p.id!==form.elements.id?.value&&normalizePlayerName(p.name)===normalizePlayerName(event.target.value));let feedback=form.querySelector('.name-feedback');if(!feedback){feedback=document.createElement('p');feedback.className='name-feedback';feedback.setAttribute('role','status');event.target.closest('label').append(feedback);}feedback.textContent=match?'That name already exists. Please choose a different name.':'';event.target.setCustomValidity(match?'That name already exists. Please choose a different name.':'');}if(['buyIn','dealerToke'].includes(event.target.name)&&$('#entry-split')){const form=event.target.form,buyIn=Math.round(dollarNumber(form.elements.buyIn.value)*100),toke=Math.round(dollarNumber(form.elements.dealerToke.value)*100);$('#entry-split').textContent=money(buyIn)+' total − '+money(toke)+' dealer toke = '+money(buyIn-toke)+' before the tournament fee.';}if(event.target.id==='player-search'){playerSearch=event.target.value;$('#player-results').scrollTop=0;$('#player-results').innerHTML=playerRows(state.players.filter(p=>(showArchived||!p.archived)&&(normalizePlayerName(p.name)+' '+playerNumberLabel(p)+' '+(p.phone||'')).includes(normalizePlayerName(playerSearch))).sort((a,b)=>a.name.localeCompare(b.name)));}if(event.target.id==='signup-search'){signupSearch=event.target.value;$('#signup-results').scrollTop=0;const t=current(),enrolled=new Set(t.entries.map(e=>e.playerId));$('#signup-results').innerHTML=registrationRows(state.players.filter(p=>!p.archived&&!enrolled.has(p.id)&&(normalizePlayerName(p.name)+' '+playerNumberLabel(p)).includes(normalizePlayerName(signupSearch))).sort((a,b)=>a.name.localeCompare(b.name)),t);}});
document.addEventListener('change',async event=>{if(!event.target.matches?.('[data-clock-image-upload]'))return;const form=event.target.closest('form'),file=event.target.files?.[0],status=form?.querySelector('[data-clock-image-status]');if(!file||!form)return;try{if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>10485760)throw new Error('Choose a JPG, PNG, WebP or GIF under 10 MB.');if(!session||!online)throw new Error('Reconnect and sign in before uploading.');if(status)status.textContent='Uploading background image…';const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[file.type],path=session.user.id+'/'+crypto.randomUUID()+'.'+ext,storage=db.storage.from('td-clock-backgrounds');const {error}=await storage.upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;form.elements.backgroundImage.value=storage.getPublicUrl(path).data.publicUrl;if(status)status.textContent='Image uploaded. Save the layout to keep it.';refreshAppearancePreview(form);}catch(err){if(status)status.textContent=err.message||'Image upload failed.';toast(err.message||'Image upload failed.',true);}},true);
document.addEventListener('change',event=>{if(event.target.form?.id==='archive-filter'){archiveFilter[event.target.name]=event.target.value;if(archiveFilter.period==='season'&&!archiveFilter.seasonId){archiveFilter.seasonId=pointsState(state).seasons.filter(x=>x.id!==pointsState(state).currentSeasonId).at(-1)?.id||'';}render();return;}if(event.target.form?.id==='leaderboard-filter'){if(!event.target.checkValidity())return;leaderboardFilter[event.target.name]=event.target.value;render();return;}if(['clock-appearance-form','saved-layout-form','new-tournament-form'].includes(event.target.form?.id)){if(event.target.name==='preset'&&CLOCK_PRESETS[event.target.value])fillAppearance(event.target.form,CLOCK_PRESETS[event.target.value]);else if(event.target.name==='templateId'){const template=state.templates.find(t=>t.id===event.target.value);fillAppearance(event.target.form,template?.clockAppearance||state.clockAppearanceDefaults);}else refreshAppearancePreview(event.target.form);}if(event.target.name==='payoutMode'){if(event.target.form.dataset.ruleEditor)requestRuleFormat(event.target.form);else{markPayoutChanged(event.target.form);refreshPayoutPreview(event.target.form);}}if(event.target.id==='show-archived'){showArchived=event.target.checked;render();}});
document.addEventListener('submit',async event=>{event.preventDefault();const form=event.target,fd=new FormData(form);try{
  if(form.id==='leaderboard-filter')return;
  if(form.id==='points-edit-form'){editPointsDialog();return;}
  if(form.id==='new-season-form'){try{if(Number(fd.get('version'))!==version)throw new Error('Season data changed. Reopen Start New Season.');if(await commit({type:'points-season-start',id:id(),name:fd.get('name')})){leaderboardFilter.period='current';dlg.close();render();toast('New season started. Previous scores are archived.');}}catch(error){setText('#season-feedback',error.message);}return;}
  if(form.id==='manual-chop-form'){
    if(Number(fd.get('version'))!==version||fd.get('tournamentId')!==selected)throw new Error('Tournament changed. Reopen the manual chop.');
    const proposal=manualChopProposal(current(),manualRows());manualChopReview={version,tournamentId:selected,participants:proposal.participants};
    modal('Accept Manual Chop & End Tournament?',`<p>Are you sure? Save these payouts, stop the clock and end the tournament. The agreement replaces the normal place payouts, including any first-place guarantee.</p><ul>${proposal.participants.map(p=>`<li>${esc(pName(p))}: <strong>${money(p.payout)}</strong> · ${chopPointsBreakdown(proposal.participants.length)}</li>`).join('')}</ul><div class="button-row"><button class="button primary" data-action="confirm-manual-chop">Accept Manual Chop & End Tournament</button><button class="button secondary" data-action="close-modal">Cancel</button></div>`);return;
  }
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
  if(form.id==='player-form'){let overrideCutoff=fd.get('overrideCutoff')==='true';const registrationTournamentId=fd.get('registrationTournamentId');if(registrationTournamentId&&!overrideCutoff){const permission=await registrationPermission(state.tournaments.find(t=>t.id===registrationTournamentId),true);if(!permission.allowed)return;overrideCutoff=permission.overrideCutoff;}if(await commit({type:'player-save',id:fd.get('id')||id(),name:fd.get('name'),phone:fd.get('phone'),notes:fd.get('notes'),...(registrationTournamentId?{registrationTournamentId,overrideCutoff}:{})})){if(dlg.open)dlg.close();toast('Player saved.');render();}return;}
  if(form.id==='new-tournament-form'){const eventId=id();if(await commit({type:'tournament-create',id:eventId,name:fd.get('name'),date:fd.get('date'),templateId:fd.get('templateId'),clockAppearance:readAppearance(form)})){dlg.close();chooseTournament(eventId);go('signup');toast('Tournament created.');}return;}
  if(form.id==='saved-layout-form'){
    if(!layoutDraft)throw new Error('Open a layout before saving.');
    const layout={id:layoutDraft.id||id(),name:String(fd.get('layoutName')||'').trim(),appearance:readAppearance(form)};
    if(await commit({type:'clock-layout-save',layout})){layoutDraft=null;setupLibraryTab='layouts';render();toast('Layout saved.');}
    return;
  }
  if(form.id==='structure-form'){
    if(editor.version!==version)throw new Error('Data changed on another device. Reopen this editor before saving.');captureEditor();const check=rebuyBreakCheck(editor.value.settings,editor.value.levels);if(check?.missing){rebuyBreakNotice();throw new Error('Break required immediately after Round '+check.round+'. Use Add Break before saving.');}const saved=clone(editor);
    const action=saved.event?{type:'tournament-settings',tournamentId:saved.value.id,settings:saved.value.settings,clockAppearance:saved.value.clockAppearance,...(form.querySelector('[data-level]')?{levels:saved.value.levels}:{})}:{type:'template-save',template:saved.value};
    if(await commit(action)){editor=null;render();toast(saved.event?'Tournament settings saved.':'Structure saved.');}return;
  }
  if(form.id==='clock-appearance-form'){
    if(Number(fd.get('version'))!==version||!editor||editor.value.id!==fd.get('templateId')||editor.version!==version)throw new Error('Data changed. Reopen this structure or tournament before saving its clock appearance.');
    const appearance=readAppearance(form);
    if(event.submitter?.value==='defaults'){
      if(await commit({type:'clock-appearance-defaults',appearance})){editor.version=version;dlg.close();toast('Preferred clock defaults saved.');}return;
    }
    editor.value.clockAppearance=appearance;dlg.close();render();toast(editor.event?'Clock appearance selected. Save tournament settings to keep it.':'Clock appearance selected. Save structure to keep it.');return;
  }
  if(form.id==='seating-settings-form'){if(await commit({type:'seating-settings',tournamentId:fd.get('tournamentId'),seatsPerTable:Number(fd.get('seatsPerTable'))})){toast('Seats per table updated.');}return;}
  if(form.id==='icm-form'){
    if(!icmReview)throw new Error('Calculate the ICM payouts before accepting.');checkIcmContext(icmReview);
    const participants=icmRows();for(const row of participants){const original=icmReview.proposal.participants.find(v=>v.entryId===row.entryId);if(!original||original.chips!==row.chips)throw new Error('Chip counts changed. Calculate ICM again.');}
    if(!await confirmApp('Accept these agreed payouts and end the tournament by ICM chop?'))return;
    if(await commit({type:'icm-accept',tournamentId:icmReview.tournamentId,participants})){icmReview=null;dlg.close();toast('Tournament ended by ICM chop.');}return;
  }
  if(form.id==='payout-form'){
    const t=current();if(Number(fd.get('version'))!==version||fd.get('tournamentId')!==selected)throw new Error('Tournament changed. Reopen Payouts and review before saving.');
    if(form.dataset.ruleEditor){await saveRulePayouts(form);return;}
    let settings=readPayoutSettings(form,t),custom=tournamentStarted(t)&&form.dataset.recalculate!=='true'&&(settings.payoutMode==='fixed'||form.dataset.customDraft==='true');
    const changed=settings.payoutMode!==t.settings.payoutMode||JSON.stringify(settings.payouts)!==JSON.stringify(t.settings.payouts)||JSON.stringify(guaranteeSettings(settings))!==JSON.stringify(guaranteeSettings(t.settings));
    if(custom&&settings.payoutMode!=='fixed'){const draft={...t,settings};settings={...settings,payoutMode:'fixed',payouts:prizes(draft),houseContribution:financials(draft).houseContribution};}
    validatePayoutOrder(prizes({...t,settings}));
    if(payoutBalance({...t,settings})!==0)throw new Error('Payouts must exactly match the prize pool.');
    if(tournamentStarted(t)&&(changed||custom!==!!t.payoutCustom)&&(!t.payoutCustom&&t.settings.payoutMode!=='fixed'||!custom)&&!await confirmApp(`Replace the existing ${t.payoutCustom?'Custom':t.settings.payoutMode==='guaranteed'?'Guaranteed':'Automatic'} Payouts with ${custom?'Custom Payouts':settings.payoutMode==='guaranteed'?'the automatic guarantee':'automatic payouts'}? ${prizes({...t,settings}).map((n,i)=>placeName(i)+': '+money(n)).join('; ')}`))return;
    if(await commit({type:'payout-settings',tournamentId:selected,settings,custom})){toast('Payouts updated.');}return;
  }
  if(form.id==='rebuy-count-form'){if(Number(fd.get('version'))!==version)throw new Error('Tournament changed. Reopen the rebuy total before saving.');const raw=String(fd.get('count')).trim();if(!/^\d+$/.test(raw))throw new Error('Enter a whole number of rebuys, zero or greater.');let overrideCutoff=fd.get('overrideCutoff')==='true';const t=state.tournaments.find(t=>t.id===fd.get('tournamentId'));if(!overrideCutoff&&!canRecordRebuys(t,clockAt(t,timeNow()))){if(!await confirmApp('Rebuys are closed. Override and change the rebuy total?','Rebuys Closed','Override'))return;overrideCutoff=true;}if(await commit({type:'rebuy-count',tournamentId:fd.get('tournamentId'),count:Number(raw),overrideCutoff})){dlg.close();toast('Tournament rebuy total saved.');}return;}
  if(form.id==='payment-form'){if(await commit({type:'payment',tournamentId:selected,entryId:fd.get('entryId'),kind:'addon'})){dlg.close();toast('Add-on recorded.');}return;}
  if(form.id==='seat-form'){
    const source={entryId:fd.get('entryId'),tournamentId:fd.get('tournamentId'),version:Number(fd.get('version')),fromTable:fd.get('fromTable')===''?null:Number(fd.get('fromTable')),fromSeat:fd.get('fromSeat')===''?null:Number(fd.get('fromSeat'))};checkSeatSource(source);
    const value=fd.get('seat');if(value==='unseated'){if(await commit({type:'seat',tournamentId:source.tournamentId,entryId:source.entryId,table:null,seat:null})){dlg.close();toast('Player is now unseated.');}}
    else{const [table,seat]=value.split('/').map(Number);await requestSeatMove(source,table,seat);}return;
  }
}catch(e){toast(e.message,true);}});
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);view=params.get('view')||'home';historyTournamentId=view==='history-summary'?params.get('tournament')||'':'';historyReturnPlayer=params.get('player')||historyReturnPlayer;if(view==='players'&&params.get('player')){playerDetail=params.get('player');profilePanel='history';profileHistoryMode='tournaments';}remotePanel=new URLSearchParams(location.search).get('panel')||'clock';editor=null;render();});
window.addEventListener('online',()=>refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){synchronizeTimeIfSignedIn();refresh();tick();}});
function synchronizeTimeIfSignedIn(){if(session)synchronizeTime();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session){void synchronizeTime();void refresh();}});window.addEventListener('online',()=>{if(session){void synchronizeTime();void refresh();}});
setInterval(()=>refresh(),2500);setInterval(synchronizeTimeIfSignedIn,60000);
void tvWindow.prime();
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.opener&&event.data?.type==='uno-tv-fullscreen'&&view==='clock')void tryTvFullscreen(false);});
window.addEventListener('resize',()=>fitTvSeating());
document.addEventListener('fullscreenchange',()=>fitTvSeating());
clockToolbar=installClockToolbar();
seatDragging=installSeatDragging({getScrollBounds:()=>({top:Math.min(innerHeight,Math.max(0,$('.management-chrome')?.getBoundingClientRect().bottom||$('.remote-header')?.getBoundingClientRect().bottom||0)),bottom:innerHeight}),getSource:entryId=>view!=='manage'||!movePlayersEnabled||dlg.open?null:seatSource(entryId),getLabel:source=>`Seat ${source.fromSeat} · ${pName(current().entries.find(e=>e.id===source.entryId))}`,onStart:clearSeatPick,onDrop:(source,target)=>requestSeatMove(source,target.table,target.seat),onError:error=>toast(error.message,true)});
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
