// Phase 3: pure Player Database selector, preserving player records and IDs.
import {normalizePlayerName,playerNumberLabel} from './domain.mjs';
export function matchingPlayers(players, search='', showArchived=false) {
  const query=normalizePlayerName(search);
  return players.filter(p=>(showArchived||!p.archived)&&
    (normalizePlayerName(p.name)+' '+playerNumberLabel(p)+' '+(p.phone||'')).includes(query))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
