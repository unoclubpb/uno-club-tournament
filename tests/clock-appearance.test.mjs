import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {clockAppearance,applyClockAppearance} from '../src/clock-appearance.mjs';
test('legacy gradients retain both endpoint colors while multicolor stops normalize without changing their input',()=>{
 const old=clockAppearance({gradientStart:'#123456',gradientEnd:'#abcdef'});assert.deepEqual(old.gradientStops,[{color:'#123456',position:0},{color:'#abcdef',position:100}]);
 const input={timerStyle:'gradient',gradientStops:[{color:'#0000ff',position:100},{color:'#ff0000',position:0},{color:'#00ff00',position:35}]},snapshot=structuredClone(input),value=clockAppearance(input);assert.equal(value.gradientStops[1].position,35);assert.equal(value.gradientStart,'#ff0000');assert.equal(value.gradientEnd,'#0000ff');assert.deepEqual(input,snapshot);const dom=new JSDOM('<div></div>');applyClockAppearance(dom.window.document.querySelector('div'),value);assert.equal(dom.window.document.querySelector('div').style.getPropertyValue('--clock-gradient'),'linear-gradient(100deg,#ff0000 0%,#00ff00 35%,#0000ff 100%)');dom.window.close();
});
test('gradient validation rejects unsafe colors, out-of-range positions, overlapping stops and more than eight colors',()=>{
 for(const stops of [[],[{color:'#ffffff',position:0}],Array.from({length:9},(_,i)=>({color:'#ffffff',position:i*12.5})),[{color:'url(bad)',position:0},{color:'#ffffff',position:100}],[{color:'#000000',position:-1},{color:'#ffffff',position:100}],[{color:'#000000',position:1},{color:'#ffffff',position:100}],[{color:'#000000',position:0},{color:'#ff0000',position:100},{color:'#ffffff',position:100}],[{color:'#000000',position:0},{color:'#ffffff',position:Infinity}]])assert.throws(()=>clockAppearance({gradientStops:stops}),/gradient|Gradient/);
});
