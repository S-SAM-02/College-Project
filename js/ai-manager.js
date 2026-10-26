export const COLLEGE_OBJECT_PROMPTS = ["person","bottle","cup","book","cell phone","laptop","keyboard","mouse","backpack","handbag","suitcase","umbrella","scissors","clock","vase","chair","remote","tv","sports ball","bowl","wine glass","fork","spoon","knife","banana","apple","orange"];
const MEDIAPIPE_VERSION="0.10.14",TFJS_VERSION="4.22.0";
const TFJS_CDN=`https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@${TFJS_VERSION}/dist/tf.min.js`;
const COCO_CDN="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";
const TRANSFORMERS_VERSION="3.7.2";
const TRANSFORMERS_CDN=`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}`;
const OWL_MODEL="Xenova/owlvit-base-patch32";
const OWL_PROMPTS=["pen","pencil","marker","book","calculator","laptop","keyboard","mouse","mobile phone","headphones","earphones","charger","power bank","bottle","cup","backpack","glasses","scissors","ruler","stapler","keys","watch","plant","flower pot","remote control","camera","microphone","speaker","ID card","water bottle","notebook","tablet","smartphone","wallet","umbrella","mug","water glass","shoe","bag","computer mouse","computer monitor","banana","apple","orange","sports ball","chair","clock","vase","handbag","suitcase"];
const HANDS_CDN=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const HAND_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_MODEL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL_FRONT="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const FACE_MODEL_REAR="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite";
function injectScript(src,test,label){if(test())return Promise.resolve();const found=[...document.scripts].find(s=>s.src===src);if(found)return new Promise((resolve,reject)=>{found.addEventListener("load",resolve,{once:true});found.addEventListener("error",()=>reject(new Error(label+" failed to load. Check network and retry.")),{once:true})});return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.async=true;s.crossOrigin="anonymous";s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error(label+" failed to load. Check network and retry."))};document.head.append(s)})}
export class AIManager{
 constructor(onModelState,onNotice){this.onModelState=onModelState;this.onNotice=onNotice;this.objectModel=null;this.handLandmarker=null;this.handTask=null;this.faceTask=null;this.faceDetector=null;this.faceFacingMode=null;this.currentFacingMode="user";this.loading={object:null,hand:null,people:null};this.currentMode="objects";this.lastPeopleCount=0;this.lastSummary="";this.lastObjectMode="";this.lastObjectResult=null;this.lastObjectInferenceAt=0;this.lastFaceTimestamp=0;this.lastHandTimestamp=0;this.lastObjectInferenceMs=0;}
 async loadObjects(){
  if(this.objectModel)return this.objectModel;
  if(this.loading.object)return this.loading.object;
  this.onModelState("object","loading","Loading open-vocabulary object detector…");
  this.loading.object=(async()=>{
    const transformers=await import(TRANSFORMERS_CDN);
    const {pipeline,env}=transformers;
    env.allowLocalModels=false;env.useBrowserCache=true;
    const detector=await pipeline("zero-shot-object-detection",OWL_MODEL,{device:"webgpu"});
    const model={detect:async video=>{
      if(!video?.videoWidth||!video?.videoHeight||video.readyState<2)throw new Error("Camera frame is not ready.");
      const started=performance.now();
      const output=await detector(video,OWL_PROMPTS,{threshold:0.13});
      const w=video.videoWidth,h=video.videoHeight;
      const mapped=(Array.isArray(output)?output:[]).map(item=>{
        const box=item.box||{},x1=Math.max(0,Math.min(w,Number(box.xmin)||0)),y1=Math.max(0,Math.min(h,Number(box.ymin)||0)),x2=Math.max(x1,Math.min(w,Number(box.xmax)||0)),y2=Math.max(y1,Math.min(h,Number(box.ymax)||0));
        return{class:String(item.label||"object").toLowerCase().replace(/[\s-]+/g,"_"),score:Number(item.score)||0,bbox:[x1,y1,x2-x1,y2-y1]};
      }).filter(p=>p.score>=0.13&&p.bbox[2]>0&&p.bbox[3]>0);
      this.lastObjectInferenceMs=performance.now()-started;this.lastObjectInferenceAt=performance.now();this.lastObjectMode="owlvit";this.lastObjectResult=mapped;this.lastPeopleCount=mapped.filter(p=>p.class==="person").length;this.lastSummary=mapped.map(p=>p.class).join(", ");return mapped;
    }};
    this.objectModel=model;
    this.onModelState("object","loaded","Open-vocabulary detector ready (prompted object labels)");
    return model;
  })();
  try{return await this.loading.object}
  catch(error){
    const message="Open-vocabulary detector failed to load. Check network access and memory, then retry: "+(error?.message||"unknown model error");
    this.onModelState("object","error",message);throw new Error(message);
  }finally{this.loading.object=null}
 }
  async loadPeople(facingMode = this.currentFacingMode) {
    this.currentFacingMode = facingMode;
    if (this.faceDetector && this.faceFacingMode === facingMode) return this.faceDetector;
    if (this.loading.people) { await this.loading.people.catch(() => {}); if (this.faceDetector && this.faceFacingMode === facingMode) return this.faceDetector; }
    if (this.faceTask && this.faceFacingMode !== facingMode) { try { this.faceTask.close?.(); } catch {} this.faceTask = null; this.faceDetector = null; }
    this.onModelState("object", "loading", "Loading local face detector…"); this.loadingPeopleFacingMode = facingMode;
    this.loading.people = (async () => {
      const { FilesetResolver, FaceDetector } = await import(HANDS_CDN);
      const vision = await FilesetResolver.forVisionTasks(HAND_WASM);
      const options = { baseOptions: { modelAssetPath: facingMode === "environment" ? FACE_MODEL_REAR : FACE_MODEL_FRONT, delegate: "GPU" }, runningMode: "VIDEO", minDetectionConfidence: 0.48, minSuppressionThreshold: 0.3 };
      let detector; try { detector = await FaceDetector.createFromOptions(vision, options); } catch { detector = await FaceDetector.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: facingMode === "environment" ? FACE_MODEL_REAR : FACE_MODEL_FRONT, delegate: "CPU" } }); }
      this.faceTask = detector; this.faceFacingMode = facingMode;
      this.faceDetector = { detect: async (video, timestamp = performance.now()) => {
        if (!video?.videoWidth || !video?.videoHeight) throw new Error("Waiting for a live camera frame.");
        const ts = Math.max(this.lastFaceTimestamp + 1, Math.floor(timestamp)); this.lastFaceTimestamp = ts;
        const result = detector.detectForVideo(video, ts), w = video.videoWidth, h = video.videoHeight;
        const detections = (result.detections || []).flatMap(detection => { const box = detection.boundingBox, score = Number(detection.categories?.[0]?.score); if (!box || !Number.isFinite(score) || score < 0.48) return []; const x = Math.max(0, Math.min(w, box.originX)), y = Math.max(0, Math.min(h, box.originY)), right = Math.max(x, Math.min(w, box.originX + box.width)), bottom = Math.max(y, Math.min(h, box.originY + box.height)); if (right <= x || bottom <= y) return []; return [{ class: "face", score, bbox: [x, y, right - x, bottom - y] }]; });
        this.lastPeopleCount = detections.length; this.lastSummary = `${detections.length} visible face(s) detected`; return detections;
      }};
      this.onModelState("object", "loaded", "Local face detector loaded; counting visible faces"); return this.faceDetector;
    })();
    try { return await this.loading.people; } catch (error) { const message = "Face detector failed to load. Check network access and retry: " + (error?.message || "model unavailable"); this.onModelState("object", "error", message); throw new Error(message); } finally { this.loading.people = null; }
  }
  async loadHands(){
    if(this.handLandmarker)return this.handLandmarker;
    if(this.loading.hand)return this.loading.hand;
    this.onModelState("hand","loading","Loading MediaPipe Hand Landmarker…");
    this.loading.hand=(async()=>{
      const {FilesetResolver,HandLandmarker}=await import(HANDS_CDN);
      const vision=await FilesetResolver.forVisionTasks(HAND_WASM);
      const baseOptions={modelAssetPath:HAND_MODEL,delegate:"GPU"};
      const options={baseOptions,runningMode:"VIDEO",numHands:2,minHandDetectionConfidence:0.25,minHandPresenceConfidence:0.25,minTrackingConfidence:0.25};
      let task;
      try{
        task=await HandLandmarker.createFromOptions(vision,options);
      }catch(gpuError){
        try{task=await HandLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:HAND_MODEL,delegate:"CPU"}});}
        catch(cpuError){
          throw new Error("Hand model initialization failed on GPU and CPU. Check network access to MediaPipe model files. "+(cpuError?.message||gpuError?.message||"Unknown model initialization error"));
        }
      }
      this.handTask=task;
      const adapter={
        detect:async(video,timestamp=performance.now())=>{
          if(!video||!video.videoWidth||!video.videoHeight||video.readyState<2)throw new Error("Camera frame is not ready.");
          const ts=Math.max(this.lastHandTimestamp+1,Math.floor(Number(timestamp)||performance.now()));
          this.lastHandTimestamp=ts;
          let result;
          try{result=task.detectForVideo(video,ts);}
          catch(error){
            this.lastHandError=error?.message||String(error);
            throw new Error("Hand landmark inference failed: "+this.lastHandError);
          }
          this.lastHandError="";
          const landmarks=(result?.landmarks||[]).filter(points=>Array.isArray(points)&&points.length>=21).map(points=>points.map(p=>({x:Number(p.x),y:Number(p.y),z:Number(p.z)||0})));
          const handednesses=(result?.handednesses||[]).map(pair=>[{categoryName:pair?.[0]?.categoryName||"Unknown",score:Number(pair?.[0]?.score)||0}]);
          this.latestHandResult={landmarks,handednesses};
          this.latestHandResultAt=performance.now();
          return this.latestHandResult;
        },
        getLatestResult:()=>this.latestHandResult||{landmarks:[],handednesses:[]},
        getLastError:()=>this.lastHandError||""
      };
      this.handLandmarker=adapter;
      this.onModelState("hand","loaded","MediaPipe Hand Landmarker loaded (up to two hands)");
      return adapter;
    })();
    try{return await this.loading.hand;}
    catch(error){const message="Hand model failed to load: "+(error?.message||"runtime/download error");this.onModelState("hand","error",message);throw new Error(message);}
    finally{this.loading.hand=null;}
  }
 async ensureMode(mode,facingMode=this.currentFacingMode){this.currentMode=mode;this.currentFacingMode=facingMode;if(mode==="objects")return this.loadObjects();if(mode==="people")return this.loadPeople(facingMode);if(mode==="drawing"||mode==="portal")return this.loadHands();return null}
 markInference(model){this.onModelState(model==="hand"?"hand":"object","ready",model==="hand"?"Hand landmarks updating from fresh video frames":this.currentMode==="people"?"Local face detector analyzing the camera":"COCO-SSD Lite detecting common categories")}
 dispose(){try{this.handTask?.close?.()}catch{}try{this.faceTask?.close?.()}catch{}this.handTask=null;this.faceTask=null;this.faceDetector=null;this.faceFacingMode=null;this.handLandmarker=null;this.objectModel=null}
}
