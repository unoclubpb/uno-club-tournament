const check=(ok,message)=>{if(!ok)throw new Error(message);};
const copy=value=>structuredClone(value);
export const pointsLabel=value=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/100);
export function parsePoints(value){
  const text=String(value).trim();check(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text),'Enter a nonnegative point amount.');
  const [whole,fraction='']=text.replace(/,/g,'').split('.');
  const amount=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2))+(Number(fraction[2]||0)>=5?1n:0n);
  check(amount<=BigInt(Number.MAX_SAFE_INTEGER),'Point amount is too large.');return Number(amount);
}
export const finishBonus=place=>Number.isInteger(place)&&place>=1&&place<=9?11-place:0;
export function chopPoints(count){
  check(Number.isSafeInteger(count)&&count>=2,'A chop requires at least two players.');
  const bonus=Array.from({length:Math.min(count,9)},(_,i)=>finishBonus(i+1)).reduce((a,b)=>a+b,0);
  return 100+Math.floor((2*bonus*100+count)/(2*count));
}
export function pointsState(state){return state.points||{version:1,currentSeasonId:'season-initial',seasons:[{id:'season-initial',name:'Season 1',startedAt:null,archivedAt:null}],awards:[]};}
function ensurePoints(state,now){if(!state.points){state.points=copy(pointsState(state));state.points.seasons[0].startedAt=now;}return state.points;}
export function pointPreview(t,kind='winner'){
  const remaining=t.entries.filter(e=>!e.eliminatedAt),chop=kind==='icm-chop'||kind==='manual-chop';
  check(chop?remaining.length>=2:remaining.length===1,chop?'A chop requires at least two players.':'Leave one remaining player to confirm the winner.');
  const shared=chop?chopPoints(remaining.length):0;
  return t.entries.map(e=>{const participant=!e.eliminatedAt,place=participant?(chop?null:1):e.place;
    check(participant||Number.isInteger(place)&&place>=remaining.length+1&&place<=t.entries.length,'Review the elimination positions before awarding points.');
    return {entryId:e.id,playerId:e.playerId,place,result:participant&&chop?kind:'finish',chopSize:participant&&chop?remaining.length:0,hundredths:participant&&chop?shared:100+finishBonus(place)*100};
  });
}
export function recordTournamentPoints(state,t,rows,now){
  const points=ensurePoints(state,now);
  check(!points.awards.some(a=>a.tournamentId===t.id)&&!t.pointsAwardedAt,'Points have already been recorded for this tournament.');
  check(rows.length===t.entries.length&&new Set(rows.map(r=>r.playerId)).size===rows.length,'Award points once per registered player.');
  const date=new Date(t.date+'T12:00:00Z');
  check(/^\d{4}-\d{2}-\d{2}$/.test(t.date)&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===t.date,'Choose a valid tournament date before awarding points.');
  for(const row of rows)points.awards.push({...row,id:'points:'+t.id+':'+row.entryId,tournamentId:t.id,seasonId:points.currentSeasonId,date:t.date,originalHundredths:row.hundredths,awardedAt:now,corrections:[]});
  t.pointsAwardedAt=now;t.pointsSeasonId=points.currentSeasonId;
}
export function startPointsSeason(state,{id,name},now){
  const title=String(name||'').trim();check(title.length>0&&title.length<=80,'Give the new season a name (up to 80 characters).');
  check(!state.tournaments.some(t=>t.status!=='completed'&&(t.entries.length||t.startedAt!=null)),'Finish the active tournament before starting a new season.');
  const points=ensurePoints(state,now),current=points.seasons.find(s=>s.id===points.currentSeasonId);
  check(id&&!points.seasons.some(s=>s.id===id),'Choose a new season ID.');
  check(!points.seasons.some(s=>s.name.toLowerCase()===title.toLowerCase()),'That season name already exists.');
  check(current&&!current.archivedAt,'The current season has changed. Reopen the leaderboard.');
  current.archivedAt=now;points.seasons.push({id,name:title,startedAt:now,archivedAt:null});points.currentSeasonId=id;
}
export function editPlayerPoints(state,{playerId,changes,reason},now){
  check(state.players.some(p=>p.id===playerId),'Player not found.');
  const points=ensurePoints(state,now);check(Array.isArray(changes)&&changes.length>0&&new Set(changes.map(c=>c.awardId)).size===changes.length,'Choose point entries to correct.');
  const planned=changes.map(change=>{const award=points.awards.find(a=>a.id===change.awardId&&a.playerId===playerId);
    check(award&&state.tournaments.some(t=>t.id===award.tournamentId&&t.status==='completed'),'Choose a recorded point entry for this player.');
    check(award.hundredths===change.expectedHundredths,'Points changed on another device. Reopen the player before editing.');
    return {award,value:parsePoints(change.value)};
  });
  const note=String(reason||'Points correction').trim();check(note.length<=300,'Keep the correction note within 300 characters.');
  for(const {award,value} of planned)if(value!==award.hundredths){award.corrections.push({at:now,from:award.hundredths,to:value,reason:note||'Points correction'});award.hundredths=value;}
}
export function filteredAwards(state,{period='current',seasonId,month,year}={}){
  const points=pointsState(state);return points.awards.filter(a=>{
    if(period==='current')return a.seasonId===points.currentSeasonId;
    if(period==='season')return a.seasonId===seasonId;
    if(period==='month')return a.date.slice(0,7)===month;
    if(period==='year')return a.date.slice(0,4)===String(year);
    return period==='lifetime';
  });
}
export function leaderboardRows(state,filter){
  const awards=filteredAwards(state,filter),totals=new Map();
  for(const award of awards){const row=totals.get(award.playerId)||{total:0,played:0};row.total+=award.hundredths;row.played++;check(Number.isSafeInteger(row.total),'Points total is too large.');totals.set(award.playerId,row);}
  const rows=state.players.filter(p=>!p.archived||totals.has(p.id)).map(player=>({player,...(totals.get(player.id)||{total:0,played:0})})).sort((a,b)=>b.total-a.total||a.player.name.localeCompare(b.player.name));
  let rank=0;return rows.map((row,i)=>{if(i===0||row.total!==rows[i-1].total)rank=i+1;return {...row,rank};});
}
