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
  bar.innerHTML='<button type="button" data-clock-undo disabled>Undo</button><button type="button" data-clock-redo disabled>Redo</button><span class="muted small-copy">Click to select; double-click to edit title or digits. Drag to move.</span>';
  surface.parentElement.insertBefore(bar,surface);
  const modes=document.createElement('div');modes.className='clock-grid-modes';
  modes.innerHTML='<label>Positioning <select data-clock-grid><option value="free">Free Movement</option><option value="snap">Snap to Grid</option></select></label>';
  surface.parentElement.insertBefore(modes,surface);
  modes.querySelector('select').value=state.mode;
  modes.addEventListener('change',e=>{state.mode=e.target.value==='snap'?'snap':'free';surface.classList.toggle('clock-grid-active',state.mode==='snap');persist()});
  surface.classList.toggle('clock-grid-active',state.mode==='snap');
  const controls=document.createElement('div');controls.className='clock-edit-controls';
  controls.innerHTML='<label>Selected Element <input data-clock-selection readonly></label><label>Displayed Title <span class="clock-title-entry"><input data-clock-title maxlength="80" placeholder="Optional — no title displayed"><button type="button" data-clear-title aria-label="Clear displayed title">×</button></span></label><label>Size <input type="range" min="8" max="250" data-clock-size value="100"><output data-clock-size-output>100</output></label><label>Color Style <select data-clock-style><option value="solid">Solid Color</option><option value="gradient">Multicolor Gradient</option><option value="stripes">Multicolor Stripes</option></select></label><label>Font <select data-clock-font><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Tahoma</option><option>Trebuchet MS</option><option>Courier New</option></select></label><button type="button" data-clock-remove>Remove selected item</button>';
  const panel=form.querySelector('[data-layout-panel="appearance"]');panel?.append(controls);
  const persist=()=>{savedField.value=encodeURIComponent(JSON.stringify({objects:state.objects,mode:state.mode}));};
  const snap=()=>JSON.stringify(state.objects);
  const checkpoint=()=>{state.history.push(snap());if(state.history.length>80)state.history.shift();state.future=[];buttons()};
  const buttons=()=>{bar.querySelector('[data-clock-undo]').disabled=!state.history.length;bar.querySelector('[data-clock-redo]').disabled=!state.future.length;persist()};
  const updateControls=()=>{
   const o=state.objects.find(v=>v.id===state.selected);if(!o)return;
   const part=state.part;
   const input=controls.querySelector('[data-clock-title]');
   input.value=o.title||'';input.disabled=part==='value';
   input.placeholder='Optional — no title displayed';
   controls.querySelector('[data-clear-title]').hidden=!input.value||part==='value';
   const size=part==='title'?o.titleSize:part==='value'?o.valueSize:(o.groupSize||100);
   controls.querySelector('[data-clock-size]').value=size;
   controls.querySelector('[data-clock-size-output]').textContent=String(size)+'%';
   controls.querySelector('[data-clock-selection]').value=part==='title'?(o.title||'Title (blank)'):part==='value'?'Digits / Value':(items[o.kind]?.[0]||o.kind)+' (Group)';
   controls.querySelector('[data-clock-style]').value=o[(part||'value')+'Style']||(o.kind==='roundClock'?'stripes':'solid');
   controls.querySelector('[data-clock-font]').value=o[(part||'value')+'Font']||'Arial';
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
     if(part==='value'&&o.kind==='roundClock'&&digitsAppearance){
      const style=digitsAppearance;
      if(style.backgroundImage&&style.backgroundImage!=='none'){el.style.backgroundImage=style.backgroundImage;el.style.backgroundClip='text';el.style.webkitBackgroundClip='text';el.style.webkitTextFillColor='transparent';}
      else {el.style.color=style.color;if(style.webkitTextFillColor&&style.webkitTextFillColor!=='transparent')el.style.webkitTextFillColor=style.webkitTextFillColor;}
     }
     group.append(el);
    }
    // Sizing is controlled by the contextual Size slider, not resize handles.
    layer.append(group);
   });
   const o=state.objects.find(v=>v.id===state.selected);
   if(o)updateControls();
   buttons();
  };
  function add(id,x=15,y=35){
   if(!items[id])return;
   checkpoint();const [title,value]=items[id];const o={id:id+'-'+Date.now()+'-'+Math.floor(Math.random()*9999),kind:id,x:clamp(x,0,75),y:clamp(y,0,75),w:36,h:30,title,value,titleX:5,titleY:7,valueX:5,valueY:38,titleSize:17,valueSize:64,titleVisible:true};
   state.objects.push(o);state.selected=o.id;state.part=null;redraw();
  }
  function undo(redo=false){const source=redo?state.future:state.history,dest=redo?state.history:state.future;if(!source.length)return;dest.push(snap());state.objects=JSON.parse(source.pop());state.selected=null;state.part=null;redraw()}
  bar.addEventListener('click',e=>{if(e.target.closest('[data-clock-undo]'))undo();if(e.target.closest('[data-clock-redo]'))undo(true)});
  form.querySelectorAll('[data-design-item]').forEach(b=>{b.draggable=true;b.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',b.dataset.designItem));b.addEventListener('click',()=>add(b.dataset.designItem))});
  surface.addEventListener('dragover',e=>e.preventDefault());
  surface.addEventListener('drop',e=>{e.preventDefault();const r=surface.getBoundingClientRect();add(e.dataTransfer.getData('text/plain'),(e.clientX-r.left)/r.width*100,(e.clientY-r.top)/r.height*100)});
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
   redraw();
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
   if(twice){state.part=part.dataset.part;markSelection();state.drag=null;return;}
   if(!wasSelected)state.part=null;
   if(!wasSelected){group.classList.add('active');}
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
   else {markSelection();buttons();}
  };
  layer.addEventListener('pointerup',finish);
  layer.addEventListener('pointercancel',finish);
  controls.addEventListener('input',e=>{
   const o=state.objects.find(v=>v.id===state.selected);if(!o)return;
   if(e.target.matches('[data-clock-title]')){o.title=e.target.value;redraw();}
   if(e.target.matches('[data-clock-size]')){
    const size=Number(e.target.value);
    if(state.part==='title')o.titleSize=size;
    else if(state.part==='value')o.valueSize=size;
    else {const previous=o.groupSize||100;const factor=size/previous;o.titleSize=Math.round(o.titleSize*factor);o.valueSize=Math.round(o.valueSize*factor);o.groupSize=size;}
    redraw();
   }
  });
  controls.addEventListener('change',e=>{
   const o=state.objects.find(v=>v.id===state.selected);if(!o)return;
   if(e.target.matches('[data-clock-style]')){checkpoint();o[(state.part||'value')+'Style']=e.target.value;redraw();}
   if(e.target.matches('[data-clock-font]')){checkpoint();o[(state.part||'value')+'Font']=e.target.value;redraw();}
  });
  controls.addEventListener('click',e=>{
   const o=state.objects.find(v=>v.id===state.selected);if(!o)return;
   if(e.target.matches('[data-clear-title]')){checkpoint();o.title='';redraw();}
   if(e.target.matches('[data-clock-remove]')){checkpoint();state.objects=state.objects.filter(v=>v.id!==state.selected);state.selected=null;redraw();}
  });
  form.addEventListener('submit',persist,true);
  document.addEventListener('keydown',e=>{if(!form.isConnected||!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z')return;if(e.target.closest('input,textarea,[contenteditable]'))return;e.preventDefault();undo(e.shiftKey)});
  redraw();
 }
 const observer=new MutationObserver(()=>{if(document.querySelector('#saved-layout-form:not([data-drag-editor-ready])'))init()});
 observer.observe(document.getElementById('app'),{subtree:true,childList:true});init();
})();
