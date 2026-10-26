const MEDIAPIPE_VERSION = "0.10.14";
const HANDS_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const HAND_MODEL = `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;

export class AIManager {
  constructor(onModelState, onNotice) {
    this.onModelState = onModelState;
    this.onNotice = onNotice;
    this.objectModel = null;
    this.handLandmarker = null;
    this.loading = { object: null, hand: null };
    this.currentMode = "objects";
    this.lastPeopleCount = 0;
    this.lastSummary = "";
    this.lastFrameAt = 0;
    this.objectFailureMessage = "";
  }
  async analyze(video, mode = this.currentMode) {
    if (!video?.videoWidth || !video?.videoHeight) throw new Error("Waiting for a live camera frame.");
    const now = performance.now();
    const wait = Math.max(0, 700 - (now - this.lastFrameAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const width = Math.min(960, video.videoWidth);
    const height = Math.round(video.videoHeight * width / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext("2d", { alpha: false });
    c.drawImage(video, 0, 0, width, height);
    const image = canvas.toDataURL("image/jpeg", 0.76);
    this.lastFrameAt = performance.now();
    const endpoint = new URL("../api/vision", import.meta.url);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, mode }),
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const hint = response.status === 404
        ? "This site is on static hosting. Deploy it to Vercel to enable /api/vision."
        : result.error || `Vision backend returned HTTP ${response.status}.`;
      throw new Error(hint);
    }
    this.lastPeopleCount = Number.isFinite(result.people_count) ? result.people_count : 0;
    this.lastSummary = typeof result.summary === "string" ? result.summary : "";
    return result;
  }
  async loadObjects() {
    if (this.objectModel) return this.objectModel;
    if (this.loading.object) return this.loading.object;
    this.onModelState("object", "loading", "Connecting to OpenAI vision backend…");
    this.loading.object = Promise.resolve({
      detect: async video => {
        const result = await this.analyze(video, this.currentMode);
        const w = video.videoWidth, h = video.videoHeight;
        return (result.objects || []).map(item => {
          const label = item.label.toLowerCase().trim().replace(/[\s-]+/g, "_");
          const [x, y, bw, bh] = item.bbox;
          return { class: label, score: item.confidence, bbox: [x * w / 1000, y * h / 1000, bw * w / 1000, bh * h / 1000] };
        });
      }
    });
    try {
      this.objectModel = await this.loading.object;
      this.onModelState("object", "loaded", "OpenAI vision client ready; waiting for first successful frame");
      return this.objectModel;
    } catch (e) {
      this.onModelState("object", "error", e.message);
      throw e;
    } finally { this.loading.object = null; }
  }
  async loadHands() {
    if (this.handLandmarker) return this.handLandmarker;
    if (this.loading.hand) return this.loading.hand;
    this.onModelState("hand", "loading", "Loading local hand-landmark engine…");
    this.loading.hand = (async () => {
      const { FilesetResolver, HandLandmarker } = await import(HANDS_CDN);
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45
      }).catch(() => HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45
      }));
      const lastVideoTime = new WeakMap();
      const adapter = {
        detectForVideo: (video, timestamp = performance.now()) => {
          const result = handLandmarker.detectForVideo(video, Math.max(timestamp, performance.now()));
          const landmarks = result.landmarks || [];
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
    catch (e) {
      const message = "Hand tracking engine could not load. Check the network, then retry: " + (e.message || "model unavailable");
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
    this.onModelState(model, "ready", model === "hand" ? "Local hand landmarks updating from live frames" : "OpenAI vision response received for a live camera frame");
  }
  dispose() {
    try { this.handLandmarker?.close?.(); } catch {}
    this.objectModel = null;
    this.handLandmarker = null;
  }
}
