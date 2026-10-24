const preferenceKey='uno-tv-preferred-display';
function readPreference(storage){try{const value=JSON.parse(storage.getItem(preferenceKey)||'null');return value?bounds(value):null;}catch{return null;}}
function bounds(screen){const left=screen.availLeft??screen.left,top=screen.availTop??screen.top,width=screen.availWidth??screen.width,height=screen.availHeight??screen.height;return [left,top,width,height].every(Number.isFinite)&&width>0&&height>0?{left,top,width,height,label:screen.label||''}:null;}
export function chooseTvScreen(details,preferred){
  const screens=details?.screens||[];
  const named=screens.filter(s=>preferred?.label&&s.label===preferred.label),samePosition=s=>preferred&&s.availLeft===preferred.left&&s.availTop===preferred.top;
  return named.find(s=>!s.isPrimary&&samePosition(s))||named.find(s=>!s.isPrimary)||named.find(samePosition)||named[0]||screens.find(s=>!s.isPrimary&&samePosition(s))||screens.find(s=>!s.isPrimary)||screens.find(s=>s!==details.currentScreen)||null;
}
export function createTvWindowController(view=window,storage=view.localStorage){
  let details=null;
  function remember(screen){const value=bounds(screen);if(value)try{storage.setItem(preferenceKey,JSON.stringify(value));}catch{}return value;}
  async function getDetails(){if(typeof view.getScreenDetails!=='function')return null;try{details=await view.getScreenDetails();return details;}catch{return null;}}
  function place(popup,screen){const value=remember(screen);if(value)try{popup.moveTo(value.left,value.top);popup.resizeTo(value.width,value.height);}catch{}return value;}
  return {
    async prime(){try{if((await view.navigator.permissions?.query({name:'window-management'}))?.state==='granted')await getDetails();}catch{}},
    open(url,name){
      const preferred=readPreference(storage),screen=chooseTvScreen(details,preferred),position=screen?bounds(screen):preferred;
      const features=position?`popup=yes,left=${position.left},top=${position.top},width=${position.width},height=${position.height}${typeof view.getScreenDetails==='function'?',fullscreen=yes':''}`:'popup=yes,width=1280,height=800';
      const target=new URL(url,view.location.href);target.searchParams.set('autotv','1');
      // Open synchronously from the click, before any permission prompt can expire activation.
      const popup=view.open(target.pathname+target.search,name,features);if(!popup)return null;
      popup.focus?.();
      if(typeof view.getScreenDetails==='function')void getDetails().then(result=>{const next=chooseTvScreen(result,preferred);if(!next)return;place(popup,next);try{popup.postMessage({type:'uno-tv-fullscreen'},view.location.origin);}catch{}});
      return popup;
    },
    async fullscreen({automatic=false}={}){
      const doc=view.document;if(doc.fullscreenElement)return {ok:true};
      const result=await getDetails(),target=chooseTvScreen(result,readPreference(storage));if(target)place(view,target);
      if(automatic&&!target)return {ok:false,reason:'Move this window to the TV, then select Enter Full Screen.'};
      if(!doc.documentElement.requestFullscreen)return {ok:false,reason:'Use the browser full-screen option on the TV window.'};
      try{await doc.documentElement.requestFullscreen({navigationUI:'hide',...(target?{screen:target}:{})});return {ok:!!doc.fullscreenElement};}
      catch{return {ok:false,reason:'Click Place TV & Enter Full Screen on the TV window. Allow window management if Chrome asks.'};}
    }
  };
}
