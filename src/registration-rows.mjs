// Phase 3: separately maintained registration list presentation.
// This renders the same controls and does not mutate registration state.
export function renderRegistrationRows(rows,t,esc){
  return rows.length?rows.slice(0,80).map(p=>`<button class="register-row" data-register="${p.id}" ${t.status==='completed'?'disabled':''}><span>${esc(p.name)}</span><strong>+ Register</strong></button>`).join(''):'<p class="muted">No matching unregistered players. Add a new player below.</p>';
}
