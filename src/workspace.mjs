import {clone,upgradeState,normalizePlayerName} from './domain.mjs';

// Import the old browser document without replacing cloud records or changing UUID links.
export function mergeBrowserWorkspace(current,browser){
  const result=upgradeState(current),incoming=upgradeState(browser);
  const withoutNumber=p=>{const copy=clone(p);delete copy.playerNumber;return copy;};
  let nextNumber=Math.max(0,...result.players.map(p=>p.playerNumber));
  for(const player of incoming.players){
    const existing=result.players.find(p=>p.id===player.id);
    if(existing){
      if(JSON.stringify(withoutNumber(existing))!==JSON.stringify(withoutNumber(player)))throw new Error(`Saved versions of ${player.name} differ. Your browser copy is preserved; resolve the difference before importing.`);
      continue;
    }
    if(result.players.some(p=>normalizePlayerName(p.name)===normalizePlayerName(player.name)))throw new Error(`The name ${player.name} already belongs to another player in your account. Your browser copy is preserved.`);
    result.players.push({...player,playerNumber:++nextNumber});
  }
  for(const collection of ['templates','tournaments'])for(const item of incoming[collection]){
    const existing=result[collection].find(p=>p.id===item.id);
    if(existing&&JSON.stringify(existing)!==JSON.stringify(item))throw new Error(`Saved versions of ${item.name} differ. Your browser copy is preserved; resolve the difference before importing.`);
    if(!existing)result[collection].push(clone(item));
  }
  return result;
}
