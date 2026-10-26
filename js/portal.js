const TIP_INDEXES=[4,8,12,16,20];
export class HandPortal{
 constructor(){this.active=false;this.smooth=null;}
 status(hands){const active=Array.isArray(hands)&&hands.filter(h=>Array.isArray(h.landmarks)&&h.landmarks.length>=21).length>=2;return{active,gesture:active?"Portal connected · all five finger pairs linked":(hands?.length===1?"Second hand not found":"Show both hands")};}
 render(ctx,hands,width,height,time=performance.now()){
  const state=this.status(hands);if(!state.active){this.active=false;this.smooth=null;return state;}
  const ordered=[...hands.filter(h=>Array.isArray(h.landmarks)&&h.landmarks.length>=21)].sort((a,b)=>a.landmarks[0].x-b.landmarks[0].x),left=ordered[0],right=ordered[1];
  const lt=TIP_INDEXES.map(i=>left.landmarks[i]),rt=TIP_INDEXES.map(i=>right.landmarks[i]);
  if([...lt,...rt].some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))){this.active=false;return{active:false,gesture:"Move both hands fully into view"};}
  const corners=[lt[0],rt[0],rt[4],lt[4]],center=corners.reduce((s,p)=>({x:s.x+p.x/4,y:s.y+p.y/4}),{x:0,y:0});
  if(!this.smooth)this.smooth={...center};this.smooth.x+=(center.x-this.smooth.x)*0.38;this.smooth.y+=(center.y-this.smooth.y)*0.38;
  const pulse=0.5+0.5*Math.sin(time/180);this.active=true;ctx.save();ctx.lineJoin="round";ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(corners[0].x,corners[0].y);for(let i=1;i<corners.length;i++)ctx.lineTo(corners[i].x,corners[i].y);ctx.closePath();ctx.fillStyle=`rgba(198,161,91,${0.045+pulse*0.035})`;ctx.fill();ctx.shadowColor="#c6a15bcc";ctx.shadowBlur=16+pulse*12;ctx.strokeStyle="#c6a15bf0";ctx.lineWidth=2.6;ctx.stroke();ctx.shadowBlur=14;ctx.strokeStyle=`rgba(232,216,176,${0.45+pulse*0.25})`;ctx.lineWidth=1;ctx.stroke();
  for(let i=0;i<TIP_INDEXES.length;i++){const a=lt[i],b=rt[i];ctx.shadowBlur=8+pulse*8;ctx.strokeStyle=`rgba(198,161,91,${0.52+pulse*0.3})`;ctx.lineWidth=i===1?2.5:1.6;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(this.smooth.x+(i-2)*8,this.smooth.y+Math.sin(time/220+i)*9,b.x,b.y);ctx.stroke();for(const point of[a,b]){ctx.beginPath();ctx.arc(point.x,point.y,(i===1?5:3.5)+pulse,0,Math.PI*2);ctx.fillStyle="#fff8e7";ctx.strokeStyle="#c6a15b";ctx.lineWidth=1.4;ctx.fill();ctx.stroke();}}
  const inner=[lt[1],rt[1],rt[3],lt[3]];ctx.shadowBlur=10;ctx.strokeStyle=`rgba(232,216,176,${0.32+pulse*0.24})`;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(inner[0].x,inner[0].y);for(let i=1;i<inner.length;i++)ctx.lineTo(inner[i].x,inner[i].y);ctx.closePath();ctx.stroke();ctx.restore();
  return{active:true,gesture:"Portal connected · all five finger pairs linked"};
 }
 reset(){this.active=false;this.smooth=null;}
}
