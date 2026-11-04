function existingEntrySettingsChanged(t,a){
 if(!t?.entries?.length)return false;
 const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const levels=rows=>rows.map(l=>[l.kind,l.minutes,l.sb,l.bb,l.ante,l.game||'',l.layoutId||'',!!l.chipUp]);
 return a.name!==undefined&&String(a.name).trim()!==t.name||a.settings&&canonical(a.settings)!==canonical(t.settings)||a.levels&&canonical(levels(a.levels))!==canonical(levels(t.levels))||a.clockAppearance&&canonical(a.clockAppearance)!==canonical(t.clockAppearance);
}
function updateExistingEntryTerms(t,next){
 const old=t.settings;
 for(const entry of t.entries)for(const payment of entry.payments||[]){
  if(payment.kind==='entry'){if(next.buyIn!==old.buyIn)payment.total=next.buyIn;payment.dealerToke=next.entryFeeType==='toke'?next.dealerToke:0;payment.adminFee=next.entryFeeType==='admin'?next.dealerToke:0;payment.feeType=next.entryFeeType||'toke';if(next.startingStack!==old.startingStack)payment.chips=next.startingStack;}
  else if(payment.kind==='addon'){if(next.addonAmount!==old.addonAmount)payment.total=next.addonAmount;if(next.addonChips!==old.addonChips)payment.chips=next.addonChips;payment.dealerToke=next.addonFeeType==='toke'?next.addonFeeAmount:0;payment.adminFee=next.addonFeeType==='admin'?next.addonFeeAmount:0;payment.feeType=next.addonFeeType||'toke';}
  else if(payment.kind==='rebuy'){if(next.rebuyAmount!==old.rebuyAmount)payment.total=next.rebuyAmount;if(next.rebuyChips!==old.rebuyChips)payment.chips=next.rebuyChips;payment.dealerToke=next.rebuyFeeType==='toke'?next.rebuyFeeAmount:0;payment.adminFee=next.rebuyFeeType==='admin'?next.rebuyFeeAmount:0;payment.feeType=next.rebuyFeeType||'toke';}
 }
}
function settingsDraftSnapshot(form,ed){return JSON.stringify({fields:[...new FormData(form).entries()],levels:ed.value.levels});}
function editorHistorySnapshot(){if(!editor)return null;captureEditor();return JSON.stringify(editor.value);}
function updateEditorHistoryButtons(){const active=editorHistory.owner===editor,undo=$('#structure-form [data-editor-undo]'),redo=$('#structure-form [data-editor-redo]');if(undo)undo.disabled=!active||!editorHistory.undo.length;if(redo)redo.disabled=!active||!editorHistory.redo.length;}
function initializeEditorHistory(ed=editor){if(!ed)return;if(editorHistory.owner!==ed)editorHistory={owner:ed,undo:[],redo:[],baseline:JSON.stringify(ed.value)};updateEditorHistoryButtons();}
function beginEditorHistoryAction(){if(!editor)return null;initializeEditorHistory();const before=editorHistorySnapshot();editorHistory.baseline=before;return before;}
function finishEditorHistoryAction(before){if(!editor||before===null)return;const after=JSON.stringify(editor.value);if(after!==before){editorHistory.undo.push(before);editorHistory.redo=[];}editorHistory.baseline=after;updateEditorHistoryButtons();}
function applyEditorHistory(redo=false){if(!editor||editorHistory.owner!==editor)return;const source=redo?editorHistory.redo:editorHistory.undo,destination=redo?editorHistory.undo:editorHistory.redo;if(!source.length)return;const currentState=editorHistorySnapshot();destination.push(currentState);editor.value=JSON.parse(source.pop());editorHistory.baseline=JSON.stringify(editor.value);render();}
function isEditorPromptField(field){return !!field?.matches?.('#structure-form [data-level] input[name="minutes"],#structure-form [data-level] input[name="game"],#structure-form [data-layout-selector]');}
function editorPromptOriginalValue(field){if(editorFieldOrigins.has(field))return editorFieldOrigins.get(field);const row=field.closest('[data-level]'),rows=[...field.form.querySelectorAll('[data-level]')],index=rows.indexOf(row),key=field.name==='layoutId'?'layoutId':field.name,baseline=editorHistory.baseline?JSON.parse(editorHistory.baseline):editor.value;return String(baseline.levels?.[index]?.[key]??'');}
async function chooseEditorPropagation(field,message,title,currentLabel,futureLabel){
  initializeEditorHistory();const before=editorHistory.baseline||JSON.stringify(editor.value),undoLength=editorHistory.undo.length,redoBefore=editorHistory.redo.slice(),original=editorPromptOriginalValue(field);pendingEditorPromptFields.add(field);
  let choice;try{choice=await chooseApp(message,title,currentLabel,futureLabel);}finally{pendingEditorPromptFields.delete(field);}
  if(choice===null){if(field.isConnected){field.value=original;captureEditor();}const restored=JSON.stringify(editor.value);if(editorHistory.owner===editor){if(editorHistory.undo.length>undoLength&&editorHistory.undo.at(-1)===before)editorHistory.undo.pop();editorHistory.redo=redoBefore;editorHistory.baseline=restored;updateEditorHistoryButtons();}editorFieldOrigins.set(field,original);return null;}
  editorFieldOrigins.set(field,field.value);return choice;
}
function configureTournamentSettingsUI(){
 const ed=editor,editing=view==='setup'&&ed?.event,form=document.querySelector('#structure-form');if(view==='setup'&&ed&&form)initializeEditorHistory(ed);
 document.body.classList.toggle('tournament-settings-page',view==='setup'&&!!ed);
 if(state.tournaments.some(t=>!t.archivedAt))document.querySelectorAll('[data-edit-template],[data-delete-template],[data-copy-template],[data-action="new-structure"]').forEach(el=>{el.disabled=true;el.title='Saved structures are locked until the current tournament is archived. Edit This Tournament to change its copy.';});
 if(view==='signup')document.querySelectorAll('[data-go="manage"]').forEach(el=>{el.classList.remove('secondary');el.classList.add('gold');});

 const locked=state.tournaments.some(t=>!t.archivedAt),library=document.querySelector('#saved-structures');
 if(locked&&library){library.classList.add('structures-locked');library.setAttribute('aria-label','Saved structures — locked during play');library.inert=true;library.querySelectorAll('button').forEach(el=>el.disabled=true);if(!library.parentElement.querySelector('.structures-lock-notice')){const notice=document.createElement('div');notice.className='structures-lock-notice';notice.textContent='Locked During Play';notice.setAttribute('role','status');library.parentElement.classList.add('structures-lock-container');library.before(notice);}}
 if(editing&&form){
  if(!form.querySelector('[data-action="save-as-structure"]')){const button=document.createElement('button');button.type='button';button.className='button secondary';button.dataset.action='save-as-structure';button.textContent='Save as New Structure';form.querySelector('.sticky-save').insertBefore(button,form.querySelector('.editor-history-controls'));}
  const t=current();if(tournamentStarted(t)){const at=clockAt(t,timeNow()).index;form.querySelectorAll('[data-level]').forEach((row,index)=>{if(index<=at){row.classList.add('protected-level');row.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);}else{const up=row.querySelector('[data-level-up]');if(up&&index===at+1)up.disabled=true;}});}
 }
 if(!editing||!form)return;
 const title=document.querySelector('#page-title');if(title)title.textContent='Tournament Management';
 const subtitle=document.querySelector('.page-banner-title>small');if(subtitle)subtitle.textContent='Tournament Settings';
 document.querySelectorAll('.nav [data-go]').forEach(el=>el.classList.toggle('active',el.dataset.go==='manage'));
 const back=document.querySelector('.header-right [data-action="close-editor"]');if(back){back.textContent='Back to Tournament Management';back.classList.remove('secondary');back.classList.add('gold');}
 const input=form.elements.structureName;if(input&&!form.querySelector('.tournament-name-row')){const label=input.closest('label'),row=document.createElement('div');row.className='tournament-name-row';label.firstChild.textContent='Tournament name';input.disabled=false;input.maxLength=120;label.before(row);row.append(label);const source=document.createElement('label');source.textContent='Structure name';const info=document.createElement('input');info.value=current()?.templateName||'Saved structure';info.readOnly=true;info.setAttribute('aria-label','Source structure');source.append(info);row.append(source);}
 ed.initialFormSnapshot??=settingsDraftSnapshot(form,ed);
}
function preserveSeatingScroll(){const selectors=['html','body','.workspace','.content','.management-panel','.seat-tables','.table-scroll','.remote-seating'];const positions=selectors.map(selector=>[selector,[...document.querySelectorAll(selector)].map(el=>[el.scrollTop,el.scrollLeft])]);const restore=()=>{for(const [selector,values] of positions)document.querySelectorAll(selector).forEach((el,index)=>{if(values[index]){el.scrollTop=values[index][0];el.scrollLeft=values[index][1];}});};return ()=>{restore();if(typeof requestAnimationFrame==='function')requestAnimationFrame(restore);};}
import {refreshDesignLayoutPreviews} from './tournament-design-layout-previews.mjs';
import {updateDesignLayoutClock} from './tournament-design-layout-clock.mjs';
import {createLayoutDraft} from './tournament-design-layout-draft.mjs';
import {rebuyBreakCheck} from './tournament-design-rebuy.mjs';
import {renderDesignSettings,readDesignSettings} from './tournament-design-settings.mjs';
import {renderTournamentDesign} from './tournament-design-screen.mjs';
import {renderSavedLayouts} from './tournament-design-layouts.mjs';
import {levelRows as designLevelRows,readLevels} from './tournament-design-levels.mjs';
import {renderLayoutEditor,renderClockLayoutScreen} from '../modules/clock-layout-editor.js';
import {renderClockAppearance} from '../modules/clock-appearance-controls.js';
import {renderPlayerProfileTabs} from './player-profile-tabs.mjs';
import {renderRegistrationTabs} from './registration-tabs.mjs';
import {renderRegistrationRows} from './registration-rows.mjs';
import {matchingPlayers} from './player-data.mjs';
import {registrationCandidates} from './registration-data.mjs';
import {createClient} from '@supabase/supabase-js';
import {id,clone,initialState,sampleTemplate,execute,clockAt,roundAt,financials,paymentTotal,prizes,statsFor,guaranteeSettings,guaranteeEligible,payoutBalance,icmProposal,manualChopProposal,planSeatMove,planTableSeating,canCombineTables,normalizePhone,tablesRequired,tablesInUse,upgradeState,normalizePlayerName,rebuyOpen,rebuyPhase,cutoffHasBreak,canRecordRebuys,canEditRebuys,registrationOpen,tournamentRebuyCount,playerNumberLabel,tvDisplayMode,tournamentStarted,defaultPayouts,tableBalanceNeeded,hasPendingEliminations,purchaseOpen} from './domain.mjs';
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
const APP_VERSION='0.4.0-reorg.186 · Reorganization';
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
let busy=false,channel=null,online=false,serverSample=null,lastSync=null,remoteError='',clockTimer,editor=null,setupLibraryTab='structures',layoutDraft=null,editorHistory={owner:null,undo:[],redo:[],baseline:null};
const editorFieldOrigins=new WeakMap(),pendingEditorPromptFields=new WeakSet();
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
let clockToolbar,seatDragging,pickedSeat=null,seatMoveChoice=null,tableCombineChoice=null,renderedWorkspaceVersion=0,seatingUndo=[];
let playerSearch='',signupSearch='',registrationPanel='find',profilePanel='details',playerDetail=null,showArchived=false,tab='players',lastClockKey='',sound=false;
const icons={home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',setup:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2Z"/><circle cx="12" cy="12" r="3"/>',players:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3M3 8a2 2 0 0 0 0 4m18-4a2 2 0 0 1 0 4M1 20v-2a4 4 0 0 1 4-4m18 6v-2a4 4 0 0 0-4-4"/>',signup:'<path d="M14 3H4v18h11M14 3l5 5v5M14 3v5h5M8 8h3m-3 5h5m-5 4h3"/><circle cx="18" cy="18" r="4"/><path d="M18 16v4m-2-2h4"/>',clock:'<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M12 17v4m-5 0h10"/>',manage:'<path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v5m-4 1h8"/>',archives:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>'};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[k]||icons.clock}</svg>`;
const names={home:'Home',setup:'Tournament Design',players:'Player Database',signup:'Tournament Registration',manage:'Tournament Management',remote:'Tournament Remote',archives:'Tournament Archives',leaderboard:'Leaderboard',clock:'Clock Display'};
const current=()=>state.tournaments.find(t=>t.id===selected);
const pName=e=>state.players.find(p=>p.id===e.playerId)?.name||'Archived player';
const active=t=>t.entries.filter(e=>!e.eliminatedAt);
const tableActionName=t=>canCombineTables(t)?(tablesInUse(t)>tablesRequired(t)?'Combine Tables':'Balance Tables'):'Shuffle Seats';
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
  modal('Manual Chop',`<form id="manual-chop-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="tournamentId" value="${t.id}"><p>Enter each remaining player’s agreed payout. Previously eliminated players keep their payouts and points.</p><div class="manual-chop-players">${remaining.map((e,i)=>`<label><span class="manual-chop-player-name" title="${esc(pName(e))}">${esc(pName(e))}</span><small class="muted">${chopPointsBreakdown(remaining.length)}</small><div class="input-wrap"><span>$</span><input type="text" inputmode="numeric" data-money="true" data-manual-payout="${e.id}" value="${num((schedule[i]||0)/100)}" required></div></label>`).join('')}</div><p id="manual-chop-feedback" role="status"></p><button class="button primary full">Review Manual Chop</button></form>`);updateManualChop();
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
    if(layoutDraft){context=layoutDraft.id?'Edit Clock Layout':'Create Clock Layout';action='<button type="button" class="button primary small" data-action="save-layout">Save Layout</button><button type="button" class="button secondary small" data-action="cancel-layout">Back to Saved Layouts</button>';}
    else if(!editor){action=setupLibraryTab==='layouts'?'<button type="button" class="button primary small" data-action="create-layout">+ Create Layout</button>':'<button type="button" class="button gold small" data-action="new-structure">+ Create Structure</button>';}
    else if(editor){context=editor.event?'Tournament settings':editor.isNew?'New structure':'Edit structure';if(editor.event)action='<button type="button" class="button gold small" data-action="close-editor">Back to Tournament Management</button>';}
  }
  if(view==='players'){
    const player=state.players.find(p=>p.id===playerDetail);
    if(player){title=esc(player.name)+(player.archived?' <span class="archived-status">(Archived)</span>':'');context='Player Database';action='<button class="button secondary small" data-action="players-back">Back to players</button>';}
    else action='<button class="button primary small" data-action="add-player">+ Add Player</button>';
  }
  if(view==='manage'&&current()&&current().status!=='completed'&&!current().archivedAt)action='<button type="button" class="button gold small context-edit-tournament" data-action="event-settings">Edit This Tournament</button>';
  if(view==='signup')action='<button class="button secondary small" data-go="manage">Back to Tournament Management</button>';
  if(view==='archives'&&archiveDetail)action='<button class="button secondary small" data-action="archives-back">Back to Tournament Archives</button>';
  return {title,context,action};
}
function header(){const showContext=!['home','players','leaderboard','archives','setup'].includes(view)&&(view!=='signup'||!!current()),banner=bannerDetails();return `<header class="header${banner?' page-banner':''}"><a class="brand" href="${APP_ROOT}?view=home" data-go="home"><span>UNO CLUB<small>TOURNAMENT DIRECTOR</small></span></a>${banner?`<div class="page-banner-title"><h1 id="page-title">${banner.title}</h1>${banner.context?`<small>${esc(banner.context)}</small>`:''}</div>`:''}<div class="header-right">${banner?.action||''}</div></header>${showContext?`<div class="context"><div><span class="eyebrow">TOURNAMENT</span><strong class="current-tournament-name" title="${esc(current()?.name||'No current tournament')}">${esc(current()?.name||'No current tournament')}</strong></div><div class="context-actions">${view==='manage'?tvDisplayControls(current()):''}${view==='signup'?'':`<button class="button small dark" data-action="open-clock" title="Automatic TV placement and full screen: pending Windows wireless HDMI testing.">${icon('clock')} Open clock window</button>`}</div></div>`:''}${!online?`<div class="mode-note warning">${esc(remoteError||'Connection interrupted. Reconnect to save changes.')} <button data-action="refresh">Retry</button></div>`:''}`;}


function nav(){return `<nav class="nav" aria-label="Tournament pages">${['home','players','setup','manage','archives','leaderboard'].map(k=>`<button class="${(view===k||view==='signup'&&k==='manage')?'active':''}" data-go="${k}">${icon(k)}<span>${names[k]}</span></button>`).join('')}</nav>`;}
function empty(title,text,button=''){return `<div class="empty"><span class="empty-icon">${icon('clock')}</span><h2>${title}</h2><p>${text}</p>${button}</div>`;}
function metrics(t){const f=financials(t);return `<div class="metrics"><div><span>Players remaining</span><strong>${active(t).length}<small> / ${t.entries.length}</small></strong></div><div><span>Prize pool</span><strong>${money(f.pool)}</strong></div><div><span>Rebuys</span><strong>${t.settings.rebuyEnabled?f.rebuyCount:'Not Allowed'}</strong></div><div><span>Add-ons</span><strong>${t.settings.addonEnabled?f.addonCount:'Not Allowed'}</strong></div><div><span>Clock status</span><strong class="status-value" id="status-metric">${statusLabel(t)}</strong></div></div>`;}
function homeTournament(){const isActive=t=>!t.archivedAt&&t.status!=='completed'&&(t.entries.length>0||t.startedAt);return (current()&&isActive(current())?current():state.tournaments.slice().reverse().find(isActive));}
// Home is now a separately loaded screen. Other screens remain in place for later phases.
function home(){return homeModule?homeModule.renderHome({t:homeTournament(),icon,esc,money,statusLabel}):homeLoadError&&homeLoadError!=='loading'?'<section class="panel" role="alert"><h2>Home could not load</h2><p>'+esc(homeLoadError)+'</p><button class="button secondary" data-action="retry-home">Retry</button></section>':'<section class="panel" role="status" aria-live="polite"><p>Loading Home…</p></section>'+nav();}

function settingsFields(s,eventSettings=false){const t=eventSettings?current():null,locked=eventSettings&&(!t||t.status!=='open'||tournamentStarted(t)||(t.entries||[]).length>0||!!t.archivedAt);return renderDesignSettings(s,{num,money,eventSettings:locked});}
function readSettings(form,base){return readDesignSettings(form,base,{clone,wholeDollars});}
function levelRows(levels){return designLevelRows(levels,{esc,clockLayouts:state.clockLayouts||[]});}
function refreshSavedLayoutPreviews(){if(view!=='setup')return;refreshDesignLayoutPreviews({document,clockLayouts:state.clockLayouts||[],defaults:state.clockAppearanceDefaults,originalAppearance:ORIGINAL_CLOCK_APPEARANCE,layoutDraft,applyClockAppearance});}
function updateLayoutDesignerClock(){updateDesignLayoutClock($('#saved-layout-form'));}
function savedLayoutView(){return renderSavedLayouts({layoutDraft,clockLayouts:state.clockLayouts||[],esc,renderLayoutEditor,renderClockAppearance,renderClockLayoutScreen});}
let layoutInitialSnapshot=null;
function layoutFormSnapshot(form){return JSON.stringify([...new FormData(form).entries()].filter(([key])=>key!=='preset').map(([key,value])=>[key,String(value)]));}
function openLayout(layout=null,duplicate=false){layoutDraft=createLayoutDraft(layout,duplicate,state.clockAppearanceDefaults,clockAppearance);setupLibraryTab='layouts';view='setup';render();layoutInitialSnapshot=$('#saved-layout-form')?layoutFormSnapshot($('#saved-layout-form')):null;}
function setup(){return renderTournamentDesign({layoutDraft,editor,setupLibraryTab,state,current,tournamentStarted,esc,structureClockAppearance,settingsFields,levelRows,payoutFields,savedLayoutView,num,money});}
function guaranteeEligibility(s,t=null){const {guaranteeAmount,guaranteePlayers}=guaranteeSettings(s);return `${t?`${t.entries.length} registered. `:''}${money(guaranteeAmount)} guaranteed to First Place with ${num(guaranteePlayers)} registered players. Below ${num(guaranteePlayers)}, two places are paid: 65% / 35%.`;}
function readGuarantee(form,s){
  if(!form.elements.guaranteeAmount)return s;
  s.guaranteeAmount=wholeDollars(form.elements.guaranteeAmount.value)*100;s.guaranteePlayers=Number(form.elements.guaranteePlayers.value);
  if(!Number.isSafeInteger(s.guaranteeAmount)||s.guaranteeAmount<=0)throw new Error('Enter a positive whole-dollar first-place guarantee.');
  if(!Number.isSafeInteger(s.guaranteePlayers)||s.guaranteePlayers<1||s.guaranteePlayers>999)throw new Error('Enter a whole number from 1 to 999 for the guarantee.');return s;
}
function payoutFormats(s,t=null){
  const {guaranteeAmount,guaranteePlayers}=guaranteeSettings(s);
  return `<fieldset class="payout-formats" ${t?.status==='completed'?'disabled':''}><legend>Prize Format</legend>${[['percent','Percentage of Prize Pool'],['fixed','Fixed Dollar Amounts']].map(([value,label])=>`<label class="check"><input type="radio" name="payoutMode" value="${value}" ${s.payoutMode===value?'checked':''}><span>${label}</span></label>`).join('')}<div class="check guarantee-choice"><input id="guaranteed-format" type="radio" name="payoutMode" value="guaranteed" aria-label="Guaranteed to First Place" ${s.payoutMode==='guaranteed'?'checked':''}><div class="guarantee-settings"><label for="guaranteed-format" class="guarantee-title">Guaranteed to First Place</label><div class="guarantee-fields"><div class="guarantee-amount"><span>$</span><input type="text" inputmode="numeric" data-money="true" name="guaranteeAmount" aria-label="First-place guarantee amount" value="${num(guaranteeAmount/100)}" required></div><span>with</span><input type="text" inputmode="numeric" name="guaranteePlayers" aria-label="Players required for guarantee" minlength="1" maxlength="3" pattern="[0-9]{1,3}" value="${guaranteePlayers}" required><span>players</span></div></div></div></fieldset>${t?`<p class="muted small-copy" id="guarantee-eligibility">${guaranteeEligibility(s,t)}</p>`:''}`;
}
function paidPlacesControl(s,t=null,live=false){
  const count=t?.icmChop?t.finalPayouts.length:s.payoutMode==='guaranteed'?2:s.payouts.length,locked=t?.status==='completed'||s.payoutMode==='guaranteed'&&!live;
  return `<label class="paid-places-label" for="paid-places">Number of Places Paid</label><div class="paid-places-control"><button type="button" class="button secondary" data-payout-step="-1" aria-label="Decrease paid places" ${locked||count===1?'disabled':''}>−</button><input id="paid-places" name="paidPlaces" type="number" min="1" max="20" step="1" value="${count}" required ${locked?'disabled':''}><button type="button" class="button secondary" data-payout-step="1" aria-label="Increase paid places" ${locked||count===20?'disabled':''}>+</button></div><p class="muted small-copy" id="paid-places-note"></p>`;
}
function setupHouseContribution(s,t=null){const total=t?financials({...t,settings:s}).houseContribution:s.houseContribution;return `<label class="payout-house-contribution">House contribution added to prizes<div class="input-wrap"><span>$</span><input type="text" inputmode="numeric" data-money="true" name="houseContributionTotal" aria-label="Total House Contribution" value="${num(total/100)}" required></div></label><input type="hidden" data-money="true" name="houseContribution" value="${num(s.houseContribution/100)}">`;}
function syncSetupHouseContribution(form,settings,t){const input=form.elements.houseContributionTotal;if(!input)return;const total=t?financials({...t,settings}).houseContribution:settings.houseContribution;input.value=num(total/100);}

function setupGuaranteeFunding(s,t){
 if(!t||s.payoutMode!=='guaranteed')return '';
 const f=financials({...t,settings:s});
 return f.guaranteeActive?`<p class="guarantee-note">${f.guaranteeContribution?`${money(f.guaranteeContribution)} is automatically added to meet the First Place guarantee.`:'The first-place guarantee is fully funded; no additional House Contribution is needed.'}</p>`:'';
}
function payoutFields(s,t=null){if(s.payoutRules)return '<p class="muted">Custom payouts are managed in Tournament Management or Tournament Remote.</p>'+setupHouseContribution(s,t);return `<div class="payout-editor-grid" data-setup-payouts><div class="payout-format-column">${paidPlacesControl(s,t)}${payoutFormats(s,t)}${setupHouseContribution(s,t)}<div id="setup-guarantee-funding">${setupGuaranteeFunding(s,t)}</div><p id="setup-payout-feedback" class="muted" role="status"></p></div><section class="payout-places-column"><h3>Payouts</h3><div id="payout-place-list" data-mode="${s.payoutMode}">${payoutPlaceRows(t,s.payoutMode,s.payouts.map(n=>s.payoutMode==='fixed'?n/100:n),true,s)}</div></section></div>`;}
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
  let amounts=[];if(t)try{amounts=prizes({...t,settings:{...t.settings,...settings,payoutMode:mode,payouts:values.map(n=>dollarNumber(n)*(mode==='fixed'?100:1))}});}catch{}
  const count=mode==='guaranteed'?2:values.length,readonly=t?.status==='completed'||mode==='guaranteed';
  return Array.from({length:count},(_,i)=>`<div class="payout-place-row" data-payout-place="${i}">${readonly?`<span>${placeName(i)}</span><output data-payout-amount="${i}">${setup&&!t?(i===0?`${money(guaranteeSettings(settings).guaranteeAmount)} minimum at ${num(guaranteeSettings(settings).guaranteePlayers)} players`:'Remainder'):money(amounts[i]||0)}</output>`:`<label for="payout-place-${i}"><span class="payout-place-label">${placeName(i)}</span><div class="input-wrap ${mode==='percent'?'payout-percentage-input':''}">${mode==='fixed'?'<span>$</span>':''}<input id="payout-place-${i}" name="payoutPlace${i+1}" data-payout-value="${i}" aria-label="${placeName(i)} ${mode==='fixed'?'dollars':'percentage'}" type="${mode==='fixed'?'text':'number'}" ${mode==='fixed'?'inputmode="numeric" data-money="true"':''} min="0" ${mode==='percent'?'max="100"':''} step="${mode==='fixed'?'1':'0.0001'}" value="${mode==='fixed'?num(dollarNumber(values[i]??0)):values[i]??0}" required>${mode==='percent'?'<span>%</span>':''}</div></label>${mode==='percent'&&!setup?`<output data-payout-amount="${i}">${money(amounts[i]||0)}</output>`:''}`}</div>`).join('');
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
  form.querySelector('#paid-places-note').textContent='';
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
    const context=payoutContext(form),base=form.id==='payout-form'?context:{...(context||{}),settings:readSettings(form,editor.value.settings)},settings=readPayoutSettings(form,base);
    setText('#guarantee-eligibility',guaranteeEligibility(settings,payoutContext(form)));
    if(mode==='percent'&&Math.abs(settings.payouts.reduce((a,b)=>a+b,0)-100)>0.000001)throw new Error('Percentages must total 100%.');
    if(form.id!=='payout-form'){$('#setup-payout-feedback').classList.remove('payout-order-error');if(mode==='percent'||mode==='fixed')validatePayoutOrder(settings.payouts,mode==='percent'?'percent':'dollars');if(mode==='guaranteed'){if(context)prizes({...context,settings}).forEach((amount,i)=>setText(`[data-payout-amount="${i}"]`,money(amount)));else setText('[data-payout-amount="0"]',`${money(settings.guaranteeAmount)} minimum at ${num(settings.guaranteePlayers)} players`);}syncSetupHouseContribution(form,settings,context);const funding=form.querySelector('#setup-guarantee-funding');if(funding&&document.activeElement!==form.elements.houseContributionTotal)funding.innerHTML=setupGuaranteeFunding(settings,context);setText('#setup-payout-feedback','');return;}
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
function summaryPaymentCalculation(amounts,total,fallback){
  if(amounts.reduce((sum,value)=>sum+value,0)!==total)return 'Saved total';
  const groups=new Map();for(const value of amounts)groups.set(value,(groups.get(value)||0)+1);
  return groups.size?[...groups].map(([value,count])=>`${count} × ${money(value)}`).join(' + '):`0 × ${money(fallback)}`;
}
function summaryPanel(t){
  const f=financials(t),payments=t.entries.flatMap(e=>e.payments||[]),entries=payments.filter(p=>p.kind==='entry'),addons=payments.filter(p=>p.kind==='addon');
  const entryCalculation=summaryPaymentCalculation(entries.map(p=>paymentTotal(p)-(p.dealerToke||0)-(p.adminFee||0)),f.tournamentEntries,Math.max(0,t.settings.buyIn-t.settings.dealerToke));
  const tokeAmounts=payments.filter(p=>p.dealerToke).map(p=>p.dealerToke);if(t.settings.rebuyFeeType==='toke'&&t.settings.rebuyFeeAmount)tokeAmounts.push(...Array(f.rebuyCount).fill(t.settings.rebuyFeeAmount));
  const adminAmounts=payments.filter(p=>p.adminFee).map(p=>p.adminFee);if(t.settings.rebuyFeeType==='admin'&&t.settings.rebuyFeeAmount)adminAmounts.push(...Array(f.rebuyCount).fill(t.settings.rebuyFeeAmount));
  const tokeCalculation=summaryPaymentCalculation(tokeAmounts,f.dealerTokes,t.settings.dealerToke);
  const adminFeeCalculation=summaryPaymentCalculation(adminAmounts,f.adminFees,0);
  const feeCalculation=f.houseFeeMode==='flat'?`${money(f.houseFee)} flat fee per tournament`:f.housePercent==null?'Saved total':`${money(f.houseBase)} × ${f.housePercent}%${Math.round(f.houseBase*f.housePercent/10000)*100===f.houseFee?(f.houseBase*f.housePercent/100===f.houseFee?'':' (rounded)'):' (saved)'}`;
  const poolCalculation=`${money(f.tournamentEntries)} + ${money(f.rebuyTotal)} + ${money(f.addonTotal)} − ${money(f.houseFee)}${f.houseContribution?` + ${money(f.houseContribution)}`:''}${f.basePool===0&&f.houseFee>f.houseBase+f.manualHouseContribution?' (minimum $0)':''}`;
  const rebuyNetCalculation=`${f.rebuyCount} × ${money(t.settings.rebuyAmount)}${t.settings.rebuyFeeAmount?` − ${f.rebuyCount} × ${money(t.settings.rebuyFeeAmount)} ${t.settings.rebuyFeeType==='admin'?'admin fee':'dealer toke'}`:''}`;
  const addonNetCalculation=summaryPaymentCalculation(addons.map(p=>paymentTotal(p)-(p.dealerToke||0)-(p.adminFee||0)),f.addonTotal,t.settings.addonAmount);
  const rows=[['Tournament Entries',f.tournamentEntries,'credit',entryCalculation],...(f.dealerTokes>0?[['Dealer Tokes',f.dealerTokes,'credit',tokeCalculation]]:[]),...(f.adminFees>0?[['Admin Fees',f.adminFees,'credit',adminFeeCalculation]]:[]),...(t.settings.rebuyEnabled?[['Rebuys',f.rebuyTotal,'credit',rebuyNetCalculation]]:[]),...(t.settings.addonEnabled?[['Add-ons',f.addonTotal,'credit',addonNetCalculation]]:[]),['Tournament Fee',-f.houseFee,'debit',feeCalculation],...(f.dealerTokesPaidOut>0?[['Dealer Tokes Paid Out',-f.dealerTokesPaidOut,'debit',f.dealerTokesPaidOut===f.dealerTokes?tokeCalculation:'Saved total']]:[]),...(f.houseContribution>0?[['House Contribution',f.houseContribution,'credit',f.guaranteeContribution?`${money(f.manualHouseContribution)} + ${money(f.guaranteeContribution)} guarantee`:'House funding']]:[]),['Total Prize Pool',f.pool,'total',Math.max(0,f.tournamentEntries+f.rebuyTotal+f.addonTotal-f.houseFee+f.manualHouseContribution)+f.guaranteeContribution===f.pool?poolCalculation:'Saved total']];
  return `<div class="section-label summary-heading"><h2>Tournament Summary</h2>${t.archivedAt?'<span class="pill light">Archived</span>':''}</div><div class="summary-grid financial-summary">${rows.map(([label,value,kind,calculation])=>`<div class="financial-${kind}"><span class="summary-name">${label}</span><span class="summary-calculation">${esc(calculation)}</span><strong>${value<0?'−':kind==='credit'&&value>0?'+':''}${money(Math.abs(value))}</strong></div>`).join('')}</div>${summaryPrizes(t)}${tournamentPoints(t)}`;
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
function entryRebuyCount(entry){return (entry.payments||[]).filter(payment=>payment.kind==='rebuy').length;}
function entryRows(t,management){const clock=management?clockAt(t,timeNow()):null,rebuyTracking=t.settings.rebuyTracking||'total';return t.entries.slice().sort((a,b)=>Number(!!a.eliminatedAt)-Number(!!b.eliminatedAt)||pName(a).localeCompare(pName(b))).map(e=>{const rebuyCount=entryRebuyCount(e),rebuyMax=t.settings.rebuyMax||0,canRebuy=management&&tournamentStarted(t)&&t.settings.rebuyEnabled&&rebuyTracking==='player'&&!e.eliminatedAt&&!e.pendingElimination&&purchaseOpen(t,clock,'rebuy')&&(!rebuyMax||rebuyCount<rebuyMax),details=e.icmChopParticipant?'ICM chop · '+num(e.finalChipCount)+' chips':e.manualChopParticipant?'Manual chop':e.place?'Finished #'+e.place:(e.table?'Table '+e.table+' · Seat '+e.seat:'Not seated');return `<div class="entry-row ${e.eliminatedAt?'out':''}"><div><strong>${esc(pName(e))}</strong><small>${details}${management&&rebuyTracking==='player'?` · Rebuys ${rebuyCount}${rebuyMax?` / ${rebuyMax}`:''}`:''}</small></div><div class="entry-actions">${t.status==='completed'?'':!e.eliminatedAt?`${management&&t.settings.rebuyEnabled&&rebuyTracking==='player'?`<button type="button" class="button tiny secondary${rebuyMax&&rebuyCount>=rebuyMax?' is-rebuy-limit':''}" data-rebuy="${e.id}" ${canRebuy||rebuyMax&&rebuyCount>=rebuyMax?'':'disabled'}>Rebuy</button>`:''}${management&&t.settings.addonEnabled?`<button class="button tiny secondary" data-addon="${e.id}">Add-on</button>`:''}${!management?`<button type="button" class="button tiny secondary" data-unregister="${e.id}" ${e.pendingElimination?'disabled':''}>Unregister</button>`:''}${management?(e.pendingElimination?'<span class="pill light">Pending Elimination</span>':`<button class="button tiny danger" data-eliminate="${e.id}">Eliminate</button>`):''}`:management?`<button type="button" class="button tiny secondary" data-undo-elimination="${e.id}">Undo Elimination</button>`:'<span class="pill light">Eliminated</span>'}</div></div>`;}).join('');}
function rebuyCountHelp(t,c){return !t.settings.rebuyEnabled?'Rebuys are not allowed.':t.status==='completed'?'This tournament is finished.':c.status==='ready'?'Start the tournament before recording rebuys.':canRecordRebuys(t,c)?'Enter rebuys now.':rebuyOpen(t,c)?'Enter rebuys after level '+t.settings.rebuyLastRound:'Rebuys are closed.';}
function rebuyCountLabel(t,c){if(!t.settings.rebuyEnabled)return 'Rebuys not allowed';if(t.status==='completed')return 'Tournament finished';if(t.rebuyCountsEntered||tournamentRebuyCount(t)>0)return tournamentRebuyCount(t)+' Rebuys';if(c.status==='ready')return 'Enter rebuys after level '+t.settings.rebuyLastRound;if((t.settings.rebuyTracking||'total')==='total'&&canRecordRebuys(t,c))return 'Enter rebuys now';if((t.settings.rebuyTracking||'total')==='player'&&tournamentStarted(t)&&canRecordRebuys(t,c))return 'Enter rebuys now';if(rebuyOpen(t,c))return 'Enter rebuys after level '+t.settings.rebuyLastRound;return canEditRebuys(t,c)?'Enter rebuys now':'Enter rebuys after level '+t.settings.rebuyLastRound;}
function addonCount(t){return t.entries.reduce((sum,e)=>sum+(e.payments||[]).filter(p=>p.kind==='addon').length,0);}
function addonAvailable(t,c){if(!t.settings.addonEnabled||!tournamentStarted(t)||t.status==='completed'||c.status==='ended')return false;const round=roundAt(t,c.index),last=t.settings.addonLastRound;return round>last||round===last&&t.levels[c.index]?.kind==='break';}
function addonCountLabel(t,c){if(!t.settings.addonEnabled)return 'Add-ons not allowed';if(t.addonCountsEntered||addonCount(t)>0)return addonCount(t)+' add-ons';if(addonAvailable(t,c))return 'Enter Add-ons now';return 'Add-on after level '+t.settings.addonLastRound;}
function rebuyCountControl(t){const c=clockAt(t,timeNow()),label=rebuyCountLabel(t,c),tracking=t.settings.rebuyTracking||'total',open=canEditRebuys(t,c);return `<button class="button secondary rebuy-control-button" id="record-rebuys" data-action="rebuy-count" aria-label="${esc(label)}" ${!t.settings.rebuyEnabled||!open||busy||!online?'disabled':''}>${esc(label)}</button><button class="button secondary addon-control-button" id="record-addons" data-action="addon-count" aria-label="${esc(addonCountLabel(t,c))}" ${!t.settings.addonEnabled||!addonAvailable(t,c)&&!t.addonCountsEntered?'disabled':''}>${esc(addonCountLabel(t,c))}</button>`;}
function seatedPlayerCount(t){return (t?.entries||[]).filter(e=>!e.eliminatedAt&&Number.isInteger(Number(e.table))&&Number(e.table)>0&&Number.isInteger(Number(e.seat))&&Number(e.seat)>0).length;}
function needsPlayersSeatedToStart(t,c){return c.status==='ready'&&seatedPlayerCount(t)<2;}
function controls(t){const c=clockAt(t,timeNow()),needsSeats=needsPlayersSeatedToStart(t,c);return `<div class="clock-controls"><button class="button ${c.status==='running'?'remote-action-red':c.status==='paused'?'remote-action-green':'primary'}" id="clock-main" data-clock="${c.status==='running'?'pause':c.status==='ready'?'start':'resume'}" data-needs-seats="${needsSeats}" ${c.status==='ended'||t.status==='completed'||needsSeats?'disabled':''}>${needsSeats?'Seat at least two players to start tournament':c.status==='running'?'Pause Clock':c.status==='ready'?'Start Tournament':'Resume Clock'}</button><button class="button secondary" data-clock="previous" ${c.index===0||t.status==='completed'?'disabled':''}>← Previous level</button><button class="button secondary" data-clock="next" ${c.index===t.levels.length-1||t.status==='completed'?'disabled':''}>Next level →</button><button class="button secondary" data-adjust="-60" ${t.status==='completed'?'disabled':''}>−1 minute</button><button class="button secondary" data-adjust="60" ${t.status==='completed'?'disabled':''}>+1 minute</button>${rebuyCountControl(t)} </div>`;}
function tvDisplayControls(t){
  if(!t)return '';
  const mode=tvDisplayMode(t),started=tournamentStarted(t);
  return `<section class="tv-display-controls" aria-label="TV Display"><strong>TV Display</strong><div class="tv-display-buttons" role="group" aria-label="TV display mode">${[['full-clock','Full Clock'],['clock-seating','Clock + Seating']].map(([value,label])=>`<button type="button" class="button small secondary ${mode===value?'is-selected':''}" data-tv-display="${value}" aria-pressed="${mode===value}" ${busy||!online||value==='full-clock'&&!started?'disabled':''}>${label}</button>`).join('')}</div></section>`;
}
function manage(){const t=current();if(!t)return noTournament('No active tournament');const f=financials(t);return `<div class="management-registration-entry"><button type="button" class="button primary" data-go="signup">Tournament Registration</button></div>${metrics(t)}${tableBalanceNeeded(t)?'<p class="table-balance-alert" role="alert"><strong>Tables Need Balancing.</strong> Please move one player to balance the tables.</p>':''}<section class="panel control-panel"><div class="mini-clock"><span class="eyebrow" id="mini-level"></span><strong id="mini-time">15:00</strong><span id="mini-blinds"></span><small id="mini-note"></small></div><div class="management-clock-actions">${controls(t)}</div></section><div class="management-layout"><div class="management-sidebar" role="tablist" aria-label="Management sections" aria-orientation="vertical">${[['players','Players'],['tables','Tables & Seating'],['payouts','Payouts'],['summary','Summary']].map(([k,label])=>`<button type="button" role="tab" id="management-tab-${k}" aria-selected="${tab===k}" aria-controls="management-panel" tabindex="${tab===k?'0':'-1'}" data-tab="${k}" class="${tab===k?'active':''}">${label}</button>`).join('')}</div><section class="panel management-panel" id="management-panel" role="tabpanel" aria-labelledby="management-tab-${tab}" tabindex="0">${tab==='players'?`<div class="section-label"><h2>Players</h2><div class="button-row"><button class="button small primary" data-action="finish" ${active(t).length!==1||t.status==='completed'?'disabled':''}>Confirm winner & finish</button></div></div>${t.entries.length?entryRows(t,true):'<p class="muted">Register players from Tournament Registration.</p>'}`:tab==='tables'?tableManagement(t):tab==='payouts'?payoutPanel(t):`${summaryPanel(t)}${!t.archivedAt?`<section class="tournament-danger-zone">${t.status==='completed'?`<button type="button" class="button secondary" data-action="archive-tournament" ${busy||!online?'disabled':''}>Archive Tournament</button>`:`<button type="button" class="button danger" data-action="delete-tournament" ${busy||!online?'disabled':''}>Delete Tournament</button>`}</section>`:''}`}</section></div>`;}
function tableManagement(t,remote=false){
  const remaining=active(t),seated=remaining.filter(e=>e.table),unseated=remaining.filter(e=>!e.table),needsBalance=canCombineTables(t),undoIndex=seatingUndo.map(item=>item.tournamentId).lastIndexOf(t.id);
  const seatAction=needsBalance?'combine-tables':'shuffle-seats';
  return `<div class="section-label"><h2>Tables & Seating</h2><div class="management-table-actions"><div class="button-row">${!remote||unseated.length?`<button class="button secondary small" data-action="seat-remaining" ${t.status==='completed'||!unseated.length?'disabled':''}>${seated.length?'Seat Remaining Players':'Seat Players'}</button>`:''}${!remote?`<button class="button secondary small unseat-all-button" data-action="unseat-all" ${t.status==='completed'||!seated.length?'disabled':''}>Unseat All Players</button>`:''}<button class="button ${needsBalance?'management-balance-button':'secondary'} small" data-action="${seatAction}" ${t.status==='completed'||!remaining.length?'disabled':''}>${tableActionName(t)}</button>${!remote&&undoIndex>=0?`<button type="button" class="button secondary small" data-action="undo-seating">Undo Last Move</button>`:''}</div></div></div>${remote?'':`<div class="seating-action-stack"><form id="seating-settings-form" class="seating-settings-form"><input type="hidden" name="tournamentId" value="${t.id}"><label>Seats per table<input type="number" name="seatsPerTable" min="2" max="10" step="1" value="${t.settings.seatsPerTable}" required ${t.status==='completed'?'disabled':''}></label><button class="button secondary" ${t.status==='completed'?'disabled':''}>Apply</button></form>`}<div class="seat-move-help"><p class="muted" id="seat-move-instructions" role="status" hidden></p>${remote?'':`<button type="button" class="button secondary small move-players-toggle ${movePlayersEnabled?'is-active':''}" data-action="toggle-move-players" aria-pressed="${movePlayersEnabled}" ${t.status==='completed'?'disabled':''}>Move Players</button>`}</div>${remote?'':'</div>'}<div class="seat-tables ${remote||movePlayersEnabled?'moves-enabled':''}">${Array.from({length:tablesInUse(t)},(_,i)=>`<div class="seat-table"><h3><span class="seat-table-title">TABLE ${i+1}</span><small>${remaining.filter(e=>e.table===i+1).length} of ${t.settings.seatsPerTable} Seats Filled</small></h3>${Array.from({length:t.settings.seatsPerTable},(_,j)=>{const e=remaining.find(e=>e.table===i+1&&e.seat===j+1);return seatRow(t,i+1,j+1,e,remote);}).join('')}</div>`).join('')}</div><div class="unseated-drop-zone" data-seat-target data-seat="unseated" data-seat-unseated-target="true"><h3 class="unseated-area-label">Unseated Area</h3>${unseated.map(e=>`<div class="result-row unseated-player-row" data-unseated-entry="${e.id}"><button type="button" class="unseated-player-grip" aria-pressed="false" data-seat-grab="${e.id}" aria-label="Select ${esc(pName(e))} to move to a seat" ${t.status==='completed'||e.pendingElimination?'disabled':''}>${esc(pName(e))}</button><div class="unseated-player-actions">${remote?'':seatEliminateButton(t,e)}</div></div>`).join('')}</div>`;
}
function unseatAllDialog(){
  const t=current();if(!t)return;
  const locked=active(t).filter(e=>e.seatLocked);
  const actions=locked.length?`<button type="button" class="button primary" data-unseat-all-mode="keep">Unseat players and keep locked players seated</button><button type="button" class="button danger" data-unseat-all-mode="everyone">Unseat everyone, including locked players</button>`:`<button type="button" class="button danger" data-unseat-all-mode="everyone">Unseat All Players</button>`;
  modal('Unseat Remaining Players',`<p>${locked.length?'Locked players stay seated unless you choose to unseat everyone.':'This removes every remaining player from their seat. They stay registered and can be seated again.'}</p><div class="button-row">${actions}<button type="button" class="button secondary" data-action="close-modal">Cancel</button></div>`);
}
function shuffleSeatsDialog(){
  const context=seatingContext(),t=current();
  try{planTableSeating(t,{mode:'shuffle'});}catch(error){modal('Cannot shuffle seats',`<p class="seat-move-error" role="alert">${esc(error.message)}</p><button class="button secondary" data-action="close-modal">Close</button>`);return;}
  tableCombineChoice={...context,mode:'shuffle'};
  modal('Shuffle Seats',`<p>Randomly assign the remaining players to open seats while keeping table sizes balanced.</p><p class="muted">Locked players stay in their exact seats. You can undo the shuffle with Undo Last Move.</p><div class="button-row"><button type="button" class="button primary" data-combine-mode="shuffle">Shuffle Seats</button><button type="button" class="button secondary" data-action="close-modal">Cancel</button></div>`);
}
function seatMovesEnabled(){return view==='remote'?remotePanel==='tables'&&current()?.status!=='completed':current()?.status!=='completed';}
function seatMoveInstructions(remote=view==='remote'){return remote?'Tap a player, then tap the destination seat.':'Tap a player, then tap a seat or Unseated Players. Enable Move Players to drag players.';}
function seatEliminateButton(t,entry){return `<button type="button" class="seat-eliminate-button" data-eliminate="${entry.id}" aria-label="Eliminate ${esc(pName(entry))} from the tournament" ${t.status==='completed'||entry.pendingElimination||active(t).length<=1?'disabled':''}>Eliminate</button>`;}
function seatRebuyButton(t,entry){
  if(!t.settings.rebuyEnabled||(t.settings.rebuyTracking||'total')!=='player')return '';
  const rebuyMax=t.settings.rebuyMax||0,rebuyCount=entryRebuyCount(entry),clock=clockAt(t,timeNow());
  const atLimit=rebuyMax>0&&rebuyCount>=rebuyMax;
  const canRebuy=t.status!=='completed'&&tournamentStarted(t)&&!entry.eliminatedAt&&!entry.pendingElimination&&purchaseOpen(t,clock,'rebuy')&&!atLimit;
  return `<button type="button" class="seat-rebuy-button${atLimit?' is-rebuy-limit':''}" data-rebuy="${entry.id}" aria-label="${atLimit?'Rebuy limit of '+rebuyMax+' reached for ':'Rebuy for '}${esc(pName(entry))}" ${canRebuy||atLimit?'':'disabled'}>Rebuy</button>`;
}
function seatRow(t,table,seat,entry,remote=false){
  const disabled=t.status==='completed'?'disabled':'',moveDisabled=disabled||(entry?.seatLocked||entry?.pendingElimination?'disabled':'');
  return `<div class="seat-row ${entry?.seatLocked?'seat-locked':''}" data-seat-target data-table="${table}" data-seat="${seat}">${entry?`<button type="button" class="seat-player-grip" data-seat-grab="${entry.id}" aria-pressed="false" aria-label="Move ${esc(pName(entry))} from Table ${table}, Seat ${seat}" title="${remote?'Tap this player, then tap the destination seat':'Drag to another seat, or select then choose a seat'}" ${moveDisabled}><span class="seat-number" aria-hidden="true">${seat}</span><span class="seat-player-name">${esc(pName(entry))}</span>${remote?'':'<span class="seat-grab-icon" aria-hidden="true">⠿</span>'}</button><div class="seat-player-actions"><button type="button" class="seat-lock-button ${entry.seatLocked?'is-locked':''}" data-seat-lock="${entry.id}" aria-pressed="${!!entry.seatLocked}" aria-label="${entry.seatLocked?'Unlock':'Lock'} ${esc(pName(entry))} at Table ${table}, Seat ${seat}" ${disabled}>${entry.seatLocked?'Locked':'Lock'}</button>${remote?'':seatRebuyButton(t,entry)+seatEliminateButton(t,entry)}</div>`:`<button type="button" class="seat-empty" data-seat-target-button="true" aria-label="Table ${table}, Seat ${seat}, empty" ${disabled}><span class="seat-number" aria-hidden="true">${seat}</span><span class="muted">Empty</span></button>`}</div>`;
}
function ordinal(n){return n+(n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'})[n%10]||'th');}
function clockSidebar(t,c){
  const phase=rebuyPhase(t,c),open=phase!=='closed',count=active(t).length+' / '+t.entries.length,pool=tvMoney(financials(t).pool),withBreak=cutoffHasBreak(t);
  const notice=phase==='final-round'?`<strong class="tv-final-rebuy">Final Rebuy Round</strong><p class="tv-cutoff-detail">${withBreak?'Rebuys remain open during the following break':'Rebuys close after this round'}</p>`:phase==='final-break'?'<strong>Rebuys Open</strong><p class="tv-cutoff-detail">Rebuys close when this break ends</p>':`<strong>Rebuys Open</strong><p>Through Level ${t.settings.rebuyLastRound}</p>${withBreak?'<p class="tv-cutoff-detail">Includes the following break</p>':''}`;
  return `<div class="tv-players"><span>PLAYERS REMAINING</span><strong style="font-size:min(${open?9:7.5}vw,${52/count.length}vw)">${count}</strong>${!open?`<small class="tv-rebuy-count">Rebuys: ${financials(t).rebuyCount}</small>`:''}</div>${open?`<div class="tv-rebuys-open">${notice}</div>`:`<div class="tv-pool"><span>PRIZE POOL</span><strong style="font-size:min(7.5vw,${52/pool.length}vw)">${pool}</strong></div><div class="tv-prizes"><span>PAYOUTS</span><div class="tv-payout-list">${prizes(t).map((v,i)=>`<p><span>${(t.icmChop||t.manualChop)?.participants[i]?esc(pName((t.icmChop||t.manualChop).participants[i])):ordinal(i+1)}</span><strong>${tvMoney(v)}</strong></p>`).join('')}</div></div>`}`;
}

function tvToolbar(){return `<div class="tv-toolbar"><button data-go="home">← Home</button><span class="tv-mode">${online?'CONNECTED':'CONNECTION INTERRUPTED'}</span><button data-action="sound">Sound: ${sound?'on':'off'}</button><button data-action="fullscreen">Full screen ⛶</button></div>`;}
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
  if(view==='manage'||view==='archives')return `<div class="management-chrome">${banner}<div class="workspace">${menu}</div></div><div class="workspace">${content}</div>`;
  return `${banner}<div class="workspace">${menu}${content}</div>`;
}
function syncManagementSidebarOffset(){const chrome=document.querySelector('.management-chrome');if(!chrome)return;document.documentElement.style.setProperty('--management-sticky-top',Math.ceil(chrome.getBoundingClientRect().height+4)+'px');}
window.addEventListener('resize',syncManagementSidebarOffset);
window.addEventListener('orientationchange',syncManagementSidebarOffset);
function render(){if(session&&view==='home')ensureHomeModule();if(session&&(view==='players'||view==='signup'))ensureScreenModule(view);if(!session||!(view==='manage'&&tab==='tables'||view==='remote'&&remotePanel==='tables')||movePlayersTournament!==selected)movePlayersEnabled=false;seatDragging?.cancel();clearSeatPick();if(!session){clearInterval(clockTimer);document.body.classList.remove('registration-page','tv','home-page','fixed-workspace','setup-page','players-page','player-profile-page','remote-page','leaderboard-page','points-editing');app.innerHTML=signInScreen();clockToolbar?.sync();return;}selectCurrentTournament();if(movePlayersTournament!==selected||current()?.status==='completed')movePlayersEnabled=false;const registration=registrationSnapshot(),panels=panelSnapshot();clearInterval(clockTimer);document.body.classList.toggle('points-editing',view==='players'&&!!pointsEditor);document.body.classList.toggle('leaderboard-page',view==='leaderboard');document.body.classList.toggle('registration-page',view==='signup'&&!!current());document.body.classList.toggle('tv',view==='clock');document.body.classList.toggle('remote-page',view==='remote');document.body.classList.toggle('home-page',view==='home');document.body.classList.toggle('fixed-workspace',['setup','players','leaderboard'].includes(view));document.body.classList.toggle('setup-page',view==='setup');document.body.classList.toggle('players-page',view==='players');document.body.classList.toggle('player-profile-page',view==='players'&&!!playerDetail);if(view==='history-summary'){app.innerHTML=historicalSummaryScreen();}else if(view==='clock'){app.innerHTML=clockScreen();}else if(view==='remote'){app.innerHTML=remoteScreen();}else{app.innerHTML=workspaceScreen();}configureTournamentSettingsUI();restoreRegistration(registration);restorePanels(panels);clockToolbar?.sync();syncManagementSidebarOffset();if(view==='setup')refreshSavedLayoutPreviews();renderedWorkspaceVersion=version;if($('#payout-form')?.dataset.ruleEditor)refreshRulePreview($('#payout-form'));updatePayoutSaveButton();if(view==='setup'&&editor)applyClockAppearance($('.structure-clock-appearance .clock-appearance-preview'),editor.value.clockAppearance||state.clockAppearanceDefaults);if(view==='remote'){try{applyClockAppearance($('.remote-clock'),current()?.clockAppearance);}catch{applyClockAppearance($('.remote-clock'),ORIGINAL_CLOCK_APPEARANCE);}}tick();clockTimer=setInterval(tick,250);if(view==='clock'){try{applyClockAppearance($('.tv-shell'),scheduledClockAppearance(current()));}catch{applyClockAppearance($('.tv-shell'),ORIGINAL_CLOCK_APPEARANCE);}fitTvSeating();if(automaticTvLaunch&&!tvLaunchAttempted){tvLaunchAttempted=true;void tryTvFullscreen(false);}}}
function setText(selector,text){const el=$(selector);if(el&&el.textContent!==String(text)){el.textContent=text;if(el.hasAttribute('data-tv-fit'))fitTvSeating(document,[el]);}}
function formatTime(ms){const sec=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
function nextBreak(t,c){if(t.levels[c.index].kind==='break')return 'Break in progress';let ms=c.remainingMs;for(let i=c.index+1;i<t.levels.length;i++){if(t.levels[i].kind==='break')return 'Next break in '+formatTime(ms);ms+=t.levels[i].minutes*60000;}return 'No further breaks scheduled';}
function scheduledClockAppearance(t,c=t?.clock){if(!t)return state.clockAppearanceDefaults||ORIGINAL_CLOCK_APPEARANCE;const level=t.levels[c?.index??0],saved=level?.layoutId?(state.clockLayouts||[]).find(l=>l.id===level.layoutId):null;return saved?.appearance||t.clockAppearance||state.clockAppearanceDefaults||ORIGINAL_CLOCK_APPEARANCE;}
function tick(){updateLayoutDesignerClock();const t=current();if(!t)return;const c=clockAt(t,timeNow()),l=t.levels[c.index],round=roundAt(t,c.index);const tv=$('.tv-shell');if(tv){const key=c.index+':'+(l.layoutId||'')+':'+JSON.stringify((state.clockLayouts||[]).map(x=>[x.id,x.appearance]))+':'+JSON.stringify(t.clockAppearance);if(tv.dataset.appliedLayoutKey!==key){applyClockAppearance(tv,scheduledClockAppearance(t,c));tv.dataset.appliedLayoutKey=key;}}const level=l.kind==='break'?'BREAK':'ROUND '+round,blinds=l.kind==='break'?'Take a break':num(l.sb)+' / '+num(l.bb);const status=t.status==='completed'?(t.endedBy==='icm-chop'?'ENDED BY ICM CHOP':t.endedBy==='manual-chop'?'ENDED BY MANUAL CHOP':'TOURNAMENT COMPLETE'):({ready:'READY TO START',running:l.kind==='break'?'BREAK':'LEVEL IN PROGRESS',paused:'CLOCK PAUSED',ended:'SCHEDULE COMPLETE'})[c.status];
  setText('#hero-time',formatTime(c.remainingMs));setText('#hero-blinds',level+' · '+blinds);setText('#mini-level',level);setText('#mini-time',formatTime(c.remainingMs));setText('#mini-blinds',blinds);setText('#mini-note',status);setText('#status-metric',statusLabel(t));
  const notice=$('.tv-compact-rebuys');if(notice&&notice.dataset.rebuyPhase!==rebuyPhase(t,c)){notice.dataset.rebuyPhase=rebuyPhase(t,c);notice.textContent=compactRebuyNotice(t,c);notice.classList.toggle('final-rebuy',rebuyPhase(t,c)==='final-round');}
  const side=$('.tv-side');if(side&&side.dataset.rebuyPhase!==rebuyPhase(t,c)){side.dataset.rebuyPhase=rebuyPhase(t,c);side.className='tv-side '+(rebuyOpen(t,c)?'pre-rebuys':'post-rebuys');side.innerHTML=clockSidebar(t,c);}
  setText('#tv-level',level);setText('#tv-status',c.status==='running'?'':status);setCountdown($('#tv-time'),formatTime(c.remainingMs));if($('#tv-time')?.hasAttribute('data-tv-fit'))fitTvSeating(document,[$('#tv-time')]);setText('#tv-game',l.kind==='break'?(l.chipUp?'BREAK · CHIP UP':'BREAK'):'CURRENT BLINDS');setText('#tv-blinds',blinds);setText('#tv-ante',l.kind==='play'&&t.settings.anteEnabled!==false&&t.settings.anteMode!=='off'&&l.ante?'Ante '+num(l.ante)+' · '+(t.settings.anteMode==='big_blind'?'Big blind':'Each player'):'Antes off');setText('#tv-break',nextBreak(t,c));
  const next=t.levels[c.index+1];setText('#tv-next-label',next?.kind==='break'?'NEXT BREAK':'NEXT BLINDS');setText('#tv-next',next?(next.kind==='break'?`${next.minutes} minutes${next.chipUp?' · Chip up':''}`:`${num(next.sb)} / ${num(next.bb)}`):'Final level');
  $('#tv-time')?.classList.toggle('urgent',c.remainingMs<=60000&&c.status==='running');if($('#tv-progress'))$('#tv-progress').style.width=(100*Math.min(1,c.remainingMs/(l.minutes*60000)))+'%';
  setCountdown($('#remote-time'),formatTime(c.remainingMs));setText('#remote-level',level);setText('#remote-blinds',l.kind==='break'?'Take a break':num(l.sb)+' / '+num(l.bb));setText('#remote-next-label',next?.kind==='break'?'NEXT BREAK':'NEXT BLINDS');setText('#remote-next',next?(next.kind==='break'?next.minutes+' minutes':num(next.sb)+' / '+num(next.bb)):'Final level');
  const b=$('#clock-main')||$('#remote-clock');if(b){const command=c.status==='running'?'pause':c.status==='ready'?'start':'resume',needsSeats=needsPlayersSeatedToStart(t,c);b.dataset.clock=command;if(b.id==='clock-main'){b.dataset.needsSeats=String(needsSeats);b.textContent=needsSeats?'Seat at least two players to start tournament':c.status==='running'?'Pause Clock':c.status==='ready'?'Start Tournament':'Resume Clock';}else b.textContent=c.status==='running'?'Pause clock':c.status==='ready'?'Start tournament':'Resume clock';b.disabled=busy||!online||c.status==='ended'||t.status==='completed'||needsSeats;if(b.id==='remote-clock'){b.classList.toggle('remote-action-red',c.status==='running');b.classList.toggle('remote-action-green',c.status==='paused');b.textContent=c.status==='running'?'Pause Clock':c.status==='ready'?'Start Tournament':'Resume Clock';}}
  for(const button of document.querySelectorAll('[data-remote-undo]')){const left=Number(button.dataset.expiry)-timeNow();button.disabled=busy||!online||left<=0;button.textContent=left>0?'Undo ('+Math.ceil(left/1000)+')':'Finalizing…';}for(const button of document.querySelectorAll('[data-remote-eliminate]'))button.disabled=busy||!online||active(t).filter(e=>!e.pendingElimination).length<=1;
  const guarantee=$('#payout-form [name=payoutMode][value=guaranteed]');if(guarantee){guarantee.disabled=t.status==='completed';try{setText('#guarantee-eligibility',guaranteeEligibility(readGuarantee(guarantee.form,clone(t.settings)),t));}catch{ /* Keep the draft validation message while editing. */ }}
  const balanceNotice=$('#remote-balance-warning');if(view==='remote'&&balanceNotice){const html=balanceWarning(t);if(balanceNotice.innerHTML!==html)balanceNotice.innerHTML=html;}
  const deleteTournamentButton=$('[data-action="delete-tournament"]');if(deleteTournamentButton)deleteTournamentButton.disabled=busy||!online;const rebuyButton=$('#record-rebuys');if(rebuyButton){const tracking=t.settings.rebuyTracking||'total',allowed=canEditRebuys(t,c);rebuyButton.disabled=busy||!online||!t.settings.rebuyEnabled||!allowed;rebuyButton.classList.toggle('rebuy-available',!rebuyButton.disabled&&canRecordRebuys(t,c));rebuyButton.textContent=rebuyCountLabel(t,c);rebuyButton.setAttribute('aria-label',rebuyCountLabel(t,c));}const addonButton=$('#record-addons');if(addonButton){addonButton.disabled=busy||!online||!t.settings.addonEnabled||!addonAvailable(t,c)&&!t.addonCountsEntered;addonButton.textContent=addonCountLabel(t,c);addonButton.setAttribute('aria-label',addonCountLabel(t,c));}
  for(const button of document.querySelectorAll('[data-tv-display]')){const selectedMode=button.dataset.tvDisplay===tvDisplayMode(t);button.disabled=busy||!online||button.dataset.tvDisplay==='full-clock'&&!tournamentStarted(t);button.classList.toggle('is-selected',selectedMode);button.setAttribute('aria-pressed',String(selectedMode));}
  const key=`${t.id}/${c.index}/${c.status}`;if(lastClockKey&&key!==lastClockKey&&view==='clock'&&sound)beep();lastClockKey=key;
  const launchFallback=$('.tv-launch-fallback');if(launchFallback)launchFallback.hidden=!!document.fullscreenElement;
  if(view==='clock') {setText('#tv-footer-status',online?'Live · Connected':remoteError?'Offline · Clock continues; changes not received':'Connecting…');setText('.tv-mode',online?'CLOUD CONNECTED':'CONNECTION INTERRUPTED');}
}
function beep(){try{const C=window.AudioContext||window.webkitAudioContext;const ctx=new C();const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=660;g.gain.value=.12;o.start();o.stop(ctx.currentTime+.35);o.onended=()=>ctx.close();}catch{}}
function seatingSnapshot(t){return t.entries.map(e=>({entryId:e.id,table:e.table??null,seat:e.seat??null,seatLocked:!!e.seatLocked}));}
async function commit(action){if(busy)return false;const user=session?.user.id;busy=true;document.body.classList.add('saving');try{
    if(!session)throw new Error('Sign in before making changes.');
    if(!online)throw new Error('Reconnect before making changes. The clock will continue.');
    const beforeTournament=state.tournaments.find(t=>t.id===action.tournamentId),beforeSeats=beforeTournament&&['seat','seat-move','seat-remaining','combine-tables','unseat-all'].includes(action.type)?seatingSnapshot(beforeTournament):null;
    const next=execute(state,action,timeNow());
    {
      const {data,error}=await db.rpc('td_save_workspace',{p_expected_version:version,p_state:next});
      if(session?.user.id!==user)return false;
      if(error){if(error.message.includes('TD_CONFLICT')){await refresh(true);throw new Error('Another device changed the tournament. Review the latest information and try again.');}throw error;}
      const saved=Array.isArray(data)?data[0]:data;if(!saved?.state)throw new Error('Save response was incomplete. Refresh before retrying.');
      state=upgradeState(saved.state);version=Number(saved.version);lastSync=Date.now();online=true;
    }
    if(beforeSeats&&action.type!=='seating-restore'){
      const after=state.tournaments.find(t=>t.id===action.tournamentId);
      if(after&&JSON.stringify(beforeSeats)!==JSON.stringify(seatingSnapshot(after))){seatingUndo.push({tournamentId:action.tournamentId,positions:beforeSeats});if(seatingUndo.length>30)seatingUndo.shift();}
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
async function confirmApp(message,title='Are You Sure?',yesLabel='Confirm',saveLabel=null){
  let box=$('#confirmation-dialog');if(box?.open)return false;
  if(!box){box=document.createElement('dialog');box.id='confirmation-dialog';document.body.append(box);}
  const context={version,selected,user:session?.user.id};
  box.setAttribute('aria-labelledby','confirmation-title');box.setAttribute('aria-describedby','confirmation-message');
  box.innerHTML=`<div class="modal-heading"><h2 id="confirmation-title">${esc(title)}</h2></div><p id="confirmation-message">${esc(message)}</p><div class="button-row"><button type="button" class="button secondary" data-confirm-answer="no">Cancel</button>${saveLabel?`<button type="button" class="button secondary" data-confirm-answer="save">${esc(saveLabel)}</button>`:''}<button type="button" class="button primary" data-confirm-answer="yes">${esc(yesLabel)}</button></div>`;
  const answer=await new Promise(resolve=>{
    const finish=value=>{box.removeEventListener('click',click);box.removeEventListener('cancel',cancel);box.removeEventListener('close',cancel);if(box.open)box.close();resolve(value);};
    const click=event=>{const button=event.target.closest('[data-confirm-answer]');if(button){event.stopPropagation();finish(button.dataset.confirmAnswer==='save'?'save':button.dataset.confirmAnswer==='yes');}};
    const cancel=event=>{event?.preventDefault();finish(false);};box.addEventListener('click',click);box.addEventListener('cancel',cancel);box.addEventListener('close',cancel);box.showModal();
  });
  if(answer&&(context.version!==version||context.selected!==selected||context.user!==session?.user.id))throw new Error('Tournament changed. Review the latest information and try again.');
  return answer;
}
async function chooseApp(message,title,currentLabel,futureLabel){
  let box=$('#confirmation-dialog');if(box?.open)return null;
  if(!box){box=document.createElement('dialog');box.id='confirmation-dialog';document.body.append(box);}
  const context={version,selected,user:session?.user.id};
  box.setAttribute('aria-labelledby','confirmation-title');box.setAttribute('aria-describedby','confirmation-message');box.setAttribute('tabindex','-1');
  box.innerHTML=`<div class="modal-heading"><h2 id="confirmation-title">${esc(title)}</h2></div><p id="confirmation-message">${esc(message)}</p><div class="button-row"><button type="button" class="button outline-light propagation-choice" data-choice="current" data-confirm-answer="no">${esc(currentLabel)}</button><button type="button" class="button outline-light propagation-choice" data-choice="future" data-confirm-answer="yes">${esc(futureLabel)}</button></div>`;
  const answer=await new Promise(resolve=>{
    const finish=value=>{box.removeEventListener('click',click);box.removeEventListener('cancel',cancel);box.removeEventListener('close',cancel);if(box.open)box.close();resolve(value);};
    const click=event=>{const button=event.target.closest('[data-choice]');if(button){event.stopPropagation();finish(button.dataset.choice);}};
    const cancel=event=>{event?.preventDefault();finish(null);};box.addEventListener('click',click);box.addEventListener('cancel',cancel);box.addEventListener('close',cancel);box.showModal();box.focus({preventScroll:true});
  });
  if(answer==='future'&&(context.version!==version||context.selected!==selected||context.user!==session?.user.id))throw new Error('Tournament changed. Review the latest information and try again.');
  return answer;
}
async function registrationPermission(t=current(),creating=false){
  if(!t||t.status==='completed'||t.archivedAt)throw new Error('This tournament is finished.');
  if(registrationOpen(t,clockAt(t,timeNow())))return {allowed:true,overrideCutoff:false};
  const allowed=await confirmApp(creating?'Registration is closed. Override and add a new player?':'Registration is closed. Override and register this player?','Registration Closed','Override');return {allowed,overrideCutoff:allowed};
}
function modal(title,body){dlg.classList.remove('rebuy-limit-dialog');dlg.removeAttribute('aria-labelledby');dlg.removeAttribute('aria-describedby');dlg.innerHTML=`<div class="modal-heading"><h2>${title}</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="Close dialog">×</button></div>${body}`;if(!dlg.open)dlg.showModal();}
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
function newTournament(templateId){if(state.tournaments.some(t=>!t.archivedAt)){toast('You must archive the current tournament before creating a new one.',true);return;}const template=state.templates.find(t=>t.id===templateId)||state.templates[0];modal('Create a tournament',`<form id="new-tournament-form"><label>Tournament name<input name="name" required maxlength="120"></label><label>Tournament date<input type="date" name="date" value="${today()}" required></label><label>Saved structure<select name="templateId">${state.templates.map(s=>`<option value="${s.id}" ${s.id===template?.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><button class="button primary full">Create tournament</button></form>`);}
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
function editTemplate(templateId,copy=false){if(state.tournaments.some(t=>!t.archivedAt))throw new Error('Saved structures are locked until the current tournament is archived. Use Edit This Tournament.');const value=clone(state.templates.find(t=>t.id===templateId));value.clockAppearance=clockAppearance(value.clockAppearance||state.clockAppearanceDefaults);if(copy){value.id=id();value.name+=' — copy';}editor={value,isNew:copy,event:false,version};view='setup';render();}
function rebuyBreakNotice(){const form=$('#structure-form'),target=$('#rebuy-break-notice');if(!form||!target||!editor)return;const settings=readSettings(form,editor.value.settings),levels=form.querySelector('[data-level]')?readLevels(form):editor.value.levels,check=rebuyBreakCheck(settings,levels);target.innerHTML=check?.missing?`<div role="alert" class="mode-note warning"><strong>Break Required</strong><p>A break must immediately follow Round ${check.round}.</p><button type="button" class="button primary" data-action="required-rebuy-break">Add Break</button> <button type="button" class="button secondary" data-action="go-rebuy-levels">Go to Levels</button></div>`:'';}
function addRequiredRebuyBreak(){captureEditor();const check=rebuyBreakCheck(editor.value.settings,editor.value.levels);if(!check?.missing)return;if(check.index<0){toast('Add playing rounds through Round '+check.round+' first.',true);return;}const levels=editor.value.levels,pos=check.index+1;levels.splice(pos,0,{kind:'break',minutes:10,sb:0,bb:0,ante:0,game:'',chipUp:false});let n=0;const rounds=levels.map(l=>l.kind==='play'?++n:n),nearby=levels.map((l,i)=>({i,kind:l.kind,distance:Math.abs(rounds[i]-rounds[pos])})).filter(v=>v.kind==='break'&&v.i!==pos&&v.distance<=4);render();if(!nearby.length){toast('Required break added. Save to keep it.');return;}modal('Another Break Is Nearby',`<p>Other breaks are within four playing rounds of the required break. Select any to delete or keep all breaks.</p>${nearby.map(v=>`<label class="check"><input type="checkbox" data-remove-nearby-break="${v.i}"> Break after Round ${rounds[v.i]}</label>`).join('')}<div class="button-row"><button type="button" class="button danger" data-action="delete-nearby-rebuy-breaks">Delete Selected Breaks</button><button type="button" class="button secondary" data-action="keep-nearby-rebuy-breaks">Keep Both Breaks</button></div>`);}
function captureEditor(){const form=$('#structure-form');if(!form)return;editor.value.name=form.elements.structureName.value;editor.value.settings=readPayout(form,readSettings(form,editor.value.settings));if(form.querySelector('[data-level]'))editor.value.levels=readLevels(form);}
function paymentDialog(entryId,kind='addon'){const t=current(),e=t.entries.find(e=>e.id===entryId),rebuy=kind==='rebuy',amount=rebuy?t.settings.rebuyAmount:t.settings.addonAmount,chips=rebuy?t.settings.rebuyChips:t.settings.addonChips;modal(rebuy?'Confirm Rebuy':'Record add-on',`<form id="payment-form" class="rebuy-payment-form"><input type="hidden" name="entryId" value="${entryId}"><input type="hidden" name="kind" value="${kind}"><p><strong>${esc(pName(e))}</strong></p><p>${money(amount)} · ${num(chips)} chips</p>${rebuy?`<p class="muted rebuy-recorded-count">Rebuys recorded: ${entryRebuyCount(e)}${t.settings.rebuyMax?` of ${t.settings.rebuyMax}`:' · Unlimited'}</p>`:''}<button class="button primary full">${rebuy?'Confirm Rebuy':'Record add-on'}</button></form>`);}
async function updateRebuyCountPreview(form){if(!form)return;const inputs=[...form.querySelectorAll('[data-count-player]')];for(const input of inputs){const min=Number(input.min||0),max=Number(input.max||Number.MAX_SAFE_INTEGER),value=Number(input.value);if(Number.isSafeInteger(value))input.value=String(Math.max(min,Math.min(max,value)));}}
function countRows(t,kind){return t.entries.slice().sort((a,b)=>pName(a).localeCompare(pName(b))).map(e=>{const count=(e.payments||[]).filter(p=>p.kind===kind).length,max=kind==='addon'?1:(t.settings.rebuyMax||Number.MAX_SAFE_INTEGER),label=kind==='addon'?'add-on':'rebuy';return `<div class="rebuy-entry-row"><strong>${esc(pName(e))}</strong><div class="rebuy-player-stepper"><button type="button" class="button secondary" data-count-step="-1" data-entry-id="${esc(e.id)}" data-count-kind="${kind}" aria-label="Decrease ${label} count for ${esc(pName(e))}">−</button><input id="${kind}-entry-${esc(e.id)}" name="${kind}-${esc(e.id)}" data-count-player type="number" inputmode="numeric" min="0" max="${max}" step="1" value="${count}" aria-label="${label[0].toUpperCase()+label.slice(1)}s for ${esc(pName(e))}" required><button type="button" class="button secondary" data-count-step="1" data-entry-id="${esc(e.id)}" data-count-kind="${kind}" aria-label="Increase ${label} count for ${esc(pName(e))}">+</button></div></div>`}).join('');}
async function rebuyCountDialog(){const t=current(),c=clockAt(t,timeNow()),tracking=t.settings.rebuyTracking||'total',allowed=canEditRebuys(t,c);if(!t.settings.rebuyEnabled||!allowed){toast(rebuyCountHelp(t,c),true);return;}const overrideCutoff=!canRecordRebuys(t,c);if(overrideCutoff&&!await confirmApp('Rebuys are closed. Override and change the rebuy counts?','Rebuys Closed','Override'))return;const common=`<input type="hidden" name="version" value="${version}"><input type="hidden" name="overrideCutoff" value="${overrideCutoff}"><input type="hidden" name="tournamentId" value="${t.id}">`;if(tracking==='total'){modal('Tournament rebuys',`<form id="rebuy-count-form"><input type="hidden" name="mode" value="total">${common}<label for="rebuy-count">Total rebuys</label><div class="rebuy-stepper"><button type="button" class="button secondary" data-rebuy-step="-1" aria-label="Decrease total rebuys">−</button><input id="rebuy-count" name="count" type="number" inputmode="numeric" min="0" max="9007199254740991" step="1" value="${t.rebuyCount||0}" required><button type="button" class="button secondary" data-rebuy-step="1" aria-label="Increase total rebuys">+</button></div><button class="button primary full">Save rebuys</button></form>`);return;}const rows=countRows(t,'rebuy');modal('Tournament rebuys',`<form id="rebuy-count-form"><input type="hidden" name="mode" value="player">${common}<div class="rebuy-entry-list">${rows||'<p class="muted">No players are registered.</p>'}</div><button class="button primary full">Save rebuy counts</button></form>`);}
async function addonCountDialog(){const t=current(),c=clockAt(t,timeNow());if(!t.settings.addonEnabled||t.status==='completed'){toast('Add-ons are not allowed.',true);return;}const overrideCutoff=!addonAvailable(t,c);if(!addonAvailable(t,c)&&!t.addonCountsEntered){toast('Add-on after level '+t.settings.addonLastRound,true);return;}if(overrideCutoff&&t.addonCountsEntered&&!await confirmApp('Add-ons are not currently allowed. Override and enter add-ons?','Add-ons Closed','Override'))return;const rows=countRows(t,'addon');modal('Tournament add-ons',`<form id="addon-count-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="overrideCutoff" value="${overrideCutoff}"><input type="hidden" name="tournamentId" value="${t.id}"><div class="rebuy-entry-list">${rows||'<p class="muted">No players are registered.</p>'}</div><button class="button primary full">Save add-ons</button></form>`);}
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
  modal('ICM Chop',`<form id="icm-form"><input type="hidden" name="version" value="${version}"><input type="hidden" name="tournamentId" value="${selected}"><div class="icm-player-list">${remaining.map(e=>`<div class="icm-player" data-icm-entry="${e.id}"><strong class="icm-player-name" title="${esc(pName(e))}">${esc(pName(e))}</strong><span class="icm-points" title="Expected tournament points, including play" aria-label="${expectedPoints} expected points">${expectedPoints}</span><label>Chip count<input type="text" inputmode="numeric" data-chips="true" data-icm-chips aria-label="Chip count for ${esc(pName(e))}" value="" autocomplete="off" required></label><label>Proposed payout ($)<input type="text" inputmode="numeric" data-money="true" data-icm-payout aria-label="Proposed payout for ${esc(pName(e))}" disabled></label></div>`).join('')}</div><div class="icm-calculate-row"><button type="button" class="button secondary" data-action="icm-calculate">Calculate ICM</button><p id="icm-feedback" class="payout-allocation" role="status" aria-live="polite"></p></div><button class="button primary full" id="icm-accept" disabled>Accept ICM Chop & End Tournament</button></form>`);
}
let icmValidationTimer=null;
function calculateIcm(){
  if(icmValidationTimer!==null){clearTimeout(icmValidationTimer);icmValidationTimer=null;}
  $('#icm-feedback')?.removeAttribute('data-validation-error');
  const form=$('#icm-form'),context={version:Number(form.elements.version.value),tournamentId:form.elements.tournamentId.value};checkIcmContext(context);
  const proposal=icmProposal(current(),icmRows());icmReview={...context,proposal};
  for(const result of proposal.participants){const row=[...form.querySelectorAll('[data-icm-entry]')].find(row=>row.dataset.icmEntry===result.entryId),input=row.querySelector('[data-icm-payout]');input.disabled=false;input.value=num(result.payout/100);input.required=true;}
  updateIcmReview();form.querySelector('.icm-player-list').scrollTop=0;
}
function updateIcmReview(target){
  if(target?.hasAttribute('data-icm-chips')){icmReview=null;$('#icm-accept').disabled=true;if($('#icm-feedback')?.getAttribute('data-validation-error')!=='true')setText('#icm-feedback','Calculate ICM again.');return;}
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
  pickedSeat=null;document.querySelectorAll('[data-seat-grab][aria-pressed="true"]').forEach(el=>el.setAttribute('aria-pressed','false'));
  setText('#seat-move-instructions','');
}
function chooseSeatPlayer(entryId){const restoreScroll=preserveSeatingScroll();try{
  if(pickedSeat?.entryId===entryId){clearSeatPick();return;}
  clearSeatPick();pickedSeat=seatSource(entryId);
  document.querySelectorAll('[data-seat-grab]').forEach(el=>{if(el.dataset.seatGrab===entryId)el.setAttribute('aria-pressed','true');});
  setText('#seat-move-instructions',`Choose a destination seat for ${pName(current().entries.find(e=>e.id===entryId))}.`);
}finally{restoreScroll();}}
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
document.addEventListener('click',async event=>{const el=event.target.closest('button,a[data-go],[data-unseated-entry],[data-seat-unseated-target]');if(!el||el.disabled)return;try{
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
  if(el.dataset.action==='required-rebuy-break'){addRequiredRebuyBreak();return;}if(el.dataset.action==='go-rebuy-levels'){captureEditor();editor.setupTab='levels';render();document.querySelector('.level-table')?.scrollIntoView({block:'start'});return;}if(el.dataset.action==='keep-nearby-rebuy-breaks'){dlg.close();return;}if(el.dataset.action==='delete-nearby-rebuy-breaks'){const indexes=[...dlg.querySelectorAll('[data-remove-nearby-break]:checked')].map(e=>Number(e.dataset.removeNearbyBreak)).sort((a,b)=>b-a);const before=indexes.length?beginEditorHistoryAction():null;for(const i of indexes)if(editor.value.levels[i]?.kind==='break')editor.value.levels.splice(i,1);finishEditorHistoryAction(before);dlg.close();render();toast(indexes.length?'Selected breaks removed. Save to keep changes.':'No breaks selected.');return;}if(el.dataset.go){event.preventDefault();go(el.dataset.go);return;}
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
  if(el.dataset.tab){if(el.dataset.tab!=='tables')movePlayersEnabled=false;tab=el.dataset.tab;render();$(`[data-tab="${tab}"]`)?.focus({preventScroll:true});return;}
  if(el.dataset.profilePanel){if(pointsEditor){toast('Save or cancel your point edits first.');return;}profilePanel=el.dataset.profilePanel;if(profilePanel!=='details'){profileHistoryMode=profilePanel==='points'?'points':'tournaments';showPlayerHistory();}$('.player-profile-panels').dataset.panel=profilePanel;for(const button of document.querySelectorAll('[data-profile-panel]'))button.setAttribute('aria-pressed',String(button.dataset.profilePanel===profilePanel));return;}
  if(el.dataset.player){pointsEditor=null;profileHistoryMode='tournaments';playerDetail=el.dataset.player;profilePanel='details';render();return;}
  if(el.dataset.createTemplate){newTournament(el.dataset.createTemplate);return;}
  if(el.dataset.designItem){const item=el.textContent.trim();const section=document.querySelector('[data-layout-panel="appearance"]');document.querySelector('#designer-selected-item').value=item;document.querySelector('#designer-item-title').value=item.toUpperCase();for(const node of document.querySelectorAll('[data-layout-panel]'))node.hidden=node!==section;for(const button of document.querySelectorAll('[data-layout-tab]'))button.classList.toggle('primary',button.dataset.layoutTab==='appearance');return;}
  if(el.dataset.layoutTab){for(const node of document.querySelectorAll('[data-layout-panel]'))node.hidden=node.dataset.layoutPanel!==el.dataset.layoutTab;for(const button of document.querySelectorAll('[data-layout-tab]')){const active=button.dataset.layoutTab===el.dataset.layoutTab;button.classList.toggle('primary',active);button.classList.toggle('secondary',!active);button.setAttribute('aria-pressed',String(active));}return;}
  if(el.dataset.editLayout||el.dataset.copyLayout){const layout=(state.clockLayouts||[]).find(l=>l.id===(el.dataset.editLayout||el.dataset.copyLayout));if(layout)openLayout(layout,!!el.dataset.copyLayout);return;}
  if(el.dataset.deleteLayout){if(await confirmApp('Delete this saved layout?'))await commit({type:'clock-layout-delete',id:el.dataset.deleteLayout});return;}
  if(el.dataset.editTemplate){editTemplate(el.dataset.editTemplate);return;}
  if(el.dataset.copyTemplate){editTemplate(el.dataset.copyTemplate,true);return;}
  if(el.dataset.deleteTemplate){if(await confirmApp('Delete this saved structure? Existing tournaments keep their copies.'))await commit({type:'template-delete',id:el.dataset.deleteTemplate});return;}
  if(el.dataset.register){const t=current(),permission=await registrationPermission(t);if(!permission.allowed)return;if(await commit({type:'register',tournamentId:t.id,playerId:el.dataset.register,overrideCutoff:permission.overrideCutoff})){signupSearch='';render();toast('Player registered.');}return;}
  if(el.dataset.unregister){const t=current(),e=t?.entries.find(e=>e.id===el.dataset.unregister);if(!e)throw new Error('Player is no longer registered.');const expected=version,refund=(e.payments||[]).filter(p=>p.kind!=='rebuy').reduce((sum,p)=>sum+paymentTotal(p),0);if(!await confirmApp(`Are you sure you want to unregister ${pName(e)}? Their entry, seat, buy-in, selected Dealer Toke or Admin Fee, and any add-on payments will be removed from this tournament. Recorded payments to refund: ${money(refund)}. Their Player Database record will be kept.`,'Unregister Player','Unregister'))return;if(version!==expected||current()?.id!==t.id)throw new Error('Tournament changed. Review the player and try again.');if(await commit({type:'unregister',tournamentId:t.id,entryId:e.id}))toast('Player unregistered.');return;}
  if(el.dataset.addon){paymentDialog(el.dataset.addon);return;}
  if(el.dataset.rebuy){const t=current(),entry=t?.entries.find(e=>e.id===el.dataset.rebuy),limit=Number(t?.settings.rebuyMax||0);if(entry&&limit>0&&entryRebuyCount(entry)>=limit){modal('Rebuy Limit of '+limit,'<div class="rebuy-limit-actions"><button type="button" class="button primary" data-action="close-modal">OK</button></div>');dlg.classList.add('rebuy-limit-dialog');dlg.querySelector('.modal-heading .icon-button')?.remove();return;}paymentDialog(el.dataset.rebuy,'rebuy');return;}
  if(el.dataset.tvDisplay){if(await commit({type:'tv-display',tournamentId:selected,mode:el.dataset.tvDisplay}))toast('TV display updated.');return;}
  if(el.dataset.payoutStep){const form=el.closest('form'),input=form.elements.paidPlaces;if(input.disabled)return;markPayoutChanged(form);input.value=String(Math.max(1,Math.min(20,(Number(input.value)||1)+Number(el.dataset.payoutStep))));refreshPayoutPreview(form);return;}
  if(el.dataset.countStep){const input=document.getElementById(el.dataset.countKind+'-entry-'+el.dataset.entryId),value=Number(input?.value);if(input){input.value=String(Math.max(Number(input.min||0),Math.min(Number(input.max||Number.MAX_SAFE_INTEGER),(Number.isSafeInteger(value)?value:0)+Number(el.dataset.countStep))));}return;}if(el.dataset.rebuyStep){const input=$('#rebuy-count'),value=Number(input.value);input.value=String(Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,(Number.isSafeInteger(value)?value:0)+Number(el.dataset.rebuyStep))));return;}
  if(el.dataset.undoElimination){const t=current(),e=t.entries.find(e=>e.id===el.dataset.undoElimination),seat=e.eliminationSeat||t.eliminationUndo.find(v=>v.entryId===e.id);if(await confirmApp(`Are you sure you want to undo the elimination of ${pName(e)}? ${seat?.table?'Restore Table '+seat.table+', Seat '+seat.seat+'.':seat?'Restore as an active, unseated player.':'The original seat was not recorded for this older elimination. Restore as unseated?'}`))await commit({type:'undo-elimination',tournamentId:selected,entryId:e.id,allowUnseated:!seat});return;}
  if(el.dataset.eliminate){eliminationDialog(el.dataset.eliminate);return;}
  if(el.dataset.unseatedEntry){if(seatMovesEnabled())chooseSeatPlayer(el.dataset.unseatedEntry);return;}
  if(el.dataset.archive){await commit({type:'player-archive',id:el.dataset.archive});return;}
  if(el.dataset.seatLock){
    const context=seatingContext(),entry=current().entries.find(e=>e.id===el.dataset.seatLock);checkSeatingContext(context);
    await commit({type:'seat-lock',tournamentId:context.tournamentId,entryId:entry.id,locked:!entry.seatLocked});return;
  }
  if(el.dataset.combineMode){
    if(dlg.open&&tableCombineChoice){const context=tableCombineChoice,label=context.mode==='shuffle'?'Shuffle Seats':tableActionName(current());checkSeatingContext(context);
      if(await commit({type:'combine-tables',tournamentId:context.tournamentId,mode:el.dataset.combineMode,order:['redraw','shuffle'].includes(el.dataset.combineMode)||context.randomBalance?randomSeatOrder(current()):[]})){tableCombineChoice=null;dlg.close();toast(label==='Combine Tables'?'Tables combined.':label==='Shuffle Seats'?'Seats shuffled.':'Tables balanced.');}
    }return;
  }
  if(el.dataset.seatMoveMode){if(dlg.open&&seatMoveChoice){const {source,table,seat}=seatMoveChoice;await saveSeatMove(source,table,seat,el.dataset.seatMoveMode);}return;}
  if(el.dataset.unseatAllMode){if(dlg.open){const context=seatingContext(),includeLocked=el.dataset.unseatAllMode==='everyone';if(await commit({type:'unseat-all',tournamentId:context.tournamentId,includeLocked,confirmed:true})){dlg.close();toast(includeLocked?'All remaining players are unseated.':'Unlocked players are unseated.');}}return;}
  if(el.dataset.seatGrab||el.dataset.seatTargetButton||el.dataset.seatUnseatedTarget){
    if(!seatMovesEnabled()||seatDragging?.shouldSuppressClick())return;
    const target=el.closest('[data-seat-target]');
    if(el.dataset.seatGrab&&target?.dataset.seat==='unseated'){chooseSeatPlayer(el.dataset.seatGrab);return;}
    if(pickedSeat&&(el.dataset.seatGrab!==pickedSeat.entryId||el.dataset.seatUnseatedTarget)){
      const source=pickedSeat;
      if(target?.dataset.seat==='unseated'){
        const t=checkSeatSource(source);
        if(await commit({type:'seat',tournamentId:source.tournamentId,entryId:source.entryId,table:null,seat:null})){clearSeatPick();toast(`${pName(t.entries.find(e=>e.id===source.entryId))} is now unseated.`);}
      }else await requestSeatMove(source,Number(target.dataset.table),Number(target.dataset.seat));
    }
    else if(el.dataset.seatGrab)chooseSeatPlayer(el.dataset.seatGrab);
    else toast('Select a player first, then choose the destination seat.');return;
  }
  if(el.dataset.seat){if(view==='remote')chooseSeatPlayer(el.dataset.seat);else seatDialog(el.dataset.seat);return;}
  if(el.dataset.clock){const t=current(),expectedIndex=clockAt(t,timeNow()).index;if(['next','previous'].includes(el.dataset.clock)&&!await confirmApp('Change the current level and reset its countdown?'))return;await commit({type:'clock',tournamentId:t.id,command:el.dataset.clock,expectedIndex});return;}
  if(el.dataset.adjust){await commit({type:'clock',tournamentId:selected,command:'adjust',seconds:Number(el.dataset.adjust)});return;}
  if(el.dataset.levelDelete!==undefined||el.dataset.levelUp!==undefined||el.dataset.levelDown!==undefined){const before=beginEditorHistoryAction();const l=editor.value.levels;if(el.dataset.levelDelete!==undefined)l.splice(Number(el.dataset.levelDelete),1);else{const i=Number(el.dataset.levelUp??el.dataset.levelDown),j=i+(el.dataset.levelUp!==undefined?-1:1);if(j>=0&&j<l.length)[l[i],l[j]]=[l[j],l[i]];}finishEditorHistoryAction(before);render();return;}
  switch(el.dataset.action){
    case 'toggle-move-players':{const restoreScroll=preserveSeatingScroll();
      if(!movePlayersEnabled){seatingContext();if(current()?.status==='completed'){restoreScroll();break;}}
      movePlayersEnabled=!movePlayersEnabled;movePlayersTournament=selected;
      if(!movePlayersEnabled){if(dlg.open&&(seatMoveChoice||$('#seat-form')))dlg.close();seatMoveChoice=null;}
      render();$('[data-action=toggle-move-players]')?.focus({preventScroll:true});restoreScroll();break;
    }
    case 'icm-chop':icmDialog();break;
    case 'icm-calculate':try{calculateIcm();}catch(error){icmReview=null;const accept=$('#icm-accept'),feedback=$('#icm-feedback');if(accept)accept.disabled=true;if(icmValidationTimer!==null)clearTimeout(icmValidationTimer);if(feedback){feedback.textContent=error.message||'Enter a positive whole chip count for every player.';feedback.setAttribute('data-validation-error','true');icmValidationTimer=setTimeout(()=>{if(feedback.isConnected&&feedback.getAttribute('data-validation-error')==='true'){feedback.textContent='';feedback.removeAttribute('data-validation-error');}icmValidationTimer=null;},10000);}}break;
    case 'rebuy-count':await rebuyCountDialog();break;case 'addon-count':await addonCountDialog();break;
    case 'cancel-seat-pick':clearSeatPick();break;case 'account':showAccount();break;case 'close-modal':seatMoveChoice=null;tableCombineChoice=null;dlg.close();break;case 'new-tournament':if(state.tournaments.some(t=>!t.archivedAt)){toast('You must archive the current tournament before creating a new one.',true);break;}newTournament();break;case 'add-player':await newPlayer();break;
    case 'players-back':playerDetail=null;render();break;case 'open-clock':openClock();break;case 'refresh':await refresh();if(online&&version===0)await saveInitialWorkspace();break;
    case 'import-browser':await importBrowserData();break;case 'clear-device-copy':clearDeviceCopyDialog();break;
    case 'signout':{const {error}=await db.auth.signOut();if(error)throw error;acceptSession(null);break;}
    case 'show-structures':setupLibraryTab='structures';render();break;
    case 'show-layouts':setupLibraryTab='layouts';render();break;
    case 'create-layout':{const layouts=state.clockLayouts||[];if(!layouts.length){openLayout();break;}modal('Create Clock Layout',`<form id="layout-base-form"><p>Choose an existing layout as your starting point.</p><label>Base New Layout On<select name="baseId"><option value="default">Default Layout</option>${layouts.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label><div class="button-row"><button type="submit" class="button primary">Create Layout</button><button type="button" class="button secondary" data-action="close-modal">Cancel</button></div></form>`);break;}
    case 'duplicate-default-layout':openLayout({name:'Default Layout Copy',appearance:clockAppearance(state.clockAppearanceDefaults)},false);break;
    case 'save-layout':$('#saved-layout-form')?.requestSubmit();break;
    case 'cancel-layout':{const form=$('#saved-layout-form');if(form&&layoutInitialSnapshot!==null&&layoutFormSnapshot(form)!==layoutInitialSnapshot){if(!await confirmApp('You have unsaved layout changes. Go back without saving?','Discard Changes','Discard Changes'))break;}layoutDraft=null;layoutInitialSnapshot=null;setupLibraryTab='layouts';render();break;}
    case 'new-structure':{const value=sampleTemplate();value.name='New tournament structure';for(const key of ['buyIn','dealerToke','startingStack','rebuyAmount','rebuyFeeAmount','rebuyChips','rebuyLastRound','housePercent','houseFlatFee','addonAmount','addonFeeAmount','addonChips','addonLastRound'])value.settings[key]='';value.clockAppearance=clockAppearance(state.clockAppearanceDefaults);editor={value,isNew:true,event:false,version};view='setup';render();break;}
    case 'event-settings':{const t=current();editor={event:true,version,value:{id:t.id,name:t.name,settings:clone(t.settings),levels:clone(t.levels),clockAppearance:clockAppearance(t.clockAppearance)}};view='setup';render();break;}
    case 'close-editor':if(editor?.event){const form=$('#structure-form');if(form&&editor.initialFormSnapshot!==settingsDraftSnapshot(form,editor)){const choice=await confirmApp('Changes have been made. Save them before returning to Tournament Management?','Unsaved Tournament Settings','Return Without Saving','Save Changes & Return');if(choice==='save'){form.requestSubmit();break}if(!choice)break}editor=null;go('manage');}else{editor=null;render();}break;
    case 'add-level':case 'add-break':{const before=beginEditorHistoryAction();editor.value.levels.push({kind:el.dataset.action==='add-break'?'break':'play',minutes:el.dataset.action==='add-break'?10:15,sb:0,bb:0,ante:0,game:el.dataset.action==='add-break'?'':(editor.value.levels.slice().reverse().find(l=>l.kind==='play')?.game||''),chipUp:false});finishEditorHistoryAction(before);render();break;}
    case 'recalculate-payouts':await recalculatePayouts();break;case 'clock-appearance':appearanceDialog();break;case 'structure-clock-appearance':appearanceDialog();break;case 'restore-clock-appearance':fillAppearance(el.closest('form'),ORIGINAL_CLOCK_APPEARANCE);break;case 'use-clock-defaults':fillAppearance(el.closest('form'),state.clockAppearanceDefaults);break;
    case 'seat-remaining':{const context=seatingContext();await commit({type:'seat-remaining',tournamentId:context.tournamentId,order:randomSeatOrder(current())});break;}
    case 'combine-tables':combineTablesDialog();break;
    case 'shuffle-seats':shuffleSeatsDialog();break;
    case 'unseat-all':unseatAllDialog();break;
    case 'undo-seating':{const index=seatingUndo.map(item=>item.tournamentId).lastIndexOf(selected),item=seatingUndo[index];if(!item)break;const context=seatingContext();if(await commit({type:'seating-restore',tournamentId:context.tournamentId,positions:item.positions})){seatingUndo.splice(index,1);toast('Previous seating restored.');}break;}
    case 'balance-tables':movePlayersEnabled=true;render();break;
    case 'delete-tournament':{const t=current();if(!t||t.archivedAt)throw new Error('Archived tournaments cannot be deleted.');const status=t.status==='completed'?'This tournament is completed.':!tournamentStarted(t)?'This tournament has not started.':`This tournament is currently in Level ${t.levels.slice(0,t.clock.index+1).filter(l=>l.kind!=='break').length}${t.clock.status==='paused'?' (paused)':''}.`;if(await confirmApp(`${t.name}: ${status} Are you sure you want to delete it? Deleting this tournament will remove all results and points awarded from it. This cannot be undone.`,'Delete Tournament','Yes, Delete Tournament')){if(await commit({type:'tournament-delete',tournamentId:t.id})){selected='';localStorage.removeItem('uno-tournament-selected');go('home');toast('Tournament deleted. All results and points from it removed.');}}break;}
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
function refreshEntrySplit(form){if(!form?.elements.buyIn||!form.elements.dealerToke)return;const buyIn=dollarNumber(form.elements.buyIn.value),fee=dollarNumber(form.elements.dealerToke.value),type=form.elements.entryFeeType.value;setText('#entry-split',`${money(buyIn*100)} total − ${money(fee*100)} ${type==='admin'?'admin fee':'dealer toke'} = ${money(Math.max(0,buyIn-fee)*100)} before the tournament fee`);}
function formatChipInput(input){
  const value=input.value,start=input.selectionStart??value.length,end=input.selectionEnd??start;
  if(/[^0-9,]/.test(value)&&!input.hasAttribute('data-icm-chips')){input.setCustomValidity('Enter a whole number of chips.');return;}
  const digits=input.hasAttribute('data-icm-chips')?value.replace(/\D/g,''):value.replace(/,/g,''),normalized=digits.replace(/^0+(?=\d)/,'');
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
document.addEventListener('focusout',event=>{if(event.target.name==='houseContributionTotal'&&event.target.form?.id==='structure-form')refreshPayoutPreview(event.target.form);});
document.addEventListener('beforeinput',event=>{if(event.target.matches?.('[data-icm-chips]')&&event.data&&/\D/.test(event.data)&&!event.inputType?.startsWith('delete'))event.preventDefault();});
document.addEventListener('input',event=>{if(event.target.matches?.('[data-rebuy-player-count]'))updateRebuyCountPreview(event.target.form);if(event.target.name==='houseContributionTotal'){event.target.value=event.target.value.replace(/\D/g,'');event.target.form.elements.houseContribution.value=event.target.value;}if(event.target.hasAttribute('data-point-value')&&pointsEditor)pointsEditor.values[event.target.dataset.pointValue]=event.target.value;if(event.target.form?.id==='points-edit-form'&&event.target.name==='reason'&&pointsEditor)pointsEditor.reason=event.target.value;if(event.target.hasAttribute('data-manual-payout'))updateManualChop();if(event.target.dataset.money)formatDollarInput(event.target);if(event.target.form?.id==='structure-form'&&['rebuyLastRound','rebuyEnabled'].includes(event.target.name))rebuyBreakNotice();if(['clock-appearance-form','saved-layout-form'].includes(event.target.form?.id))refreshAppearancePreview(event.target.form);if(event.target.form?.querySelector('#payout-place-list')){if(event.target.name!=='payoutMode')markPayoutChanged(event.target.form);if(event.target.form.dataset.ruleEditor){if(event.target.name==='payoutMode')return;if(event.target.hasAttribute('data-payout-value'))markRuleDraft(event.target.form);if(event.target.name==='houseContribution')event.target.form.dataset.rulesDirty='true';}if(event.target.form.id==='payout-form'&&tournamentStarted(current())&&event.target.hasAttribute('data-payout-value')){event.target.form.dataset.customDraft='true';event.target.form.dataset.recalculate='false';}refreshPayoutPreview(event.target.form);}if(event.target.closest('[data-icm-entry]'))updateIcmReview(event.target);if(event.target.dataset.phone)formatPhoneInput(event.target);if(event.target.dataset.chips)formatChipInput(event.target);if(event.target.form?.id==='player-form'&&event.target.name==='name'){const form=event.target.form,match=state.players.find(p=>p.id!==form.elements.id?.value&&normalizePlayerName(p.name)===normalizePlayerName(event.target.value));let feedback=form.querySelector('.name-feedback');if(!feedback){feedback=document.createElement('p');feedback.className='name-feedback';feedback.setAttribute('role','status');event.target.closest('label').append(feedback);}feedback.textContent=match?'That name already exists. Please choose a different name.':'';event.target.setCustomValidity(match?'That name already exists. Please choose a different name.':'');}if(['buyIn','dealerToke'].includes(event.target.name))refreshEntrySplit(event.target.form);if(event.target.id==='player-search'){playerSearch=event.target.value;$('#player-results').scrollTop=0;$('#player-results').innerHTML=playerRows(state.players.filter(p=>(showArchived||!p.archived)&&(normalizePlayerName(p.name)+' '+playerNumberLabel(p)+' '+(p.phone||'')).includes(normalizePlayerName(playerSearch))).sort((a,b)=>a.name.localeCompare(b.name)));}if(event.target.id==='signup-search'){signupSearch=event.target.value;$('#signup-results').scrollTop=0;const t=current(),enrolled=new Set(t.entries.map(e=>e.playerId));$('#signup-results').innerHTML=registrationRows(state.players.filter(p=>!p.archived&&!enrolled.has(p.id)&&(normalizePlayerName(p.name)+' '+playerNumberLabel(p)).includes(normalizePlayerName(signupSearch))).sort((a,b)=>a.name.localeCompare(b.name)),t);}});
document.addEventListener('change',async event=>{if(!event.target.matches?.('[data-clock-image-upload]'))return;const form=event.target.closest('form'),file=event.target.files?.[0],status=form?.querySelector('[data-clock-image-status]');if(!file||!form)return;try{if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>10485760)throw new Error('Choose a JPG, PNG, WebP or GIF under 10 MB.');if(!session||!online)throw new Error('Reconnect and sign in before uploading.');if(status)status.textContent='Uploading background image…';const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[file.type],path=session.user.id+'/'+crypto.randomUUID()+'.'+ext,storage=db.storage.from('td-clock-backgrounds');const {error}=await storage.upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;form.elements.backgroundImage.value=storage.getPublicUrl(path).data.publicUrl;if(status)status.textContent='Image uploaded. Save the layout to keep it.';refreshAppearancePreview(form);}catch(err){if(status)status.textContent=err.message||'Image upload failed.';toast(err.message||'Image upload failed.',true);}},true);
document.addEventListener('change',event=>{if(event.target.form?.id==='archive-filter'){archiveFilter[event.target.name]=event.target.value;if(archiveFilter.period==='season'&&!archiveFilter.seasonId){archiveFilter.seasonId=pointsState(state).seasons.filter(x=>x.id!==pointsState(state).currentSeasonId).at(-1)?.id||'';}render();return;}if(event.target.form?.id==='leaderboard-filter'){if(!event.target.checkValidity())return;leaderboardFilter[event.target.name]=event.target.value;render();return;}if(['clock-appearance-form','saved-layout-form'].includes(event.target.form?.id)){if(event.target.name==='preset'&&CLOCK_PRESETS[event.target.value])fillAppearance(event.target.form,CLOCK_PRESETS[event.target.value]);else if(event.target.name==='templateId'){const template=state.templates.find(t=>t.id===event.target.value);fillAppearance(event.target.form,template?.clockAppearance||state.clockAppearanceDefaults);}else refreshAppearancePreview(event.target.form);}if(event.target.name==='payoutMode'){if(event.target.form.dataset.ruleEditor)requestRuleFormat(event.target.form);else{markPayoutChanged(event.target.form);refreshPayoutPreview(event.target.form);}}if(event.target.id==='show-archived'){showArchived=event.target.checked;render();}});
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
  if(form.id==='new-tournament-form'){if(state.tournaments.some(t=>!t.archivedAt)){toast('You must archive the current tournament before creating a new one.',true);return;}const eventId=id();if(await commit({type:'tournament-create',id:eventId,name:fd.get('name'),date:fd.get('date'),templateId:fd.get('templateId')})){dlg.close();chooseTournament(eventId);go('setup');const t=current();editor={event:true,version,value:{id:t.id,name:t.name,settings:clone(t.settings),levels:clone(t.levels),clockAppearance:clockAppearance(t.clockAppearance)}};render();toast('Tournament created.');}return;}
  if(form.id==='layout-base-form'){event.preventDefault();const key=String(fd.get('baseId')||'default');const base=key==='default'?null:(state.clockLayouts||[]).find(l=>l.id===key);dlg.close();openLayout(base?{name:'New Layout',appearance:base.appearance}:null);return;}
  if(form.id==='saved-layout-form'){
    if(!layoutDraft)throw new Error('Open a layout before saving.');
    const layout={id:layoutDraft.id||id(),name:String(fd.get('layoutName')||'').trim(),appearance:readAppearance(form),editorData:JSON.parse(decodeURIComponent(form.querySelector('[name="editorData"]')?.value||'null'))};
    if(await commit({type:'clock-layout-save',layout})){layoutDraft=null;setupLibraryTab='layouts';render();toast('Layout saved.');}
    return;
  }
  if(form.id==='structure-form'){
    if(editor.version!==version)throw new Error('Data changed on another device. Reopen this editor before saving.');captureEditor();const check=rebuyBreakCheck(editor.value.settings,editor.value.levels);if(check?.missing){rebuyBreakNotice();throw new Error('Break required immediately after Round '+check.round+'. Use Add Break before saving.');}const saved=clone(editor);
    const action=saved.event?{type:'tournament-settings',tournamentId:saved.value.id,name:saved.value.name,settings:saved.value.settings,clockAppearance:saved.value.clockAppearance,...(form.querySelector('[data-level]')?{levels:saved.value.levels}:{})}:{type:'template-save',template:saved.value};
    if(saved.event&&existingEntrySettingsChanged(current(),action)){if(!await confirmApp('Players have already bought in. Save these changes and update existing buy-in, rebuy, and add-on amounts, selected fees, and chips wherever the terms have changed? Selecting Cancel returns to Tournament Settings without saving.','Update Existing Players?','Yes, Update Players'))return;action.updateExistingEntries=true;}
    if(await commit(action)){editor=null;if(saved.event)go('manage');else render();toast(saved.event?'Tournament settings saved.':'Structure saved.');}return;
  }
  if(form.id==='clock-appearance-form'){
    if(Number(fd.get('version'))!==version||!editor||editor.value.id!==fd.get('templateId')||editor.version!==version)throw new Error('Data changed. Reopen this structure or tournament before saving its clock appearance.');
    const appearance=readAppearance(form);
    if(event.submitter?.value==='defaults'){
      if(await commit({type:'clock-appearance-defaults',appearance})){editor.version=version;dlg.close();toast('Preferred clock defaults saved.');}return;
    }
    const historyBefore=beginEditorHistoryAction();editor.value.clockAppearance=appearance;finishEditorHistoryAction(historyBefore);dlg.close();render();toast(editor.event?'Clock appearance selected. Save tournament settings to keep it.':'Clock appearance selected. Save structure to keep it.');return;
  }
  if(form.id==='seating-settings-form'){const tournament=current(),capacity=Number(fd.get('seatsPerTable')),affected=active(tournament).filter(e=>e.table!=null&&e.seat>capacity&&active(tournament).filter(v=>v.table===e.table).length>capacity);if(affected.length&&!await confirmApp(`Reducing to ${capacity} seats per table will move ${affected.length} player(s) to Unseated Players. Continue?`,'Change Seats Per Table','Confirm'))return;if(await commit({type:'seating-settings',tournamentId:fd.get('tournamentId'),seatsPerTable:Number(fd.get('seatsPerTable'))})){toast('Seats per table updated.');}return;}
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
  if(form.id==='rebuy-count-form'){if(Number(fd.get('version'))!==version)throw new Error('Tournament changed. Reopen the rebuy counts before saving.');const t=state.tournaments.find(t=>t.id===fd.get('tournamentId'));if(!t)throw new Error('Tournament not found.');let overrideCutoff=fd.get('overrideCutoff')==='true';if(fd.get('mode')==='total'){const raw=String(fd.get('count')||'').trim();if(!/^\d+$/.test(raw))throw new Error('Enter a whole number for the tournament rebuy total.');const count=Number(raw);if(!Number.isSafeInteger(count))throw new Error('Rebuy count is too large.');if(!overrideCutoff&&!canRecordRebuys(t,clockAt(t,timeNow()))){if(!await confirmApp('Rebuys are closed. Override and change the rebuy total?','Rebuys Closed','Override'))return;overrideCutoff=true;}if(await commit({type:'rebuy-count',tournamentId:t.id,count,overrideCutoff})){dlg.close();toast('Tournament rebuys saved.');}return;}const counts=t.entries.map(e=>{const raw=String(fd.get('rebuy-'+e.id)??'0').trim();if(!/^\d+$/.test(raw))throw new Error('Enter a whole number of rebuys for '+pName(e)+'.');const count=Number(raw);if(!Number.isSafeInteger(count))throw new Error('Rebuy count is too large.');return{entryId:e.id,count};});if(!overrideCutoff&&!canRecordRebuys(t,clockAt(t,timeNow()))){if(!await confirmApp('Rebuys are closed. Override and change the player counts?','Rebuys Closed','Override'))return;overrideCutoff=true;}if(await commit({type:'rebuy-player-counts',tournamentId:t.id,counts,overrideCutoff})){dlg.close();toast('Tournament rebuy counts saved.');}return;}
  if(form.id==='addon-count-form'){if(Number(fd.get('version'))!==version)throw new Error('Tournament changed. Reopen add-ons before saving.');const t=state.tournaments.find(t=>t.id===fd.get('tournamentId'));if(!t)throw new Error('Tournament not found.');const counts=t.entries.map(e=>{const raw=String(fd.get('addon-'+e.id)??'0').trim();if(!/^\d+$/.test(raw)||Number(raw)>1)throw new Error('Each player can receive no more than one add-on.');return{entryId:e.id,count:Number(raw)};});let overrideCutoff=fd.get('overrideCutoff')==='true';if(!overrideCutoff&&!addonAvailable(t,clockAt(t,timeNow()))){if(!await confirmApp('Add-ons are not currently allowed. Override and change the player counts?','Add-ons Closed','Override'))return;overrideCutoff=true;}if(await commit({type:'addon-counts',tournamentId:t.id,counts,overrideCutoff})){dlg.close();toast('Add-ons saved.');}return;}
  if(form.id==='payment-form'){const kind=fd.get('kind')||'addon';if(await commit({type:'payment',tournamentId:selected,entryId:fd.get('entryId'),kind})){dlg.close();toast(kind==='rebuy'?'Rebuy recorded.':'Add-on recorded.');}return;}
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
window.addEventListener('resize',refreshSavedLayoutPreviews);
window.addEventListener('resize',()=>fitTvSeating());
document.addEventListener('fullscreenchange',()=>fitTvSeating());
clockToolbar=installClockToolbar();
seatDragging=installSeatDragging({getScrollBounds:()=>({top:Math.min(innerHeight,Math.max(0,$('.management-chrome')?.getBoundingClientRect().bottom||$('.remote-header')?.getBoundingClientRect().bottom||0)),bottom:innerHeight}),getSource:entryId=>view!=='manage'||!movePlayersEnabled||dlg.open?null:seatSource(entryId),getLabel:source=>`${source.fromSeat==null?"Unseated":`Seat ${source.fromSeat}`} · ${pName(current().entries.find(e=>e.id===source.entryId))}`,onStart:clearSeatPick,onDrop:async(source,target)=>{if(target.unseated){checkSeatSource(source);return commit({type:'seat',tournamentId:source.tournamentId,entryId:source.entryId,table:null,seat:null});}return requestSeatMove(source,target.table,target.seat);},onError:error=>toast(error.message,true)});
document.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const table=event.target.closest?.('#structure-form .level-table');
  if(!table)return;
  const fields=[...table.querySelectorAll('input:not([type="hidden"]):not(:disabled),select:not(:disabled),button:not(:disabled)')].filter(el=>el.tabIndex>=0);
  const index=fields.indexOf(event.target);
  if(index<0)return;
  const next=index+(event.shiftKey?-1:1);
  if(next<0||next>=fields.length)return;
  event.preventDefault();
  fields[next].focus();
});
document.addEventListener('keydown',event=>{
  const button=event.target.closest?.('.management-sidebar [data-tab]');if(!button)return;
  const tabs=[...document.querySelectorAll('.management-sidebar [data-tab]')],index=tabs.indexOf(button);
  const next=event.key==='ArrowDown'?(index+1)%tabs.length:event.key==='ArrowUp'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next!==null){event.preventDefault();tabs[next].click();}
});
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const focused=document.activeElement;if(pickedSeat||focused?.closest?.('.seat-table,.unseated-drop-zone')){clearSeatPick();if(focused?.closest?.('.seat-table,.unseated-drop-zone'))focused.blur();event.preventDefault();}});
render();
let authEventSeen=false;
db.auth.onAuthStateChange((event,newSession)=>{authEventSeen=true;setTimeout(()=>{if(event==='TOKEN_REFRESHED'){session=newSession;void refresh();}else void acceptSession(newSession);},0);});
db.auth.getSession().then(({data,error})=>{if(authEventSeen)return;if(error){authReady=true;authError='Could not restore your sign-in. Please sign in again.';render();return;}void acceptSession(data.session);}).catch(()=>{authReady=true;authError='Could not connect to sign-in. Please try again.';render();});

document.addEventListener('change',async event=>{
 const field=event.target;
 if(field.matches?.('#structure-form [data-level] input[name=minutes]')){
  const form=field.form,rows=[...form.querySelectorAll('[data-level]')],row=field.closest('[data-level]'),index=rows.indexOf(row),kind=row?.querySelector('[name=kind]')?.value,ed=editor,versionAtPrompt=version;
  if(index<0||!kind)return;
  const following=rows.slice(index+1).filter(next=>next.querySelector('[name=kind]')?.value===kind);
  if(!following.length)return;
  const ordinal=rows.slice(0,index+1).filter(next=>next.querySelector('[name=kind]')?.value===kind).length,label=(kind==='break'?'Break ':'Round ')+ordinal,minutes=field.value;
  const message=kind==='break'?'Only breaks will change. Playing rounds will stay the same.':'Only playing rounds will change. Breaks will stay the same.';
  const choice=await chooseEditorPropagation(field,message,'Apply '+minutes+' minutes to…',label+' only',label+' and future '+(kind==='break'?'breaks':'rounds'));
  if(!choice||editor!==ed||version!==versionAtPrompt||!field.isConnected||field.value!==minutes)return;
  if(choice==='future'){for(const next of following)next.querySelector('[name=minutes]').value=minutes;if(editor===ed&&editorHistory.owner===ed)editorHistory.baseline=editorHistorySnapshot();}
  return;
 }
 if(field.matches?.('#structure-form [data-level] input[name=game]')){
  const form=field.form,rows=[...form.querySelectorAll('[data-level]')],row=field.closest('[data-level]'),index=rows.indexOf(row),following=rows.slice(index+1).filter(next=>next.querySelector('[name=kind]').value==='play'),ed=editor,versionAtPrompt=version,chosen=field.value.trim();
  if(index<0||!following.length||!chosen)return;
  const ordinal=rows.slice(0,index+1).filter(next=>next.querySelector('[name=kind]').value==='play').length,label='Round '+ordinal;
  const choice=await chooseEditorPropagation(field,'Use '+chosen+' for this and future playing rounds?','Apply game to…',label+' only',label+' and future rounds');
  if(!choice||editor!==ed||version!==versionAtPrompt||!field.isConnected||field.value.trim()!==chosen)return;
  if(choice==='future'){for(const next of following)next.querySelector('[name=game]').value=chosen;if(editor===ed&&editorHistory.owner===ed)editorHistory.baseline=editorHistorySnapshot();}
  return;
 }
 const select=field;if(!select.matches?.('#structure-form [data-layout-selector]'))return;
 const form=select.form,rows=[...form.querySelectorAll('[data-level]')],row=select.closest('[data-level]'),index=rows.indexOf(row),following=rows.slice(index+1),ed=editor,versionAtPrompt=version,chosen=select.value,kind=row?.querySelector('[name=kind]')?.value;
 if(index<0||!following.length)return;
 const ordinal=rows.slice(0,index+1).filter(next=>next.querySelector('[name=kind]')?.value===kind).length,itemLabel=(kind==='break'?'Break ':'Round ')+ordinal,label=select.selectedOptions[0]?.textContent||'this layout';
 const choice=await chooseEditorPropagation(select,'Use '+label+' for all subsequent levels and breaks?','Apply layout to…',itemLabel+' only',itemLabel+' and all future levels and breaks');
 if(!choice||editor!==ed||version!==versionAtPrompt||!select.isConnected||select.value!==chosen)return;
 if(choice==='future'){for(const nextRow of following){const next=nextRow.querySelector('[data-layout-selector]');if(next)next.value=chosen;}if(editor===ed&&editorHistory.owner===ed)editorHistory.baseline=editorHistorySnapshot();}
});

document.addEventListener('focusin',event=>{if(!event.target.closest?.('#structure-form')||!editor)return;initializeEditorHistory();const snapshot=editorHistorySnapshot();editorHistory.baseline=snapshot;if(isEditorPromptField(event.target))editorFieldOrigins.set(event.target,event.target.value);});
document.addEventListener('change',event=>{if(!event.target.closest?.('#structure-form')||!editor)return;initializeEditorHistory();const before=editorHistory.baseline||JSON.stringify(editor.value),after=editorHistorySnapshot();if(after!==before){editorHistory.undo.push(before);editorHistory.redo=[];}editorHistory.baseline=after;if(isEditorPromptField(event.target)&&!pendingEditorPromptFields.has(event.target))editorFieldOrigins.set(event.target,event.target.value);updateEditorHistoryButtons();});
document.addEventListener('click',event=>{if(event.target.closest?.('#structure-form [data-editor-undo]')){event.preventDefault();applyEditorHistory(false);return;}if(event.target.closest?.('#structure-form [data-editor-redo]')){event.preventDefault();applyEditorHistory(true);return;}});

document.addEventListener('click',event=>{if(!event.target.closest?.('[data-action="save-as-structure"]'))return;try{
 const form=document.querySelector('#structure-form');if(!editor?.event||!form||!form.reportValidity())return;captureEditor();editor.structureExportDraft=clone(editor.value);
 modal('Save as New Structure',`<form id="tournament-structure-copy-form"><input type="hidden" name="version" value="${version}"><label>New structure name<input name="name" required maxlength="120" value="${esc((current().templateName||'Tournament')+' — Copy')}"></label><p class="muted">Saves the setup only. Your original structure and current tournament remain unchanged.</p><button class="button primary full">Save New Structure</button></form>`);
 }catch(error){toast(error.message,true);}});
document.addEventListener('submit',async event=>{if(event.target.id!=='tournament-structure-copy-form')return;event.preventDefault();try{
 const form=event.target;if(!form.reportValidity())return;const draft=editor?.structureExportDraft;if(!draft||Number(form.elements.version.value)!==version||editor.version!==version)throw new Error('Tournament changed. Close this dialog and review the settings before trying again.');
 if(await commit({type:'tournament-save-structure',tournamentId:current().id,id:id(),name:form.elements.name.value,settings:draft.settings,levels:draft.levels})){editor.version=version;delete editor.structureExportDraft;dlg.close();toast('New structure saved. Tournament settings remain unsaved until Save Tournament Settings.');}
 }catch(error){toast(error.message,true);}});

// Reveal the amount field for the selected settlement fee type without discarding either value.
document.addEventListener('change',event=>{if(event.target.name!=='houseFeeMode')return;const form=event.target.form,flat=event.target.value==='flat';form.querySelector('[data-fee-percent]').hidden=flat;form.querySelector('[data-fee-flat]').hidden=!flat;});
document.addEventListener('change',event=>{if(event.target.name!=='rebuyTracking')return;const form=event.target.form,input=form.querySelector('[name="rebuyMax"]'),fieldset=form.querySelector('fieldset');if(input)input.disabled=event.target.value!=='player'||!!fieldset?.disabled;});
document.addEventListener('change',event=>{if(event.target.name==='entryFeeType')refreshEntrySplit(event.target.form);});
