export class CameraController{
 constructor(video,onState,onDimensions){this.video=video;this.onState=onState;this.onDimensions=onDimensions;this.stream=null;this.devices=[];this.facingMode="user"}
 async enumerate(){if(!navigator.mediaDevices?.enumerateDevices)return[];this.devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput");return this.devices}
 async start(deviceId="",facingMode="user",quality="balanced"){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access is unavailable. Open this site over HTTPS or localhost in a supported browser.");
  await this.stop(false);this.facingMode=facingMode;this.onState("requesting","Requesting camera permission…");
  // Prefer the selected camera quality, retaining lighter fallbacks for older webcams.
  const presets={balanced:{width:960,height:540,fps:30},detail:{width:1280,height:720,fps:30},maximum:{width:1920,height:1080,fps:24}};
  const selected=presets[quality]||presets.balanced;
  const common={width:{ideal:selected.width},height:{ideal:selected.height},frameRate:{ideal:selected.fps,max:selected.fps}};
  const fallback={width:{ideal:960},height:{ideal:540},frameRate:{ideal:24,max:30}};
  const light={width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}};
  const attempts=deviceId
   ?[{...common,deviceId:{exact:deviceId}},{...fallback,deviceId:{exact:deviceId}},{...common,facingMode},{...fallback,facingMode},{...light,facingMode},{video:true}]
   :[{...common,facingMode},{...fallback,facingMode},{...light,facingMode},{...common},{video:true}];
  let lastError;
  for(const constraint of attempts){
   try{
    const videoConstraints=constraint.video===true?true:constraint;
    this.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:videoConstraints});
    break;
   }catch(e){
    lastError=e;
    if(e.name==="NotAllowedError"||e.name==="PermissionDeniedError"||e.name==="SecurityError")throw e;
    if(e.name==="OverconstrainedError"&&deviceId)continue;
   }
  }
  if(!this.stream)throw lastError||new Error("No usable camera was found.");
  try{
   this.video.srcObject=this.stream;
   this.video.muted=true;
   this.video.autoplay=true;
   this.video.playsInline=true;
   await new Promise((resolve,reject)=>{
    if(this.video.readyState>=1&&this.video.videoWidth)return resolve();
    let settled=false;
    const finish=(fn,v)=>{if(settled)return;settled=true;clearTimeout(timer);this.video.removeEventListener("loadedmetadata",loaded);this.video.removeEventListener("error",failed);fn(v)};
    const loaded=()=>finish(resolve);
    const failed=()=>finish(reject,new Error("Camera stream could not be displayed."));
    const timer=setTimeout(()=>finish(reject,new Error("Camera connected but did not provide a video frame. Check camera permissions and retry.")),12000);
    this.video.addEventListener("loadedmetadata",loaded);this.video.addEventListener("error",failed);
   });
   await this.video.play();
   if(!this.video.videoWidth||!this.video.videoHeight)throw new Error("Camera opened but no image frames are available yet.");
  }catch(e){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;throw e}
  const stream=this.stream,track=stream.getVideoTracks()[0];
  this.onDimensions(this.video.videoWidth,this.video.videoHeight,track?.getSettings?.()||{});
  this.onState("running","Camera connected");
  track?.addEventListener("ended",()=>{if(this.stream===stream)this.onState("offline","Camera disconnected")});
  return this.enumerate();
 }
 async stop(update=true){if(this.stream)this.stream.getTracks().forEach(t=>t.stop());this.stream=null;this.video.pause();this.video.srcObject=null;if(update)this.onState("offline","Camera offline")}
}