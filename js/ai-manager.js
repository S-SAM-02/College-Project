const MEDIAPIPE_VERSION = "0.10.14";
const TFJS_VERSION = "4.22.0";
const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";
const TFJS_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@${TFJS_VERSION}/dist/tf.min.js`;
const COCO_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js`;
const HANDS_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const HAND_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL_FRONT = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const FACE_MODEL_REAR = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite";

function injectScript(src, test, label) {
  if (test()) return Promise.resolve();
  const existing = [...document.scripts].find(script => script.src === src);
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener("load", resolve, { once: true });
    existing.addEventListener("error", () => reject(new Error(`${label} failed to load. Check your network and retry.`)), { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error(`${label} failed to load. Check your network and retry.`)); };
    document.head.append(script);
  });
}

export class AIManager {
  constructor(onModelState, onNotice) {
    this.onModelState = onModelState;
    this.onNotice = onNotice;
    this.objectModel = null;
    this.zeroShotDetector = null;
    this.zeroShotLoading = null;
    this.zeroShotLastAt = 0;
    this.handLandmarker = null;
    this.handTask = null;
    this.faceTask = null;
    this.faceDetector = null;
    this.faceFacingMode = null;
    this.loadingPeopleFacingMode = null;
    this.currentFacingMode = "user";
    this.loading = { object: null, hand: null, people: null };
    this.currentMode = "objects";
    this.lastPeopleCount = 0;
    this.lastSummary = "";
    this.lastFrameAt = 0;
    this.lastObjectResult = null;
    this.lastObjectInferenceAt = 0;
    this.lastObjectMode = "";
    this.lastFaceTimestamp = 0;
  }

  async loadZeroShotObjects() {
    if (this.zeroShotDetector) return this.zeroShotDetector;
    if (this.zeroShotLoading) return this.zeroShotLoading;
    this.onModelState("object", "loading", "Loading open-vocabulary object model (first download can be large)…");
    this.zeroShotLoading = (async () => {
      const mod = await import(TRANSFORMERS_CDN);
      const pipeline = mod.pipeline;
      if (typeof pipeline !== "function") throw new Error("Open-vocabulary detector failed to initialize.");
      const detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", {
        device: "webgpu",
        dtype: "q8"
      }).catch(async () => pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", {
        device: "wasm",
        dtype: "q8"
      }));
      this.zeroShotDetector = {
        detect: async video => {
          if (!video?.videoWidth || !video?.videoHeight) throw new Error("Waiting for a live camera frame.");
          const now = performance.now();
          if (now - this.zeroShotLastAt < 1350 && this.lastObjectMode === "zero-shot") {
            return this.lastObjectResult?.predictions || [];
          }
          this.zeroShotLastAt = now;
          const w = video.videoWidth, h = video.videoHeight;
          const canvas = document.createElement("canvas");
          const targetW = Math.min(640, w);
          const targetH = Math.round(h * targetW / w);
          canvas.width = targetW; canvas.height = targetH;
          canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0, targetW, targetH);
          const candidates = [
            "pen", "pencil", "marker", "highlighter", "eraser", "notebook", "book", "paper", "calculator",
            "laptop", "computer monitor", "keyboard", "computer mouse", "mobile phone", "smartphone",
            "headphones", "earphones", "headset", "USB flash drive", "charger", "power bank", "cable",
            "water bottle", "cup", "mug", "backpack", "school bag", "wallet", "keys", "watch", "glasses",
            "scissors", "stapler", "tape dispenser", "ruler", "desk lamp", "chair", "table", "plant",
            "flower pot", "remote control", "camera", "tripod", "microphone", "speaker", "ID card",
            "shoe", "cap", "ball", "person", "face", "hand", "phone case", "lunch box", "umbrella"
          ];
          const output = await detector(canvas, candidates, { threshold: 0.055, top_k: 15 });
          const items = (Array.isArray(output) ? output : []).map(d => {
            const box = d.box || {};
            const x1 = Math.max(0, Math.min(w, Number(box.xmin) * w / targetW));
            const y1 = Math.max(0, Math.min(h, Number(box.ymin) * h / targetH));
            const x2 = Math.max(x1, Math.min(w, Number(box.xmax) * w / targetW));
            const y2 = Math.max(y1, Math.min(h, Number(box.ymax) * h / targetH));
            return {
              class: String(d.label || "object").toLowerCase().replace(/[\\s-]+/g, "_"),
              score: Number(d.score) || 0,
              bbox: [x1, y1, x2 - x1, y2 - y1]
            };
          }).filter(d => d.score >= 0.055 && d.bbox[2] > 8 && d.bbox[3] > 8);
          const bestByLabel = new Map();
          for (const item of items) {
            const prior = bestByLabel.get(item.class);
            if (!prior || item.score > prior.score) bestByLabel.set(item.class, item);
          }
          const mapped = [...bestByLabel.values()].sort((a, b) => b.score - a.score).slice(0, 15);
          this.lastObjectResult = { at: now, predictions: mapped };
          this.lastObjectInferenceAt = now;
          this.lastObjectMode = "zero-shot";
          this.lastSummary = mapped.map(item => item.class).join(", ");
          this.lastPeopleCount = mapped.filter(item => item.class === "person").length;
          return mapped;
        }
      };
      this.onModelState("object", "loaded", "Open-vocabulary model loaded; recognizes prompted common items");
      return this.zeroShotDetector;
    })();
    try { return await this.zeroShotLoading; }
    catch (error) {
      this.onModelState("object", "error", "Open-vocabulary model unavailable: " + (error?.message || "download failed"));
      throw error;
    } finally { this.zeroShotLoading = null; }
  }

  async loadObjects() {
    if (this.objectModel) return this.objectModel;
    if (this.loading.object) return this.loading.object;
    this.onModelState("object", "loading", "Loading local object and person detector…");
    this.loading.object = (async () => {
      await injectScript(TFJS_CDN, () => Boolean(window.tf), "TensorFlow.js runtime");
      await window.tf.ready();
      await injectScript(COCO_CDN, () => Boolean(window.cocoSsd), "COCO-SSD detector");
      try { await window.tf.setBackend("webgl"); await window.tf.ready(); }
      catch { try { await window.tf.setBackend("cpu"); await window.tf.ready(); } catch {} }
      const detector = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
      const model = {
        detect: async video => {
          if (!video?.videoWidth || !video?.videoHeight) throw new Error("Waiting for a live camera frame.");
          const now = performance.now();
          if (this.lastObjectMode === "coco" && now - this.lastObjectInferenceAt < 650) {
            return this.lastObjectResult?.predictions || [];
          }
          this.lastObjectInferenceAt = now;
          const predictions = await detector.detect(video, 20, 0.28);
          const w = video.videoWidth, h = video.videoHeight;
          const people = predictions.filter(p => p.class === "person" && p.score >= 0.35);
          this.lastPeopleCount = people.length;
          const mapped = predictions.map(p => ({
            class: String(p.class || "object").toLowerCase().replace(/[\s-]+/g, "_"),
            score: Number(p.score) || 0,
            bbox: Array.isArray(p.bbox) ? [
              Math.max(0, p.bbox[0]), Math.max(0, p.bbox[1]),
              Math.min(w, p.bbox[0] + p.bbox[2]) - Math.max(0, p.bbox[0]),
              Math.min(h, p.bbox[1] + p.bbox[3]) - Math.max(0, p.bbox[1])
            ] : [0, 0, 0, 0]
          })).filter(p => p.bbox[2] > 0 && p.bbox[3] > 0);
          this.lastObjectResult = { at: now, predictions: mapped };
          this.lastObjectMode = "coco";
          return mapped;
        }
      };
      this.objectModel = model;
      this.onModelState("object", "loaded", "Local COCO-SSD model loaded; analyzing live frames");
      return model;
    })();
    try { return await this.loading.object; }
    catch (error) {
      this.onModelState("object", "error", error?.message || "Local object detector could not load.");
      throw error;
    } finally { this.loading.object = null; }
  }

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

  async loadHands() {
    if (this.handLandmarker) return this.handLandmarker;
    if (this.loading.hand) return this.loading.hand;
    this.onModelState("hand", "loading", "Loading local hand-landmark model…");
    this.loading.hand = (async () => {
      const { FilesetResolver, HandLandmarker } = await import(HANDS_CDN);
      const vision = await FilesetResolver.forVisionTasks(HAND_WASM);
      const options = {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4
      };
      try {
        this.handTask = await HandLandmarker.createFromOptions(vision, options);
      } catch {
        this.handTask = await HandLandmarker.createFromOptions(vision, {
          ...options, baseOptions: { modelAssetPath: HAND_MODEL, delegate: "CPU" }
        });
      }
      const adapter = {
        detectForVideo: (video, timestamp = performance.now()) => {
          const safeTimestamp = Math.max(0, Math.floor(timestamp));
          const result = this.handTask.detectForVideo(video, safeTimestamp);
          const landmarks = (result.landmarks || []).map(hand => hand.map(p => ({
            x: p.x, y: p.y, z: p.z || 0
          })));
          const handednesses = (result.handednesses || []).map(pair => {
            const category = pair?.[0];
            return [{ categoryName: category?.categoryName || "Unknown", score: category?.score || 0 }];
          });
          return { landmarks, handednesses };
        }
      };
      this.handLandmarker = adapter;
      this.onModelState("hand", "loaded", "Local hand landmark engine ready");
      return adapter;
    })();
    try { return await this.loading.hand; }
    catch (error) {
      const message = "Hand tracking failed to load. Check network access, then retry: " + (error?.message || "model unavailable");
      this.onModelState("hand", "error", message);
      throw new Error(message);
    } finally { this.loading.hand = null; }
  }

  async ensureMode(mode, facingMode = this.currentFacingMode) {
    this.currentMode = mode;
    this.currentFacingMode = facingMode;
    if (mode === "objects") return this.loadZeroShotObjects();
    if (mode === "people") return this.loadPeople(facingMode);
    if (mode === "drawing" || mode === "portal") return this.loadHands();
    return null;
  }

  markInference(model) {
    this.onModelState(model === "hand" ? "hand" : "object", "ready", model === "hand" ? "Local hand landmarks updating from live frames" : this.currentMode === "people" ? "Local face detector is analyzing the camera" : "Local COCO-SSD detector is analyzing the camera");
  }

  dispose() {
    try { this.handTask?.close?.(); } catch {}
    try { this.faceTask?.close?.(); } catch {}
    this.handTask = null;
    this.faceTask = null;
    this.faceDetector = null;
    this.faceFacingMode = null;
    this.handLandmarker = null;
    this.objectModel = null;
  }
}
