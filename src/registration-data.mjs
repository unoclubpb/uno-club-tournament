// Phase 3: pure registration candidate selector. Does not modify player or tournament data.
import {normalizePlayerName,playerNumberLabel} from './domain.mjs';
export function registrationCandidates(players, entries, search='') {
  const enrolled=new Set(entries.map(e=>e.playerId));
  const query=normalizePlayerName(search);
  return players.filter(p=>!p.archived&&!enrolled.has(p.id)&&
    (normalizePlayerName(p.name)+' '+playerNumberLabel(p)).includes(query))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
