import{CameraController}from"./camera.js";import{AIManager}from"./ai-manager.js";import{resizeCanvases}from"./image-processing.js";import{HandTracker,drawHandSkeleton}from"./hand-tracking.js";import{AirDrawing}from"./drawing.js";import{HandPortal}from"./portal.js";import{parseCommand}from"./nlp.js";import{PerformanceMeter}from"./performance.js";import{describePeople}from"./person-counter.js";import{filterObjectsNearHands}from"./object-in-hand.js";
const $=id=>document.getElementById(id),video=$("cameraVideo"),frame=$("cameraFrame"),overlay=$("overlayCanvas"),ink=$("inkCanvas"),ctx=overlay.getContext("2d");let preferredFacing="user",mode="objects",session=false,inferenceBusy=false,handInferenceBusy=false,raf=0,inferenceRaf=0,lastInference=0,lastHandInferenceAt=0,lastHandMediaTime=-1,lastVisionInferenceAt=0,handLoadNoticeShown=false,latestObjects=[],latestHands=[],peopleDetectionHistory=[],stableClass=null,stableScore=0,faceCountNote=false,videoFrameToken=null,renderFpsFrames=0,renderFpsWindowStart=performance.now(),latestHandCallbackAt=0,portalHandsCache=[],portalLastBothAt=0,lastOverlayRenderAt=0;const camera=new CameraController(video,onCameraState,onDimensions),handTracker=new HandTracker(),drawing=new AirDrawing(ink),portal=new HandPortal(),modelStates={object:"idle",hand:"idle"};const ai=new AIManager(onModelState,setNotice),meter=new PerformanceMeter(({inferenceMs})=>{$("inferenceStatus").textContent=inferenceMs>0?"AI "+Math.round(inferenceMs)+" ms":"Waiting"});
const configs={objects:{title:"Object intelligence",label:"OBJECT FINDER",metric:"DETECTIONS",confidence:"CONFIDENCE",gesture:"TRACKING",main:"Ready when<br>you are.",description:"Start the camera to identify visible everyday objects."},drawing:{title:"Air drawing",label:"AIR DRAWING",metric:"HAND TRACK",confidence:"MODEL",gesture:"GESTURE STATE",main:"Make an idea<br>visible.",description:"Hold thumb and index together to draw one stroke. Release to stop; pinch again to begin a new stroke. Leaving the frame preserves ink. A fist erases only beneath it."},portal:{title:"Two-hand portal",label:"TWO-HAND PORTAL",metric:"HANDS TRACKED",confidence:"MODEL",gesture:"CONNECTION",main:"Bring two points<br>together.",description:"Show both hands to link thumb-to-thumb, index-to-index and the other finger pairs inside the portal frame."},people:{title:"Person finder",label:"PERSON FINDER",metric:"FACES VISIBLE",confidence:"MODEL",gesture:"DETECTION",main:"The scene, in<br>clear numbers.",description:"Counts visible faces locally; rear-camera distant faces may be harder to detect."}};
function setNotice(m){$("noticeText").textContent=m}function feedback(m){$("commandFeedback").textContent=m}function cameraLoading(on,text="Preparing camera…"){$("cameraLoading").hidden=!on;$("loadingLabel").textContent=text}
function onCameraState(state,message){const s=$("sessionStatus"),wrap=s.parentElement;s.textContent=message;wrap.classList.toggle("ready",state==="running");wrap.classList.toggle("error",state==="error");if(state==="running"){session=true;frame.classList.add("running");$("stopCamera").hidden=false;$("cameraSelect").disabled=false;$("engineStatus").textContent="Camera ready";cameraLoading(false);startLoop()}else if(state==="offline"){session=false;frame.classList.remove("running");$("stopCamera").hidden=true;$("cameraSelect").disabled=true;$("resolutionLabel").textContent="— × —";$("engineStatus").textContent="Not initialized";$("inferenceStatus").textContent="Waiting";$("fpsLabel").textContent="— render FPS";cancelFrameScheduler();ctx.clearRect(0,0,overlay.width,overlay.height);meter.reset()}else if(state==="requesting")cameraLoading(true,message);else if(state==="error"){session=false;frame.classList.remove("running");cameraLoading(false);$("stopCamera").hidden=true}}
function applyCameraOrientation(){const mirrored=preferredFacing==="user";video.classList.toggle("mirrored-preview",mirrored);overlay.classList.remove("mirrored-overlay");ink.classList.toggle("mirrored-overlay",mirrored);overlay.dataset.mirrored="false";ink.dataset.mirrored=String(mirrored);ink.style.display=mode==="drawing"?"block":"none";ink.hidden=mode!=="drawing";ink.style.visibility=mode==="drawing"?"visible":"hidden";ink.style.opacity=mode==="drawing"?"1":"0"}
function syncVisionCanvases(){
 if(!video.videoWidth||!video.videoHeight)return;
 const w=video.videoWidth,h=video.videoHeight;
 if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}
 drawing.resize(w,h);
}
function onDimensions(w,h,settings){syncVisionCanvases();$("resolutionLabel").textContent=(settings.width||w)+" × "+(settings.height||h);applyCameraOrientation()}
function onModelState(model,state,message){
 modelStates[model]=state;
 const prefix=model==="object"?"object":"hand";
 const status=$(prefix+"ModelStatus"),tag=$(prefix+"ModelTag"),dot=$(prefix+"ModelDot");
 if(status)status.textContent=message;
 if(tag)tag.textContent=state==="ready"?"READY":state==="error"?"ERROR":state==="loading"?"LOAD":state==="loaded"?"TEST":"IDLE";
 if(dot){dot.textContent=state==="ready"?"✓":state==="error"?"!":state==="loading"?"·":"○";dot.parentElement.classList.toggle("ready",state==="ready");dot.parentElement.classList.toggle("error",state==="error");}
 $("modelCount").textContent=Object.values(modelStates).filter(s=>s==="ready").length+" / 2 READY";
 if(state==="error")setNotice(message);
 if(state==="ready"||state==="loaded"){
  if(model==="hand")$("engineStatus").textContent="MediaPipe hand tracking ready";
  else $("engineStatus").textContent=mode==="people"?"Face detector ready":"Open-vocabulary object detector ready";
 }
}
function updateModeUI(){ink.style.display=mode==="drawing"?"block":"none";ink.hidden=mode!=="drawing";ink.style.visibility=mode==="drawing"?"visible":"hidden";ink.style.opacity=mode==="drawing"?"1":"0";document.querySelectorAll(".mode-button").forEach(b=>{b.classList.toggle("active",b.dataset.mode===mode);b.setAttribute("aria-pressed",String(b.dataset.mode===mode))});const c=configs[mode];$("resultTitle").textContent=c.title;$("visionLabel").textContent=c.label;$("metricLabel").textContent=c.metric;$("confidenceLabel").textContent=c.confidence;$("gestureLabel").textContent=c.gesture;$("resultMain").innerHTML=c.main;$("resultDescription").textContent=c.description;$("metricValue").textContent="—";$("confidenceValue").textContent="—";$("gestureValue").textContent="Waiting";ctx.clearRect(0,0,overlay.width,overlay.height)}
async function setMode(next){
 if(!configs[next])return;
 mode=next;lastInference=0;lastHandMediaTime=-1;lastHandInferenceAt=0;lastVisionInferenceAt=0;latestObjects=[];latestHands=[];peopleDetectionHistory=[];stableClass=null;stableScore=0;portal.reset();portalHandsCache=[];portalLastBothAt=0;handTracker.reset();ctx.clearRect(0,0,overlay.width,overlay.height);
 if(next==="drawing"){drawing.resume();}else{drawing.pause();}
 updateModeUI();
 if(session){
  try{
   setNotice("Preparing "+configs[mode].title+"…");
   await ai.ensureMode(mode,preferredFacing);
   if(mode==="objects"||mode==="drawing"||mode==="portal")ai.onHandResult=handleHandResult;
   if(mode==="drawing")drawing.resume();else drawing.pause();
   setNotice(mode==="drawing"||mode==="portal"?"Hand tracking is starting; keep the full hand in frame.":"Waiting for the next camera analysis…");
  }catch(e){setNotice(e.message)}
 }
}
async function startCamera(facing=preferredFacing){
 if(session&&camera.facingMode===facing){return}
 const previousFacing=preferredFacing;
 preferredFacing=facing;updateFacingButtons();applyCameraOrientation();
 try{
  cancelFrameScheduler();cameraLoading(true,"Requesting camera permission…");feedback("Opening "+(facing==="user"?"front":"rear")+" camera…");
  const devices=await camera.start($("cameraSelect").value,facing);
  preferredFacing=facing;populateCameras(devices);updateFacingButtons();applyCameraOrientation();
  latestObjects=[];latestHands=[];handTracker.reset();portal.reset();portalHandsCache=[];portalLastBothAt=0;lastInference=0;lastHandInferenceAt=0;lastHandMediaTime=-1;lastVisionInferenceAt=0;
  await setupMode();cameraLoading(false);
  if(session)startLoop();
 }catch(e){
  preferredFacing=previousFacing;updateFacingButtons();applyCameraOrientation();
  const m=friendlyCameraError(e);onCameraState("error",m);setNotice(m);feedback(m);
 }
}
function friendlyCameraError(e){if(["NotAllowedError","PermissionDeniedError"].includes(e.name))return"Camera permission denied. Allow camera access in browser site settings, then retry.";if(["NotFoundError","DevicesNotFoundError"].includes(e.name))return"No camera was found. Connect a camera or choose an available device.";if(["NotReadableError","TrackStartError"].includes(e.name))return"The camera is busy. Close other apps using it and retry.";return e.message||"Camera startup failed. Use HTTPS or localhost and check browser permissions."}
function populateCameras(devices){const s=$("cameraSelect"),old=s.value;s.replaceChildren();s.add(new Option("Automatic camera",""));devices.forEach((d,i)=>s.add(new Option(d.label||"Camera "+(i+1),d.deviceId)));s.disabled=devices.length===0;if(devices.some(d=>d.deviceId===old))s.value=old}function updateFacingButtons(){$("cameraFacingSelect").value=preferredFacing}
async function switchCamera(){
 if(!session)return;
 const currentFacing=preferredFacing;
 try{
  cancelFrameScheduler();cameraLoading(true,"Switching camera…");
  const ds=await camera.start($("cameraSelect").value,currentFacing);
  populateCameras(ds);syncVisionCanvases();applyCameraOrientation();
  latestObjects=[];latestHands=[];handTracker.reset();portal.reset();portalHandsCache=[];portalLastBothAt=0;lastInference=0;lastHandInferenceAt=0;
  await setupMode();cameraLoading(false);if(session)startLoop();
 }catch(e){const m=friendlyCameraError(e);onCameraState("error",m);setNotice(m);feedback(m)}
}
async function stopCamera(){
 cancelFrameScheduler();await camera.stop();latestObjects=[];latestHands=[];portalHandsCache=[];portalLastBothAt=0;
 handTracker.reset();portal.reset();inferenceBusy=false;handInferenceBusy=false;lastInference=0;lastHandInferenceAt=0;
 ctx.clearRect(0,0,overlay.width,overlay.height);onCameraState("offline","Camera offline");setNotice("Camera stopped. Your air drawing stays saved in this session.");
}
async function setupMode(){
 if(!session)return;
 try{
  await ai.ensureMode(mode,preferredFacing);
  if(mode==="objects"||mode==="drawing"||mode==="portal")ai.onHandResult=handleHandResult;
  $("engineStatus").textContent=mode==="drawing"||mode==="portal"?"MediaPipe hand engine ready":mode==="people"?"Face detector ready":"Open-vocabulary object detector ready";
  if(mode==="drawing"||mode==="portal")setNotice("Hand model ready. Show the full hand(s) in the camera view.");
  else setNotice("Waiting for the next analysis frame.");
 }catch(e){$("engineStatus").textContent="Initialization failed";setNotice(e.message)}
}
function cancelFrameScheduler(){
 if(videoFrameToken!==null&&video.cancelVideoFrameCallback){try{video.cancelVideoFrameCallback(videoFrameToken)}catch{}videoFrameToken=null}
 cancelAnimationFrame(raf);cancelAnimationFrame(inferenceRaf)
}
function startLoop(){
 cancelFrameScheduler();renderFpsFrames=0;renderFpsWindowStart=performance.now();
 const hasVideoCallback=typeof video.requestVideoFrameCallback==="function";
 const renderPreview=now=>{
  if(!session)return;
  renderFpsFrames++;
  if(now-renderFpsWindowStart>=500){
   $("fpsLabel").textContent=Math.round(renderFpsFrames*1000/(now-renderFpsWindowStart))+" preview FPS";
   renderFpsFrames=0;renderFpsWindowStart=now;
  }
  if(video.readyState>=2&&video.videoWidth){
   if(overlay.width!==video.videoWidth||overlay.height!==video.videoHeight||ink.width!==video.videoWidth||ink.height!==video.videoHeight)syncVisionCanvases();
   renderOverlay(now);
  }
 };
 const loadHandIfNeeded=()=>{
  if(!session||!(mode==="drawing"||mode==="portal"||mode==="objects")||ai.handLandmarker||ai.loading.hand||handLoadNoticeShown)return;
  handLoadNoticeShown=true;setNotice("Loading hand landmark model…");
  ai.loadHands().then(()=>{
   handLoadNoticeShown=false;ai.onHandResult=handleHandResult;
   setNotice("Hand landmark model ready. Show the full hand(s) to the camera.");
  }).catch(e=>{
   handLoadNoticeShown=false;onModelState("hand","error",e.message);
   setNotice("Hand tracking could not start: "+e.message);
  });
 };
 const processVideoFrame=(now,meta={})=>{
  if(!session)return;
  if(video.readyState>=2&&video.videoWidth){
   const mediaTime=Number.isFinite(meta.mediaTime)?meta.mediaTime:video.currentTime;
   if(mode==="drawing"||mode==="portal"||mode==="objects"){
    ai.onHandResult=handleHandResult;loadHandIfNeeded();
    const handInterval=mode==="objects"?65:45;
    if(ai.handLandmarker&&!handInferenceBusy&&mediaTime!==lastHandMediaTime&&now-lastHandInferenceAt>=handInterval){
     lastHandMediaTime=mediaTime;lastHandInferenceAt=now;handInferenceBusy=true;
     Promise.resolve().then(()=>ai.handLandmarker.detect(video,now))
      .then(data=>{if(session)handleHandResult(data,now,performance.now())})
      .catch(e=>onModelState("hand","error","Hand inference error: "+(e?.message||String(e))))
      .finally(()=>{handInferenceBusy=false});
    }
   }
   const inferenceInterval=mode==="objects"?220:((mode==="people"&&preferredFacing==="environment")?180:125);
   if((mode==="objects"||mode==="people")&&!inferenceBusy&&!handInferenceBusy&&mediaTime!==lastInference
      &&performance.now()-lastVisionInferenceAt>=inferenceInterval){
    lastInference=mediaTime;lastVisionInferenceAt=performance.now();
    runVisionInference(now).catch(e=>setNotice("Vision inference failed: "+e.message));
   }
  }
 };
 if(hasVideoCallback){
  const frameLoop=(now,meta)=>{if(!session)return;renderPreview(now);processVideoFrame(now,meta);videoFrameToken=video.requestVideoFrameCallback(frameLoop)};
  videoFrameToken=video.requestVideoFrameCallback(frameLoop);
 }else{
  const frameLoop=now=>{if(!session)return;renderPreview(now);processVideoFrame(now,{mediaTime:video.currentTime});inferenceRaf=requestAnimationFrame(frameLoop)};
  inferenceRaf=requestAnimationFrame(frameLoop);
 }
}
async function runVisionInference(now){
 if(inferenceBusy||!session||video.readyState<2)return;
 inferenceBusy=true;const started=performance.now(),target=mode;
 try{
  const detector=await ai.ensureMode(target,preferredFacing);
  const predictions=await detector.detect(video,now);
  if(target!==mode)return;
  const rawPredictions=Array.isArray(predictions)?predictions:[];
  if(target==="objects"){
   const filtered=latestHands.length?filterObjectsNearHands(rawPredictions,latestHands,video.videoWidth,video.videoHeight,.18):[];
   latestObjects=mergeStableHeldObjects(latestObjects,filtered);
   updateObjectResult(latestObjects);
  }else{latestObjects=stabilizePeopleDetections(rawPredictions);updatePeopleResult();}
  ai.markInference("object");
  const elapsed=Number(ai.lastObjectInferenceMs)||performance.now()-started;
  $("inferenceStatus").textContent="AI "+Math.round(elapsed)+" ms";
 }catch(e){setNotice((target==="people"?"Face":"Object")+" model error: "+e.message);onModelState("object","error",e.message)}
 finally{inferenceBusy=false}
}
function mergeStableHeldObjects(previous,current){
 const now=performance.now();
 const valid=item=>item&&Array.isArray(item.bbox)&&item.bbox.length>=4&&item.bbox.slice(0,4).every(Number.isFinite)&&item.bbox[2]>0&&item.bbox[3]>0;
 const overlap=(a,b)=>{const [ax,ay,aw,ah]=a.bbox,[bx,by,bw,bh]=b.bbox;const ix=Math.max(0,Math.min(ax+aw,bx+bw)-Math.max(ax,bx));const iy=Math.max(0,Math.min(ay+ah,by+bh)-Math.max(ay,by));const inter=ix*iy;return inter/Math.max(1,aw*ah+bw*bh-inter)};
 const next=(Array.isArray(current)?current:[]).filter(valid).map(item=>({...item,lastSeen:now}));
 // Bridge brief missed frames, but never retain a disappeared object for long.
 for(const old of (Array.isArray(previous)?previous:[]).filter(valid)){
  if(now-(old.lastSeen||0)>520)continue;
  if(next.some(item=>item.class===old.class&&overlap(item,old)>.12))continue;
  next.push({...old,score:Math.min(old.score||.5,.7),lastSeen:old.lastSeen||now});
 }
 return next.sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,6);
}
function updateObjectResult(pred){
 const detections=pred.filter(p=>Number.isFinite(p?.score)&&p.score>=.12&&Array.isArray(p.bbox)&&p.bbox.length>=4&&p.bbox[2]>0&&p.bbox[3]>0)
  .sort((a,b)=>b.score-a.score);
 const people=detections.filter(p=>p.class==="person");
 const objects=detections.filter(p=>p.class!=="person"&&p.class!=="face");
 if(!detections.length){
  stableClass=null;stableScore=0;
  $("resultMain").textContent="Nothing detected yet";
  $("resultDescription").textContent="Show your hand holding an item. Only objects near a tracked hand will be shown.";
  $("metricValue").textContent="0 detections";$("confidenceValue").textContent="—";$("gestureValue").textContent=latestHands.length?"Hand tracked":"Waiting for hand";return
 }
 const best=objects[0]||people[0];
 if(stableClass===best.class)stableScore=stableScore*.65+best.score*.35;else{stableClass=best.class;stableScore=best.score}
 $("resultMain").textContent=people.length?people.length+" person"+(people.length===1?"":"s")+" detected":best.class.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
 $("resultDescription").textContent="Showing "+objects.length+" item"+(objects.length===1?"":"s")+" beside your tracked hand. Objects away from the hand are ignored.";
 $("metricValue").textContent=detections.length+" detection"+(detections.length===1?"":"s");
 $("confidenceValue").textContent=Math.round(best.score*100)+"% best";
 $("gestureValue").textContent=latestHands.length+" hand"+(latestHands.length===1?"":"s")+" tracked";
}
function stabilizePeopleDetections(predictions){
 const now=performance.now();
 const current=(Array.isArray(predictions)?predictions:[]).filter(p=>p?.class==="face"&&Number.isFinite(p.score)&&p.score>=.22&&Array.isArray(p.bbox)&&p.bbox.length>=4&&p.bbox[2]>0&&p.bbox[3]>0);
 peopleDetectionHistory.push({at:now,items:current});
 while(peopleDetectionHistory.length>3||peopleDetectionHistory.length&&now-peopleDetectionHistory[0].at>700)peopleDetectionHistory.shift();
 const iou=(a,b)=>{const [ax,ay,aw,ah]=a.bbox,[bx,by,bw,bh]=b.bbox;const ix=Math.max(0,Math.min(ax+aw,bx+bw)-Math.max(ax,bx));const iy=Math.max(0,Math.min(ay+ah,by+bh)-Math.max(ay,by));const inter=ix*iy;return inter/Math.max(1,aw*ah+bw*bh-inter)};
 // Keep a detection if it appears in at least two recent frames, or is a high-confidence
 // current result. This removes isolated false hits without making the overlay lag excessively.
 return current.filter(face=>face.score>=.55||peopleDetectionHistory.filter(frame=>frame.items.some(old=>iou(face,old)>.25)).length>=2);
}
function updatePeopleResult(){const n=Number.isFinite(ai.lastPeopleCount)?ai.lastPeopleCount:0;$("resultMain").textContent=n;$("resultDescription").textContent=n===0?(preferredFacing==="environment"?"No faces detected yet. Move the camera to include the whole group, keep it steady, and use good lighting.":"No clear faces detected in this frame. Improve lighting and keep faces unobstructed."):n===1?"1 visible face detected. Include the full group and keep distant faces unobstructed.":n+" visible faces detected in the current camera view. Small, turned-away or overlapping faces may still be missed.";$("metricValue").textContent=n;$("confidenceValue").textContent=preferredFacing==="environment"?"Crowd-aware rear-camera scan":"Live face scan";$("gestureValue").textContent="Faces detected";if(!faceCountNote){setNotice("Person Finder estimates visible faces in the live camera view. Crowded or distant faces can be missed depending on resolution, lighting and occlusion.");faceCountNote=true}}
function handleHandResult(data,timestamp,arrivedAt){
 if(!session||!(mode==="drawing"||mode==="portal"||mode==="objects"))return;
 const tracked=handTracker.process(data,overlay.width,overlay.height);
 const now=Number.isFinite(arrivedAt)?arrivedAt:performance.now();
 if(mode==="portal"){
  if(tracked.hands.length>=2){
   latestHands=tracked.hands.slice(0,2);
   portalHandsCache=latestHands;
   portalLastBothAt=now;
  }else if(portalHandsCache.length===2&&now-portalLastBothAt<220){
   // Bridge brief dropped inference frames; disconnect when the hands are really gone.
   latestHands=portalHandsCache;
  }else{
   latestHands=tracked.hands;
   portalHandsCache=[];
   portalLastBothAt=0;
  }
 }else{
  latestHands=tracked.hands;
  portalHandsCache=[];
  portalLastBothAt=0;
 }
 latestHandCallbackAt=now;
 if(mode==="drawing")updateDrawingResult(tracked.fist);
 else if(mode==="portal")updatePortalResult(arrivedAt);
 $("inferenceStatus").textContent="Hand model updating";
}
function updateDrawingResult(fist){const r=drawing.process(latestHands,fist);$("resultMain").textContent=r.drawing?"Drawing in air":fist?"Local eraser active":latestHands.length?"Hand detected":"No hand landmarks";$("resultDescription").textContent=r.drawing?"Pinch held: ink follows the index fingertip. Release or move off-screen to pause; existing ink stays.":fist?"Move your closed hand over only the area you want to erase. Other ink remains.":latestHands.length?"Pinch thumb and index again to start a separate stroke. Existing drawing is preserved.":"Move one hand into view; existing ink stays visible when the hand leaves.";$("metricValue").textContent=latestHands.length+" hand"+(latestHands.length===1?"":"s");$("confidenceValue").textContent="Local landmarks";$("gestureValue").textContent=r.gesture}
function updatePortalResult(now){const r=portal.status(latestHands);$("resultMain").textContent=r.active?"Portal connected":r.hands+" / 2 hands detected";$("resultDescription").textContent=r.active?"A flowing portal is drawn between corresponding fingertips.":"Show both hands fully in the camera view; the portal closes when either hand leaves the frame.";$("metricValue").textContent=latestHands.length+" / 2 hands";$("confidenceValue").textContent="Local landmarks";$("gestureValue").textContent=r.gesture}
function renderOverlay(now){
 if(!overlay.width||!overlay.height||now-lastOverlayRenderAt<33)return;
 lastOverlayRenderAt=now;
 ctx.clearRect(0,0,overlay.width,overlay.height);
 // The ink canvas is a dedicated Air Drawing layer. Explicitly gate it on each frame
 // so it can never leak into Portal, Object Finder or Person Finder, including stale CSS states.
 const drawingActive=mode==="drawing";
 ink.hidden=!drawingActive;ink.style.display=drawingActive?"block":"none";ink.style.visibility=drawingActive?"visible":"hidden";ink.style.opacity=drawingActive?"1":"0";
 const mirrored=preferredFacing==="user";
 const labels=[];
 ctx.save();
 if(mirrored){ctx.translate(overlay.width,0);ctx.scale(-1,1)}
 if(mode==="objects"){
  const boxes=latestObjects.filter(p=>p.class!=="face"&&p.score>=.12);
  for(const b of boxes){
   const[x,y,w,h]=b.bbox;
   ctx.save();ctx.strokeStyle="#C6A15B";ctx.lineWidth=Math.max(2,overlay.width*.002);ctx.shadowColor="#c6a15b40";ctx.shadowBlur=7;ctx.strokeRect(x,y,w,h);ctx.restore();
   const text=(b.class==="person"?"Person":b.class.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()))+" · "+Math.round(b.score*100)+"%";
   labels.push({x,y,text,w:ctx.measureText(text).width+14,h:24,boxWidth:w});
  }
 } else if(mode==="drawing"){
  if(latestHands.length)drawHandSkeleton(ctx,latestHands);
 } else if(mode==="portal"){
  if(latestHands.length)drawHandSkeleton(ctx,latestHands);
  // Portal status is updated on hand inference callbacks, not again on every preview frame.
  portal.render(ctx,latestHands,overlay.width,overlay.height,now);
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
