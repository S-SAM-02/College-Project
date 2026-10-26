export const COLLEGE_OBJECT_PROMPTS = ["person","bottle","cup","book","cell phone","laptop","keyboard","mouse","backpack","handbag","suitcase","umbrella","scissors","clock","vase","chair","remote","tv","sports ball","bowl","wine glass","fork","spoon","knife","banana","apple","orange"];
const MEDIAPIPE_VERSION="0.10.14",TFJS_VERSION="4.22.0";
const TFJS_CDN=`https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@${TFJS_VERSION}/dist/tf.min.js`;
const COCO_CDN="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";
const HANDS_CDN=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const HAND_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_MODEL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL_FRONT="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const FACE_MODEL_REAR="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite";
function injectScript(src,test,label){if(test())return Promise.resolve();const found=[...document.scripts].find(s=>s.src===src);if(found)return new Promise((resolve,reject)=>{found.addEventListener("load",resolve,{once:true});found.addEventListener("error",()=>reject(new Error(label+" failed to load.")),{once:true})});return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.async=true;s.crossOrigin="anonymous";s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error(label+" failed to load. Check network and retry."))};document.head.append(s)})}
export class AIManager{
 constructor(onModelState,onNotice){this.onModelState=onModelState;this.onNotice=onNotice;this.objectModel=null;this.handLandmarker=null;this.handTask=null;this.faceTask=null;this.faceDetector=null;this.faceFacingMode=null;this.currentFacingMode="user";this.loading={object:null,hand:null,people:null};this.currentMode="objects";this.lastPeopleCount=0;this.lastSummary="";this.lastObjectMode="";this.lastObjectResult=null;this.lastObjectInferenceAt=0;this.lastFaceTimestamp=0;this.lastHandTimestamp=0;this.lastObjectInferenceMs=0;}
 async loadObjects(){if(this.objectModel)return this.objectModel;if(this.loading.object)return this.loading.object;this.onModelState("object","loading","Loading COCO-SSD Lite real-time detector…");this.loading.object=(async()=>{await injectScript(TFJS_CDN,()=>Boolean(window.tf),"TensorFlow.js");await window.tf.ready();try{await window.tf.setBackend("webgl");await window.tf.ready()}catch{try{await window.tf.setBackend("cpu");await window.tf.ready()}catch{}}await injectScript(COCO_CDN,()=>Boolean(window.cocoSsd),"COCO-SSD");const detector=await window.cocoSsd.load({base:"lite_mobilenet_v2"});const model={detect:async video=>{if(!video?.videoWidth||!video?.videoHeight)throw new Error("Waiting for a live camera frame.");const started=performance.now(),pred=await detector.detect(video,20,0.28),w=video.videoWidth,h=video.videoHeight;const mapped=pred.map(p=>({class:String(p.class||"object").toLowerCase().replace(/[\\s-]+/g,"_"),score:Number(p.score)||0,bbox:Array.isArray(p.bbox)?[Math.max(0,p.bbox[0]),Math.max(0,p.bbox[1]),Math.min(w,p.bbox[0]+p.bbox[2])-Math.max(0,p.bbox[0]),Math.min(h,p.bbox[1]+p.bbox[3])-Math.max(0,p.bbox[1])]:[0,0,0,0]})).filter(p=>p.score>=0.28&&p.bbox[2]>0&&p.bbox[3]>0);this.lastObjectInferenceMs=performance.now()-started;this.lastObjectInferenceAt=performance.now();this.lastObjectMode="coco";this.lastObjectResult=mapped;this.lastPeopleCount=mapped.filter(p=>p.class==="person").length;this.lastSummary=mapped.map(p=>p.class).join(", ");return mapped}};this.objectModel=model;this.onModelState("object","loaded","COCO-SSD Lite ready — common categories only");return model})();try{return await this.loading.object}catch(e){this.onModelState("object","error","Object model failed to load: "+(e?.message||"runtime/download error"));throw e}finally{this.loading.object=null}}
  async loadPeople(facingMode = this.currentFacingMode) {
    this.currentFacingMode = facingMode;
    if (this.faceDetector && this.faceFacingMode === facingMode) return this.faceDetector;
    if (this.loading.people) {
      await this.loading.people.catch(() => {});
      if (this.faceDetector && this.faceFacingMode === facingMode) return this.faceDetector;
    }
    if (this.faceTask && this.faceFacingMode !== facingMode) {
      try { this.faceTask.close?.(); } catch {}
      this.faceTask = null;
      this.faceDetector = null;
    }
    this.onModelState("object", "loading", "Loading local face detector…");
    this.loadingPeopleFacingMode = facingMode;
    this.loading.people = (async () => {
      const { FilesetResolver, FaceDetector } = await import(HANDS_CDN);
      const vision = await FilesetResolver.forVisionTasks(HAND_WASM);
      const options = {
        baseOptions: { modelAssetPath: facingMode === "environment" ? FACE_MODEL_REAR : FACE_MODEL_FRONT, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.48,
        minSuppressionThreshold: 0.3
      };
      let detector;
      try {
        detector = await FaceDetector.createFromOptions(vision, options);
      } catch {
        detector = await FaceDetector.createFromOptions(vision, {
          ...options, baseOptions: { modelAssetPath: facingMode === "environment" ? FACE_MODEL_REAR : FACE_MODEL_FRONT, delegate: "CPU" }
        });
      }
      this.faceTask = detector;
      this.faceFacingMode = facingMode;
      this.faceDetector = {
        detect: async (video, timestamp = performance.now()) => {
          if (!video?.videoWidth || !video?.videoHeight) throw new Error("Waiting for a live camera frame.");
          const ts = Math.max(this.lastFaceTimestamp + 1, Math.floor(timestamp));
          this.lastFaceTimestamp = ts;
          const result = detector.detectForVideo(video, ts);
          const w = video.videoWidth, h = video.videoHeight;
          const detections = (result.detections || []).flatMap((detection) => {
            const box = detection.boundingBox;
            const score = Number(detection.categories?.[0]?.score);
            if (!box || !Number.isFinite(score) || score < 0.48) return [];
            const x = Math.max(0, Math.min(w, box.originX));
            const y = Math.max(0, Math.min(h, box.originY));
            const right = Math.max(x, Math.min(w, box.originX + box.width));
            const bottom = Math.max(y, Math.min(h, box.originY + box.height));
            if (right <= x || bottom <= y) return [];
            return [{ class: "face", score, bbox: [x, y, right - x, bottom - y] }];
          });
          this.lastPeopleCount = detections.length;
          this.lastSummary = `${detections.length} visible face(s) detected`;
          return detections;
        }
      };
      this.onModelState("object", "loaded", "Local face detector loaded; counting visible faces");
      return this.faceDetector;
    })();
    try { return await this.loading.people; }
    catch (error) {
      const message = "Face detector failed to load. Check network access and retry: " + (error?.message || "model unavailable");
      this.onModelState("object", "error", message);
      throw new Error(message);
    } finally { this.loading.people = null; }
  }

  async loadHands(){
    if(this.handLandmarker)return this.handLandmarker;
    if(this.loading.hand)return this.loading.hand;
    this.onModelState("hand","loading","Loading asynchronous MediaPipe two-hand landmarks…");
    this.loading.hand=(async()=>{
      const {FilesetResolver,HandLandmarker}=await import(HANDS_CDN);
      const vision=await FilesetResolver.forVisionTasks(HAND_WASM);
      const normalize=result=>({
        landmarks:(result?.landmarks||[]).map(points=>points.map(p=>({x:p.x,y:p.y,z:p.z||0}))),
        handednesses:(result?.handednesses||[]).map(pair=>[{categoryName:pair?.[0]?.categoryName||"Unknown",score:pair?.[0]?.score||0}])
      });
      const deliver=(result,timestamp)=>{
        const data=normalize(result);
        this.latestHandResult=data;
        this.latestHandResultAt=performance.now();
        this.handResultCount=(this.handResultCount||0)+1;
        try{this.onHandResult?.(data,timestamp,this.latestHandResultAt);}catch(error){this.lastHandError=error?.message||String(error);}
      };
      const options={
        baseOptions:{modelAssetPath:HAND_MODEL,delegate:"GPU"},
        runningMode:"LIVE_STREAM",numHands:2,
        minHandDetectionConfidence:0.32,minHandPresenceConfidence:0.32,minTrackingConfidence:0.32,
        resultListener:(result,input)=>deliver(result,input?.timestamp),
        errorListener:error=>{this.lastHandError=error?.message||String(error);}
      };
      try{this.handTask=await HandLandmarker.createFromOptions(vision,options);}
      catch{this.handTask=await HandLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:HAND_MODEL,delegate:"CPU"}});}
      const adapter={
        detectAsync:(video,timestamp=performance.now())=>{
          if(!video?.videoWidth)throw new Error("Camera frame is not ready.");
          const ts=Math.max(this.lastHandTimestamp+1,Math.floor(timestamp));this.lastHandTimestamp=ts;
          this.handTask.detectAsync(video,ts);
        },
        getLatestResult:()=>({result:this.latestHandResult||{landmarks:[],handednesses:[]},at:this.latestHandResultAt||0,count:this.handResultCount||0}),
        getLastError:()=>this.lastHandError||""
      };
      this.handLandmarker=adapter;
      this.onModelState("hand","loaded","MediaPipe asynchronous two-hand landmarks ready");
      return adapter;
    })();
    try{return await this.loading.hand;}
    catch(error){this.onModelState("hand","error","Hand model failed to load: "+(error?.message||"runtime/download error"));throw error;}
    finally{this.loading.hand=null;}
  }
 async ensureMode(mode,facingMode=this.currentFacingMode){this.currentMode=mode;this.currentFacingMode=facingMode;if(mode==="objects")return this.loadObjects();if(mode==="people")return this.loadPeople(facingMode);if(mode==="drawing"||mode==="portal")return this.loadHands();return null}
 markInference(model){this.onModelState(model==="hand"?"hand":"object","ready",model==="hand"?"Hand landmarks updating from fresh video frames":this.currentMode==="people"?"Local face detector analyzing the camera":"COCO-SSD Lite detecting common classes")}
 dispose(){try{this.handTask?.close?.()}catch{}try{this.faceTask?.close?.()}catch{}this.handTask=null;this.faceTask=null;this.faceDetector=null;this.faceFacingMode=null;this.handLandmarker=null;this.objectModel=null}
}
