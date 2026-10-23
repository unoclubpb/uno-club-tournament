// Local display behavior: background clock ticks and cloud updates are not activity.
export function installClockToolbar({root=document,view=window,delayMs=3000,now=()=>view.performance.now(),schedule=(fn,ms)=>view.setTimeout(fn,ms),cancel=timer=>view.clearTimeout(timer)}={}){
  let active=false,lastActivity=0,timer=null;
  const toolbar=()=>root.querySelector('.tv-toolbar');
  function sync(){
    if(timer!==null){cancel(timer);timer=null;}
    const bar=toolbar();if(!bar){active=false;return;}
    if(!active){active=true;lastActivity=now();}
    const remaining=delayMs-(now()-lastActivity),idle=remaining<=0;
    if(idle&&bar.contains(root.activeElement))root.activeElement.blur();
    bar.classList.toggle('is-idle',idle);bar.setAttribute('aria-hidden',String(idle));bar.toggleAttribute('inert',idle);
    if(!idle)timer=schedule(sync,remaining);
  }
  function wake(){if(!toolbar())return;active=true;lastActivity=now();sync();}
  const bindings=[];
  function listen(target,type,handler=wake,options={passive:true}){target.addEventListener(type,handler,options);bindings.push(()=>target.removeEventListener(type,handler,options));}
  for(const type of ['pointermove','mousemove','pointerdown','touchstart','touchmove','wheel','keydown','focusin'])listen(root,type);
  listen(root,'scroll',wake,{capture:true,passive:true});
  listen(root,'fullscreenchange');listen(view,'resize');listen(view,'focus');
  listen(root,'visibilitychange',()=>{if(!root.hidden)wake();});
  return {sync,destroy(){if(timer!==null)cancel(timer);for(const remove of bindings)remove();}};
}
