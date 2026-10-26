import{distance,Smoother,clamp}from'./image-processing.js';
export class HandTracker{
 constructor(){this.smoothers=new Map();this.fistFrames=0;this.fistLatched=false;this.lastSides=[]}
 process(result,w,h){
  const source=result?.landmarks||[],rawSides=result?.handednesses||[];
  const hands=source.map((raw,index)=>{
   const canonical=rawSides[index]?.[0]?.categoryName;
   const side=canonical==='Left'||canonical==='Right'?canonical:'Hand '+(index+1);
   const landmarks=raw.map(p=>({x:clamp(p.x,0,1)*w,y:clamp(p.y,0,1)*h,z:p.z||0}));
   const key=side+'-'+index;
   if(!this.smoothers.has(key))this.smoothers.set(key,new Smoother(.55));
   const indexTip=this.smoothers.get(key).update(landmarks[8]);
   return{side,landmarks,indexTip,thumbTip:landmarks[4],wrist:landmarks[0],raw};
  });
  const fist=hands.length>0&&hands.every(hand=>isFist(hand.raw));
  this.fistFrames=fist?Math.min(this.fistFrames+1,12):0;
  if(this.fistFrames>=4)this.fistLatched=true;
  if(!fist)this.fistLatched=false;
  return{hands,fist:this.fistLatched};
 }
 reset(){this.smoothers.clear();this.fistFrames=0;this.fistLatched=false;this.lastSides=[]}
}
export function pinchActive(hand,width){
 if(!hand||!hand.raw||hand.raw.length<21)return false;
 const palm=distance(hand.raw[5],hand.raw[17]);
 const pinch=distance(hand.raw[4],hand.raw[8]);
 return pinch<Math.max(.035,palm*.32);
}
export function isFist(lm){
 if(!Array.isArray(lm)||lm.length<21)return false;
 const curled=[[8,6,5],[12,10,9],[16,14,13],[20,18,17]];
 let count=0;
 for(const[tip,pip,mcp]of curled){
  const tipP=lm[tip],pipP=lm[pip],mcpP=lm[mcp];
  const tipToPalm=distance(tipP,lm[0]),pipToPalm=distance(pipP,lm[0]);
  if(tipToPalm<pipToPalm*1.06&&distance(tipP,mcpP)<.23)count++;
 }
 return count>=3;
}
export function drawHandSkeleton(ctx,hands){
 const pairs=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
 ctx.save();ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#C6A15B';ctx.fillStyle='#FFF9E9';ctx.shadowColor='#c6a15b59';ctx.shadowBlur=4;
 for(const h of hands){for(const[a,b]of pairs){ctx.beginPath();ctx.moveTo(h.landmarks[a].x,h.landmarks[a].y);ctx.lineTo(h.landmarks[b].x,h.landmarks[b].y);ctx.stroke()}for(const i of[0,4,8,12,16,20]){const p=h.landmarks[i];ctx.beginPath();ctx.arc(p.x,p.y,i===8?4:2.5,0,Math.PI*2);ctx.fill();ctx.stroke()}}
 ctx.restore();
}