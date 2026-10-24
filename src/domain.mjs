import {icmEquities,roundLowerFirst} from './icm.mjs';
import {clockAppearance} from './clock-appearance.mjs';
export const id = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
const check = (ok, message) => { if (!ok) throw new Error(message); };
export function sampleTemplate() {
  const blinds = [[25,50],[50,100],[75,150],[100,200],[150,300],[200,400],[300,600],[400,800],[500,1000],[600,1200],[800,1600],[1000,2000],[1500,3000],[2000,4000],[2500,5000],[3000,6000],[4000,8000],[5000,10000],[6000,12000],[8000,16000],[10000,20000],[15000,30000],[20000,40000],[30000,60000],[40000,80000],[50000,100000],[60000,120000],[80000,160000]];
  const levels=[];
  blinds.forEach(([sb,bb],i)=>{
    levels.push({kind:'play',minutes:15,sb,bb,ante:i>=6?bb:0,game:"No Limit Hold’em",chipUp:false});
    if([7,15,23].includes(i)) levels.push({kind:'break',minutes:({7:5,15:10,23:15})[i],sb:0,bb:0,ante:0,game:'',chipUp:[7,15].includes(i)});
  });
  return {id:id(),name:'Uno Club — 15-minute levels',levels,settings:{financeVersion:2,startingStack:5000,buyIn:5000,dealerToke:1000,housePercent:20,rebuyEnabled:true,rebuyAmount:2500,rebuyChips:5000,rebuyLastRound:6,rebuyMax:0,addonEnabled:false,addonAmount:9000,addonChips:20000,addonLastRound:4,anteMode:'off',pauseBreaks:true,seatsPerTable:10,houseContribution:0,guaranteeAmount:100000,guaranteePlayers:10,payoutMode:'percent',payouts:[65,35]}};
}
export const playerNumberLabel=p=>String(p.playerNumber).padStart(3,'0');
function assignPlayerNumbers(players){
  let highest=players.reduce((n,p)=>Number.isSafeInteger(p.playerNumber)&&p.playerNumber>0?Math.max(n,p.playerNumber):n,0);
  for(const p of players)if(!Number.isSafeInteger(p.playerNumber)||p.playerNumber<1)p.playerNumber=++highest;
}
export function normalizePhone(value){
  const phone=String(value??'').trim();
  check(phone===''||/^(?:[0-9]{10}|[0-9]{3}-[0-9]{3}-[0-9]{4})$/.test(phone),'Enter exactly 10 digits for the phone number (###-###-####).');
  const digits=phone.replace(/-/g,'');return digits?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`:'';
}
export const normalizePlayerName=name=>String(name??'').trim().replace(/\s+/gu,' ').toLowerCase();
// The cutoff includes one break immediately following the last allowed playing round.
export function purchaseOpen(t,c,kind){
  if(t.status==='completed'||c.status==='ended'||!t.settings[kind+'Enabled'])return false;
  const round=roundAt(t,c.index),last=t.settings[kind+'LastRound'];
  if(round!==last)return round<last;
  return t.levels[c.index].kind==='play'||t.levels[c.index-1]?.kind==='play';
}
export const rebuyOpen=(t,c)=>purchaseOpen(t,c,'rebuy');
export const canRecordRebuys=(t,c)=>t.status!=='completed'&&t.settings.rebuyEnabled&&c.status!=='ready'&&(rebuyPhase(t,c)==='final-break'||!rebuyOpen(t,c));
export const tournamentRebuyCount=t=>(Number.isSafeInteger(t.rebuyCount)&&t.rebuyCount>=0?t.rebuyCount:0)+t.entries.flatMap(e=>e.payments||[]).filter(p=>p.kind==='rebuy').length;
export function cutoffHasBreak(t,kind='rebuy'){
  let round=0;const index=t.levels.findIndex(l=>l.kind==='play'&&++round===t.settings[kind+'LastRound']);
  return index>=0&&t.levels[index+1]?.kind==='break';
}
export function rebuyPhase(t,c){
  if(!rebuyOpen(t,c))return 'closed';
  if(roundAt(t,c.index)!==t.settings.rebuyLastRound)return 'open';
  return t.levels[c.index].kind==='break'?'final-break':'final-round';
}

export const initialState=()=>({schemaVersion:1,players:[],templates:[sampleTemplate()],tournaments:[]});
export const paymentTotal=p=>p.total??((p.prize||0)+(p.house||0));
export const tablesRequired=t=>Math.ceil(t.entries.filter(e=>!e.eliminatedAt).length/t.settings.seatsPerTable);
// Keep occupied tables available until the organizer moves those players.
export const tablesInUse=t=>Math.max(tablesRequired(t),...t.entries.filter(e=>!e.eliminatedAt).map(e=>e.table||0),0);
export const tournamentStarted=t=>t.startedAt!=null||t.clock.status!=='ready';
export const tvDisplayMode=t=>tournamentStarted(t)&&t.tvDisplayMode==='full-clock'?'full-clock':'clock-seating';
function upgradeSettings(old){
  if(old.financeVersion===2)return old;
  const s={...old,financeVersion:2,buyIn:(old.entryPrize||0)+(old.entryHouse||0),dealerToke:old.entryHouse||0,housePercent:20,rebuyAmount:(old.rebuyPrize||0)+(old.rebuyHouse||0),addonAmount:(old.addonPrize||0)+(old.addonHouse||0)};
  for(const k of ['entryPrize','entryHouse','rebuyPrize','rebuyHouse','addonPrize','addonHouse','tableCount','fixedExpense'])delete s[k];
  return s;
}
export function upgradeState(value){
  const s=clone(value);
  assignPlayerNumbers(s.players);
  for(const template of s.templates){
    const starter=template.name==='Uno Club — 15-minute levels'&&template.settings.financeVersion!==2&&template.settings.entryPrize===1000&&template.settings.entryHouse===1000;
    template.settings=upgradeSettings(template.settings);
    if(starter)template.settings.buyIn=5000;
  }
  for(const t of s.tournaments){
    if(t.settings.financeVersion!==2){
      if(t.status==='completed'&&!t.settlement){
        const paid=t.entries.flatMap(e=>e.payments).filter(p=>p.paid),collected=paid.reduce((n,p)=>n+paymentTotal(p),0),fees=paid.reduce((n,p)=>n+(p.house||0),0)+(t.settings.fixedExpense||0);
        t.settlement={collected,owed:t.entries.flatMap(e=>e.payments).filter(p=>!p.paid).reduce((n,p)=>n+paymentTotal(p),0),dealerTokes:0,houseBase:collected,houseFee:fees,housePercent:null,pool:Math.max(0,collected-fees+(t.settings.houseContribution||0)),legacy:true};
      }
      t.settings=upgradeSettings(t.settings);
      for(const e of t.entries)for(const p of e.payments){p.total=paymentTotal(p);p.dealerToke=p.kind==='entry'?(p.house||0):0;delete p.prize;delete p.house;}
    }
    // Rebuys belong to the tournament. Move old records into its total exactly once.
    t.rebuyCount=tournamentRebuyCount(t);
    for(const e of t.entries){e.payments=(e.payments||[]).filter(p=>p.kind!=='rebuy');if(t.status!=='completed')for(const p of e.payments)p.paid=true;}
  }
  return s;
}
export const roundAt=(t,index)=>t.levels.slice(0,index+1).filter(l=>l.kind==='play').length;
export function clockAt(t,now) {
  const c=clone(t.clock); if(c.status!=='running') return c;
  while(now>=c.deadline){
    if(c.index===t.levels.length-1){c.status='ended';c.remainingMs=0;c.deadline=null;return c;}
    const prev=t.levels[c.index]; c.index++;
    const next=t.levels[c.index];
    if(t.settings.pauseBreaks&&(next.kind==='break'||prev.kind==='break')){
      c.status='paused';c.remainingMs=next.minutes*60000;c.deadline=null;return c;
    }
    c.deadline+=next.minutes*60000;
  }
  c.remainingMs=Math.max(0,c.deadline-now); return c;
}
export const guaranteeSettings=s=>({guaranteeAmount:s.guaranteeAmount??100000,guaranteePlayers:s.guaranteePlayers??10});
export const guaranteeEligible=t=>t.entries.length>=guaranteeSettings(t.settings).guaranteePlayers;
export function defaultPayouts(count){return ({1:[100],2:[65,35],3:[50,30,20],4:[45,30,15,10]})[count]||Array.from({length:count},(_,i)=>i===0?100:0);}
export function tableBalanceNeeded(t){if(t.status==='completed')return false;const counts=[...new Set(t.entries.filter(e=>!e.eliminatedAt&&e.table).map(e=>e.table))].map(table=>t.entries.filter(e=>!e.eliminatedAt&&e.table===table).length);return counts.length>1&&Math.max(...counts)-Math.min(...counts)>=2;}
export function financials(t){
  const payments=t.entries.flatMap(e=>e.payments||[]).filter(p=>p.kind!=='rebuy');
  const rebuyCount=tournamentRebuyCount(t),rebuyTotal=rebuyCount*t.settings.rebuyAmount;
  const entryTotal=payments.filter(p=>p.kind==='entry').reduce((n,p)=>n+paymentTotal(p),0);
  const dealerTokes=payments.filter(p=>p.kind==='entry').reduce((n,p)=>n+(p.dealerToke||0),0);
  const tournamentEntries=Math.max(0,entryTotal-dealerTokes),addonTotal=payments.filter(p=>p.kind==='addon').reduce((n,p)=>n+paymentTotal(p),0);
  const collected=entryTotal+rebuyTotal+addonTotal,houseBase=tournamentEntries;
  const houseFee=Math.round(houseBase*t.settings.housePercent/10000)*100;
  const manualHouseContribution=t.settings.houseContribution||0;
  const basePool=Math.max(0,tournamentEntries+rebuyTotal+addonTotal-houseFee+manualHouseContribution);
  const guaranteeActive=t.settings.payoutMode==='guaranteed'&&guaranteeEligible(t);
  const guaranteeContribution=guaranteeActive?Math.max(0,guaranteeSettings(t.settings).guaranteeAmount-basePool):0;
  let amounts={collected,owed:0,entryTotal,tournamentEntries,dealerTokes,dealerTokesPaidOut:dealerTokes,houseBase,houseFee,manualHouseContribution,guaranteeContribution,houseContribution:manualHouseContribution+guaranteeContribution,basePool,pool:basePool+guaranteeContribution,housePercent:t.settings.housePercent,guaranteeActive,addonTotal};
  // Completed settlements are immutable, including historical accounting rules.
  if(t.status==='completed'&&t.settlement){
    const saved=t.settlement,entries=saved.tournamentEntries??(saved.collected-saved.dealerTokes-rebuyTotal-addonTotal);
    amounts={...amounts,...saved,tournamentEntries:entries,dealerTokesPaidOut:saved.dealerTokesPaidOut??saved.dealerTokes,houseContribution:saved.houseContribution??(saved.pool-entries-rebuyTotal-addonTotal+saved.houseFee),guaranteeContribution:saved.guaranteeContribution||0};
  }
  return {...amounts,rebuyCount,rebuyTotal,addonCount:payments.filter(p=>p.kind==='addon').length,chips:payments.reduce((n,p)=>n+p.chips,0)+rebuyCount*t.settings.rebuyChips};
}
export function prizes(t){
  if(t.status==='completed'&&t.finalPayouts)return clone(t.finalPayouts);
  if(t.settings.payoutMode==='fixed')return clone(t.settings.payouts);
  if(t.status==='completed'&&t.settlement){const pool=t.settlement.pool,old=t.settings.payouts.map(p=>Math.floor(pool*p/100));if(old.length)old[0]+=pool-old.reduce((a,b)=>a+b,0);return old;}
  const f=financials(t),pool=f.pool;
  if(t.settings.payoutMode==='guaranteed'&&f.guaranteeActive){
    const first=Math.max(guaranteeSettings(t.settings).guaranteeAmount,Math.floor(pool*65/10000)*100);return [first,pool-first];
  }
  const percentages=t.settings.payoutMode==='guaranteed'?[65,35]:t.settings.payouts;
  return roundLowerFirst(percentages.map(p=>pool*p/100),pool);
}
export function payoutBalance(t){return financials(t).pool-prizes(t).reduce((a,b)=>a+b,0);}
export function icmProposal(t,chipCounts){
  check(t.status!=='completed','Completed tournament is locked.');
  const remaining=t.entries.filter(e=>!e.eliminatedAt);
  check(remaining.length>=2&&remaining.length<=20,'Calculate an ICM chop with 2–20 remaining players.');
  check(payoutBalance(t)===0,'Update payouts to exactly match the prize pool before calculating an ICM chop.');
  check(Array.isArray(chipCounts)&&chipCounts.length===remaining.length&&new Set(chipCounts.map(v=>v.entryId)).size===remaining.length,'Enter chip counts for every remaining player exactly once.');
  const participants=chipCounts.map(v=>{const e=remaining.find(e=>e.id===v.entryId);check(e,'Only remaining players can take part in an ICM chop.');check(Number.isSafeInteger(v.chips)&&v.chips>0,'Enter a positive whole chip count for every remaining player.');return {entryId:e.id,playerId:e.playerId,chips:v.chips};}).sort((a,b)=>b.chips-a.chips||remaining.findIndex(e=>e.id===a.entryId)-remaining.findIndex(e=>e.id===b.entryId));
  const schedule=prizes(t);check(schedule.length<=t.entries.length,'Use no more payout places than registered players before calculating ICM.');const chopPool=schedule.slice(0,remaining.length).reduce((a,b)=>a+b,0),reservedPayouts=schedule.slice(remaining.length);
  const exact=icmEquities(participants.map(v=>v.chips),schedule.slice(0,remaining.length)),rounded=roundLowerFirst(exact,chopPool);
  return {participants:participants.map((v,i)=>({...v,chipRank:i+1,payout:rounded[i]})),chopPool,reservedPayouts,originalPayouts:schedule};
}
export function validateTemplate(template){
  check(template.name.trim(),'Give the structure a name.');check(template.levels.length>0,'Add at least one level.');
  check(template.levels[0].kind==='play','Start the structure with a playing level.');
  check(template.levels.some(l=>l.kind==='play'),'Add a playing level.');
  template.levels.forEach(l=>{check(['play','break'].includes(l.kind),'Invalid level type.');check(Number.isFinite(l.minutes)&&l.minutes>=0.1&&l.minutes<=180,'Level length must be between 0.1 and 180 minutes.');check(l.kind!=='break'||Number.isInteger(l.minutes),'Break length must be a whole number of minutes (1–180).');check([l.sb,l.bb,l.ante].every(v=>Number.isSafeInteger(v)&&v>=0),'Blinds and antes must be nonnegative whole numbers.');check(l.kind==='break'||l.bb>=l.sb,'Big blind must be at least the small blind.');});
  const s=template.settings,{guaranteeAmount,guaranteePlayers}=guaranteeSettings(s);
  check(Number.isSafeInteger(guaranteeAmount)&&guaranteeAmount>0&&guaranteeAmount%100===0,'Enter a positive whole-dollar first-place guarantee.');
  check(Number.isSafeInteger(guaranteePlayers)&&guaranteePlayers>=1,'Enter a positive whole number of players for the guarantee.');
  ['startingStack','buyIn','dealerToke','rebuyAmount','rebuyChips','rebuyLastRound','rebuyMax','addonAmount','addonChips','addonLastRound','seatsPerTable','houseContribution'].forEach(k=>check(Number.isSafeInteger(s[k])&&s[k]>=0,`Invalid ${k} setting.`));
  for(const key of ['buyIn','dealerToke','rebuyAmount','addonAmount','houseContribution'])check(s[key]%100===0,'Enter monetary amounts as whole dollars.');
  check(s.payoutMode!=='fixed'||s.payouts.every(n=>Number.isSafeInteger(n)&&n%100===0),'Fixed payouts must be whole dollars.');
  check(s.dealerToke<=s.buyIn,'Dealer toke cannot exceed the full buy-in.');
  check(Number.isFinite(s.housePercent)&&s.housePercent>=0&&s.housePercent<=100,'House percentage must be between 0 and 100.');
  check(s.startingStack>0,'Starting chips must be greater than zero.');check(s.seatsPerTable>=2&&s.seatsPerTable<=10,'Use 2–10 seats per table.');
  check(['off','big_blind','per_player'].includes(s.anteMode),'Choose the ante setting.');
  check(['percent','fixed','guaranteed'].includes(s.payoutMode),'Choose a payout mode.');
  check(s.payouts.length>0&&s.payouts.length<=20&&s.payouts.every(v=>Number.isFinite(v)&&v>=0),'Enter valid payouts.');
  check(s.payoutMode!=='percent'||Math.abs(s.payouts.reduce((a,b)=>a+b,0)-100)<0.000001,'Payout percentages must total 100%.');
}
// Locks belong to this tournament entry and protect the exact table and seat.
function requireUnlocked(entry){check(!entry.seatLocked,`Unlock the player at Table ${entry.table}, Seat ${entry.seat} first.`);}
export function canCombineTables(t){const remaining=t.entries.filter(e=>!e.eliminatedAt),count=tablesRequired(t);return count>0&&remaining.some(e=>e.table)&&(remaining.some(e=>!e.table||e.table>count)||Array.from({length:count},(_,i)=>remaining.filter(e=>e.table===i+1).length!==Math.floor(remaining.length/count)+(i<remaining.length%count?1:0)).some(Boolean));}
export function planTableSeating(t,{mode='remaining',order=[]}={}){
  check(t&&t.status!=='completed','Completed tournament is locked.');
  check(['remaining','combine','redraw','legacy-redraw'].includes(mode),'Choose a valid seating action.');
  const active=t.entries.filter(e=>!e.eliminatedAt),capacity=t.settings.seatsPerTable;
  const count=mode==='remaining'?tablesInUse(t):tablesRequired(t);
  if(mode==='combine'||mode==='redraw')check(canCombineTables(t),'No tables need to be combined.');
  if(mode==='redraw')check(count===1,'Redraw is only available when forming the final table.');
  const redraw=mode==='redraw'||mode==='legacy-redraw';
  const moving=active.filter(e=>redraw?!e.seatLocked:!e.table||(mode==='combine'&&e.table>count));
  const targets=Array.from({length:count},(_,i)=>Math.floor(active.length/count)+(i<active.length%count?1:0));
  // Refuse to close a locked player's table before planning any changes.
  for(const entry of active.filter(e=>e.seatLocked)){
    check(entry.table>=1&&entry.table<=count&&entry.seat>=1&&entry.seat<=capacity,`Unlock the player at Table ${entry.table}, Seat ${entry.seat} before combining tables.`);
  }
  if(mode==='combine')for(let table=1;table<=count;table++){
    const occupants=active.filter(e=>e.table===table),excess=occupants.length-targets[table-1];
    const candidates=occupants.filter(e=>!e.seatLocked).sort((a,b)=>b.seat-a.seat);
    check(excess<=candidates.length,`Unlock a player at Table ${table} before balancing tables.`);
    if(excess>0)moving.push(...candidates.slice(0,excess));
  }
  const movingIds=new Set(moving.map(e=>e.id)),occupied=new Set(),loads=Array(count).fill(0);
  for(const entry of active.filter(e=>!movingIds.has(e.id))){occupied.add(`${entry.table}/${entry.seat}`);loads[entry.table-1]++;}
  const rank=new Map(order.map((entryId,i)=>[entryId,i]));
  if(mode==='remaining'||redraw)moving.sort((a,b)=>(rank.get(a.id)??order.length)-(rank.get(b.id)??order.length));
  const updates=[];
  for(const entry of moving){
    requireUnlocked(entry);
    let table=0;
    for(let i=0;i<count;i++)if(loads[i]<(mode==='combine'?targets[i]:capacity)&&(!table||loads[i]<loads[table-1]))table=i+1;
    check(table,'No open seat is available.');
    let seat=1;while(occupied.has(`${table}/${seat}`))seat++;
    check(seat<=capacity,'No open seat is available.');
    updates.push({entryId:entry.id,table,seat});occupied.add(`${table}/${seat}`);loads[table-1]++;
  }
  return updates;
}
function applySeats(t,updates){for(const update of updates){const entry=t.entries.find(e=>e.id===update.entryId);entry.table=update.table;entry.seat=update.seat;}}
// A complete, validated seating change; no records are mutated while planning.
export function planSeatMove(t,{entryId,table,seat,mode='move'}){
  check(t&&t.status!=='completed','Completed tournament is locked.');
  const remaining=t.entries.filter(e=>!e.eliminatedAt),source=remaining.find(e=>e.id===entryId);
  check(source,'Only remaining players can be moved.');
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
export function execute(state,action,now=Date.now()){
  const s=upgradeState(state), a=action;let t=s.tournaments.find(t=>t.id===a.tournamentId);
  if(a.type==='player-save'){
    const name=String(a.name||'').trim().replace(/\s+/gu,' ');check(name,'Enter a player name.');check(name.length<=100,'Player name is too long.');
    const p=s.players.find(p=>p.id===a.id);
    check(!s.players.some(v=>v.id!==a.id&&normalizePlayerName(v.name)===normalizePlayerName(name)),'That name already exists. Please choose a different name.');
    const phone=normalizePhone(a.phone??p?.phone??'');
    if(p){p.name=name;p.phone=phone;p.notes=String(a.notes||'').slice(0,1000);}else s.players.push({id:a.id||id(),playerNumber:s.players.reduce((n,p)=>Math.max(n,p.playerNumber),0)+1,name,phone,notes:String(a.notes||'').slice(0,1000),archived:false});return s;
  }
  if(a.type==='player-archive'){const p=s.players.find(p=>p.id===a.id);check(p,'Player not found.');p.archived=!p.archived;return s;}
  if(a.type==='clock-appearance-defaults'){s.clockAppearanceDefaults=clockAppearance(a.appearance);return s;}
  if(a.type==='template-save'){const template=clone(a.template);if(template.settings.payoutMode==='guaranteed')template.settings.payouts=[65,35];validateTemplate(template);const ix=s.templates.findIndex(v=>v.id===template.id);if(ix<0)s.templates.push(template);else s.templates[ix]=template;return s;}
  if(a.type==='template-delete'){check(s.templates.length>1,'Keep at least one saved structure.');s.templates=s.templates.filter(v=>v.id!==a.id);return s;}
  if(a.type==='tournament-create'){
    const template=s.templates.find(v=>v.id===a.templateId);check(template,'Choose a saved structure.');validateTemplate(template);check(String(a.name||'').trim(),'Give the tournament a name.');
    s.tournaments.push({id:a.id||id(),name:String(a.name).trim().slice(0,120),date:a.date||new Date(now).toISOString().slice(0,10),templateName:template.name,levels:clone(template.levels),settings:clone(template.settings),clockAppearance:clockAppearance(s.clockAppearanceDefaults),entries:[],rebuyCount:0,eliminationUndo:[],status:'open',clock:{index:0,status:'ready',remainingMs:template.levels[0].minutes*60000,deadline:null},createdAt:now});return s;
  }
  check(t,'Choose a tournament first.');
  if(a.type==='clock-appearance'){t.clockAppearance=clockAppearance(a.appearance);return s;}
  // Display changes must not materialize, pause or otherwise alter the clock.
  if(a.type==='tv-display'){
    check(['full-clock','clock-seating'].includes(a.mode),'Choose a TV display mode.');
    check(tournamentStarted(t)||a.mode==='clock-seating','Full Clock becomes available when the tournament starts.');
    t.tvDisplayMode=a.mode;return s;
  }
  if(a.type==='tournament-settings'||a.type==='payout-settings'){
    check(t.status!=='completed','Completed tournament is locked.');
    if(a.type==='tournament-settings'&&tournamentStarted(t))check(a.settings.payoutMode===t.settings.payoutMode&&JSON.stringify(a.settings.payouts)===JSON.stringify(t.settings.payouts)&&JSON.stringify(guaranteeSettings(a.settings))===JSON.stringify(guaranteeSettings(t.settings)),'Use Save Payouts in Tournament Management to change an active payout agreement.');
    const template={id:'event',name:t.name,levels:clone(a.levels||t.levels),settings:clone(a.settings)};validateTemplate(template);
    check(t.clock.status==='ready'||!a.levels,'Level structure can be changed before the clock starts.');
    if(a.levels){t.levels=template.levels;t.clock.remainingMs=t.levels[0].minutes*60000;}
    check(!t.entries.some(e=>!e.eliminatedAt&&e.seat>template.settings.seatsPerTable),'Move players before reducing seats per table.');
    if(template.settings.payoutMode==='guaranteed')template.settings.payouts=[65,35];
    if(a.type==='payout-settings'){
      check(payoutBalance({...t,settings:template.settings})===0,'Payouts must exactly match the prize pool.');
      check(!a.custom||template.settings.payoutMode==='fixed','Custom payouts must use fixed dollar amounts.');
      if(a.custom&&!t.payoutCustom&&t.settings.payoutMode!=='fixed')t.payoutAutomatic={payoutMode:t.settings.payoutMode,payouts:clone(t.settings.payouts),...guaranteeSettings(t.settings),guaranteeContribution:financials(t).guaranteeContribution};
      t.payoutCustom=!!a.custom;
    }
    t.settings=template.settings;return s;
  }
  check(t.status!=='completed','Completed tournament is locked.');
  t.clock=clockAt(t,now);const c=t.clock;
  if(a.type==='clock'){
    if(a.command==='start'||a.command==='resume'){check(['ready','paused'].includes(c.status),'Clock is already running or finished.');if(!tournamentStarted(t))t.tvDisplayMode='clock-seating';c.status='running';c.deadline=now+c.remainingMs;t.startedAt??=now;}
    else if(a.command==='pause'){check(c.status==='running','Clock is not running.');c.status='paused';c.deadline=null;}
    else if(a.command==='adjust'){check(Number.isFinite(a.seconds)&&Math.abs(a.seconds)<=86400,'Invalid time adjustment.');c.remainingMs=Math.max(0,c.remainingMs+a.seconds*1000);if(c.status==='running')c.deadline=now+c.remainingMs;}
    else if(a.command==='next'||a.command==='previous'){
      const delta=a.command==='next'?1:-1;check(c.index+delta>=0&&c.index+delta<t.levels.length,'No level in that direction.');c.index+=delta;c.remainingMs=t.levels[c.index].minutes*60000;c.deadline=c.status==='running'?now+c.remainingMs:null;if(c.status==='ended')c.status='paused';
    } else throw new Error('Unknown clock command.');return s;
  }
  if(a.type==='register'){
    check(s.players.some(p=>p.id===a.playerId&&!p.archived),'Choose an active player.');check(!t.entries.some(e=>e.playerId===a.playerId),'Player is already registered.');
    t.entries.push({id:a.id||id(),playerId:a.playerId,registeredAt:now,eliminatedAt:null,place:null,table:null,seat:null,payments:[{id:id(),kind:'entry',total:t.settings.buyIn,dealerToke:t.settings.dealerToke,chips:t.settings.startingStack,paid:true,at:now}]});t.eliminationUndo=[];return s;
  }
  if(a.type==='rebuy-count'){
    check(canRecordRebuys(t,c),'Enter the rebuy total during the break after the final rebuy round, or afterward.');
    check(Number.isSafeInteger(a.count)&&a.count>=0,'Enter a whole number of rebuys, zero or greater.');
    check(Number.isSafeInteger(a.count*t.settings.rebuyAmount)&&Number.isSafeInteger(a.count*t.settings.rebuyChips),'Rebuy count is too large.');
    t.rebuyCount=a.count;return s;
  }
  if(a.type==='seating-settings'){
    check(Number.isSafeInteger(a.seatsPerTable)&&a.seatsPerTable>=2&&a.seatsPerTable<=10,'Use 2–10 seats per table.');
    for(const entry of t.entries.filter(e=>!e.eliminatedAt&&e.seat>a.seatsPerTable))requireUnlocked(entry);
    t.settings.seatsPerTable=a.seatsPerTable;
    const remaining=t.entries.filter(e=>!e.eliminatedAt),displaced=remaining.filter(e=>e.seat>a.seatsPerTable);
    for(const entry of displaced){entry.table=null;entry.seat=null;}
    const count=tablesInUse(t);
    for(const entry of displaced){
      const available=Array.from({length:count},(_,i)=>({table:i+1,entries:remaining.filter(e=>e.table===i+1)})).filter(v=>v.entries.length<a.seatsPerTable).sort((a,b)=>a.entries.length-b.entries.length||a.table-b.table)[0];
      check(available,'No seat is available.');entry.table=available.table;entry.seat=Array.from({length:a.seatsPerTable},(_,i)=>i+1).find(seat=>!available.entries.some(e=>e.seat===seat));
    }
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
    check(!e.eliminatedAt,'Player already eliminated.');const active=t.entries.filter(e=>!e.eliminatedAt).length;check(active>1,'Use Finish Tournament to confirm the winner.');
    e.eliminationSeat={table:e.table,seat:e.seat,seatLocked:!!e.seatLocked};e.eliminationOrder=Math.max(0,...t.entries.map(v=>v.eliminationOrder||0))+1;
    t.eliminationUndo.push({entryId:e.id,...e.eliminationSeat});e.eliminatedAt=now;e.place=active;e.table=null;e.seat=null;e.seatLocked=false;return s;
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
  if(a.type==='icm-accept'){
    const proposal=icmProposal(t,a.participants),byId=new Map(a.participants.map(v=>[v.entryId,v]));
    const participants=proposal.participants.map(v=>{const payout=byId.get(v.entryId).payout;check(Number.isSafeInteger(payout)&&payout>=0&&payout%100===0,'Agreed payouts must be whole dollars, zero or greater.');return {...v,payout};});
    check(Number.isSafeInteger(participants.reduce((n,v)=>n+v.payout,0))&&participants.reduce((n,v)=>n+v.payout,0)===proposal.chopPool,'Agreed payouts must exactly match the amount available for the chop.');
    t.icmChop={acceptedAt:now,participants,chopPool:proposal.chopPool,reservedPayouts:proposal.reservedPayouts,originalPayouts:proposal.originalPayouts};
    for(const result of participants){const entry=t.entries.find(e=>e.id===result.entryId);entry.finalChipCount=result.chips;entry.agreedPayout=result.payout;entry.icmChopParticipant=true;}
    t.finalPayouts=[...participants.map(v=>v.payout),...proposal.reservedPayouts];t.endedBy='icm-chop';
    t.settlement=financials(t);t.status='completed';t.completedAt=now;c.status='ended';c.deadline=null;c.remainingMs=0;t.eliminationUndo=[];return s;
  }
  if(a.type==='finish'){
    const remaining=t.entries.filter(e=>!e.eliminatedAt);check(remaining.length===1,'Leave exactly one remaining player before finishing.');
    const payout=prizes(t);check(payout.reduce((a,b)=>a+b,0)===financials(t).pool,'Payouts must exactly match the prize pool.');
    remaining[0].place=1;t.finalPayouts=clone(payout);t.endedBy='winner';
    t.settlement=financials(t);t.status='completed';t.completedAt=now;c.status='ended';c.deadline=null;c.remainingMs=0;t.eliminationUndo=[];return s;
  }
  throw new Error('Unknown action.');
}
export function statsFor(state,playerId){
  const rows=state.tournaments.filter(t=>t.status==='completed').flatMap(t=>t.entries.filter(e=>e.playerId===playerId).map(e=>({t,e})));
  const lastPlayed=state.tournaments.filter(t=>(t.status==='completed'||t.startedAt!=null)&&t.entries.some(e=>e.playerId===playerId)).map(t=>t.date).filter(Boolean).sort().at(-1)||null;
  return {played:rows.length,wins:rows.filter(r=>r.e.place===1).length,history:rows,lastPlayed};
}
