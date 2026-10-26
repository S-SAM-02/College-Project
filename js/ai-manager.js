const MEDIAPIPE_VERSION="0.10.14";
const HANDS_CDN=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const HAND_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_MODEL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL_FRONT="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const FACE_MODEL_REAR="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite";
const TF_SCRIPT="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const COCO_SCRIPT="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";
const TRANSFORMERS_CDN="https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";
const OWL_VIT_MODEL="Xenova/owlvit-base-patch32";
export const OBJECT_PROMPTS=[
 "smartphone","mobile phone","cell phone","pen","ballpoint pen","pencil",
 "identity card","ID card","student ID badge","plastic card","USB cable",
 "wire","electrical cable","charging cable","charger cable","flowerpot",
 "flower pot","plant pot","potted plant","calculator","notebook","book",
 "water bottle","cup","laptop","keyboard","computer mouse","headphones",
 "earphones","power bank","remote control","keys","wallet","glasses","watch",
 "backpack","bag","scissors","phone charger","flower","plant","chair","person"
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
 const value=String(label||"object").toLowerCase().replace(/[_-]+/g," ").trim();
 if(["smartphone","mobile phone","cell phone","cellphone"].some(s=>value.includes(s)))return "mobile_phone";
 if(["identity card","id card","student id","id badge","identification card","plastic id"].some(s=>value.includes(s)))return "id_card";
 if(["usb cable","electrical cable","charging cable","charger cable","wire"].some(s=>value.includes(s)))return "cable";
 if(["flowerpot","flower pot","plant pot","potted plant"].some(s=>value.includes(s)))return "flowerpot";
 if(["ballpoint pen","ink pen","pen"].some(s=>value.includes(s)))return "pen";
 if(value.includes("pencil"))return "pencil";
 if(value.includes("earphone"))return "earphones";
 if(value.includes("headphone"))return "headphones";
 if(value.includes("power bank"))return "power_bank";
 return value.replace(/\s+/g,"_");
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
  this.currentFacingMode="user";this.loading={object:null,coco:null,hand:null,people:null};this.currentMode="objects";
  this.lastPeopleCount=0;this.lastSummary="";this.lastObjectMode="";this.lastObjectResult=null;this.lastObjectInferenceAt=0;
  this.lastFaceTimestamp=0;this.lastHandTimestamp=0;this.lastObjectInferenceMs=0;
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
   this.cocoModel={detect:async(video,maxNumBoxes=12,minScore=0.28)=>{
    if(!video?.videoWidth||!video?.videoHeight||video.readyState<2)throw new Error("Camera frame is not ready.");
    const started=performance.now(),found=await detector.detect(video,maxNumBoxes,minScore),w=video.videoWidth,h=video.videoHeight;
    const mapped=(Array.isArray(found)?found:[]).map(item=>{
     const b=item.bbox||[],x=Math.max(0,Math.min(w,Number(b[0])||0)),y=Math.max(0,Math.min(h,Number(b[1])||0));
     const right=Math.max(x,Math.min(w,x+(Number(b[2])||0))),bottom=Math.max(y,Math.min(h,y+(Number(b[3])||0)));
     return{class:String(item.class||"object").toLowerCase().replace(/[\s-]+/g,"_"),score:Number(item.score)||0,bbox:[x,y,right-x,bottom-y]};
    }).filter(p=>p.score>=minScore&&p.bbox[2]>0&&p.bbox[3]>0);
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
  this.onModelState("object","loading","Loading open-vocabulary object detector…");
  this.loading.object=(async()=>{
   try{
    const {pipeline}=await import(TRANSFORMERS_CDN);
    let detector=null,runtime="wasm";
    if(typeof navigator!=="undefined"&&navigator.gpu){
     try{detector=await pipeline("zero-shot-object-detection",OWL_VIT_MODEL,{device:"webgpu"});runtime="webgpu";}catch{}
    }
    if(!detector)detector=await pipeline("zero-shot-object-detection",OWL_VIT_MODEL);
    const canvas=document.createElement("canvas");
    let frameCtx=canvas.getContext("2d",{willReadFrequently:true});
    const model={detect:async video=>{
     if(!video?.videoWidth||!video?.videoHeight||video.readyState<2)throw new Error("Camera frame is not ready.");
     const w=video.videoWidth,h=video.videoHeight,started=performance.now();
     if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;frameCtx=canvas.getContext("2d",{willReadFrequently:true});}
     if(!frameCtx)throw new Error("Open-vocabulary detector could not prepare an image frame.");
     frameCtx.drawImage(video,0,0,w,h);
     let found;
     try{found=await detector(canvas,OBJECT_PROMPTS,{top_k:40,threshold:0.075});}
     catch(firstError){
      if(runtime!=="webgpu")throw firstError;
      detector=await pipeline("zero-shot-object-detection",OWL_VIT_MODEL);runtime="wasm";
      found=await detector(canvas,OBJECT_PROMPTS,{top_k:40,threshold:0.075});
     }
     const mapped=mapOpenVocabularyDetections(found,w,h,0.075);
     this.lastObjectInferenceMs=performance.now()-started;this.lastObjectInferenceAt=performance.now();
     this.lastObjectMode="owlvit-"+runtime;this.lastObjectResult=mapped;
     this.lastPeopleCount=mapped.filter(p=>p.class==="person").length;this.lastSummary=mapped.map(p=>p.class).join(", ");
     return mapped;
    }};
    this.objectModel=model;this.lastObjectMode="owlvit-"+runtime;
    this.onModelState("object","loaded","Open-vocabulary object detector ready");
    return model;
   }catch(owlError){
    const coco=await this.loadCocoDetector();
    this.objectModel={detect:async video=>{
     const result=await coco.detect(video,20,0.28);
     this.lastObjectMode="coco-ssd-fallback";return result;
    }};
    this.onModelState("object","loaded","Open-vocabulary model unavailable; common-object fallback ready");
    return this.objectModel;
   }
  })();
  try{return await this.loading.object}
  catch(error){const message="Object detector failed to load: "+(error?.message||"model unavailable");this.onModelState("object","error",message);throw new Error(message)}
  finally{this.loading.object=null}
 }
 async loadPeople(facingMode=this.currentFacingMode){
  this.currentFacingMode=facingMode;
  if(this.faceDetector&&this.faceFacingMode===facingMode)return this.faceDetector;
  if(this.loading.people){await this.loading.people.catch(()=>{});if(this.faceDetector&&this.faceFacingMode===facingMode)return this.faceDetector;}
  if(this.faceTask&&this.faceFacingMode!==facingMode){try{this.faceTask.close?.()}catch{}this.faceTask=null;this.faceDetector=null;this.faceFacingMode=null;}
  this.onModelState("object","loading",facingMode==="environment"?"Loading rear-camera face detector…":"Loading front-camera face detector…");
  this.loading.people=(async()=>{
   const {FilesetResolver,FaceDetector}=await import(HANDS_CDN);
   const vision=await FilesetResolver.forVisionTasks(HAND_WASM);
   const modelAssetPath=facingMode==="environment"?FACE_MODEL_REAR:FACE_MODEL_FRONT;
   const common={runningMode:"VIDEO",minDetectionConfidence:facingMode==="environment"?0.32:0.42,minSuppressionThreshold:0.2};
   let detector;
   try{detector=await FaceDetector.createFromOptions(vision,{...common,baseOptions:{modelAssetPath,delegate:"GPU"}});}
   catch(gpuError){try{detector=await FaceDetector.createFromOptions(vision,{...common,baseOptions:{modelAssetPath,delegate:"CPU"}});}catch(cpuError){throw new Error("Face detector failed to initialize for this camera. "+(cpuError?.message||gpuError?.message||"Unknown model error"));}}
   this.faceTask=detector;this.faceFacingMode=facingMode;
   this.faceDetector={detect:async(video,timestamp=performance.now())=>{
    if(!video?.videoWidth||!video?.videoHeight||video.readyState<2)throw new Error("Waiting for a live camera frame.");
    const ts=Math.max(this.lastFaceTimestamp+1,Math.floor(timestamp));this.lastFaceTimestamp=ts;const startedFace=performance.now();
    const result=detector.detectForVideo(video,ts),w=video.videoWidth,h=video.videoHeight;
    const detections=(result.detections||[]).flatMap(d=>{
     const box=d.boundingBox,score=Number(d.categories?.[0]?.score);
     if(!box||!Number.isFinite(score)||score<(facingMode==="environment"?0.32:0.42))return[];
     const x=Math.max(0,Math.min(w,box.originX)),y=Math.max(0,Math.min(h,box.originY));
     const right=Math.max(x,Math.min(w,box.originX+box.width)),bottom=Math.max(y,Math.min(h,box.originY+box.height));
     return right>x&&bottom>y?[{class:"face",score,bbox:[x,y,right-x,bottom-y]}]:[];
    });
    this.lastPeopleCount=detections.length;this.lastSummary=`${detections.length} face(s) detected`;
    this.lastObjectResult=detections;this.lastObjectMode="mediapipe-face-"+(facingMode==="environment"?"rear":"front");
    this.lastObjectInferenceMs=performance.now()-startedFace;return detections;
   }};
   this.onModelState("object","loaded",facingMode==="environment"?"Rear-camera face detector ready":"Front-camera face detector ready");
   return this.faceDetector;
  })();
  try{return await this.loading.people}
  catch(error){const message="Face detector failed to load: "+(error?.message||"model unavailable");this.onModelState("object","error",message);throw new Error(message)}
  finally{this.loading.people=null}
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
 async ensureMode(mode,facingMode=this.currentFacingMode){this.currentMode=mode;this.currentFacingMode=facingMode;if(mode==="objects")return this.loadObjects();if(mode==="people")return this.loadPeople();if(mode==="drawing"||mode==="portal")return this.loadHands();return null}
 markInference(model){this.onModelState(model==="hand"?"hand":"object","ready",model==="hand"?"Hand landmarks updating from fresh video frames":this.currentMode==="people"?"Multi-person detector analyzing live frames":"Open-vocabulary object detector analyzing live frames")}
 dispose(){try{this.handTask?.close?.()}catch{}try{this.faceTask?.close?.()}catch{}this.handTask=null;this.faceTask=null;this.faceDetector=null;this.peopleDetector=null;this.objectModel=null;this.cocoModel=null;this.faceFacingMode=null}
}
