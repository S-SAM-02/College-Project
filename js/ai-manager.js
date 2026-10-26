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
  }
  async analyze(video, mode = this.currentMode) {
    if (!video?.videoWidth || !video?.videoHeight) throw new Error("Waiting for a live camera frame.");
    const now = performance.now();
    if (now - this.lastFrameAt < 700) await new Promise(resolve => setTimeout(resolve, 700 - (now - this.lastFrameAt)));
    const width = Math.min(640, video.videoWidth);
    const height = Math.round(video.videoHeight * width / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0, width, height);
    const image = canvas.toDataURL("image/jpeg", 0.68);
    this.lastFrameAt = performance.now();
    const response = await fetch(new URL("../api/vision", import.meta.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, mode })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || (response.status === 404 ? "OpenAI backend route is not deployed. Deploy this project to Vercel and set OPENAI_API_KEY." : "OpenAI vision request failed."));
    this.lastPeopleCount = Number.isFinite(result.people_count) ? result.people_count : 0;
    this.lastSummary = typeof result.summary === "string" ? result.summary : "";
    return result;
  }
  async loadObjects() {
    if (this.objectModel) return this.objectModel;
    if (this.loading.object) return this.loading.object;
    this.onModelState("object", "loading", "Connecting to OpenAI vision…");
    this.loading.object = Promise.resolve({
      detect: async video => {
        const result = await this.analyze(video, this.currentMode);
        const w = video.videoWidth, h = video.videoHeight;
        return (result.objects || []).map(item => {
          const [x, y, bw, bh] = item.bbox;
          return {
            class: item.label.toLowerCase().trim().replace(/[\\s-]+/g, "_"),
            score: item.confidence,
            bbox: [x * w / 1000, y * h / 1000, bw * w / 1000, bh * h / 1000]
          };
        });
      }
    });
    this.objectModel = await this.loading.object;
    this.loading.object = null;
    this.onModelState("object", "loaded", "OpenAI vision connection ready; waiting for frame analysis");
    return this.objectModel;
  }
  async loadHands() {
    if (this.handLandmarker) return this.handLandmarker;
    if (this.loading.hand) return this.loading.hand;
    this.onModelState("hand", "loading", "Connecting to OpenAI vision for hand estimates…");
    this.loading.hand = Promise.resolve({
      detectForVideo: async video => {
        const result = await this.analyze(video, this.currentMode);
        const hands = Array.isArray(result.hands) ? result.hands : [];
        return {
          landmarks: hands.map(hand => hand.landmarks),
          handednesses: hands.map(hand => [{ categoryName: hand.side || "Unknown", score: 0.5 }])
        };
      }
    });
    this.handLandmarker = await this.loading.hand;
    this.loading.hand = null;
    this.onModelState("hand", "loaded", "OpenAI vision connection ready; hand landmarks are estimates");
    return this.handLandmarker;
  }
  async ensureMode(mode) {
    this.currentMode = mode;
    if (mode === "objects" || mode === "people") return this.loadObjects();
    if (mode === "drawing" || mode === "portal") return this.loadHands();
    return null;
  }
  markInference(model) {
    this.onModelState(model, "ready", "OpenAI vision response received for a live camera frame");
  }
  dispose() { this.objectModel = null; this.handLandmarker = null; }
}
