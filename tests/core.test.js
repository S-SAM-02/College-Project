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
  assert.equal(pinchActive({ raw: makeLandmarks().slice(0, 10) }, 640), false);
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
