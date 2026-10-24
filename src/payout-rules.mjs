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

// Ranked prizes must never increase further down the finishing order. This is
// separate from calculation so old agreements remain visible and correctable.
export function payoutOrderError(amounts,format='dollars'){
  const ordinal=n=>n+(n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'})[n%10]||'th');
  const label=value=>format==='percent'?`${value}%`:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(value/100);
  for(let i=1;i<amounts.length;i++)if(amounts[i]>amounts[i-1])return `${ordinal(i+1)} place (${label(amounts[i])}) cannot pay more than ${ordinal(i)} place (${label(amounts[i-1])}).`;
  return '';
}
export function validatePayoutOrder(amounts,format='dollars'){
  const message=payoutOrderError(amounts,format);if(message){const error=new Error(message);error.code='PAYOUT_ORDER';throw error;}return amounts;
}
