export const ORIGINAL_CLOCK_APPEARANCE=Object.freeze({background:'#060f18',timerStyle:'solid',timer:'#f2d17e',minutes:'#f2d17e',seconds:'#ffffff',gradientStart:'#f2d17e',gradientEnd:'#f27979',stripe1:'#f2d17e',stripe2:'#ffffff',stripe3:'#74c7ec',currentBlinds:'#ffffff',nextBlinds:'#f2d17e',level:'#f2d17e',text:'#abb6c4'});
export const CLOCK_PRESETS={original:ORIGINAL_CLOCK_APPEARANCE,contrast:{...ORIGINAL_CLOCK_APPEARANCE,background:'#000000',timer:'#ffffff',currentBlinds:'#ffff00',nextBlinds:'#00ff99',text:'#ffffff'},blue:{...ORIGINAL_CLOCK_APPEARANCE,background:'#07182e',timer:'#78d3ff',currentBlinds:'#e3f5ff',nextBlinds:'#aabaff',level:'#78d3ff'},green:{...ORIGINAL_CLOCK_APPEARANCE,background:'#071b15',timer:'#83edb2',currentBlinds:'#ffffff',nextBlinds:'#f2d17e',level:'#83edb2'}};
export function clockAppearance(value={}){
  const result={...ORIGINAL_CLOCK_APPEARANCE,...value};
  if(!['solid','separate','gradient','stripes'].includes(result.timerStyle))throw new Error('Choose a countdown style.');
  for(const key of Object.keys(ORIGINAL_CLOCK_APPEARANCE).filter(k=>k!=='timerStyle'))if(!/^#[0-9a-f]{6}$/i.test(result[key]))throw new Error('Choose a valid clock color.');
  const stops=value.gradientStops??[{color:result.gradientStart,position:0},{color:result.gradientEnd,position:100}];
  if(!Array.isArray(stops)||stops.length<2||stops.length>8)throw new Error('Choose 2–8 gradient colors.');
  const gradientStops=stops.map(stop=>{if(!stop||!/^#[0-9a-f]{6}$/i.test(stop.color)||!Number.isFinite(stop.position)||stop.position<0||stop.position>100)throw new Error('Each gradient color needs a valid color and a position from 0% to 100%.');return {color:stop.color,position:stop.position};}).sort((a,b)=>a.position-b.position);
  if(gradientStops[0].position!==0||gradientStops.at(-1).position!==100||gradientStops.some((stop,i)=>i>0&&stop.position===gradientStops[i-1].position))throw new Error('Gradient colors need different positions, starting at 0% and ending at 100%.');
  return {...Object.fromEntries(Object.keys(ORIGINAL_CLOCK_APPEARANCE).map(k=>[k,result[k]])),gradientStart:gradientStops[0].color,gradientEnd:gradientStops.at(-1).color,gradientStops};
}
export function applyClockAppearance(node,value){
  if(!node)return;const appearance=clockAppearance(value);
  node.dataset.timerStyle=appearance.timerStyle;
  for(const [key,color] of Object.entries(appearance))if(key!=='timerStyle'&&key!=='gradientStops')node.style.setProperty('--clock-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),color);
  node.style.setProperty('--clock-gradient',`linear-gradient(100deg,${appearance.gradientStops.map(stop=>`${stop.color} ${stop.position}%`).join(',')})`);
}
export function setCountdown(node,text){
  if(!node||node.textContent===text)return;
  const [minutes,seconds]=text.split(':');
  node.replaceChildren(...[minutes,':',seconds].map((value,i)=>{const span=node.ownerDocument.createElement('span');span.className=['timer-minutes','timer-colon','timer-seconds'][i];span.textContent=value;return span;}));
}
