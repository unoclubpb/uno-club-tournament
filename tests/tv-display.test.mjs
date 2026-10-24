import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {fitTvSeating} from '../src/tv-display.mjs';

test('TV names shrink to their available row and grow again after resizing without shortening names',()=>{
 const dom=new JSDOM('<div class="tv-seating-shell"><span data-tv-fit="72">A very long player name that must remain fully visible on the seating chart</span></div>'),root=dom.window.document,node=root.querySelector('span'),name=node.textContent;
 let width=95,height=28;
 node.getBoundingClientRect=()=>({width,height});
 Object.defineProperties(node,{clientWidth:{get:()=>width},clientHeight:{get:()=>height},scrollWidth:{get:()=>width},scrollHeight:{get:()=>Math.ceil(name.length*parseFloat(node.style.fontSize)*.6/width)*parseFloat(node.style.fontSize)*1.05}});
 fitTvSeating(root);const small=parseFloat(node.style.fontSize);assert.ok(small<height*.72);assert.ok(node.scrollHeight<=height+1);assert.equal(node.textContent,name);
 width=500;height=80;fitTvSeating(root);assert.ok(parseFloat(node.style.fontSize)>small);assert.ok(node.scrollHeight<=height+1);assert.equal(node.textContent,name);dom.window.close();
});
