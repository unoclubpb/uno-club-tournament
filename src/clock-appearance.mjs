export const ORIGINAL_CLOCK_APPEARANCE=Object.freeze({background:'#060f18',timerStyle:'solid',timer:'#f2d17e',minutes:'#f2d17e',seconds:'#ffffff',gradientStart:'#f2d17e',gradientEnd:'#f27979',stripe1:'#f2d17e',stripe2:'#ffffff',stripe3:'#74c7ec',currentBlinds:'#ffffff',nextBlinds:'#f2d17e',level:'#f2d17e',text:'#abb6c4'});
export const CLOCK_PRESETS={original:ORIGINAL_CLOCK_APPEARANCE,contrast:{...ORIGINAL_CLOCK_APPEARANCE,background:'#000000',timer:'#ffffff',currentBlinds:'#ffff00',nextBlinds:'#00ff99',text:'#ffffff'},blue:{...ORIGINAL_CLOCK_APPEARANCE,background:'#07182e',timer:'#78d3ff',currentBlinds:'#e3f5ff',nextBlinds:'#aabaff',level:'#78d3ff'},green:{...ORIGINAL_CLOCK_APPEARANCE,background:'#071b15',timer:'#83edb2',currentBlinds:'#ffffff',nextBlinds:'#f2d17e',level:'#83edb2'}};
export function clockAppearance(value={}){
  const result={...ORIGINAL_CLOCK_APPEARANCE,...value};
  if(!['solid','separate','gradient','stripes'].includes(result.timerStyle))throw new Error('Choose a countdown style.');
  for(const key of Object.keys(ORIGINAL_CLOCK_APPEARANCE).filter(k=>k!=='timerStyle'))if(!/^#[0-9a-f]{6}$/i.test(result[key]))throw new Error('Choose a valid clock color.');
  return Object.fromEntries(Object.keys(ORIGINAL_CLOCK_APPEARANCE).map(k=>[k,result[k]]));
}
export function applyClockAppearance(node,value){
  if(!node)return;const appearance=clockAppearance(value);
  node.dataset.timerStyle=appearance.timerStyle;
  for(const [key,color] of Object.entries(appearance))if(key!=='timerStyle')node.style.setProperty('--clock-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),color);
}
export function setCountdown(node,text){
  if(!node||node.textContent===text)return;
  const [minutes,seconds]=text.split(':');
  node.replaceChildren(...[minutes,':',seconds].map((value,i)=>{const span=node.ownerDocument.createElement('span');span.className=['timer-minutes','timer-colon','timer-seconds'][i];span.textContent=value;return span;}));
}
