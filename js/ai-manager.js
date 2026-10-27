const MEDIAPIPE_VERSION="0.10.14";
const HANDS_CDN=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const HAND_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_MODEL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL_FRONT="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const FACE_MODEL_REAR="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite";
const TF_SCRIPT="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const COCO_SCRIPT="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";
const TRANSFORMERS_MODULE="https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const OPEN_VOCABULARY_MODEL="onnx-community/grounding-dino-tiny-ONNX";
export const OBJECT_PROMPTS=[
 "student ID card","identity card","ID badge","credit card","debit card","plastic card",
 "ballpoint pen","pen","pencil","marker","water bottle","bottle","drinking bottle",
 "computer mouse","wireless mouse","laptop computer","laptop","computer keyboard","computer monitor",
 "smartphone","mobile phone","phone charger","USB cable","charger","notebook","book",
 "calculator","wallet","keys","glasses","headphones","earphones","cup","chair","backpack"
];
const ensureScript=(src,ready,label)=>new Promise((resolve,reject)=>{
 if(ready())return resolve();
 const existing=[...document.scripts].find(s=>s.src===src);
 if(existing){existing.addEventListener("load",()=>ready()?resolve():reject(new Error(label+" did not initialize.")),{once:true});existing.addEventListener("error",()=>reject(new Error(label+" CDN failed to load.")),{once:true});return;}
 const script=document.createElement("script");script.src=src;script.async=true;script.crossOrigin="anonymous";
 script.onload=()=>ready()?resolve():reject(new Error(label+" did not initialize."));
 script.onerror=()=>{script.remove();reject(new Error(label+" CDN failed to load. Check internet access and retry."));};
 document.head.append(script);
});

export function normalizeObjectLabel(label){
 const value=String(label||"object").toLowerCase().replace(/[_-]+/g," ").replace(/^[\s.,:;]+|[\s.,:;]+$/g,"").trim();
 if(/\b(student|identity|identification|id)\b.*\b(card|badge)\b/.test(value)||/\b(card|badge)\b.*\b(student|identity|identification|id)\b/.test(value))return "id_card";
 if(/\b(credit|debit|plastic|access) card\b/.test(value))return "card";
 if(/\b(card)\b/.test(value))return "card";
 if(/\b(smartphone|mobile phone|cell phone|cellphone|phone)\b/.test(value))return "mobile_phone";
 if(/\b(usb|electrical|charging|charger) cable\b|\bwire\b/.test(value))return "cable";
 if(/\b(flowerpot|flower pot|plant pot|potted plant)\b/.test(value))return "flowerpot";
 if(/\b(ballpoint pen|ink pen|fountain pen|pen)\b/.test(value))return "pen";
 if(/\bpencil\b/.test(value))return "pencil";
 if(/\bearphone\b/.test(value))return "earphones";
 if(/\bheadphone\b/.test(value))return "headphones";
 if(/\bpower bank\b/.test(value))return "power_bank";
 if(/\b(water bottle|drinking bottle|bottle)\b/.test(value))return "bottle";
 if(/\b(computer mouse|wireless mouse|mouse)\b/.test(value))return "mouse";
 if(/\b(laptop computer|laptop)\b/.test(value))return "laptop";
 if(/\b(keyboard)\b/.test(value))return "keyboard";
 if(/\b(calculator)\b/.test(value))return "calculator";
 if(/\b(id card|student id)\b/.test(value))return "id_card";
 return value.replace(/^(a|an|the)\s+/,"").replace(/\s+/g,"_");
}

function boxIoU(a,b){
 const ax=a[0],ay=a[1],ar=ax+a[2],ab=ay+a[3],bx=b[0],by=b[1],br=bx+b[2],bb=by+b[3];
 const intersection=Math.max(0,Math.min(ar,br)-Math.max(ax,bx))*Math.max(0,Math.min(ab,bb)-Math.max(ay,by));
 const union=a[2]*a[3]+b[2]*b[3]-intersection;
 return union>0?intersection/union:0;
}

export function mapOpenVocabularyDetections(found,width,height,minScore=0.075){
 const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);
 const mapped=(Array.isArray(found)?found:[]).flatMap(item=>{
  const score=Number(item?.score)||0,box=item?.box;
  if(score<minScore||!box)return[];
  const values=Array.isArray(box)?box:[box.xmin,box.ymin,box.xmax,box.ymax];
  if(values.length<4||values.slice(0,4).some(v=>!Number.isFinite(Number(v))))return[];
  const x=Math.max(0,Math.min(w,Number(values[0]))),y=Math.max(0,Math.min(h,Number(values[1])));
  const right=Math.max(x,Math.min(w,Number(values[2]))),bottom=Math.max(y,Math.min(h,Number(values[3])));
  if(right<=x||bottom<=y)return[];
  return[{class:normalizeObjectLabel(item.label),score,bbox:[x,y,right-x,bottom-y]}];
 }).sort((a,b)=>b.score-a.score);
 const unique=[];
 for(const item of mapped){
  if(unique.some(existing=>boxIoU(existing.bbox,item.bbox)>.62))continue;
  unique.push(item);
 }
 return unique.slice(0,40);
}

export class AIManager{
 constructor(onModelState,onNotice){
  this.onModelState=onModelState;this.onNotice=onNotice;
  this.objectModel=null;this.cocoModel=null;this.peopleDetector=null;
  this.handLandmarker=null;this.handTask=null;this.faceTask=null;this.faceDetector=null;this.faceFacingMode=null;
  this.currentFacingMode="user";this.loading={object:null,coco:null,hand:null,people:null,openVocabulary:null};this.currentMode="objects";
  this.lastPeopleCount=0;this.lastSummary="";this.lastObjectMode="";this.lastObjectResult=null;this.lastObjectInferenceAt=0;this.lastCrowdFallbackAt=0;this.lastCrowdFallbackPeople=[];
  this.lastFaceTimestamp=0;this.lastHandTimestamp=0;this.lastObjectInferenceMs=0;this.openVocabularyDetector=null;this.openVocabularyBusy=false;this.openVocabularyFailed=false;this.lastOpenVocabularyRequestAt=0;this.lastOpenVocabularyResultAt=0;this.lastOpenVocabularyResult=[];this.openVocabularyCanvas=null;
 }
 async loadCocoDetector(){
  if(this.cocoModel)return this.cocoModel;
  if(this.loading.coco)return this.loading.coco;
  this.loading.coco=(async()=>{
   await ensureScript(TF_SCRIPT,()=>Boolean(globalThis.tf),"TensorFlow.js");
   await ensureScript(COCO_SCRIPT,()=>Boolean(globalThis.cocoSsd),"COCO-SSD");
   if(globalThis.tf?.ready)await globalThis.tf.ready();
   let detector;
   try{detector=await globalThis.cocoSsd.load({base:"lite_mobilenet_v2"});}
   catch(firstError){
    try{detector=await globalThis.cocoSsd.load({base:"mobilenet_v2"});}
    catch(secondError){throw new Error("COCO-SSD model weights could not be loaded. "+(secondError?.message||firstError?.message||"Unknown model error"));}
   }
   this.cocoModel={detect:async(video,maxNumBoxes=12,minScore=0.16)=>{
    if(!video?.videoWidth||!video?.videoHeight||video.readyState<2)throw new Error("Camera frame is not ready.");
    // Downscale the inference input to reduce latency on laptop CPUs while preserving original coordinates.
    const started=performance.now(),sourceWidth=video.videoWidth,sourceHeight=video.videoHeight;
    const inferenceWidth=Math.min(512,sourceWidth),scale=inferenceWidth/sourceWidth,inferenceHeight=Math.max(1,Math.round(sourceHeight*scale));
    let input=video;
    if(scale<0.999){
     if(!this.objectInputCanvas){this.objectInputCanvas=document.createElement("canvas");this.objectInputContext=this.objectInputCanvas.getContext("2d",{alpha:false,desynchronized:true});}
     const canvas=this.objectInputCanvas;canvas.width=inferenceWidth;canvas.height=inferenceHeight;
     this.objectInputContext.drawImage(video,0,0,inferenceWidth,inferenceHeight);input=canvas;
    }
    const found=await detector.detect(input,Math.min(20,Math.max(6,maxNumBoxes)),minScore),w=sourceWidth,h=sourceHeight;
    const mapped=(Array.isArray(found)?found:[]).map(item=>{
     const b=item.bbox||[],x=Math.max(0,Math.min(w,Number(b[0])||0)),y=Math.max(0,Math.min(h,Number(b[1])||0));
     const right=Math.max(x,Math.min(w,x+(Number(b[2])||0))),bottom=Math.max(y,Math.min(h,y+(Number(b[3])||0)));
     return{class:String(item.class||"object").toLowerCase().replace(/[\s-]+/g,"_"),score:Number(item.score)||0,bbox:[x/scale,y/scale,(right-x)/scale,(bottom-y)/scale]};
    }).filter(p=>p.score>=minScore&&p.bbox[2]>0&&p.bbox[3]>0)
      .sort((a,b)=>b.score-a.score).slice(0,Math.min(40,Math.max(20,maxNumBoxes)));
    this.lastObjectInferenceMs=performance.now()-started;this.lastObjectInferenceAt=performance.now();
    this.lastObjectResult=mapped;this.lastPeopleCount=mapped.filter(p=>p.class==="person"&&p.score>=minScore).length;
    this.lastSummary=mapped.map(p=>p.class).join(", ");return mapped;
   }};
   return this.cocoModel;
  })();
  try{return await this.loading.coco}
  finally{this.loading.coco=null}
 }
 async loadObjects(){
  if(this.objectModel)return this.objectModel;
  if(this.loading.object)return this.loading.object;
  this.onModelState("object","loading","Loading lightweight local object detector…");
  this.loading.object=(async()=>{
   const coco=await this.loadCocoDetector();
   this.objectModel={detect:async video=>{const result=await coco.detect(video,20,0.10);this.lastObjectMode="coco-ssd-hand-local";return result;}};
   this.onModelState("object","loaded","Lightweight local object detector ready");
   return this.objectModel;
  })();
  try{return await this.loading.object}
  catch(error){const message="Object detector failed to load: "+(error?.message||"model unavailable");this.onModelState("object","error",message);throw new Error(message)}
  finally{this.loading.object=null}
 }
 async loadOpenVocabularyDetector(){
  if(this.openVocabularyDetector)return this.openVocabularyDetector;
  if(this.loading.openVocabulary)return this.loading.openVocabulary;
  this.loading.openVocabulary=(async()=>{
   if(this.onNotice)this.onNotice("Loading expanded object recognition for ID cards, pens and other items. First download may be large; the fast local detector remains available.");
   const {pipeline,RawImage,env}=await import(TRANSFORMERS_MODULE);
   if(env){env.allowLocalModels=false;env.useBrowserCache=true;}
   let detector;
   try{
    detector=await pipeline("zero-shot-object-detection",OPEN_VOCABULARY_MODEL,{device:"webgpu",dtype:"q4f16"});
   }catch(webgpuError){
    try{
     detector=await pipeline("zero-shot-object-detection",OPEN_VOCABULARY_MODEL,{device:"wasm",dtype:"uint8"});
    }catch(wasmError){
     throw new Error("Expanded object model could not start on WebGPU or CPU. "+(wasmError?.message||webgpuError?.message||"Model initialization failed."));
    }
   }
   this.openVocabularyRawImage=RawImage;
   this.openVocabularyDetector=detector;
   if(this.currentMode==="objects"&&this.onNotice)this.onNotice("Expanded object recognition is ready. Hold the item near your hand for clearer labels.");
   return detector;
  })();
  try{return await this.loading.openVocabulary;}
  catch(error){
   this.openVocabularyFailed=true;
   if(this.currentMode==="objects"&&this.onNotice)this.onNotice("Expanded object recognition unavailable; the standard detector is still active. "+(error?.message||"Check the connection."));
   throw error;
  }finally{this.loading.openVocabulary=null;}
 }
 requestOpenVocabularyDetections(video){
  const now=performance.now();
  if(!video?.videoWidth||!video?.videoHeight||video.readyState<2||this.openVocabularyFailed)return this.lastOpenVocabularyResult;
  const recent=now-this.lastOpenVocabularyResultAt<900?this.lastOpenVocabularyResult:[];
  if(this.openVocabularyBusy||now-this.lastOpenVocabularyRequestAt<1300)return recent;
  this.lastOpenVocabularyRequestAt=now;this.openVocabularyBusy=true;
  Promise.resolve().then(async()=>{
   const detector=await this.loadOpenVocabularyDetector();
   const sourceWidth=video.videoWidth,sourceHeight=video.videoHeight;
   const inferenceWidth=Math.min(640,sourceWidth),scale=inferenceWidth/sourceWidth,inferenceHeight=Math.max(1,Math.round(sourceHeight*scale));
   if(!this.openVocabularyCanvas)this.openVocabularyCanvas=document.createElement("canvas");
   const canvas=this.openVocabularyCanvas;canvas.width=inferenceWidth;canvas.height=inferenceHeight;
   const context=canvas.getContext("2d",{alpha:false,desynchronized:true});
   if(!context)throw new Error("Could not prepare the image for expanded object recognition.");
   context.drawImage(video,0,0,inferenceWidth,inferenceHeight);
   const image=this.openVocabularyRawImage.fromCanvas(canvas);
   const found=await detector(image,OBJECT_PROMPTS,{threshold:0.20});
   const mapped=mapOpenVocabularyDetections(found,inferenceWidth,inferenceHeight,0.16).map(item=>({
    ...item,
    bbox:item.bbox.map((v,index)=>index%2===0?v/scale:v/scale),
    source:"open-vocabulary"
   }));
   this.lastOpenVocabularyResult=mapped;
   this.lastOpenVocabularyResultAt=performance.now();
  }).catch(error=>{
   this.openVocabularyFailed=true;
   if(this.currentMode==="objects"&&this.onNotice)this.onNotice("Expanded item model could not run; standard object detection remains active. "+(error?.message||"Model error"));
  }).finally(()=>{this.openVocabularyBusy=false;});
  return recent;
 }
 async detectCrowdPeople(video){
  // Reuse cached crowd detections between face frames; running a second model
  // pass on every frame causes slowdowns and noisy counts.
  const now=performance.now();
  if(now-this.lastCrowdFallbackAt<650)return this.lastCrowdFallbackPeople;
  const detector=await this.loadCocoDetector();
  const predictions=await detector.detect(video,20,0.30);
  this.lastCrowdFallbackAt=now;
  this.lastCrowdFallbackPeople=predictions.filter(p=>p.class==="person"&&p.score>=0.30);
  return this.lastCrowdFallbackPeople;
 }
 async loadPeople(facingMode=this.currentFacingMode){
  this.currentFacingMode=facingMode;
  if(this.peopleDetector&&this.peopleFacingMode===facingMode)return this.peopleDetector;
  if(this.peopleFacingMode!==facingMode){try{this.faceTask?.close?.()}catch{}try{this.rearShortFaceTask?.close?.()}catch{}this.faceTask=null;this.rearShortFaceTask=null;this.faceDetector=null;this.peopleDetector=null;this.faceFacingMode=null;}
  if(this.loading.people){
   const pending=this.loading.people;
   if(this.loading.peopleFacingMode===facingMode)return pending;
   try{await pending}catch{}
   if(this.peopleDetector&&this.peopleFacingMode===facingMode)return this.peopleDetector;
  }
  this.onModelState("object","loading",facingMode==="environment"?"Loading rear-camera face detection…":"Loading front-camera face detection…");
  this.loading.peopleFacingMode=facingMode;
  this.loading.people=(async()=>{
   const {FilesetResolver,FaceDetector}=await import(HANDS_CDN);
   const vision=await FilesetResolver.forVisionTasks(HAND_WASM);
   const modelPath=facingMode==="environment"?FACE_MODEL_REAR:FACE_MODEL_FRONT;
   const options={baseOptions:{modelAssetPath:modelPath,delegate:"GPU"},runningMode:"VIDEO",minDetectionConfidence:facingMode==="environment"?.10:.24,minSuppressionThreshold:facingMode==="environment"?.12:.18};
   let detector;
   try{detector=await FaceDetector.createFromOptions(vision,options);}
   catch(gpuError){
    try{detector=await FaceDetector.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:modelPath,delegate:"CPU"}});}
    catch(cpuError){throw new Error("Face detector failed on GPU and CPU: "+(cpuError?.message||gpuError?.message||"model initialization failed"));}
   }
   let rearShortDetector=null;
   if(facingMode==="environment"){
    try{
     rearShortDetector=await FaceDetector.createFromOptions(vision,{baseOptions:{modelAssetPath:FACE_MODEL_FRONT,delegate:"GPU"},runningMode:"VIDEO",minDetectionConfidence:.075,minSuppressionThreshold:.10});
    }catch{
     try{rearShortDetector=await FaceDetector.createFromOptions(vision,{baseOptions:{modelAssetPath:FACE_MODEL_FRONT,delegate:"CPU"},runningMode:"VIDEO",minDetectionConfidence:.055,minSuppressionThreshold:.08});}catch{}
    }
    this.rearShortFaceTask=rearShortDetector;
   }
   this.faceTask=detector;this.faceFacingMode=facingMode;this.lastFaceTimestamp=0;this.lastRearShortTimestamp=0;
   this.faceDetector={detect:async(video,timestamp=performance.now())=>{
    if(!video?.videoWidth||!video?.videoHeight||video.readyState<2)throw new Error("Waiting for a live camera frame.");
    const started=performance.now(),w=video.videoWidth,h=video.videoHeight;
    const ts=Math.max(this.lastFaceTimestamp+1,Math.floor(Number(timestamp)||performance.now()));this.lastFaceTimestamp=ts;
    const readDetections=(task,time,threshold)=>{
     if(!task)return[];
     const result=task.detectForVideo(video,time);
     return (result?.detections||[]).flatMap(detection=>{
      const box=detection.boundingBox,score=Number(detection.categories?.[0]?.score);
      if(!box||!Number.isFinite(score)||score<threshold)return[];
      const x=Math.max(0,Math.min(w,box.originX)),y=Math.max(0,Math.min(h,box.originY));
      const right=Math.max(x,Math.min(w,box.originX+box.width)),bottom=Math.max(y,Math.min(h,box.originY+box.height));
      if(right<=x||bottom<=y)return[];
      return[{class:"face",score,bbox:[x,y,right-x,bottom-y]}];
     });
    };
    let detections=readDetections(detector,ts,facingMode==="environment"?.095:.22);
    // Rear views often contain both nearby and distant faces. Run both ranges,
    // then de-duplicate overlapping boxes so a partial hit from one model
    // never prevents the second model from finding other people.
    if(facingMode==="environment"&&rearShortDetector){
     const shortTs=Math.max(this.lastRearShortTimestamp+1,ts+1);this.lastRearShortTimestamp=shortTs;
     detections.push(...readDetections(rearShortDetector,shortTs,.075));
    }
    // When face detection misses much of a group, augment the count using
    // the lightweight person detector. Prefer faces when it finds a useful set.
    let crowdPeople=[];
    if(detections.length<4){
     try{crowdPeople=await this.detectCrowdPeople(video)}catch{}
    }
    detections.sort((a,b)=>b.score-a.score);
    const unique=[];
    for(const item of detections){
     const [x,y,wBox,hBox]=item.bbox;
     if(unique.some(other=>{const [ox,oy,ow,oh]=other.bbox;const ix=Math.max(0,Math.min(x+wBox,ox+ow)-Math.max(x,ox));const iy=Math.max(0,Math.min(y+hBox,oy+oh)-Math.max(y,oy));const inter=ix*iy;return inter/Math.max(1,wBox*hBox+ow*oh-inter)>.55;}))continue;
     unique.push(item);
    }
    // Face boxes nested in upper body boxes refer to the same person. Only add
    // unmatched person boxes so the combined count does not double-count clear faces.
    const personBoxes=crowdPeople.filter(person=>{
     const [px,py,pw,ph]=person.bbox;
     const fx=px+pw/2,fy=py+ph*.3;
     return !unique.some(face=>{
      const [x,y,wBox,hBox]=face.bbox;
      return fx>=x-wBox*.15&&fx<=x+wBox*1.15&&fy>=y-hBox*.2&&fy<=y+hBox*1.5;
     });
    });
    const peopleCount=unique.length+personBoxes.length;
    this.lastPeopleCount=Math.min(20,peopleCount);this.lastObjectResult=unique;this.lastObjectMode="mediapipe-face-"+facingMode;
    this.lastObjectInferenceMs=performance.now()-started;this.lastSummary=this.lastPeopleCount+" visible people detected";
    return unique;
   }};
   this.peopleDetector=this.faceDetector;this.peopleFacingMode=facingMode;
   this.onModelState("object","loaded",facingMode==="environment"?"Rear-camera dual-range face detector ready":"Front-camera face detector ready");
   return this.peopleDetector;
  })();
  try{return await this.loading.people}
  catch(error){const message="Face detector failed to load. Check network access and retry: "+(error?.message||"model unavailable");this.onModelState("object","error",message);throw new Error(message)}
  finally{if(this.loading.peopleFacingMode===facingMode){this.loading.people=null;this.loading.peopleFacingMode=null}}
 }
 async loadHands(){
  if(this.handLandmarker)return this.handLandmarker;
  if(this.loading.hand)return this.loading.hand;
  this.onModelState("hand","loading","Loading MediaPipe Hand Landmarker…");
  this.loading.hand=(async()=>{
   const {FilesetResolver,HandLandmarker}=await import(HANDS_CDN);
   const vision=await FilesetResolver.forVisionTasks(HAND_WASM);
   const options={baseOptions:{modelAssetPath:HAND_MODEL,delegate:"GPU"},runningMode:"VIDEO",numHands:2,minHandDetectionConfidence:0.25,minHandPresenceConfidence:0.25,minTrackingConfidence:0.25};
   let task;
   try{task=await HandLandmarker.createFromOptions(vision,options);}
   catch(gpuError){
    try{task=await HandLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:HAND_MODEL,delegate:"CPU"}});}
    catch(cpuError){throw new Error("Hand model initialization failed on GPU and CPU. Check network access to MediaPipe model files. "+(cpuError?.message||gpuError?.message||"Unknown model initialization error"));}
   }
   this.handTask=task;
   const adapter={detect:async(video,timestamp=performance.now())=>{
    if(!video?.videoWidth||!video?.videoHeight||video.readyState<2)throw new Error("Camera frame is not ready.");
    const ts=Math.max(this.lastHandTimestamp+1,Math.floor(Number(timestamp)||performance.now()));this.lastHandTimestamp=ts;
    let result;
    try{result=task.detectForVideo(video,ts);}catch(error){this.lastHandError=error?.message||String(error);throw new Error("Hand landmark inference failed: "+this.lastHandError);}
    this.lastHandError="";
    const landmarks=(result?.landmarks||[]).filter(points=>Array.isArray(points)&&points.length>=21&&points.every(p=>Number.isFinite(Number(p?.x))&&Number.isFinite(Number(p?.y)))).map(points=>points.map(p=>({x:Number(p.x),y:Number(p.y),z:Number(p.z)||0})));
    const handednesses=(result?.handednesses||[]).map(pair=>[{categoryName:pair?.[0]?.categoryName||"Unknown",score:Number(pair?.[0]?.score)||0}]);
    this.latestHandResult={landmarks,handednesses};this.latestHandResultAt=performance.now();return this.latestHandResult;
   },getLatestResult:()=>this.latestHandResult||{landmarks:[],handednesses:[]},getLastError:()=>this.lastHandError||""};
   this.handLandmarker=adapter;this.onModelState("hand","loaded","MediaPipe Hand Landmarker loaded (up to two hands)");return adapter;
  })();
  try{return await this.loading.hand}
  catch(error){const message="Hand model failed to load: "+(error?.message||"runtime/download error");this.onModelState("hand","error",message);throw new Error(message)}
  finally{this.loading.hand=null}
 }
 async ensureMode(mode,facingMode=this.currentFacingMode){this.currentMode=mode;this.currentFacingMode=facingMode;if(mode==="objects")return this.loadObjects();if(mode==="people")return this.loadPeople(facingMode);if(mode==="drawing"||mode==="portal")return this.loadHands();return null}
 markInference(model){this.onModelState(model==="hand"?"hand":"object","ready",model==="hand"?"Hand landmarks updating from fresh video frames":this.currentMode==="people"?"Multi-person detector analyzing live frames":"Local object detector analyzing the hand area")}
 dispose(){try{this.handTask?.close?.()}catch{}try{this.faceTask?.close?.()}catch{}try{this.rearShortFaceTask?.close?.()}catch{}this.rearShortFaceTask=null;this.handTask=null;this.faceTask=null;this.faceDetector=null;this.peopleDetector=null;this.objectModel=null;this.cocoModel=null;this.faceFacingMode=null;this.loading.people=null;this.loading.peopleFacingMode=null}
}
