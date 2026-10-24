import {roundLowerFirst} from './icm.mjs';

// Fixed awards keep their exact amounts. Only the percentage-funded places
// share the remainder and any rounding dollars, from the lowest place upward.
export function validatePayoutRules(rules){
  if(!Array.isArray(rules)||rules.length<1||rules.length>20)throw new Error('Choose 1–20 paid places.');
  for(const rule of rules){
    if(!rule||!['percent','fixed'].includes(rule.mode)||!Number.isFinite(rule.value)||rule.value<0)throw new Error('Enter a valid payout for each place.');
    if(rule.mode==='fixed'&&(!Number.isSafeInteger(rule.value)||rule.value%100))throw new Error('Fixed payouts must be whole dollars.');
    if(rule.mode==='percent'&&rule.value>100)throw new Error('Each percentage must be between 0 and 100.');
  }
  const percentages=rules.filter(rule=>rule.mode==='percent');
  if(percentages.length&&Math.abs(percentages.reduce((sum,rule)=>sum+rule.value,0)-100)>0.000001)throw new Error('The percentage places must total 100% of the remaining prize pool.');
  if(!Number.isSafeInteger(rules.filter(rule=>rule.mode==='fixed').reduce((sum,rule)=>sum+rule.value,0)))throw new Error('Fixed payout total is too large.');
  return rules;
}

export function calculatePayoutRules(pool,rules){
  validatePayoutRules(rules);
  if(!Number.isSafeInteger(pool)||pool<0||pool%100)throw new Error('Prize pool must be whole dollars.');
  const fixed=rules.reduce((sum,rule)=>sum+(rule.mode==='fixed'?rule.value:0),0);
  const percentages=rules.filter(rule=>rule.mode==='percent');
  if(!percentages.length)return rules.map(rule=>rule.value);
  // Revenue can fall after an agreement. Keep the promised fixed awards visible
  // and report their shortfall through payoutBalance; never invent negative
  // prizes or make the Management/TV screens fail to render.
  const remaining=Math.max(0,pool-fixed),amounts=roundLowerFirst(percentages.map(rule=>remaining*rule.value/100),remaining);
  let index=0;return rules.map(rule=>rule.mode==='fixed'?rule.value:amounts[index++]);
}
