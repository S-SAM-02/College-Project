import { distance, Smoother, clamp } from "./image-processing.js";

export class HandTracker {
  constructor() {
    this.smoothers = new Map();
    this.fistFrames = 0;
    this.fistLatched = false;
    this.nextHandId = 1;
    this.previousHands = [];
  }

  process(result, width, height) {
    const source = Array.isArray(result?.landmarks) ? result.landmarks : [];
    const handednesses = Array.isArray(result?.handednesses) ? result.handednesses : [];
    const rawHands = source.filter(points => Array.isArray(points) && points.length >= 21);
    const hands = rawHands.map((raw, index) => {
      const category = handednesses[index]?.[0]?.categoryName;
      const modelSide = category === "Left" || category === "Right" ? category : "Unknown";
      const landmarks = raw.map(point => ({
        x: clamp(Number(point.x) || 0, 0, 1) * width,
        y: clamp(Number(point.y) || 0, 0, 1) * height,
        z: Number(point.z) || 0
      }));
      const wrist = landmarks[0];
      let bestPrevious = null;
      let bestDistance = Infinity;
      for (const previous of this.previousHands) {
        if (previous.used || (modelSide !== "Unknown" && previous.modelSide !== "Unknown" && previous.modelSide !== modelSide)) continue;
        const d = distance(wrist, previous.wrist);
        if (d < bestDistance) { bestDistance = d; bestPrevious = previous; }
      }
      let id;
      if (bestPrevious && bestDistance < Math.min(width, height) * 0.35) {
        id = bestPrevious.id;
        bestPrevious.used = true;
      } else {
        id = this.nextHandId++;
      }
      const key = String(id);
      if (!this.smoothers.has(key)) this.smoothers.set(key, new Smoother(0.72));
      const indexTip = this.smoothers.get(key).update(landmarks[8]);
      return { id, modelSide, side: modelSide === "Unknown" ? "Hand " + (index + 1) : modelSide, landmarks, indexTip, thumbTip: landmarks[4], wrist, raw };
    });
    this.previousHands = hands.map(hand => ({ id: hand.id, modelSide: hand.modelSide, wrist: hand.wrist, used: false }));

    const fist = hands.length > 0 && hands.every(hand => isFist(hand.raw));
    this.fistFrames = fist ? Math.min(this.fistFrames + 1, 12) : 0;
    if (this.fistFrames >= 4) this.fistLatched = true;
    if (!fist) this.fistLatched = false;
    return { hands, fist: this.fistLatched };
  }

  reset() {
    this.smoothers.clear();
    this.fistFrames = 0;
    this.fistLatched = false;
    this.previousHands = [];
    this.nextHandId = 1;
  }
}

export function pinchActive(hand) {
  const lm = hand?.raw;
  if (!Array.isArray(lm) || lm.length < 21) return false;
  const palmWidth = distance(lm[5], lm[17]);
  const palmLength = distance(lm[0], lm[9]);
  const palmScale = Math.max(palmWidth, palmLength * 0.65, 0.0001);
  return distance(lm[4], lm[8]) / palmScale < 0.55;
}

export function isFist(lm) {
  if (!Array.isArray(lm) || lm.length < 21) return false;
  const fingerTriples = [[8, 6, 5], [12, 10, 9], [16, 14, 13], [20, 18, 17]];
  let curled = 0;
  for (const [tip, pip, mcp] of fingerTriples) {
    const tipToWrist = distance(lm[tip], lm[0]);
    const pipToWrist = distance(lm[pip], lm[0]);
    const tipToMcp = distance(lm[tip], lm[mcp]);
    if (tipToWrist < pipToWrist * 1.18 || tipToMcp < distance(lm[mcp], lm[0]) * 0.65) curled++;
  }
  return curled >= 3;
}

export function drawHandSkeleton(ctx, hands) {
  const connections = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17]
  ];
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#168BFF";
  ctx.fillStyle = "#EAF5FF";
  ctx.shadowColor = "#168BFF88";
  ctx.shadowBlur = 7;
  for (const hand of hands) {
    for (const [a, b] of connections) {
      const p = hand.landmarks[a], q = hand.landmarks[b];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    for (const index of [0, 4, 8, 12, 16, 20]) {
      const point = hand.landmarks[index];
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 8 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}
