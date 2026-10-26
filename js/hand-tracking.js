import { distance, Smoother, clamp } from "./image-processing.js";
export class HandTracker{
 constructor(){this.smoothers=new Map();this.fistFrames=0;this.fistLatched=false;this.nextHandId=1;this.previousHands=[];}
 process(result,width,height){
  const source=Array.isArray(result?.landmarks)?result.landmarks:[],handednesses=Array.isArray(result?.handednesses)?result.handednesses:[];
  const rawHands=source.filter(p=>Array.isArray(p)&&p.length>=21);
  const hands=rawHands.map((raw,index)=>{
   const category=handednesses[index]?.[0]?.categoryName,modelSide=category==="Left"||category==="Right"?category:"Unknown";
   const landmarks=raw.map(p=>({x:clamp(Number(p.x)||0,0,1)*width,y:clamp(Number(p.y)||0,0,1)*height,z:Number(p.z)||0})),wrist=landmarks[0];
   let prior=null,best=Infinity;
   for(const old of this.previousHands){if(old.used||(modelSide!=="Unknown"&&old.modelSide!=="Unknown"&&old.modelSide!==modelSide))continue;const d=distance(wrist,old.wrist);if(d<best){best=d;prior=old;}}
   let id;if(prior&&best<Math.min(width,height)*0.4){id=prior.id;prior.used=true;}else id=this.nextHandId++;
   if(!this.smoothers.has(String(id)))this.smoothers.set(String(id),new Smoother(0.82));
   const indexTip=this.smoothers.get(String(id)).update(landmarks[8]);
   return{id,modelSide,side:modelSide==="Unknown"?"Hand "+(index+1):modelSide,landmarks,indexTip,thumbTip:landmarks[4],wrist,raw};
  });
  this.previousHands=hands.map(h=>({id:h.id,modelSide:h.modelSide,wrist:h.wrist,used:false}));
  const fist=hands.length===1&&isFist(hands[0].raw);this.fistFrames=fist?Math.min(this.fistFrames+1,12):0;if(this.fistFrames>=5)this.fistLatched=true;if(!fist)this.fistLatched=false;
  return{hands,fist:this.fistLatched};
 }
 reset(){this.smoothers.clear();this.fistFrames=0;this.fistLatched=false;this.previousHands=[];this.nextHandId=1;}
}
export function pinchActive(hand){
 const lm=hand?.raw;if(!Array.isArray(lm)||lm.length<21)return false;
 const scale=Math.max(distance(lm[5],lm[17]),distance(lm[0],lm[9])*0.7,0.0001);
 return distance(lm[4],lm[8])/scale<0.72;
}
export function isFist(lm){
 if(!Array.isArray(lm)||lm.length<21)return false;
 const fingers=[[8,6,5],[12,10,9],[16,14,13],[20,18,17]];let curled=0;
 for(const[tip,pip,mcp]of fingers){const tw=distance(lm[tip],lm[0]),pw=distance(lm[pip],lm[0]),tm=distance(lm[tip],lm[mcp]);if(tw<pw*1.2||tm<distance(lm[mcp],lm[0])*0.68)curled++;}
 return curled>=3;
}
export function drawHandSkeleton(ctx,hands){
 const links=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
 ctx.save();ctx.lineWidth=3;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#168BFF";ctx.fillStyle="#EAF5FF";ctx.shadowColor="#168BFF88";ctx.shadowBlur=7;
 for(const hand of hands){for(const[a,b]of links){const p=hand.landmarks[a],q=hand.landmarks[b];ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}for(const i of[0,4,8,12,16,20]){const p=hand.landmarks[i];ctx.beginPath();ctx.arc(p.x,p.y,i===8?5:3.5,0,Math.PI*2);ctx.fill();ctx.stroke();}}
 ctx.restore();
}
