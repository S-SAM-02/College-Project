import { distance, Smoother, clamp } from "./image-processing.js";

export class HandTracker {
  constructor() {
    this.smoothers = new Map();
    this.fistFrames = 0;
    this.nextHandId = 1;
    this.previousHands = [];
  }

  process(result, width, height) {
    const source = Array.isArray(result?.landmarks) ? result.landmarks : [];
    const handednesses = Array.isArray(result?.handednesses) ? result.handednesses : [];
    const rawHands = source.filter(points => Array.isArray(points) && points.length >= 21);
    const usedPrevious = new Set();

    const hands = rawHands.map((raw, index) => {
      const side = handednesses[index]?.[0]?.categoryName;
      const modelSide = side === "Left" || side === "Right" ? side : "Unknown";
      const landmarks = raw.map(p => ({
        x: clamp(Number(p.x) || 0, 0, 1) * width,
        y: clamp(Number(p.y) || 0, 0, 1) * height,
        z: Number(p.z) || 0
      }));
      const wrist = landmarks[0];
      let previous = null, bestDistance = Infinity;
      for (const old of this.previousHands) {
        if (usedPrevious.has(old.id)) continue;
        if (modelSide !== "Unknown" && old.modelSide !== "Unknown" && modelSide !== old.modelSide) continue;
        const d = distance(wrist, old.wrist);
        if (d < bestDistance) { bestDistance = d; previous = old; }
      }

      const id = previous && bestDistance < Math.min(width, height) * 0.45 ? previous.id : this.nextHandId++;
      if (previous && id === previous.id) usedPrevious.add(previous.id);
      if (!this.smoothers.has(id)) this.smoothers.set(id, new Smoother(0.62));
      const indexTip = this.smoothers.get(id).update(landmarks[8]);
      return { id, modelSide, side: modelSide === "Unknown" ? "Hand " + (index + 1) : modelSide, landmarks, indexTip, thumbTip: landmarks[4], wrist, raw };
    });

    this.previousHands = hands.map(h => ({ id: h.id, modelSide: h.modelSide, wrist: h.wrist }));
    const fist = hands.length === 1 && isFist(hands[0].raw);
    this.fistFrames = fist ? Math.min(this.fistFrames + 1, 10) : 0;
    return { hands, fist: this.fistFrames >= 3 };
  }

  reset() { this.smoothers.clear(); this.fistFrames = 0; this.previousHands = []; this.nextHandId = 1; }
}

export function pinchActive(hand) {
  const lm = hand?.raw;
  if (!Array.isArray(lm) || lm.length < 21) return false;
  const palmWidth = distance(lm[5], lm[17]);
  const palmLength = distance(lm[0], lm[9]);
  const scale = Math.max(palmWidth, palmLength * 0.72, 0.0001);
  const pinchRatio = distance(lm[4], lm[8]) / scale;
  return Number.isFinite(pinchRatio) && pinchRatio < 0.82;
}

export function isFist(lm) {
  if (!Array.isArray(lm) || lm.length < 21) return false;
  const fingers = [[8,6,5],[12,10,9],[16,14,13],[20,18,17]];
  let curled = 0;
  for (const [tip, pip, mcp] of fingers) {
    const tipDistance = distance(lm[tip], lm[0]);
    const pipDistance = distance(lm[pip], lm[0]);
    const tipToMcp = distance(lm[tip], lm[mcp]);
    if (tipDistance < pipDistance * 1.22 || tipToMcp < distance(lm[mcp], lm[0]) * 0.70) curled++;
  }
  return curled >= 3;
}

export function drawHandSkeleton(ctx, hands) {
  const links = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#168BFF";
  ctx.fillStyle = "#EAF5FF";
  ctx.shadowColor = "#168BFF88";
  ctx.shadowBlur = 6;
  for (const hand of hands) {
    for (const [a,b] of links) {
      const p=hand.landmarks[a], q=hand.landmarks[b];
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
    }
    for (const i of [0,4,8,12,16,20]) {
      const p=hand.landmarks[i];
      ctx.beginPath(); ctx.arc(p.x,p.y,i===8?5:3.5,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}
