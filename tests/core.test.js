import test from 'node:test';import assert from 'node:assert/strict';import{formatCount,mapBox,overlapRatio,distance,Smoother}from'../js/image-processing.js';import{parseCommand}from'../js/nlp.js';import{countPeople}from'../js/person-counter.js';test('box mapping',()=>assert.deepEqual(mapBox([10,20,30,40],100,200,200,400),[20,40,60,80]));test('count formatting',()=>{assert.equal(formatCount(0),'0');assert.equal(formatCount(4),'4');assert.equal(formatCount(16),'Above 15');assert.equal(formatCount(-1),'—')});test('equal box overlap',()=>assert.equal(overlapRatio([0,0,10,10],[0,0,10,10]),1));test('separate box overlap',()=>assert.equal(overlapRatio([0,0,10,10],[20,20,3,3]),0));test('distance',()=>assert.equal(distance({x:0,y:0},{x:3,y:4}),5));test('smoothing',()=>{const s=new Smoother(.5);s.update({x:0,y:0});assert.deepEqual(s.update({x:10,y:10}),{x:5,y:5})});test('mode command parsing',()=>{assert.equal(parseCommand('open object finder').mode,'objects');assert.equal(parseCommand('start hand drawing').mode,'drawing');assert.equal(parseCommand('activate portal').mode,'portal');assert.equal(parseCommand('show person count').mode,'people')});test('action command parsing',()=>{assert.equal(parseCommand('reset the drawing').action,'clearDrawing');assert.equal(parseCommand('stop camera').action,'stopCamera')});test('unrecognized command rejected',()=>assert.equal(parseCommand('teleport to mars').ok,false));test('person thresholding',()=>assert.equal(countPeople([{class:'person',score:.9},{class:'person',score:.3},{class:'book',score:.9}]),'1'));
import { HandTracker, pinchActive, isFist } from '../js/hand-tracking.js';
import { AIManager } from '../js/ai-manager.js';

const makeLandmarks = (overrides = {}) => Array.from({ length: 21 }, (_, i) => ({
  x: (i % 5) * 0.08 + 0.3,
  y: Math.floor(i / 5) * 0.08 + 0.2,
  z: 0,
  ...(overrides[i] || {})
}));

test('hand tracker returns no hands for an empty model result', () => {
  const tracker = new HandTracker();
  const result = tracker.process({ landmarks: [], handednesses: [] }, 640, 480);
  assert.equal(result.hands.length, 0);
  assert.equal(result.fist, false);
});

test('pinch detector rejects a missing or incomplete hand', () => {
  assert.equal(pinchActive(null, 640), false);
  assert.equal(pinchActive({ raw: makeLandmarks().slice(0, 10) }), false);
});

test('hand tracker normalizes all 21 landmark coordinates to canvas pixels', () => {
  const tracker = new HandTracker();
  const raw = makeLandmarks({0:{x:0.5,y:0.25}});
  const result = tracker.process({landmarks:[raw],handednesses:[[{categoryName:'Left'}]]},800,400);
  assert.equal(result.hands.length,1);
  assert.equal(result.hands[0].landmarks.length,21);
  assert.equal(result.hands[0].landmarks[0].x,400);
  assert.equal(result.hands[0].landmarks[0].y,100);
});

test('local detector adapter does not require the OpenAI endpoint', async () => {
  const manager = new AIManager(() => {}, () => {});
  assert.equal(typeof manager.loadObjects, 'function');
  assert.equal(typeof manager.loadHands, 'function');
  assert.equal(await manager.ensureMode('unknown'), null);
  manager.dispose();
});

test('person finder count utility accepts local detector predictions', () => {
  assert.equal(countPeople([
    {class:'person',score:0.91},
    {class:'person',score:0.52},
    {class:'person',score:0.2},
    {class:'chair',score:0.97}
  ]),'2');
});

import { HandPortal } from '../js/portal.js';

test('pinch activates relative to palm size', () => {
  const raw = makeLandmarks({
    0: {x:.5,y:.8}, 5:{x:.4,y:.5}, 9:{x:.5,y:.45}, 17:{x:.6,y:.5},
    4:{x:.5,y:.45}, 8:{x:.52,y:.45}
  });
  assert.equal(pinchActive({raw}), true);
});

test('fist detector recognizes curled fingertips', () => {
  const raw = makeLandmarks({
    0:{x:.5,y:.8},
    5:{x:.36,y:.57}, 6:{x:.37,y:.60}, 8:{x:.38,y:.61},
    9:{x:.45,y:.54}, 10:{x:.46,y:.57}, 12:{x:.47,y:.58},
    13:{x:.55,y:.54}, 14:{x:.56,y:.57}, 16:{x:.57,y:.58},
    17:{x:.64,y:.58}, 18:{x:.65,y:.61}, 20:{x:.66,y:.62}
  });
  assert.equal(isFist(raw), true);
});

test('portal connects all five corresponding fingertip pairs', () => {
  const ctx = Object.fromEntries([
    'clearRect','save','restore','beginPath','moveTo','lineTo','closePath','fill','stroke','quadraticCurveTo','arc'
  ].map(name => [name, () => {}]));
  const left = makeLandmarks({
    4:{x:.2,y:.35}, 8:{x:.25,y:.3}, 12:{x:.26,y:.4}, 16:{x:.24,y:.5}, 20:{x:.18,y:.55}
  });
  const right = makeLandmarks({
    4:{x:.8,y:.35}, 8:{x:.75,y:.3}, 12:{x:.74,y:.4}, 16:{x:.76,y:.5}, 20:{x:.82,y:.55}
  });
  const portal = new HandPortal();
  const result = portal.render(ctx, [
    {landmarks:left},{landmarks:right}
  ], 640, 480, 1000);
  assert.equal(result.active, true);
  assert.match(result.gesture, /all five finger pairs linked/);
});

import { COLLEGE_OBJECT_PROMPTS } from '../js/ai-manager.js';

test('real-time object model exposes only its supported common categories', () => {
  assert.ok(COLLEGE_OBJECT_PROMPTS.length >= 20);
  for (const item of ['person','laptop','cell phone','keyboard','book','bottle']) {
    assert.ok(COLLEGE_OBJECT_PROMPTS.includes(item), 'missing common category: ' + item);
  }
  assert.equal(new Set(COLLEGE_OBJECT_PROMPTS).size, COLLEGE_OBJECT_PROMPTS.length);
});

test('portal status reports two valid hand tracks without touching a canvas',()=>{
 const left=makeLandmarks({4:{x:.2,y:.35},8:{x:.25,y:.3},12:{x:.26,y:.4},16:{x:.24,y:.5},20:{x:.18,y:.55}});
 const right=makeLandmarks({4:{x:.8,y:.35},8:{x:.75,y:.3},12:{x:.74,y:.4},16:{x:.76,y:.5},20:{x:.82,y:.55}});
 assert.equal(new HandPortal().status([{landmarks:left},{landmarks:right}]).active,true);
});
test('two detected hands do not activate fist-clear gesture',()=>{
 const tracker=new HandTracker(),open=makeLandmarks({0:{x:.5,y:.8}});
 const r=tracker.process({landmarks:[open,open],handednesses:[[{categoryName:'Left'}],[{categoryName:'Right'}]]},640,480);
 assert.equal(r.hands.length,2);assert.equal(r.fist,false);
});

test('pinchActive scales thumb-index distance against palm dimensions',()=>{
 const raw=makeLandmarks({0:{x:.5,y:.8},5:{x:.4,y:.5},9:{x:.5,y:.45},17:{x:.6,y:.5},4:{x:.5,y:.45},8:{x:.52,y:.45}});
 assert.equal(pinchActive({raw}),true);
});
test('portal status needs two valid 21-point hand landmark sets',()=>{
 const one=makeLandmarks({0:{x:.5,y:.8}});
 assert.equal(new HandPortal().status([{landmarks:one}]).active,false);
 assert.equal(new HandPortal().status([{landmarks:one},{landmarks:one}]).active,true);
});
