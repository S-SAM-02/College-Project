export class CameraController{
 constructor(video,onState,onDimensions){this.video=video;this.onState=onState;this.onDimensions=onDimensions;this.stream=null;this.devices=[];this.facingMode="user"}
 async enumerate(){if(!navigator.mediaDevices?.enumerateDevices)return[];this.devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput");return this.devices}
 async start(deviceId="",facingMode="user"){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access is unavailable. Open this site over HTTPS or localhost in a supported browser.");
  await this.stop(false);this.facingMode=facingMode;this.onState("requesting","Requesting camera permission…");
  const common={width:{ideal:640},height:{ideal:360},frameRate:{ideal:30,max:30}};
  const attempts=deviceId?[{...common,deviceId:{exact:deviceId}},{...common,facingMode},{ }]:[{...common,facingMode},{...common},{ }];
  let lastError;
  for(const videoConstraints of attempts){try{this.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:Object.keys(videoConstraints).length?videoConstraints:true});break}catch(e){lastError=e;if(e.name==="NotAllowedError"||e.name==="PermissionDeniedError")throw e}}
  if(!this.stream)throw lastError||new Error("No usable camera was found.");
  try{
   this.video.srcObject=this.stream;
   await new Promise((resolve,reject)=>{if(this.video.readyState>=1&&this.video.videoWidth)return resolve();let settled=false;const finish=(fn,v)=>{if(settled)return;settled=true;clearTimeout(timer);this.video.removeEventListener("loadedmetadata",loaded);this.video.removeEventListener("error",failed);fn(v)};const loaded=()=>finish(resolve);const failed=()=>finish(reject,new Error("Camera stream could not be displayed."));const timer=setTimeout(()=>finish(reject,new Error("Camera connected but did not provide a video frame. Check the camera permission and try again.")),12000);this.video.addEventListener("loadedmetadata",loaded);this.video.addEventListener("error",failed)});
   await this.video.play();
  }catch(e){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;throw e}
  const track=this.stream.getVideoTracks()[0];this.onDimensions(this.video.videoWidth,this.video.videoHeight,track?.getSettings?.()||{});this.onState("running","Camera connected");track?.addEventListener("ended",()=>this.onState("offline","Camera disconnected"));return this.enumerate()
 }
 async stop(update=true){if(this.stream)this.stream.getTracks().forEach(t=>t.stop());this.stream=null;this.video.pause();this.video.srcObject=null;if(update)this.onState("offline","Camera offline")}
}