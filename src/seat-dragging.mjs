// Pointer events support mouse, pen and touch without taking over scrolling elsewhere.
export function installSeatDragging({getSource,getLabel,onStart,onDrop,onError}){
  let drag=null,suppressUntil=0;
  const targetAt=(x,y)=>document.elementFromPoint?.(x,y)?.closest('[data-seat-target]');
  function highlight(){
    document.querySelectorAll('.seat-drop-target').forEach(el=>el.classList.remove('seat-drop-target'));
    const target=targetAt(drag.x,drag.y);if(target)target.classList.add('seat-drop-target');
  }
  function scrollFrame(){
    if(!drag?.active)return;
    const edge=70,dy=drag.y<edge?-Math.ceil((edge-drag.y)/4):drag.y>innerHeight-edge?Math.ceil((drag.y-innerHeight+edge)/4):0;
    if(dy){window.scrollBy(0,Math.max(-22,Math.min(22,dy)));highlight();}
    drag.frame=window.requestAnimationFrame?.(scrollFrame);
  }
  function cancel(){
    const old=drag;drag=null;
    if(old?.active)suppressUntil=performance.now()+400;
    if(old?.frame)window.cancelAnimationFrame?.(old.frame);
    old?.ghost?.remove();old?.handle.classList.remove('seat-is-moving');
    if(old)try{old.handle.releasePointerCapture?.(old.id);}catch{}
    document.querySelectorAll('.seat-drop-target').forEach(el=>el.classList.remove('seat-drop-target'));
    document.body.classList.remove('seat-dragging');
  }
  document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-seat-grab]');
    if(!handle||handle.disabled||event.button!==0||event.isPrimary===false)return;
    try{
      const source=getSource(handle.dataset.seatGrab);if(!source)return;
      cancel();drag={id:event.pointerId,handle,source,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false};
      handle.setPointerCapture?.(event.pointerId);
    }catch(error){cancel();onError(error);}
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<8)return;
    event.preventDefault();
    if(!drag.active){
      drag.active=true;onStart();drag.handle.classList.add('seat-is-moving');document.body.classList.add('seat-dragging');
      drag.ghost=document.createElement('div');drag.ghost.className='seat-drag-ghost';drag.ghost.textContent=getLabel(drag.source);document.body.append(drag.ghost);
      drag.frame=window.requestAnimationFrame?.(scrollFrame);
    }
    drag.ghost.style.transform=`translate(${Math.max(8,Math.min(innerWidth-230,drag.x+12))}px,${Math.max(8,Math.min(innerHeight-60,drag.y+12))}px)`;
    highlight();
  },{passive:false});
  document.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const source=drag.source,active=drag.active,target=active?targetAt(event.clientX,event.clientY):null;
    const destination=target?{table:Number(target.dataset.table),seat:Number(target.dataset.seat)}:null;
    cancel();if(active&&destination)Promise.resolve(onDrop(source,destination)).catch(onError);
  });
  document.addEventListener('pointercancel',cancel);
  document.addEventListener('lostpointercapture',event=>{if(drag?.id===event.pointerId)cancel();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')cancel();});
  window.addEventListener('blur',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  return {cancel,shouldSuppressClick:()=>performance.now()<suppressUntil};
}
