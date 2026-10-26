import test from 'node:test';import assert from 'node:assert/strict';import{formatCount,mapBox,overlapRatio,distance,Smoother}from'../js/image-processing.js';import{parseCommand}from'../js/nlp.js';import{countPeople}from'../js/person-counter.js';import{filterObjectsNearHands}from'../js/object-in-hand.js';test('box mapping',()=>assert.deepEqual(mapBox([10,20,30,40],100,200,200,400),[20,40,60,80]));test('count formatting',()=>{assert.equal(formatCount(0),'0');assert.equal(formatCount(4),'4');assert.equal(formatCount(16),'Above 15');assert.equal(formatCount(-1),'—')});test('equal box overlap',()=>assert.equal(overlapRatio([0,0,10,10],[0,0,10,10]),1));test('separate box overlap',()=>assert.equal(overlapRatio([0,0,10,10],[20,20,3,3]),0));test('distance',()=>assert.equal(distance({x:0,y:0},{x:3,y:4}),5));test('smoothing',()=>{const s=new Smoother(.5);s.update({x:0,y:0});assert.deepEqual(s.update({x:10,y:10}),{x:5,y:5})});test('mode command parsing',()=>{assert.equal(parseCommand('open object finder').mode,'objects');assert.equal(parseCommand('start hand drawing').mode,'drawing');assert.equal(parseCommand('activate portal').mode,'portal');assert.equal(parseCommand('show person count').mode,'people')});test('action command parsing',()=>{assert.equal(parseCommand('reset the drawing').action,'clearDrawing');assert.equal(parseCommand('stop camera').action,'stopCamera')});test('unrecognized command rejected',()=>assert.equal(parseCommand('teleport to mars').ok,false));test('person thresholding includes lower-confidence person boxes',()=>assert.equal(countPeople([{class:'person',score:.9},{class:'person',score:.3},{class:'book',score:.9}]),'2'));
test('person counter supports at least ten visible person boxes',()=>assert.equal(countPeople(Array.from({length:10},()=>({class:'person',score:.26}))), '10'));
test('open-vocabulary labels normalize requested everyday objects',()=>{assert.equal(normalizeObjectLabel('mobile phone'),'mobile_phone');assert.equal(normalizeObjectLabel('identity card'),'id_card');assert.equal(normalizeObjectLabel('electrical wire'),'cable');assert.equal(normalizeObjectLabel('flower pot'),'flowerpot');assert.equal(normalizeObjectLabel('ballpoint pen'),'pen')});
test('open-vocabulary mapping clamps boxes and merges duplicate prompt matches',()=>{const found=mapOpenVocabularyDetections([{label:'mobile phone',score:.32,box:{xmin:10,ymin:10,xmax:80,ymax:70}},{label:'smartphone',score:.3,box:{xmin:11,ymin:10,xmax:79,ymax:70}},{label:'pen',score:.25,box:{xmin:90,ymin:15,xmax:110,ymax:50}}],100,80,.1);assert.equal(found.length,2);assert.equal(found[0].class,'mobile_phone');assert.deepEqual(found[1].bbox,[90,15,10,35])});
import { HandTracker, pinchActive, isFist } from '../js/hand-tracking.js';
import { normalizeObjectLabel, mapOpenVocabularyDetections } from '../js/ai-manager.js';
import { AirDrawing } from '../js/drawing.js';
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
  ]),'3');
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
  const calls = { moveTo:0, lineTo:0, stroke:0, fill:0, quadraticCurveTo:0 };
  const ctx = Object.fromEntries([
    'clearRect','save','restore','beginPath','closePath','arc','moveTo','lineTo','fill','stroke','quadraticCurveTo'
  ].map(name => [name, () => { calls[name]=(calls[name]||0)+1; }]));
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
  assert.match(result.gesture, /three straight fingertip links/);
  assert.equal(calls.stroke, 4, "three links plus one rectangular frame");
  assert.equal(calls.lineTo, 6, "three straight links plus three rectangle edges");
  assert.equal(calls.quadraticCurveTo, 0, "portal uses no animated curves");
  assert.equal(calls.fill, 0, "portal draws no duplicate filled overlay");
});

test('object detector uses the fast local COCO-SSD loader',()=>{
 const manager = new AIManager(()=>{},()=>{});
 assert.equal(typeof manager.loadObjects,'function');
 assert.equal(typeof manager.ensureMode,'function');
 assert.equal(manager.objectModel,null);
 manager.dispose();
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

test('Object Finder filters detections to objects near tracked hands',()=>{
 const landmarks=Array.from({length:21},(_,i)=>({x:200+(i%4)*5,y:120+Math.floor(i/4)*5,z:0}));
 const hands=[{landmarks}];
 const predictions=[
  {class:'bottle',score:.8,bbox:[215,130,35,45]},
  {class:'chair',score:.9,bbox:[400,120,70,100]},
  {class:'person',score:.99,bbox:[210,130,30,40]},
  {class:'cup',score:.15,bbox:[210,130,20,25]}
 ];
 const found=filterObjectsNearHands(predictions,hands,640,480);
 assert.deepEqual(found.map(item=>item.class),['bottle']);
});
test('Object Finder still returns scene detections when hand tracking is unavailable',()=>{
 assert.deepEqual(filterObjectsNearHands([{class:'bottle',score:.9,bbox:[20,20,80,100]}],[],640,480).map(p=>p.class),['bottle']);
});

test('object model and one-hand localization are independent',()=>{
 const predictions=[{class:'bottle',score:.8,bbox:[20,20,50,80]},{class:'chair',score:.9,bbox:[300,200,70,70]},{class:'person',score:.99,bbox:[15,20,50,80]}];
 assert.deepEqual(predictions.filter(p=>p.class!=='person'&&p.class!=='face').map(p=>p.class),['bottle','chair']);
 const landmarks=Array.from({length:21},(_,i)=>({x:70+(i%4)*10,y:55+Math.floor(i/4)*10,z:0}));
 assert.deepEqual(filterObjectsNearHands(predictions,[{landmarks}],640,480).map(p=>p.class),['bottle']);
});

test('hand tracker rejects malformed landmark coordinates instead of emitting broken points',()=>{
 const tracker=new HandTracker();
 const invalid=makeLandmarks({8:{x:NaN,y:0.5}});
 assert.equal(tracker.process({landmarks:[invalid]},640,480).hands.length,0);
});
test('hand tracker tolerates absent handedness metadata',()=>{
 const tracker=new HandTracker(),raw=makeLandmarks({0:{x:0.5,y:0.25}});
 const result=tracker.process({landmarks:[raw]},800,400);
 assert.equal(result.hands.length,1);
 assert.equal(result.hands[0].side,'Hand 1');
 assert.equal(result.hands[0].landmarks[0].x,400);
 assert.equal(result.hands[0].landmarks[0].y,100);
});

test('Object Finder does not require hand tracking to return visible objects',()=>{
 const predictions=[{class:'bottle',score:.8,bbox:[20,20,50,80]},{class:'chair',score:.9,bbox:[300,200,70,70]},{class:'person',score:.99,bbox:[15,20,50,80]}];
 assert.deepEqual(filterObjectsNearHands(predictions,[],640,480).map(p=>p.class),['chair','bottle']);
});

test('fist erases only a local circular area instead of clearing the canvas', () => {
  const calls = { clearRect: 0, arc: [], composite: [] };
  const ctx = {
    save(){}, restore(){}, beginPath(){}, clearRect(){ calls.clearRect++; },
    arc(x,y,r){ calls.arc.push({x,y,r}); }, fill(){},
    set globalCompositeOperation(value){ calls.composite.push(value); },
    set shadowBlur(value){}
  };
  const canvas = { width: 640, height: 360, getContext(){ return ctx; } };
  const drawing = new AirDrawing(canvas);
  const landmarks = Array.from({length:21},(_,i)=>({x:100+(i%5)*4,y:80+Math.floor(i/5)*4}));
  const result = drawing.process([{landmarks}], true);
  assert.equal(calls.clearRect, 0);
  assert.equal(calls.arc.length, 1);
  assert.ok(calls.arc[0].r > 0);
  assert.ok(calls.composite.includes('destination-out'));
  assert.match(result.gesture, /erase locally/);
});

test('drawing preserves existing ink when hand is lost and does not connect separate pinches', () => {
 const calls={clearRect:0,moveTo:[],lineTo:[],arc:[],strokes:0};
 const ctx={save(){},restore(){},beginPath(){},clearRect(){calls.clearRect++},moveTo(x,y){calls.moveTo.push([x,y])},lineTo(x,y){calls.lineTo.push([x,y])},stroke(){calls.strokes++},arc(x,y,r){calls.arc.push([x,y,r])},fill(){},set strokeStyle(v){},set fillStyle(v){},set lineWidth(v){},set lineCap(v){},set lineJoin(v){},set shadowColor(v){},set shadowBlur(v){},set globalCompositeOperation(v){}};
 const canvas={width:640,height:360,getContext(){return ctx}};
 const drawing=new AirDrawing(canvas);
 const makeHand=(pinch)=>{const raw=Array.from({length:21},(_,i)=>({x:.25+(i%5)*.03,y:.25+Math.floor(i/5)*.03,z:0}));raw[4]={x:.25,y:.25};raw[8]={x:pinch?.255:.32,y:.25};return {raw,indexTip:{x:100,y:100},landmarks:raw.map(p=>({x:p.x*640,y:p.y*360}))};};
 drawing.process([makeHand(true)],false);
 drawing.process([],false);
 drawing.process([makeHand(true)],false);
 drawing.process([makeHand(false)],false);
 assert.equal(calls.clearRect,0);
 assert.equal(calls.lineTo.length,0,"new pinch after a release starts a new stroke");
});
