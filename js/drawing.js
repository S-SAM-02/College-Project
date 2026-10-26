import { Smoother } from "./image-processing.js";
import { pinchActive } from "./hand-tracking.js";
export class AirDrawing{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext("2d");this.smoother=new Smoother(0.42);this.lastPoint=null;this.enabled=true;this.wasFist=false;}
 process(hands,fist){
  const hand=Array.isArray(hands)&&hands.length?hands[0]:null;
  if(fist){if(!this.wasFist)this.clear();this.wasFist=true;return{drawing:false,gesture:"Fist detected · canvas cleared"};}this.wasFist=false;
  if(!this.enabled||!hand){this.lastPoint=null;this.smoother.reset();return{drawing:false,gesture:hand?"Drawing paused":"No hand landmarks"};}
  if(pinchActive(hand)){const point=this.smoother.update(hand.indexTip);
   if(this.lastPoint){const ctx=this.ctx;ctx.save();ctx.strokeStyle="#F0C96D";ctx.lineWidth=Math.max(3,this.canvas.width*0.004);ctx.lineCap="round";ctx.lineJoin="round";ctx.shadowColor="#c6a15b38";ctx.shadowBlur=2;ctx.beginPath();ctx.moveTo(this.lastPoint.x,this.lastPoint.y);ctx.lineTo(point.x,point.y);ctx.stroke();ctx.restore();}
   else{this.ctx.beginPath();this.ctx.arc(point.x,point.y,Math.max(1.5,this.canvas.width*0.002),0,Math.PI*2);this.ctx.fillStyle="#F0C96D";this.ctx.fill();}
   this.lastPoint=point;return{drawing:true,gesture:"Pinch detected · drawing"};
  }
  this.lastPoint=null;this.smoother.reset();return{drawing:false,gesture:"Bring thumb and index closer to draw"};
 }
 clear(){this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.lastPoint=null;this.smoother.reset();}
 pause(){this.enabled=false;this.lastPoint=null;this.smoother.reset();}resume(){this.enabled=true;}
}
