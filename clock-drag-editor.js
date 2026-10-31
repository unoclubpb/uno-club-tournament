// Clock Designer interaction layer, phase 1: editor-only interaction.
(()=>{
 const items={roundClock:['TIME REMAINING','15:00'],roundNumber:['ROUND','1'],currentBlinds:['CURRENT BLINDS','100 / 200'],nextBlinds:['NEXT BLINDS','200 / 400'],gameName:['GAME','HOLD\u2019EM'],playersRemaining:['PLAYERS REMAINING','24'],totalEntries:['TOTAL ENTRIES','30'],playerCount:['PLAYER COUNT','24'],prizePool:['PRIZE POOL','$1,200'],nextBreak:['NEXT BREAK','10 MIN']};
 let session=null;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function init(){
  const form=document.querySelector('#saved-layout-form'),surface=form?.querySelector('.designer-preview-surface');
  if(!form||!surface||form.dataset.dragEditorReady)return;
  form.dataset.dragEditorReady='true';
  const state={objects:[],selected:null,part:null,history:[],future:[],drag:null};
  const defaults=[['roundClock',4,30,44,49,16,58],['roundNumber',73,5,24,20,12,27],['currentBlinds',51,37,28,29,13,28],['nextBlinds',51,68,28,25,12,24],['playersRemaining',80,40,18,24,11,27],['prizePool',80,70,18,24,11,24]];
  state.objects=defaults.map(([kind,x,y,w,h,titleSize,valueSize])=>{const [title,value]=items[kind];return {id:kind+'-starter',kind,x,y,w,h,title,value,titleX:4,titleY:10,valueX:4,valueY:43,titleSize,valueSize,titleVisible:true};});
  state.selected=state.objects[0].id;
  state.mode='free';
  try{const saved=JSON.parse(decodeURIComponent(form.dataset.editorState||'null'));if(saved&&Array.isArray(saved.objects)){state.objects=saved.objects;state.mode=saved.mode==='snap'?'snap':'free';state.selected=state.objects[0]?.id||null;}}catch{}
  session=state;
  const original=surface.querySelector('.designer-tv');
  const clockDigits=original?.querySelector('[data-countdown]');
  const digitStyle=clockDigits?getComputedStyle(clockDigits):null;
  const digitsAppearance=digitStyle?{backgroundImage:digitStyle.backgroundImage,color:digitStyle.color,webkitTextFillColor:digitStyle.webkitTextFillColor,webkitBackgroundClip:digitStyle.webkitBackgroundClip,backgroundClip:digitStyle.backgroundClip}:null;
  if(original){original.style.visibility='hidden';original.style.pointerEvents='none';}
  const savedField=document.createElement('input');savedField.type='hidden';savedField.name='editorData';form.append(savedField);
  const layer=document.createElement('div');layer.className='clock-edit-layer';surface.append(layer);
  const bar=document.createElement('div');bar.className='clock-edit-tools';
  bar.innerHTML='<div class="clock-history-stack"><span class="eyebrow clock-preview-caption">CLOCK DESIGNER · 16:9 PREVIEW</span><div class="uno-segmented clock-history-actions" role="group" aria-label="Edit history"><button type="button" data-clock-undo disabled>Undo</button><button type="button" data-clock-redo disabled>Redo</button></div></div>';
  // Place both toolbars in the same grid row so they share an exact baseline.
  const workspace=form.querySelector('.designer-workspace');
  const previewColumn=form.querySelector('.designer-preview-column');
  previewColumn?.querySelector(':scope > .eyebrow')?.remove();
  // Keep the Background action beside the preview instructions, outside the 16:9 screen.
  const backgroundButton=surface.querySelector('.designer-background-button');
  const previewHelp=previewColumn?.querySelector(':scope > .small-copy');
  if(backgroundButton&&previewHelp){
   const helpRow=document.createElement('div');
   helpRow.className='designer-preview-help-row';
   previewHelp.parentNode.insertBefore(helpRow,previewHelp);
   helpRow.append(previewHelp,backgroundButton);
   backgroundButton.style.position='static';
   backgroundButton.style.inset='auto';
  }
  const rightColumn=form.querySelector('.designer-right-column');
  const rightToolbar=form.querySelector('.designer-toolbar-row');
  if(workspace&&previewColumn&&rightColumn&&rightToolbar){
   workspace.insertBefore(bar,previewColumn);
   workspace.insertBefore(rightToolbar,rightColumn);
   workspace.classList.add('clock-toolbar-grid');
  }else surface.parentElement.insertBefore(bar,surface);
  const modes=document.createElement('div');modes.className='clock-grid-modes';
  modes.innerHTML='<div class="uno-segmented" role="group" aria-label="Positioning"><button type="button" data-clock-mode="free">Free Movement</button><button type="button" data-clock-mode="snap">Snap to Grid</button></div>';
  bar.append(modes);
  const refreshModes=()=>{
   modes.querySelectorAll('[data-clock-mode]').forEach(btn=>{const active=btn.dataset.clockMode===state.mode;btn.setAttribute('aria-pressed',String(active));btn.classList.toggle('active',active);});
  };
  modes.addEventListener('click',e=>{
   const btn=e.target.closest('[data-clock-mode]');if(!btn)return;
   state.mode=btn.dataset.clockMode;surface.classList.toggle('clock-grid-active',state.mode==='snap');
   refreshModes();persist();
  });
  refreshModes();
  surface.classList.toggle('clock-grid-active',state.mode==='snap');
  const controls=document.createElement('div');controls.className='clock-edit-controls';
  controls.innerHTML='<label>Displayed Title <span class="clock-title-entry"><input data-clock-title maxlength="80" placeholder="Optional — no title displayed"><button type="button" data-clear-title aria-label="Clear displayed title">×</button></span></label><label><span data-clock-size-label>Size</span> <input type="range" min="8" max="250" data-clock-size value="100"><output data-clock-size-output>100</output></label><label>Color Style <span class="clock-style-row"><select data-clock-style><option value="solid">Solid Color</option><option value="gradient">Multicolor Gradient</option><option value="stripes">Multicolor Stripes</option></select><button type="button" data-palette-toggle title="Edit colors" aria-label="Edit colors">🎨</button></span></label><div class="clock-palette" data-clock-palette hidden></div><label>Font <select data-clock-font><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Tahoma</option><option>Trebuchet MS</option><option>Courier New</option></select></label><label>Text Shadow <input type="checkbox" data-clock-shadow></label><label>Shadow Depth <input type="range" data-clock-shadow-depth min="0" max="30" value="5"></label><button type="button" data-clock-remove>Remove selected item</button>';
  const panel=form.querySelector('[data-layout-panel="appearance"]');
  if(panel){
   // Remove legacy preview-only fields entirely; retain the working editor controls.
   panel.replaceChildren(controls);
  }
  const persist=()=>{savedField.value=encodeURIComponent(JSON.stringify({objects:state.objects,mode:state.mode}));};
  const snap=()=>JSON.stringify(state.objects);
  const checkpoint=()=>{state.history.push(snap());if(state.history.length>80)state.history.shift();state.future=[];buttons()};
  const buttons=()=>{bar.querySelector('[data-clock-undo]').disabled=!state.history.length;bar.querySelector('[data-clock-redo]').disabled=!state.future.length;persist()};
  const paletteDefaults={solid:['#f4c542'],gradient:['#e85050','#f4c542','#4fa6ec'],stripes:['#e85050','#f4c542','#4fa6ec']};
  const currentObject=()=>state.objects.find(v=>v.id===state.selected);
  const currentPart=()=>state.part||'value';
  const colorsFor=(o,part,style)=>{o.palette??={};o.palette[part]??={};return o.palette[part][style]??=[...paletteDefaults[style]];};
  const drawPalette=()=>{
   const el=controls.querySelector('[data-clock-palette]'),o=currentObject();if(!o||el.hidden)return;
   const part=currentPart(),style=o[part+'Style']||(o.kind==='roundClock'?'stripes':'solid'),colors=colorsFor(o,part,style);
   el.replaceChildren();
   colors.forEach((color,i)=>{const row=document.createElement('label');row.textContent=style==='solid'?'Text Color':'Color '+(i+1);
     const pick=document.createElement('input');pick.type='color';pick.value=/^#[0-9a-f]{6}$/i.test(color)?color:'#ffffff';pick.dataset.colorIndex=i;row.append(pick);el.append(row);});
   if(style!=='solid'){const add=document.createElement('button');add.type='button';add.textContent='+ Add Color';add.dataset.addColor='';add.disabled=colors.length>=8;el.append(add);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove Last Color';remove.dataset.removeColor='';remove.disabled=colors.length<=2;el.append(remove);}
  };
  const setTab=(tab)=>{
   for(const panel of form.querySelectorAll('[data-layout-panel]'))panel.hidden=panel.dataset.layoutPanel!==tab;
   for(const btn of form.querySelectorAll('[data-layout-tab]')){
    const active=btn.dataset.layoutTab===tab;
    btn.classList.toggle('primary',active);btn.classList.toggle('secondary',!active);
    btn.setAttribute('aria-pressed',String(active));
   }
  };
  form.querySelectorAll('[data-layout-tab]').forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.layoutTab)));
  setTab('items'); // Initialize the active blue/white tab before any user interaction.
  const selectAppearanceTab=()=>setTab('appearance');
  const updateControls=()=>{
   const o=state.objects.find(v=>v.id===state.selected);if(!o)return;
   const part=state.part;
   const input=controls.querySelector('[data-clock-title]');
   input.value=o.title||'';input.disabled=part==='value';
   input.placeholder='Optional — no title displayed';
   controls.querySelector('[data-clear-title]').hidden=!input.value||part==='value';
   const size=part==='title'?o.titleSize:part==='value'?o.valueSize:(o.groupSize??100);
   const selectedName=part==='title'?(o.title||'Title'):part==='value'?o.value:(o.title||items[o.kind]?.[0]||'Item')+' + '+o.value;

   controls.querySelector('[data-clock-size-label]').textContent='Size ('+selectedName+')';
   const slider=controls.querySelector('[data-clock-size]');
   if(part==='title'||part==='value'){slider.min=10;slider.max=120;}
   else {const factorMin=Math.max(10/Math.max(o.titleSize,0.01),10/Math.max(o.valueSize,0.01));const factorMax=Math.min(120/Math.max(o.titleSize,0.01),120/Math.max(o.valueSize,0.01));const baseline=o.groupSize??100;slider.min=Math.max(1,Math.ceil(baseline*factorMin));slider.max=Math.max(Number(slider.min)+1,Math.floor(baseline*factorMax));}
   slider.value=clamp(size,Number(slider.min),Number(slider.max));
   controls.querySelector('[data-clock-size-output]').textContent=String(size)+'%';
   controls.querySelector('[data-clock-shadow]').checked=!!o[(part||'value')+'Shadow'];
   controls.querySelector('[data-clock-shadow-depth]').value=o[(part||'value')+'ShadowDepth']??5;
   controls.querySelector('[data-clock-style]').value=o[(part||'value')+'Style']||(o.kind==='roundClock'?'stripes':'solid');
   controls.querySelector('[data-clock-font]').value=o[(part||'value')+'Font']||'Arial';
   drawPalette();
  };
  const syncItemButtons=()=>{
   const present=new Set(state.objects.map(o=>o.kind));
   form.querySelectorAll('[data-design-item]').forEach(btn=>{
    const used=present.has(btn.dataset.designItem);
    btn.disabled=used;btn.classList.toggle('clock-item-present',used);
    btn.setAttribute('aria-pressed',String(used));
    btn.title=used?'Already on the clock':'Add to clock';
   });
  };
  const redraw=()=>{
   layer.replaceChildren();
   state.objects.forEach(o=>{
    const group=document.createElement('div');group.className='clock-edit-group'+(state.selected===o.id?' active':'');
    group.dataset.id=o.id;Object.assign(group.style,{left:o.x+'%',top:o.y+'%',width:o.w+'%',height:o.h+'%'});
    for(const part of ['title','value']){
     const el=document.createElement('div');el.dataset.part=part;el.className='clock-edit-part'+(state.selected===o.id&&state.part===part?' active':'');
     el.textContent=part==='title'?o.title:o.value;
     Object.assign(el.style,{left:o[part+'X']+'%',top:o[part+'Y']+'%',fontSize:o[part+'Size']+'px',display:part==='title'&&!o.title?'none':'block',fontFamily:o[part+'Font']||'Arial'});
     if(part==='value'&&o.kind==='roundClock'&&digitsAppearance&&(!o.valueStyle||o.valueStyle==='stripes')){
      const style=digitsAppearance;
      if(style.backgroundImage&&style.backgroundImage!=='none'){el.style.backgroundImage=style.backgroundImage;el.style.backgroundClip='text';el.style.webkitBackgroundClip='text';el.style.webkitTextFillColor='transparent';}
      else {el.style.color=style.color;if(style.webkitTextFillColor&&style.webkitTextFillColor!=='transparent')el.style.webkitTextFillColor=style.webkitTextFillColor;}
     }
     const styleName=o[part+'Style']||(part==='value'&&o.kind==='roundClock'?'stripes':'solid');
     const colors=colorsFor(o,part,styleName);
     if(styleName==='solid'){el.style.backgroundImage='none';el.style.webkitTextFillColor='currentColor';el.style.color=colors[0];}
     if(styleName==='gradient'){el.style.backgroundImage='linear-gradient(90deg,'+colors.join(',')+')';el.style.backgroundClip='text';el.style.webkitBackgroundClip='text';el.style.webkitTextFillColor='transparent';}
     if(styleName==='stripes'){el.style.backgroundImage='repeating-linear-gradient(110deg,'+colors.map((v,i)=>v+' '+i*14+'px '+(i+1)*14+'px').join(',')+')';el.style.backgroundClip='text';el.style.webkitBackgroundClip='text';el.style.webkitTextFillColor='transparent';}
     const depth=o[part+'ShadowDepth']??5;
     el.style.textShadow=o[part+'Shadow']?('0 '+Math.round(depth/3)+'px '+depth+'px #000'):'none';
     group.append(el);
    }
    // Sizing is controlled by the contextual Size slider, not resize handles.
    layer.append(group);
   });
   // Fit group outlines to the rendered text, including enlarged or repositioned parts.
   for(const group of layer.querySelectorAll('.clock-edit-group')){
    const o=state.objects.find(v=>v.id===group.dataset.id);if(!o)continue;
    const parts=[...group.querySelectorAll('.clock-edit-part')].filter(el=>el.style.display!=='none');
    if(!parts.length)continue;
    const gw=group.clientWidth||1,gh=group.clientHeight||1;
    const right=Math.max(...parts.map(el=>el.offsetLeft+el.scrollWidth+8));
    const bottom=Math.max(...parts.map(el=>el.offsetTop+el.scrollHeight+8));
    if(right>gw)group.style.width=Math.min(100-o.x,o.w*right/gw)+'%';
    if(bottom>gh)group.style.height=Math.min(100-o.y,o.h*bottom/gh)+'%';
   }
   const o=state.objects.find(v=>v.id===state.selected);
   if(o)updateControls();
   syncItemButtons();
   buttons();
  };
  function add(id,x=15,y=35){
   if(!items[id]||state.objects.some(o=>o.kind===id))return;
   checkpoint();const [title,value]=items[id];const o={id:id+'-'+Date.now()+'-'+Math.floor(Math.random()*9999),kind:id,x:clamp(x,0,75),y:clamp(y,0,75),w:36,h:30,title,value,titleX:5,titleY:7,valueX:5,valueY:38,titleSize:17,valueSize:64,titleVisible:true};
   state.objects.push(o);state.selected=o.id;state.part=null;redraw();
  }
  function undo(redo=false){const source=redo?state.future:state.history,dest=redo?state.history:state.future;if(!source.length)return;dest.push(snap());state.objects=JSON.parse(source.pop());state.selected=null;state.part=null;redraw()}
  bar.addEventListener('click',e=>{if(e.target.closest('[data-clock-undo]'))undo();if(e.target.closest('[data-clock-redo]'))undo(true)});
  form.querySelectorAll('[data-design-item]').forEach(b=>{b.draggable=false;b.addEventListener('click',()=>add(b.dataset.designItem))});
  // Keep DOM nodes stable during pointer gestures. Replacing them mid-drag
  // cancels native double-click targeting and pointer capture in browsers.
  const syncPositions=()=>{
   state.objects.forEach(o=>{
    const g=[...layer.children].find(el=>el.dataset.id===o.id);
    if(!g)return;
    Object.assign(g.style,{left:o.x+'%',top:o.y+'%',width:o.w+'%',height:o.h+'%'});
    for(const part of ['title','value']){
     const el=g.querySelector('[data-part="'+part+'"]');if(!el)continue;
     Object.assign(el.style,{left:o[part+'X']+'%',top:o[part+'Y']+'%',fontSize:o[part+'Size']+'px'});
    }
   });
  };
  let lastTap=null;
  const markSelection=()=>{
   for(const g of layer.querySelectorAll('.clock-edit-group')){
    const selected=g.dataset.id===state.selected;
    g.classList.toggle('active',selected);
    for(const p of g.querySelectorAll('[data-part]'))p.classList.toggle('active',selected&&p.dataset.part===state.part);
   }
  };
  layer.addEventListener('dblclick',e=>{
   const el=e.target.closest('[data-part]');if(!el)return;
   state.selected=el.parentElement.dataset.id;state.part=el.dataset.part;
   redraw();selectAppearanceTab();
  });
  layer.addEventListener('pointerdown',e=>{
   const group=e.target.closest('.clock-edit-group');if(!group)return;
   const o=state.objects.find(v=>v.id===group.dataset.id);if(!o)return;
   const resize=!!e.target.closest('[data-resize]');
   const part=e.target.closest('[data-part]');
   const wasSelected=state.selected===o.id;
   state.selected=o.id;
   const now=Date.now();
   const key=part?o.id+':'+part.dataset.part:null;
   const twice=key&&lastTap&&lastTap.key===key&&now-lastTap.when<550;
   lastTap=key?{key,when:now}:null;
   if(twice){state.part=part.dataset.part;markSelection();state.drag=null;updateControls();selectAppearanceTab();return;}
   if(!wasSelected)state.part=null;
   if(!wasSelected){group.classList.add('active');updateControls();selectAppearanceTab();}
   const rect=surface.getBoundingClientRect();
   state.drag={id:o.id,part:!resize&&state.part&&part?state.part:null,resize,x:e.clientX,y:e.clientY,original:JSON.parse(JSON.stringify(o)),before:snap(),rect,moved:false};
   layer.setPointerCapture(e.pointerId);
  });
  layer.addEventListener('pointermove',e=>{
   const d=state.drag;if(!d)return;
   const o=state.objects.find(v=>v.id===d.id);if(!o)return;
   const grid=v=>state.mode==='snap'?Math.round(v/2.5)*2.5:v;
   const dx=(e.clientX-d.x)/d.rect.width*100,dy=(e.clientY-d.y)/d.rect.height*100;
   if(Math.abs(dx)+Math.abs(dy)>.2)d.moved=true;
   if(d.resize){
    const scale=clamp((d.original.w+dx)/d.original.w,.4,3);
    o.w=clamp(d.original.w*scale,12,100-o.x);
    o.h=clamp(d.original.h*scale,10,100-o.y);
    o.titleSize=Math.round(d.original.titleSize*scale);
    o.valueSize=Math.round(d.original.valueSize*scale);
   }else if(d.part){
    o[d.part+'X']=clamp(grid(d.original[d.part+'X']+dx/d.original.w*100),0,100);
    o[d.part+'Y']=clamp(grid(d.original[d.part+'Y']+dy/d.original.h*100),0,100);
   }else{
    o.x=clamp(grid(d.original.x+dx),0,100-o.w);
    o.y=clamp(grid(d.original.y+dy),0,100-o.h);
   }
   syncPositions();
  });
  const finish=()=>{
   const d=state.drag;if(!d)return;state.drag=null;
   if(d.moved&&snap()!==d.before){state.history.push(d.before);state.future=[];redraw();}
   else {markSelection();updateControls();buttons();}
  };
  layer.addEventListener('pointerup',finish);
  layer.addEventListener('pointercancel',finish);
  controls.addEventListener('focusin',e=>{
   if(e.target.matches('[data-clock-title],[data-clock-size]')){checkpoint();}
  });
  controls.addEventListener('input',e=>{
   const o=state.objects.find(v=>v.id===state.selected);if(!o)return;
   if(e.target.matches('[data-clock-title]')){
    o.title=e.target.value;
    const group=[...layer.children].find(el=>el.dataset.id===o.id);
    const title=group?.querySelector('[data-part="title"]');
    if(title){title.textContent=o.title;title.style.display=o.title?'block':'none';}
    controls.querySelector('[data-clear-title]').hidden=!o.title;
    controls.querySelector('[data-clock-size-label]').textContent='Size ('+(state.part==='title'?(o.title||'Title'):state.part==='value'?o.value:(o.title||'Title')+' + '+o.value)+')';
    persist();
   }
   if(e.target.matches('[data-clock-size]')){
    const size=Number(e.target.value);
    if(state.part==='title')o.titleSize=size;
    else if(state.part==='value')o.valueSize=size;
    else {const previous=o.groupSize||100;const factor=size/previous;o.titleSize=o.titleSize*factor;o.valueSize=o.valueSize*factor;o.groupSize=size;}
    controls.querySelector('[data-clock-size-output]').textContent=String(Math.round(size))+'%';
    redraw();
   }
   if(e.target.matches('[data-clock-shadow-depth]')){o[currentPart()+'ShadowDepth']=Number(e.target.value);redraw();}
  });
  controls.addEventListener('change',e=>{
   const o=state.objects.find(v=>v.id===state.selected);if(!o)return;
   if(e.target.matches('[data-clock-style]')){checkpoint();o[(state.part||'value')+'Style']=e.target.value;redraw();}
   if(e.target.matches('[data-clock-font]')){checkpoint();o[(state.part||'value')+'Font']=e.target.value;redraw();}
   if(e.target.matches('[data-clock-shadow]')){checkpoint();o[currentPart()+'Shadow']=e.target.checked;redraw();}
   if(e.target.matches('[data-color-index]')){checkpoint();colorsFor(o,currentPart(),o[currentPart()+'Style']||'solid')[Number(e.target.dataset.colorIndex)]=e.target.value;redraw();}
  });
  controls.addEventListener('click',e=>{
   const o=state.objects.find(v=>v.id===state.selected);if(!o)return;
   if(e.target.matches('[data-clear-title]')){checkpoint();o.title='';redraw();}
   if(e.target.closest('[data-palette-toggle]')){const p=controls.querySelector('[data-clock-palette]');p.hidden=!p.hidden;drawPalette();}
   if(e.target.matches('[data-add-color],[data-remove-color]')){checkpoint();const palette=colorsFor(o,currentPart(),o[currentPart()+'Style']||'solid');if(e.target.matches('[data-add-color]')&&palette.length<8)palette.push('#ffffff');if(e.target.matches('[data-remove-color]')&&palette.length>2)palette.pop();redraw();}
   if(e.target.matches('[data-clock-remove]')){checkpoint();state.objects=state.objects.filter(v=>v.id!==state.selected);state.selected=null;redraw();}
  });
  form.addEventListener('submit',persist,true);
  document.addEventListener('keydown',e=>{if(!form.isConnected||!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z')return;if(e.target.closest('input,textarea,[contenteditable]'))return;e.preventDefault();undo(e.shiftKey)});
  redraw();
 }
 const observer=new MutationObserver(()=>{if(document.querySelector('#saved-layout-form:not([data-drag-editor-ready])'))init()});
 observer.observe(document.getElementById('app'),{subtree:true,childList:true});init();
})();
