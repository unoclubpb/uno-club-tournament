import {tablesInUse} from './domain.mjs';

// The TV shows the same available tables and seats as Tournament Management.
export function tvSeating(t){
  const remaining=t.entries.filter(e=>!e.eliminatedAt);
  return {
    tables:Array.from({length:tablesInUse(t)},(_,i)=>({number:i+1,seats:Array.from({length:t.settings.seatsPerTable},(_,j)=>({number:j+1,entry:remaining.find(e=>e.table===i+1&&e.seat===j+1)||null}))})),
    unseated:remaining.filter(e=>!e.table)
  };
}

// Measure text after layout rather than relying on a particular TV resolution.
// Each name remains complete; long names wrap and shrink within their seat row.
export function fitTvSeating(root=document,nodes=null){
  const shell=root.querySelector('.tv-seating-shell');if(!shell)return;
  for(const node of nodes||shell.querySelectorAll('[data-tv-fit]')){
    const {width,height}=node.getBoundingClientRect();if(!width||!height)continue;
    const range=node.ownerDocument.createRange();range.selectNodeContents(node);
    const maximum=Number(node.dataset.tvFit)||32;
    let low=1,high=Math.min(maximum,height*.72),best=1;
    for(let step=0;step<10;step++){
      const size=(low+high)/2;node.style.fontSize=size+'px';
      const text=range.getBoundingClientRect?.();
      const fits=node.scrollWidth<=node.clientWidth+1&&node.scrollHeight<=node.clientHeight+1&&(!text||text.width<=width-.5&&text.height<=height-.5);
      if(fits){best=size;low=size;}else high=size;
    }
    node.style.fontSize=best+'px';
  }
}
