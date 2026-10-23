import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installClockToolbar} from '../src/clock-toolbar.mjs';
function setup(){
 const dom=new JSDOM('<div class="tv-shell"><div class="tv-toolbar"><button>Sound</button></div><div id="round">ROUND 1</div></div>'),root=dom.window.document,view=dom.window;
 let time=0,nextId=0;const timers=new Map();
 const controller=installClockToolbar({root,view,now:()=>time,schedule:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const advance=ms=>{const end=time+ms;while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=end;};
 controller.sync();return {root,view,controller,advance,bar:()=>root.querySelector('.tv-toolbar'),close(){controller.destroy();view.close();}};
}
test('clock toolbar hides after three idle seconds and does not keep keyboard or touch targets active',()=>{
 const f=setup();try{assert.equal(f.bar().getAttribute('aria-hidden'),'false');f.bar().querySelector('button').focus();f.advance(2999);assert.equal(f.bar().classList.contains('is-idle'),false);f.advance(1);assert.equal(f.bar().classList.contains('is-idle'),true);assert.equal(f.bar().getAttribute('aria-hidden'),'true');assert.ok(f.bar().hasAttribute('inert'));assert.equal(f.root.activeElement,f.root.body);assert.equal(f.root.querySelector('#round').textContent,'ROUND 1');}finally{f.close();}
});
test('mouse, touch, scrolling and keyboard activity reveal clock controls and restart the idle period',()=>{
 const f=setup();try{for(const type of ['pointermove','mousemove','pointerdown','touchstart','touchmove','wheel','scroll','keydown']){f.advance(3000);assert.equal(f.bar().getAttribute('aria-hidden'),'true');f.root.dispatchEvent(new f.view.Event(type,{bubbles:true}));assert.equal(f.bar().getAttribute('aria-hidden'),'false',type);assert.equal(f.bar().hasAttribute('inert'),false);f.advance(2000);f.root.dispatchEvent(new f.view.Event(type,{bubbles:true}));f.advance(2999);assert.equal(f.bar().getAttribute('aria-hidden'),'false');f.advance(1);assert.equal(f.bar().getAttribute('aria-hidden'),'true');}}finally{f.close();}
});
test('clock rerenders preserve inactivity while leaving and returning starts a fresh visible period',()=>{
 const f=setup();try{f.advance(2000);f.root.querySelector('.tv-toolbar').outerHTML='<div class="tv-toolbar"><button>Full screen</button></div>';f.controller.sync();f.advance(1000);assert.equal(f.bar().getAttribute('aria-hidden'),'true');f.controller.sync();assert.equal(f.bar().getAttribute('aria-hidden'),'true');f.bar().remove();f.controller.sync();f.advance(10000);f.root.body.innerHTML='<div class="tv-toolbar"><button>Sound</button></div>';f.controller.sync();assert.equal(f.bar().getAttribute('aria-hidden'),'false');f.advance(3000);assert.equal(f.bar().getAttribute('aria-hidden'),'true');}finally{f.close();}
});
test('fullscreen and viewport changes reveal controls without requiring a cloud write',()=>{
 const f=setup();try{for(const [target,type] of [[f.root,'fullscreenchange'],[f.view,'resize'],[f.view,'focus']]){f.advance(3000);assert.equal(f.bar().getAttribute('aria-hidden'),'true');target.dispatchEvent(new f.view.Event(type));assert.equal(f.bar().getAttribute('aria-hidden'),'false');}}finally{f.close();}
});
