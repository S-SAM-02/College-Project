const MEDIAPIPE_VERSION = "0.10.14";
const TFJS_VERSION = "4.22.0";
const TFJS_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@${TFJS_VERSION}/dist/tf.min.js`;
const COCO_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js`;
const HANDS_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const HAND_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

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
    this.handLandmarker = null;
    this.handTask = null;
    this.loading = { object: null, hand: null };
    this.currentMode = "objects";
    this.lastPeopleCount = 0;
    this.lastSummary = "";
    this.lastFrameAt = 0;
    this.lastObjectResult = null;
    this.lastObjectInferenceAt = 0;
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
          if (now - this.lastObjectInferenceAt < 650) {
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

  async ensureMode(mode) {
    this.currentMode = mode;
    if (mode === "objects" || mode === "people") return this.loadObjects();
    if (mode === "drawing" || mode === "portal") return this.loadHands();
    return null;
  }

  markInference(model) {
    this.onModelState(model === "hand" ? "hand" : "object", "ready", model === "hand" ? "Local hand landmarks updating from live frames" : "Local COCO-SSD detector is analyzing the camera");
  }

  dispose() {
    try { this.handTask?.close?.(); } catch {}
    this.handTask = null;
    this.handLandmarker = null;
    this.objectModel = null;
  }
}
