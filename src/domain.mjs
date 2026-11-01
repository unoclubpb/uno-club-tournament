remaining players can be moved.');
  check(Number.isInteger(table)&&table>=1&&table<=tablesInUse(t)&&Number.isInteger(seat)&&seat>=1&&seat<=t.settings.seatsPerTable,'Invalid table or seat.');
  check(['move','swap','slide'].includes(mode),'Choose a valid seat move.');
  if(source.table===table&&source.seat===seat)return [];
  requireUnlocked(source);
  const occupant=remaining.find(e=>e.id!==source.id&&e.table===table&&e.seat===seat);
  const moved={entryId:source.id,table,seat};
  if(!occupant)return [moved];
  check(mode!=='move','That seat is occupied. Choose Swap players or Slide players down.');
  if(mode==='swap'){
    requireUnlocked(occupant);
    check(source.table&&source.seat>=1&&source.seat<=t.settings.seatsPerTable,'A player must already have a seat to swap.');
    return [moved,{entryId:occupant.id,table:source.table,seat:source.seat}];
  }
  const occupied=new Map(remaining.filter(e=>e.id!==source.id&&e.table===table).map(e=>[e.seat,e]));
  let emptySeat=seat;while(emptySeat<=t.settings.seatsPerTable&&occupied.has(emptySeat))emptySeat++;
  check(emptySeat<=t.settings.seatsPerTable,`Cannot slide players down: no empty seat from Seat ${seat} through Seat ${t.settings.seatsPerTable} at Table ${table}.`);
  const updates=[moved];for(let number=seat;number<emptySeat;number++){requireUnlocked(occupied.get(number));updates.push({entryId:occupied.get(number).id,table,seat:number+1});}
  return updates;
}
export const hasPendingEliminations=t=>t.entries.some(e=>e.pendingElimination);
function recordElimination(t,e,now){
  const count=t.entries.filter(v=>!v.eliminatedAt).length;check(count>1,'Use Finish Tournament to confirm the winner.');
  e.eliminationSeat={table:e.table,seat:e.seat,seatLocked:!!e.seatLocked};e.eliminationOrder=Math.max(0,...t.entries.map(v=>v.eliminationOrder||0))+1;
  t.eliminationUndo.push({entryId:e.id,...e.eliminationSeat});e.eliminatedAt=now;e.place=count;e.table=null;e.seat=null;e.seatLocked=false;delete e.pendingElimination;
}
// Pure server-contract model, also used by isolated browser/database parity tests.
// Production pending mutations go through td_remote_elimination, never a document save.
export function finalizePendingEliminations(state,now){
  const s=clone(state);
  for(const t of s.tournaments){if(t.status==='completed')continue;
    const due=t.entries.filter(e=>e.pendingElimination&&e.pendingElimination.expiresAt<=now).sort((a,b)=>a.pendingElimination.expiresAt-b.pendingElimination.expiresAt||a.pendingElimination.id.localeCompare(b.pendingElimination.id));
    for(const e of due){const pending=e.pendingElimination;recordElimination(t,e,pending.expiresAt);const request=t.remoteEliminationRequests.find(v=>v.id===pending.id);request.status='finalized';request.closedAt=pending.expiresAt;}
  }return s;
}
export function applyRemoteElimination(state,{tournamentId,entryId,requestId,command},now){
  const s=finalizePendingEliminations(state,now),t=s.tournaments.find(t=>t.id===tournamentId),e=t?.entries.find(e=>e.id===entryId);
  check(t&&t.status!=='completed','Choose an active tournament.');check(e,'Player entry not found.');check(['start','undo'].includes(command)&&requestId,'Invalid remote command.');
  t.remoteEliminationRequests||=[];const prior=t.remoteEliminationRequests.find(v=>v.id===requestId);check(!prior||prior.entryId===entryId,'Remote request belongs to another player.');
  if(command==='start'&&!prior){check(!e.eliminatedAt,'Player already eliminated.');if(!e.pendingElimination){check(t.entries.filter(v=>!v.eliminatedAt&&!v.pendingElimination).length>1,'Leave one player active to confirm the winner.');const pending={id:requestId,requestedAt:now,expiresAt:now+5000};e.pendingElimination=pending;t.remoteEliminationRequests.push({...pending,entryId,status:'pending'});}}
  if(command==='undo'&&e.pendingElimination?.id===requestId&&now<e.pendingElimination.expiresAt){delete e.pendingElimination;prior.status='canceled';prior.closedAt=now;}
  return s;
}
export function execute(state,action,now=Date.now()){
  const s=upgradeState(state), a=action;let t=s.tournaments.find(t=>t.id===a.tournamentId);
  if(a.type==='tournament-save-structure'){
 check(t&&!t.archivedAt&&t.status!=='completed','Choose the current unarchived tournament.');
 const name=String(a.name||'').trim(),template={id:a.id||id(),name,levels:clone(a.levels||t.levels),settings:clone(a.settings||t.settings),clockAppearance:clone(t.clockAppearance||s.clockAppearanceDefaults)};
 check(name&&name.length<=120,'Enter a new structure name (up to 120 characters).');check(!s.templates.some(v=>v.id===template.id||v.name.trim().toLowerCase()===name.toLowerCase()),'That structure name already exists. Choose a different name.');
 assertFutureLevelEdits(t,template.levels,now);validateTemplate(template);s.templates.push(template);return s;
}
if(a.type==='points-season-start'){startPointsSeason(s,a,now);return s;}
  if(a.type==='points-edit'){editPlayerPoints(s,a,now);return s;}
  if(a.type==='tournament-delete'){check(t&&!t.archivedAt,'Archived tournaments cannot be deleted.');if(s.points)s.points.awards=s.points.awards.filter(v=>v.tournamentId!==t.id);s.tournaments=s.tournaments.filter(v=>v.id!==t.id);return s;}
  if(a.type==='tournament-archive'){check(t&&t.status==='completed','Complete the tournament before archiving it.');t.archivedAt??=now;return s;}
  if(a.type==='player-save'){
    if(a.registrationTournamentId)requireRegistration(s.tournaments.find(t=>t.id===a.registrationTournamentId),a,now);
    const name=String(a.name||'').trim().replace(/\s+/gu,' ');check(name,'Enter a player name.');check(name.length<=100,'Player name is too long.');
    const p=s.players.find(p=>p.id===a.id);
    check(!s.players.some(v=>v.id!==a.id&&normalizePlayerName(v.name)===normalizePlayerName(name)),'That name already exists. Please choose a different name.');
    const phone=normalizePhone(a.phone??p?.phone??'');
    if(p){p.name=name;p.phone=phone;p.notes=String(a.notes||'').slice(0,1000);}else s.players.push({id:a.id||id(),playerNumber:s.players.reduce((n,p)=>Math.max(n,p.playerNumber),0)+1,name,phone,notes:String(a.notes||'').slice(0,1000),archived:false});return s;
  }
  if(a.type==='player-archive'){const p=s.players.find(p=>p.id===a.id);check(p,'Player not found.');p.archived=!p.archived;return s;}
  if(a.type==='clock-appearance-defaults'){s.clockAppearanceDefaults=clockAppearance(a.appearance);return s;}
  if(a.type==='clock-layout-save'){
    const layout=clone(a.layout||{}),name=String(layout.name||'').trim();
    check(name.length>0&&name.length<=100,'Enter a layout name (up to 100 characters).');
    check(name.toLocaleLowerCase()!=='default layout','Default Layout is reserved.');
    check(!s.clockLayouts.some(v=>v.id!==layout.id&&v.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase()),'A layout with that name already exists.');
    const record={id:layout.id||id(),name,appearance:clockAppearance(layout.appearance||s.clockAppearanceDefaults),editorData:layout.editorData?clone(layout.editorData):null};
    const index=s.clockLayouts.findIndex(v=>v.id===record.id);
    if(index<0)s.clockLayouts.push(record);else s.clockLayouts[index]=record;
    return s;
  }
  if(a.type==='clock-layout-delete'){
    check(s.clockLayouts.some(v=>v.id===a.id),'Layout not found.');
    check(!s.templates.some(v=>v.levels.some(l=>l.layoutId===a.id))&&!s.tournaments.some(v=>v.levels.some(l=>l.layoutId===a.id)),'This layout is assigned to a saved structure or tournament. Reassign those levels before deleting it.');
    s.clockLayouts=s.clockLayouts.filter(v=>v.id!==a.id);return s;
  }
  if(a.type==='template-save'){check(!s.tournaments.some(t=>!t.archivedAt),'Saved structures are locked until the current tournament is archived. Use Edit This Tournament.');const template=clone(a.template);template.clockAppearance=clockAppearance(template.clockAppearance||s.clockAppearanceDefaults);if(template.settings.payoutMode==='guaranteed')template.settings.payouts=[65,35];validateTemplate(template);const ix=s.templates.findIndex(v=>v.id===template.id);if(ix<0)s.templates.push(template);else s.templates[ix]=template;return s;}
  if(a.type==='template-delete'){check(!s.tournaments.some(t=>!t.archivedAt),'Saved structures are locked until the current tournament is archived.');check(s.templates.length>1,'Keep at least one saved structure.');s.templates=s.templates.filter(v=>v.id!==a.id);return s;}
  if(a.type==='tournament-create'){
    check(!s.tournaments.some(t=>!t.archivedAt),'You must archive the current tournament before creating a new one.');
    const template=s.templates.find(v=>v.id===a.templateId);check(template,'Choose a saved structure.');validateTemplate(template);check(String(a.name||'').trim(),'Give the tournament a name.');
    s.tournaments.push({id:a.id||id(),name:String(a.name).trim().slice(0,120),date:a.date||new Date(now).toISOString().slice(0,10),templateName:template.name,levels:clone(template.levels),settings:clone(template.settings),clockAppearance:clockAppearance(a.clockAppearance||template.clockAppearance||s.clockAppearanceDefaults),entries:[],rebuyCount:0,eliminationUndo:[],status:'open',clock:{index:0,status:'ready',remainingMs:template.levels[0].minutes*60000,deadline:null},createdAt:now});return s;
  }
  check(t,'Choose a tournament first.');
  if(a.type==='clock-appearance'){t.clockAppearance=clockAppearance(a.appearance);return s;}
  // Display changes must not materialize, pause or otherwise alter the clock.
  if(a.type==='tv-display'){
    check(['full-clock','clock-seating'].includes(a.mode),'Choose a TV display mode.');
    check(tournamentStarted(t)||a.mode==='clock-seating','Full Clock becomes available when the tournament starts.');
    t.tvDisplayMode=a.mode;return s;
  }
  if(a.type==='tournament-settings'||a.type==='payout-settings'){if(a.type==='tournament-settings'&&existingEntrySettingsChanged(t,a))check(a.updateExistingEntries===true,'Players have already bought in. Confirm updating their existing amounts and chips before saving.');if(a.type==='tournament-settings'&&a.name!==undefined){check(String(a.name).trim()&&String(a.name).trim().length<=120,'Enter a tournament name (up to 120 characters).');t.name=String(a.name).trim();}
    check(t.status!=='completed','Completed tournament is locked.');
    if(a.type==='tournament-settings'&&tournamentStarted(t))check(a.settings.payoutMode===t.settings.payoutMode&&JSON.stringify(a.settings.payouts)===JSON.stringify(t.settings.payouts)&&JSON.stringify(a.settings.payoutRules)===JSON.stringify(t.settings.payoutRules)&&JSON.stringify(guaranteeSettings(a.settings))===JSON.stringify(guaranteeSettings(t.settings)),'Use Save Payouts in Tournament Management to change an active payout agreement.');
    const template={id:'event',name:t.name,levels:clone(a.levels||t.levels),settings:clone(a.settings)};validateTemplate(template,{requireRebuyBreak:a.type!=='payout-settings'&&(!tournamentStarted(t)||!!a.levels||a.settings.rebuyLastRound!==t.settings.rebuyLastRound||a.settings.rebuyEnabled!==t.settings.rebuyEnabled)});
    if(a.levels){assertFutureLevelEdits(t,template.levels,now);const started=tournamentStarted(t);t.levels=template.levels;if(!started)t.clock.remainingMs=t.levels[0].minutes*60000;}
    check(!t.entries.some(e=>!e.eliminatedAt&&e.seat>template.settings.seatsPerTable),'Move players before reducing seats per table.');
    if(template.settings.payoutMode==='guaranteed')template.settings.payouts=[65,35];
    if(a.type==='payout-settings'){
      validatePayoutOrder(prizes({...t,settings:template.settings}));
      check(payoutBalance({...t,settings:template.settings})===0,'Payouts must exactly match the prize pool.');
      check(!a.custom||['fixed','mixed','percent'].includes(template.settings.payoutMode),'Choose custom payout rules or fixed dollar amounts.');
      check(template.settings.payoutMode!=='mixed'||a.custom,'Mixed payouts must be saved as Custom Payouts.');
      if(a.custom&&!t.payoutCustom&&['percent','guaranteed','fixed'].includes(t.settings.payoutMode))t.payoutAutomatic={payoutMode:t.settings.payoutMode,payouts:clone(t.settings.payouts),...guaranteeSettings(t.settings),guaranteeContribution:financials(t).guaranteeContribution};
      t.payoutCustom=!!a.custom;
    }
    if(a.type==='tournament-settings'&&a.clockAppearance!=null)t.clockAppearance=clockAppearance(a.clockAppearance);
    if(a.type==='tournament-settings'&&a.updateExistingEntries)updateExistingEntryTerms(t,template.settings);
    t.settings=template.settings;return s;
  }
  check(t.status!=='completed','Completed tournament is locked.');
  t.clock=clockAt(t,now);const c=t.clock;
  if(a.type==='clock'){
    if(a.command==='start'||a.command==='resume'){check(['ready','paused'].includes(c.status),'Clock is already running or finished.');if(!tournamentStarted(t))check(t.entries.filter(e=>!e.eliminatedAt&&Number.isInteger(e.table)&&e.table>0&&Number.isInteger(e.seat)&&e.seat>0).length>=2,'Seat at least two players before starting the tournament.');if(!tournamentStarted(t))t.tvDisplayMode='clock-seating';c.status='running';c.deadline=now+c.remainingMs;t.startedAt??=now;}
    else if(a.command==='pause'){check(c.status==='running','Clock is not running.');c.status='paused';c.deadline=null;}
    else if(a.command==='adjust'){check(Number.isFinite(a.seconds)&&Math.abs(a.seconds)<=86400,'Invalid time adjustment.');c.remainingMs=Math.max(0,c.remainingMs+a.seconds*1000);if(c.status==='running')c.deadline=now+c.remainingMs;}
    else if(a.command==='next'||a.command==='previous'){
      check(a.expectedIndex==null||a.expectedIndex===c.index,'The clock advanced. Review the current level and try again.');
      const delta=a.command==='next'?1:-1;check(c.index+delta>=0&&c.index+delta<t.levels.length,'No level in that direction.');c.index+=delta;c.remainingMs=t.levels[c.index].minutes*60000;c.deadline=c.status==='running'?now+c.remainingMs:null;if(c.status==='ended')c.status='paused';
    } else throw new Error('Unknown clock command.');return s;
  }
  if(a.type==='unregister'){
    check(t&&!t.archivedAt&&t.status!=='completed','Choose an active tournament.');
    const entry=t.entries.find(e=>e.id===a.entryId);check(entry,'Player is no longer registered.');
    check(!entry.eliminatedAt&&!entry.pendingElimination,'Only a player who has not been eliminated can be unregistered.');
    t.entries=t.entries.filter(e=>e.id!==entry.id);for(const e of t.entries)if(e.eliminatedAt&&e.place)e.place--;
    t.eliminationUndo=[];t.remoteEliminationRequests=(t.remoteEliminationRequests||[]).filter(r=>r.entryId!==entry.id);return s;
  }
  if(a.type==='register'){
    requireRegistration(t,a,now);
    if(!registrationOpen(t,c))recordCutoffOverride(t,a,now,'registration');
    check(s.players.some(p=>p.id===a.playerId&&!p.archived),'Choose an active player.');check(!t.entries.some(e=>e.playerId===a.playerId),'Player is already registered.');
    t.entries.push({id:a.id||id(),playerId:a.playerId,registeredAt:now,eliminatedAt:null,place:null,table:null,seat:null,payments:[{id:id(),kind:'entry',total:t.settings.buyIn,dealerToke:t.settings.dealerToke,chips:t.settings.startingStack,paid:true,at:now}]});t.eliminationUndo=[];return s;
  }
  if(a.type==='rebuy-count'){
    check(canEditRebuys(t,c),'Enter the rebuy total during the break after the final rebuy round, or afterward with an override.');
    check(canRecordRebuys(t,c)||a.overrideCutoff===true,'Rebuys are closed. Override is required.');
    check(Number.isSafeInteger(a.count)&&a.count>=0,'Enter a whole number of rebuys, zero or greater.');
    check(Number.isSafeInteger(a.count*t.settings.rebuyAmount)&&Number.isSafeInteger(a.count*t.settings.rebuyChips),'Rebuy count is too large.');
    if(!canRecordRebuys(t,c))recordCutoffOverride(t,a,now,'rebuy-count');
    t.rebuyCount=a.count;return s;
  }
  if(a.type==='seating-settings'){
    check(Number.isSafeInteger(a.seatsPerTable)&&a.seatsPerTable>=2&&a.seatsPerTable<=10,'Use 2–10 seats per table.');
    const capacity=a.seatsPerTable;const remaining=t.entries.filter(e=>!e.eliminatedAt&&e.table!=null),changes=[];
for(const table of new Set(remaining.map(e=>e.table))){const rows=remaining.filter(e=>e.table===table).sort((a,b)=>a.seat-b.seat);if(!rows.some(e=>e.seat>capacity))continue;
if(rows.length<=capacity)rows.forEach((entry,index)=>{if(entry.seat!==index+1)changes.push({entry,table,seat:index+1});});
else rows.filter(e=>e.seat>capacity).forEach(entry=>changes.push({entry,table:null,seat:null}));}
for(const change of changes)requireUnlocked(change.entry);
for(const change of changes){change.entry.table=change.table;change.entry.seat=change.seat;}
t.settings.seatsPerTable=capacity;
    return s;
  }
  if(a.type==='seat-move'){applySeats(t,planSeatMove(t,a));return s;}
  if(a.type==='seat-remaining'||a.type==='combine-tables'||a.type==='auto-seat'){
    const mode=a.type==='seat-remaining'?'remaining':a.type==='auto-seat'?'legacy-redraw':a.mode;
    check(a.type!=='combine-tables'||['combine','redraw'].includes(mode),'Choose how to combine tables.');
    applySeats(t,planTableSeating(t,{mode,order:a.order}));return s;
  }
  const e=t.entries.find(e=>e.id===a.entryId);
  if(['payment','eliminate','seat','seat-lock'].includes(a.type))check(e,'Player entry not found.');
  if(a.type==='seat-lock'){
    check(!e.pendingElimination,'Pending elimination: that player and seat are reserved until Undo expires.');
    check(!e.eliminatedAt&&e.table&&e.seat,'Only a seated remaining player can be locked.');
    check(typeof a.locked==='boolean','Choose lock or unlock.');e.seatLocked=a.locked;return s;
  }
  if(a.type==='payment'){
    check(a.kind==='addon','Record rebuys as a tournament total from the cutoff break onward.');check(!e.eliminatedAt,'Player has been eliminated.');const k=a.kind;
    check(purchaseOpen(t,c,k),`${k==='rebuy'?'Rebuy':'Add-on'} period has closed.`);
    check(t.settings[k+'Enabled'],`${k==='rebuy'?'Rebuys':'Add-ons'} are turned off.`);
    check(roundAt(t,c.index)<=t.settings[k+'LastRound'],`${k==='rebuy'?'Rebuy':'Add-on'} period has closed.`);
    if(k==='addon')check(!e.payments.some(p=>p.kind==='addon'),'Add-on already recorded.');
    e.payments.push({id:id(),kind:k,total:t.settings[k+'Amount'],dealerToke:0,chips:t.settings[k+'Chips'],paid:true,at:now});return s;
  }
  if(a.type==='eliminate'){
    check(!e.eliminatedAt,'Player already eliminated.');check(!e.pendingElimination,'That player has a pending elimination.');
    check(t.entries.filter(v=>!v.eliminatedAt).length>1,'Use Finish Tournament to confirm the winner.');check(t.entries.filter(v=>!v.eliminatedAt&&!v.pendingElimination).length>1,'Leave one player active to confirm the winner.');
    recordElimination(t,e,now);return s;
  }
  if(a.type==='undo-elimination'){
    const entryId=a.entryId||t.eliminationUndo.at(-1)?.entryId,p=t.entries.find(e=>e.id===entryId);check(p?.eliminatedAt,'Choose an eliminated player to restore.');
    const undo=p.eliminationSeat||t.eliminationUndo.find(e=>e.entryId===entryId);
    check(undo||a.allowUnseated,'The original seat was not recorded for this older elimination. Confirm restoration as unseated.');
    if(undo?.table){check(undo.seat>=1&&undo.seat<=t.settings.seatsPerTable,'The original seat no longer exists. Restore its table capacity before undoing this elimination.');check(!t.entries.some(e=>!e.eliminatedAt&&e.table===undo.table&&e.seat===undo.seat),`Table ${undo.table}, Seat ${undo.seat} is occupied. Move that player before undoing this elimination.`);}
    p.eliminatedAt=null;p.place=null;p.table=undo?.table||null;p.seat=undo?.seat||null;p.seatLocked=!!undo?.seatLocked;delete p.eliminationSeat;delete p.eliminationOrder;
    t.eliminationUndo=t.eliminationUndo.filter(e=>e.entryId!==entryId);
    t.entries.filter(e=>e.eliminatedAt).sort((a,b)=>a.eliminatedAt-b.eliminatedAt||(a.eliminationOrder||0)-(b.eliminationOrder||0)||b.place-a.place).forEach((e,i)=>e.place=t.entries.length-i);return s;
  }
  if(a.type==='seat'){
    check(!e.eliminatedAt,'Only remaining players can be seated.');
    if(e.table!==a.table||e.seat!==a.seat)requireUnlocked(e);
    if(a.table===null){e.table=null;e.seat=null;return s;}
    check(Number.isInteger(a.table)&&a.table>=1&&a.table<=tablesInUse(t)&&Number.isInteger(a.seat)&&a.seat>=1&&a.seat<=t.settings.seatsPerTable,'Invalid table or seat.');
    check(!t.entries.some(v=>v.id!==e.id&&!v.eliminatedAt&&v.table===a.table&&v.seat===a.seat),'That seat is occupied.');e.table=a.table;e.seat=a.seat;return s;
  }
  if(a.type==='manual-chop-accept'){
    const proposal=manualChopProposal(t,a.participants),points=pointPreview(t,'manual-chop');
    t.manualChop={...proposal,acceptedAt:now};
    for(const result of proposal.participants){const entry=t.entries.find(e=>e.id===result.entryId);entry.agreedPayout=result.payout;entry.manualChopParticipant=true;}
    t.finalPayouts=[...proposal.participants.map(p=>p.payout),...proposal.reservedPayouts];t.endedBy='manual-chop';t.settlement=financials(t);t.status='completed';t.completedAt=now;c.status='ended';c.deadline=null;c.remainingMs=0;t.eliminationUndo=[];recordTournamentPoints(s,t,points,now);return s;
  }
  if(a.type==='icm-accept'){
    const points=pointPreview(t,'icm-chop');
    const proposal=icmProposal(t,a.participants),byId=new Map(a.participants.map(v=>[v.entryId,v]));
    const participants=proposal.participants.map(v=>{const payout=byId.get(v.entryId).payout;check(Number.isSafeInteger(payout)&&payout>=0&&payout%100===0,'Agreed payouts must be whole dollars, zero or greater.');return {...v,payout};});
    check(Number.isSafeInteger(participants.reduce((n,v)=>n+v.payout,0))&&participants.reduce((n,v)=>n+v.payout,0)===proposal.chopPool,'Agreed payouts must exactly match the amount available for the chop.');
    t.icmChop={acceptedAt:now,participants,chopPool:proposal.chopPool,reservedPayouts:proposal.reservedPayouts,originalPayouts:proposal.originalPayouts};
    for(const result of participants){const entry=t.entries.find(e=>e.id===result.entryId);entry.finalChipCount=result.chips;entry.agreedPayout=result.payout;entry.icmChopParticipant=true;}
    t.finalPayouts=[...participants.map(v=>v.payout),...proposal.reservedPayouts];t.endedBy='icm-chop';
    t.settlement=financials(t);t.status='completed';t.completedAt=now;c.status='ended';c.deadline=null;c.remainingMs=0;t.eliminationUndo=[];recordTournamentPoints(s,t,points,now);return s;
  }
  if(a.type==='finish'){
    check(!hasPendingEliminations(t),'Wait for pending eliminations to finish before confirming the winner.');
    const remaining=t.entries.filter(e=>!e.eliminatedAt);check(remaining.length===1,'Leave exactly one remaining player before finishing.');
    const points=pointPreview(t,'winner');
    const payout=validatePayoutOrder(prizes(t));check(payout.reduce((a,b)=>a+b,0)===financials(t).pool,'Payouts must exactly match the prize pool.');
    remaining[0].place=1;t.finalPayouts=clone(payout);t.endedBy='winner';
    t.settlement=financials(t);t.status='completed';t.completedAt=now;c.status='ended';c.deadline=null;c.remainingMs=0;t.eliminationUndo=[];recordTournamentPoints(s,t,points,now);return s;
  }
  throw new Error('Unknown action.');
}
export function statsFor(state,playerId){
  const rows=state.tournaments.filter(t=>t.status==='completed').flatMap(t=>t.entries.filter(e=>e.playerId===playerId).map(e=>({t,e})));
  const lastPlayed=state.tournaments.filter(t=>(t.status==='completed'||t.startedAt!=null)&&t.entries.some(e=>e.playerId===playerId)).map(t=>t.date).filter(Boolean).sort().at(-1)||null;
  return {played:rows.length,wins:rows.filter(r=>r.e.place===1).length,history:rows,lastPlayed};
}
