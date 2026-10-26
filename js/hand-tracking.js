import { distance, Smoother, clamp } from "./image-processing.js";

const LANDMARK_COUNT=21;
const SKELETON_LINKS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];

export class HandTracker {
  constructor() {
    this.smoothers = new Map();
    this.fistFrames = 0;
    this.nextHandId = 1;
    this.previousHands = [];
  }

  process(result, width, height) {
    const canvasWidth=Math.max(1,Number(width)||1),canvasHeight=Math.max(1,Number(height)||1);
    const source=Array.isArray(result?.landmarks)?result.landmarks:[];
    const handednesses=Array.isArray(result?.handednesses)?result.handednesses:[];
    const rawHands=source.filter(points=>Array.isArray(points)&&points.length>=LANDMARK_COUNT&&points.every(p=>Number.isFinite(Number(p?.x))&&Number.isFinite(Number(p?.y))));
    const usedPrevious=new Set();

    const hands=rawHands.map((raw,index)=>{
      const side=handednesses[index]?.[0]?.categoryName;
      const modelSide=side==="Left"||side==="Right"?side:"Unknown";
      const normalized=raw.slice(0,LANDMARK_COUNT).map(p=>({x:clamp(Number(p.x),0,1),y:clamp(Number(p.y),0,1),z:Number(p.z)||0}));
      const landmarks=normalized.map(p=>({x:p.x*canvasWidth,y:p.y*canvasHeight,z:p.z}));
      const wrist=landmarks[0];
      let previous=null,bestDistance=Infinity;
      for(const old of this.previousHands){
        if(usedPrevious.has(old.id))continue;
        if(modelSide!=="Unknown"&&old.modelSide!=="Unknown"&&modelSide!==old.modelSide)continue;
        const d=distance(wrist,old.wrist);
        if(d<bestDistance){bestDistance=d;previous=old;}
      }
      const id=previous&&bestDistance<Math.min(canvasWidth,canvasHeight)*0.55?previous.id:this.nextHandId++;
      if(previous&&id===previous.id)usedPrevious.add(previous.id);
      if(!this.smoothers.has(id))this.smoothers.set(id,new Smoother(0.62));
      const indexTip=this.smoothers.get(id).update(landmarks[8]);
      return {id,modelSide,side:modelSide==="Unknown"?"Hand "+(index+1):modelSide,landmarks,indexTip,thumbTip:landmarks[4],wrist,raw:normalized};
    });
    this.previousHands=hands.map(h=>({id:h.id,modelSide:h.modelSide,wrist:h.wrist}));
    const fist=hands.length===1&&isFist(hands[0].raw);
    this.fistFrames=fist?Math.min(this.fistFrames+1,10):0;
    // A lost hand resets its gesture state but does not discard the currently selected mode.
    return {hands,fist:this.fistFrames>=3};
  }

  reset(){this.smoothers.clear();this.fistFrames=0;this.previousHands=[];this.nextHandId=1;}
}

export function pinchActive(hand) {
  const lm=hand?.raw;
  if(!Array.isArray(lm)||lm.length<LANDMARK_COUNT)return false;
  const palmWidth=distance(lm[5],lm[17]),palmLength=distance(lm[0],lm[9]);
  const scale=Math.max(palmWidth,palmLength*0.72,0.0001);
  const ratio=distance(lm[4],lm[8])/scale;
  return Number.isFinite(ratio)&&ratio<0.9;
}

export function isFist(lm) {
  if(!Array.isArray(lm)||lm.length<LANDMARK_COUNT)return false;
  const fingers=[[8,6,5],[12,10,9],[16,14,13],[20,18,17]];
  let curled=0;
  for(const [tip,pip,mcp] of fingers){
    const tipDistance=distance(lm[tip],lm[0]),pipDistance=distance(lm[pip],lm[0]),tipToMcp=distance(lm[tip],lm[mcp]);
    if(tipDistance<pipDistance*1.22||tipToMcp<distance(lm[mcp],lm[0])*0.7)curled++;
  }
  return curled>=3;
}

export function drawHandSkeleton(ctx,hands) {
  ctx.save();ctx.lineWidth=3;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#168BFF";ctx.fillStyle="#EAF5FF";ctx.shadowColor="#168BFF88";ctx.shadowBlur=6;
  for(const hand of Array.isArray(hands)?hands:[]){
    const points=hand?.landmarks;
    if(!Array.isArray(points)||points.length<LANDMARK_COUNT||points.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y)))continue;
    for(const [a,b] of SKELETON_LINKS){const p=points[a],q=points[b];ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    for(const i of [0,4,8,12,16,20]){const p=points[i];ctx.beginPath();ctx.arc(p.x,p.y,i===8?5:3.5,0,Math.PI*2);ctx.fill();ctx.stroke();}
  }
  ctx.restore();
}
