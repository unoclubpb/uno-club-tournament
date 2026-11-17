import {normalizePlayerName} from './domain.mjs';
export function registrationCandidates(players,entries,search=''){
 const query=normalizePlayerName(search).trim();
 if(!query)return [];
 const enrolled=new Set(entries.map(e=>e.playerId));
 return players.filter(p=>!p.archived&&!enrolled.has(p.id)&&normalizePlayerName(p.name).split(/\s+/).some(word=>word.startsWith(query))).sort((a,b)=>a.name.localeCompare(b.name));
}
