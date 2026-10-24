// Malmuth–Harville ICM: each finishing position is drawn in proportion to the
// remaining stacks. Merge equal subsets rather than enumerating permutations.
export function icmEquities(stacks,payouts){
  if(stacks.length<2||stacks.length>20)throw new Error('Calculate an ICM chop with 2–20 remaining players.');
  if(!stacks.every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(stacks.reduce((a,b)=>a+b,0)))throw new Error('Enter a positive whole chip count for every remaining player.');
  if(!payouts.every(n=>Number.isSafeInteger(n)&&n>=0&&n%100===0))throw new Error('ICM payouts must be whole dollars.');
  if(payouts.length===stacks.length&&payouts.every(n=>n===payouts[0]))return stacks.map(()=>payouts[0]);
  const total=stacks.reduce((a,b)=>a+b,0),equity=stacks.map(()=>0),totals=new Map([[0,total]]);
  let states=new Map([[0,1]]);
  const last=Math.min(stacks.length,payouts.length);
  for(let place=0;place<last;place++){
    const next=new Map();
    for(const [mask,probability] of states){
      const remaining=totals.get(mask);
      for(let i=0;i<stacks.length;i++)if(!(mask&(1<<i))){
        const chance=probability*stacks[i]/remaining,key=mask|(1<<i);
        equity[i]+=chance*payouts[place];
        if(place<last-1){next.set(key,(next.get(key)||0)+chance);if(!totals.has(key))totals.set(key,remaining-stacks[i]);}
      }
    }
    states=next;
  }
  return equity;
}
// Input order is chip order, highest to lowest; odd dollars go to lower ranks first.
export function roundLowerFirst(values,total){
  if(!Number.isSafeInteger(total)||total<0||total%100)throw new Error('Prize total must be whole dollars.');
  if(!values.length)return [];
  const rounded=values.map(n=>Math.floor(n/100+1e-9)*100);
  let dollars=(total-rounded.reduce((a,b)=>a+b,0))/100;
  if(!Number.isInteger(dollars)||dollars<0||dollars>values.length)throw new Error('Payout amounts do not match the prize total.');
  for(let i=values.length-1;dollars>0;i=(i+values.length-1)%values.length,dollars--)rounded[i]+=100;
  return rounded;
}
