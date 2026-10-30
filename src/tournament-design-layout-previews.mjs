export function refreshDesignLayoutPreviews({document,clockLayouts,defaults,originalAppearance,layoutDraft,applyClockAppearance}){
 for(const frame of document.querySelectorAll('[data-saved-layout-preview]')){
  const layout=clockLayouts.find(item=>item.id===frame.dataset.savedLayoutPreview);
  const screen=frame.querySelector('.designer-tv');
  if(screen){applyClockAppearance(screen,layout?.appearance||defaults||originalAppearance);if(frame.clientWidth)screen.style.zoom=String(frame.clientWidth/780);}
 }
 const live=document.querySelector('#saved-layout-form .designer-tv');
 if(live&&layoutDraft)applyClockAppearance(live,layoutDraft.appearance);
}
