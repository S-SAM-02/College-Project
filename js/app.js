import{CameraController}from"./camera.js";import{AIManager}from"./ai-manager.js";import{resizeCanvases}from"./image-processing.js";import{HandTracker,drawHandSkeleton}from"./hand-tracking.js";import{AirDrawing}from"./drawing.js";import{HandPortal}from"./portal.js";import{parseCommand}from"./nlp.js";import{PerformanceMeter}from"./performance.js";import{describePeople}from"./person-counter.js";
const $=id=>document.getElementById(id),video=$("cameraVideo"),frame=$("cameraFrame"),overlay=$("overlayCanvas"),ink=$("inkCanvas"),ctx=overlay.getContext("2d");let preferredFacing="user",mode="objects",session=false,inferenceBusy=false,raf=0,lastInference=0,lastHandInferenceAt=0,handLoadNoticeShown=false,latestObjects=[],latestHands=[],stableClass=null,stableScore=0,faceCountNote=false,videoFrameToken=null,renderFpsFrames=0,renderFpsWindowStart=performance.now(),lastHandResultCount=0;const camera=new CameraController(video,onCameraState,onDimensions),handTracker=new HandTracker(),drawing=new AirDrawing(ink),portal=new HandPortal(),modelStates={object:"idle",hand:"idle"};const ai=new AIManager(onModelState,setNotice),meter=new PerformanceMeter(({inferenceMs})=>{$("inferenceStatus").textContent=inferenceMs>0?"AI "+Math.round(inferenceMs)+" ms":"Waiting"});
const configs={objects:{title:"Object intelligence",label:"OBJECT FINDER",metric:"DETECTIONS",confidence:"CONFIDENCE",gesture:"TRACKING",main:"Ready when<br>you are.",description:"Start the camera to identify visible everyday objects."},drawing:{title:"Air drawing",label:"AIR DRAWING",metric:"HAND TRACK",confidence:"MODEL",gesture:"GESTURE STATE",main:"Make an idea<br>visible.",description:"Pinch thumb and index finger to draw; close your hand into a fist to clear."},portal:{title:"Two-hand portal",label:"TWO-HAND PORTAL",metric:"HANDS TRACKED",confidence:"MODEL",gesture:"CONNECTION",main:"Bring two points<br>together.",description:"Show both hands to link thumb-to-thumb, index-to-index and the other finger pairs inside the portal frame."},people:{title:"Person finder",label:"PERSON FINDER",metric:"FACES VISIBLE",confidence:"MODEL",gesture:"DETECTION",main:"The scene, in<br>clear numbers.",description:"Counts visible face detections locally. It does not identify people."}};
function setNotice(m){$("noticeText").textContent=m}function feedback(m){$("commandFeedback").textContent=m}function cameraLoading(on,text="Preparing camera…"){$("cameraLoading").hidden=!on;$("loadingLabel").textContent=text}
function onCameraState(state,message){const s=$("sessionStatus"),wrap=s.parentElement;s.textContent=message;wrap.classList.toggle("ready",state==="running");wrap.classList.toggle("error",state==="error");if(state==="running"){session=true;frame.classList.add("running");$("stopCamera").hidden=false;$("cameraSelect").disabled=false;$("engineStatus").textContent="Camera ready";cameraLoading(false);startLoop()}else if(state==="offline"){session=false;frame.classList.remove("running");$("stopCamera").hidden=true;$("cameraSelect").disabled=true;$("resolutionLabel").textContent="— × —";$("engineStatus").textContent="Not initialized";$("inferenceStatus").textContent="Waiting";$("fpsLabel").textContent="— render FPS";cancelFrameScheduler();ctx.clearRect(0,0,overlay.width,overlay.height);meter.reset()}else if(state==="requesting")cameraLoading(true,message);else if(state==="error"){session=false;frame.classList.remove("running");cameraLoading(false);$("stopCamera").hidden=true}}
function applyCameraOrientation(){const mirrored=preferredFacing==="user";video.classList.toggle("mirrored-preview",mirrored);overlay.classList.remove("mirrored-overlay");ink.classList.toggle("mirrored-overlay",mirrored);overlay.dataset.mirrored=String(mirrored);ink.dataset.mirrored=String(mirrored)}
function onDimensions(w,h,settings){resizeCanvases(video,[overlay,ink]);$("resolutionLabel").textContent=(settings.width||w)+" × "+(settings.height||h);applyCameraOrientation()}
function onModelState(model,state,message){modelStates[model]=state;const p=model==="object"?"object":"hand",status=$(p+"ModelStatus"),tag=$(p+"ModelTag"),dot=$(p+"ModelDot");status.textContent=message;tag.textContent=state==="ready"?"READY":state==="loading"?"LOAD":state==="error"?"ERROR":state==="loaded"?"TEST":"IDLE";dot.textContent=state==="ready"?"✓":state==="error"?"!":state==="loading"?"·":"○";dot.parentElement.classList.toggle("ready",state==="ready");dot.parentElement.classList.toggle("error",state==="error");$("modelCount").textContent=Object.values(modelStates).filter(s=>s==="ready").length+" / 2 READY";if(state==="error")setNotice(message);if(state==="ready"||state==="loaded")$("engineStatus").textContent=model==="hand"?"Local hand tracking ready":mode==="people"?"Local face detector ready":"Local object detector ready"}
function updateModeUI(){document.querySelectorAll(".mode-button").forEach(b=>{b.classList.toggle("active",b.dataset.mode===mode);b.setAttribute("aria-pressed",String(b.dataset.mode===mode))});const c=configs[mode];$("resultTitle").textContent=c.title;$("visionLabel").textContent=c.label;$("metricLabel").textContent=c.metric;$("confidenceLabel").textContent=c.confidence;$("gestureLabel").textContent=c.gesture;$("resultMain").innerHTML=c.main;$("resultDescription").textContent=c.description;$("metricValue").textContent="—";$("confidenceValue").textContent="—";$("gestureValue").textContent="Waiting";ctx.clearRect(0,0,overlay.width,overlay.height)}
async function setMode(next){if(!configs[next])return;mode=next;lastInference=0;latestObjects=[];latestHands=[];stableClass=null;stableScore=0;portal.reset();handTracker.reset();ctx.clearRect(0,0,overlay.width,overlay.height);if(next==="drawing"){drawing.resume();drawing.clear();}updateModeUI();if(session){try{setNotice("Preparing "+configs[mode].title+"…");await ai.ensureMode(mode, preferredFacing);if(mode==="drawing"||mode==="portal")drawing.resume();setNotice(mode==="drawing"||mode==="portal"?"Hand tracking runs locally; show your full hand(s) in frame.":"Waiting for the next camera analysis…")}catch(e){setNotice(e.message)}}}
async function startCamera(facing=preferredFacing){if(session&&camera.facingMode===facing)return;try{cameraLoading(true,"Requesting camera permission…");const devices=await camera.start($("cameraSelect").value,facing);preferredFacing=facing;populateCameras(devices);updateFacingButtons();applyCameraOrientation();await setupMode();cameraLoading(false)}catch(e){const m=friendlyCameraError(e);onCameraState("error",m);setNotice(m);feedback(m)}}
function friendlyCameraError(e){if(["NotAllowedError","PermissionDeniedError"].includes(e.name))return"Camera permission denied. Allow camera access in browser site settings, then retry.";if(["NotFoundError","DevicesNotFoundError"].includes(e.name))return"No camera was found. Connect a camera or choose an available device.";if(["NotReadableError","TrackStartError"].includes(e.name))return"The camera is busy. Close other apps using it and retry.";return e.message||"Camera startup failed. Use HTTPS or localhost and check browser permissions."}
function populateCameras(devices){const s=$("cameraSelect"),old=s.value;s.replaceChildren();s.add(new Option("Automatic camera",""));devices.forEach((d,i)=>s.add(new Option(d.label||"Camera "+(i+1),d.deviceId)));s.disabled=devices.length===0;if(devices.some(d=>d.deviceId===old))s.value=old}function updateFacingButtons(){$("cameraFacingSelect").value=preferredFacing}
async function switchCamera(){if(!session)return;try{cameraLoading(true,"Switching camera…");const ds=await camera.start($("cameraSelect").value,preferredFacing);populateCameras(ds);resizeCanvases(video,[overlay,ink]);applyCameraOrientation();await setupMode();cameraLoading(false)}catch(e){const m=friendlyCameraError(e);onCameraState("error",m);setNotice(m);feedback(m)}}
async function stopCamera(){cancelAnimationFrame(raf);await camera.stop();latestObjects=[];latestHands=[];handTracker.reset();portal.reset();onCameraState("offline","Camera offline")}
async function setupMode(){if(!session)return;try{await ai.ensureMode(mode, preferredFacing);$("engineStatus").textContent=mode==="drawing"||mode==="portal"?"MediaPipe hand engine ready":mode==="people"?"Local face detector ready":"COCO-SSD Lite object detector ready";setNotice(mode==="drawing"||mode==="portal"?"Hand landmarks are processed locally on this device.":"Waiting for the next analysis frame.")}catch(e){$("engineStatus").textContent="Initialization failed";setNotice(e.message)}}
function cancelFrameScheduler(){
 if(videoFrameToken!==null&&video.cancelVideoFrameCallback){try{video.cancelVideoFrameCallback(videoFrameToken)}catch{}videoFrameToken=null}
 cancelAnimationFrame(raf)
}
function startLoop(){
 cancelFrameScheduler();renderFpsFrames=0;renderFpsWindowStart=performance.now();
 const hasVideoCallback=typeof video.requestVideoFrameCallback==="function";
 const schedulePreview=()=>{if(session)raf=requestAnimationFrame(renderPreview)};
 const renderPreview=now=>{
  if(!session)return;
  renderFpsFrames++;
  if(now-renderFpsWindowStart>=500){$("fpsLabel").textContent=Math.round(renderFpsFrames*1000/(now-renderFpsWindowStart))+" preview FPS";renderFpsFrames=0;renderFpsWindowStart=now}
  if(video.readyState>=2&&video.videoWidth){
   if(overlay.width!==video.videoWidth||overlay.height!==video.videoHeight)resizeCanvases(video,[overlay,ink]);
   renderOverlay(now);
  }
  schedulePreview();
 };
 const onVideoFrame=(now,meta={})=>{
  if(!session)return;
  if(video.readyState>=2&&video.videoWidth){
   const mediaTime=Number.isFinite(meta.mediaTime)?meta.mediaTime:video.currentTime;
   if(mode==="drawing"||mode==="portal"){
    if(!ai.handLandmarker&&!ai.loading.hand&&!handLoadNoticeShown){
     handLoadNoticeShown=true;setNotice("Loading asynchronous hand landmarks (up to two hands)…");
     ai.loadHands().catch(e=>{onModelState("hand","error",e.message);handLoadNoticeShown=false});
    }
    if(ai.handLandmarker&&mediaTime!==lastHandInferenceAt){
     lastHandInferenceAt=mediaTime;
     try{ai.handLandmarker.detectAsync(video,now)}catch(e){onModelState("hand","error","Hand tracking failed: "+e.message)}
     const latest=ai.handLandmarker?.getLatestResult?.();
     if(latest&&latest.count!==lastHandResultCount&&latest.result){
      lastHandResultCount=latest.count;
      const result=handTracker.process(latest.result,overlay.width,overlay.height);
      latestHands=result.hands;
      if(mode==="drawing")updateDrawingResult(result.fist);else updatePortalResult(now);
      ai.markInference("hand");
     }
     const modelError=ai.handLandmarker?.getLastError?.();
     if(modelError)onModelState("hand","error",modelError);
    }
   }else if((mode==="objects"||mode==="people")&&!inferenceBusy&&mediaTime!==lastInference){
    lastInference=mediaTime;
    runVisionInference(now).catch(e=>setNotice("Vision inference failed: "+e.message));
   }
  }
  if(session){if(hasVideoCallback)videoFrameToken=video.requestVideoFrameCallback(onVideoFrame);else setTimeout(()=>{if(session)raf=requestAnimationFrame(()=>onVideoFrame(performance.now(),{mediaTime:video.currentTime}))},0)}
 };
 schedulePreview();
 if(hasVideoCallback)videoFrameToken=video.requestVideoFrameCallback(onVideoFrame);
 else raf=requestAnimationFrame(now=>onVideoFrame(now,{mediaTime:video.currentTime}));
}
async function runVisionInference(now){
 if(inferenceBusy||!session||video.readyState<2)return;
 inferenceBusy=true;const started=performance.now(),target=mode;
 try{
  const detector=await ai.ensureMode(target,preferredFacing);
  const predictions=await detector.detect(video,now);
  if(target!==mode)return;
  latestObjects=predictions||[];
  ai.markInference("object");
  if(target==="objects")updateObjectResult(latestObjects);else if(target==="people")updatePeopleResult();
  const elapsed=Number(ai.lastObjectInferenceMs)||performance.now()-started;
  $("inferenceStatus").textContent="AI "+Math.round(elapsed)+" ms";
 }catch(e){setNotice((target==="people"?"Face":"Object")+" model error: "+e.message);onModelState("object","error",e.message)}
 finally{inferenceBusy=false}
}
function updateObjectResult(pred){const cs=pred.filter(p=>p.score>=.055&&p.class!=="person"&&p.class!=="face").sort((a,b)=>b.score-a.score);if(!cs.length){stableClass=null;stableScore=0;$("resultMain").textContent="Scanning objects";$("resultDescription").textContent="No supported object detected. This compact detector recognizes only common trained classes; center the item, get closer, and improve lighting." ;$("metricValue").textContent="0 found";$("confidenceValue").textContent="—";$("gestureValue").textContent="Searching";return}const best=cs[0];if(stableClass===best.class)stableScore=stableScore*.65+best.score*.35;else{stableClass=best.class;stableScore=best.score}$("resultMain").textContent=best.class.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());$("resultDescription").textContent="COCO-SSD Lite detects common trained categories, not every object. Keep the target centered and well lit; pens, small tools and unfamiliar items may not be in its class list.";$("metricValue").textContent=cs.length+" object"+(cs.length===1?"":"s");$("confidenceValue").textContent=Math.round(stableScore*100)+"%";$("gestureValue").textContent="Live detection"}
function updatePeopleResult(){const n=ai.lastPeopleCount;$("resultMain").textContent=n;$("resultDescription").textContent=n===0?"No clear faces detected in this frame. Improve lighting and keep faces unobstructed.":"Visible face detections. Very small, turned-away or occluded faces may be missed; photos and posters can sometimes be detected as faces.";$("metricValue").textContent=n;$("confidenceValue").textContent="Local face model";$("gestureValue").textContent="Faces detected";if(!faceCountNote){setNotice("Person Finder counts detected faces, not identities. It does not recognize who someone is, and it may miss small or occluded faces.");faceCountNote=true}}
function updateDrawingResult(fist){const r=drawing.process(latestHands,fist);$("resultMain").textContent=r.drawing?"Drawing in air":latestHands.length?"Hand detected":"No hand landmarks";$("resultDescription").textContent=r.drawing?"Pinch held: ink follows the index fingertip. Release to pause.":latestHands.length?"Bring thumb and index closer to draw. A confirmed fist clears the canvas.":"Move one hand fully into the camera view; the live hand skeleton should appear.";$("metricValue").textContent=latestHands.length+" hand"+(latestHands.length===1?"":"s");$("confidenceValue").textContent="Local landmarks";$("gestureValue").textContent=r.gesture}
function updatePortalResult(now){const r=portal.status(latestHands);$("resultMain").textContent=r.active?"Portal connected":r.hands+" / 2 hands detected";$("resultDescription").textContent=r.active?"Thumb, index, middle, ring and pinky tips are linked across both hands.":"Keep both hands fully visible to build the portal frame.";$("metricValue").textContent=latestHands.length+" / 2 hands";$("confidenceValue").textContent="Local landmarks";$("gestureValue").textContent=r.gesture}
function renderOverlay(now){
 if(!overlay.width||!overlay.height)return;
 ctx.clearRect(0,0,overlay.width,overlay.height);
 const mirrored=preferredFacing==="user";
 const labels=[];
 ctx.save();
 if(mirrored){ctx.translate(overlay.width,0);ctx.scale(-1,1)}
 if(mode==="objects"){
  const boxes=latestObjects.filter(p=>p.class!=="person"&&p.class!=="face"&&p.score>=.055);
  for(const b of boxes){
   const[x,y,w,h]=b.bbox;
   ctx.save();ctx.strokeStyle="#C6A15B";ctx.lineWidth=Math.max(2,overlay.width*.002);ctx.shadowColor="#c6a15b40";ctx.shadowBlur=7;ctx.strokeRect(x,y,w,h);ctx.restore();
   const text=b.class.replaceAll("_"," ")+" · "+Math.round(b.score*100)+"%";
   labels.push({x,y,text,w:ctx.measureText(text).width+14,h:24,boxWidth:w});
  }
 } else if(mode==="drawing"&&latestHands.length){
  drawHandSkeleton(ctx,latestHands);
 } else if(mode==="portal"){
  const portalResult=portal.render(ctx,latestHands,overlay.width,overlay.height,now);
  $("resultMain").textContent=portalResult.active?"Portal connected":portalResult.hands+" / 2 hands detected";
  $("resultDescription").textContent=portalResult.active?"Five fingertip pairs connect the tracked hands.":"Move both hands fully into the camera frame; show the palms to the camera.";
  $("metricValue").textContent=latestHands.length+" / 2 hands";
  $("confidenceValue").textContent="Local landmarks";
  $("gestureValue").textContent=portalResult.gesture;
 } else if(mode==="people"){
  for(const face of latestObjects){
   if(face.class!=="face")continue;
   const[x,y,w,h]=face.bbox;
   ctx.save();ctx.strokeStyle="#C6A15B";ctx.lineWidth=Math.max(2,overlay.width*.002);ctx.strokeRect(x,y,w,h);ctx.restore();
   const text="Face · "+Math.round(face.score*100)+"%";
   labels.push({x,y,text,w:ctx.measureText(text).width+14,h:22,boxWidth:w});
  }
 }
 ctx.restore();
 // Boxes/landmarks use a mirrored geometry transform for the front camera.
 // Text uses mirrored box coordinates but is painted untransformed, so glyphs stay readable.
 for(const item of labels){
  const mirroredBoxX=mirrored?overlay.width-item.x-item.boxWidth:item.x;
  const lx=Math.max(0,Math.min(overlay.width-item.w,mirroredBoxX));
  const ly=Math.max(0,item.y-item.h-3);
  ctx.save();ctx.font="600 13px DM Sans, sans-serif";ctx.fillStyle="#ffffffef";ctx.fillRect(lx,ly,item.w,item.h);ctx.fillStyle="#725321";ctx.textBaseline="middle";ctx.fillText(item.text,lx+7,ly+item.h/2);ctx.restore();
 }
}
function clearDrawing(){drawing.clear();feedback("Drawing canvas cleared.")}
async function executeCommand(text){const c=parseCommand(text);if(!c.ok){feedback(c.message);return}if(c.mode){await setMode(c.mode);feedback(c.message+(session?"":" Start camera to use live inference."));return}switch(c.action){case"startCamera":await startCamera();break;case"stopCamera":await stopCamera();break;case"stopDrawing":drawing.pause();feedback("Drawing paused.");return;case"clearDrawing":clearDrawing();return}feedback(c.message)}
$("startCamera").addEventListener("click",()=>startCamera());$("stopCamera").addEventListener("click",stopCamera);$("cameraSelect").addEventListener("change",switchCamera);$("cameraFacingSelect").addEventListener("change",e=>{preferredFacing=e.target.value;$("cameraSelect").value="";startCamera(preferredFacing)});$("retryModels").addEventListener("click",setupMode);document.querySelectorAll(".mode-button").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));$("commandForm").addEventListener("submit",e=>{e.preventDefault();const i=$("commandInput");executeCommand(i.value);i.value=""});
$("voiceButton").addEventListener("click",()=>{const API=window.SpeechRecognition||window.webkitSpeechRecognition;if(!API){feedback("Voice input is not supported here. Type your command instead.");return}const r=new API();r.lang=navigator.language||"en-US";r.interimResults=false;r.maxAlternatives=1;$("voiceButton").classList.add("listening");feedback("Listening for a command…");r.onresult=e=>{const t=e.results?.[0]?.[0]?.transcript||"";$("commandInput").value=t;executeCommand(t)};r.onerror=()=>feedback("Voice input unavailable or permission denied. Use text instead.");r.onend=()=>$("voiceButton").classList.remove("listening");try{r.start()}catch{feedback("Unable to start voice recognition. Type instead.")}});
$("aboutButton").addEventListener("click",()=>$("aboutDialog").showModal());$("aboutDialog").addEventListener("click",e=>{const r=$("aboutDialog").getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$("aboutDialog").close()});window.addEventListener("pagehide",()=>{camera.stop(false);ai.dispose()});document.addEventListener("visibilitychange",()=>{if(document.hidden)cancelFrameScheduler();else if(session)startLoop()});updateModeUI();updateFacingButtons();applyCameraOrientation();if(!window.isSecureContext&&location.hostname!=="localhost")setNotice("Camera access requires HTTPS or localhost. Local AI models load on first use and need network access to their public model hosts.");
