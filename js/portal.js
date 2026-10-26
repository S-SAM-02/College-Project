const FRAME_FINGERS = [4, 8];
const LINK_FINGERS = [12, 16, 20];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class HandPortal {
  constructor() {
    this.active = false;
    this.previous = new Map();
    this.lastTime = 0;
  }

  status(hands) {
    const valid = Array.isArray(hands)
      ? hands.filter(hand => Array.isArray(hand?.landmarks)
          && hand.landmarks.length >= 21
          && hand.landmarks.slice(0, 21).every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)))
      : [];
    return {
      active: valid.length === 2,
      hands: valid.length,
      gesture: valid.length === 2 ? "Portal connected · thumb-index frame locked"
        : valid.length === 1 ? "Second hand not found" : "Show both hands; pinch thumb and index to form each side"
    };
  }

  render(ctx, hands, width = ctx.canvas?.width || 1, height = ctx.canvas?.height || 1, timestamp = performance.now()) {
    const state = this.status(hands);
    if (!state.active) {
      this.active = false;
      this.previous.clear();
      return state;
    }
    const ordered = [...hands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
    const left = ordered[0].landmarks;
    const right = ordered[1].landmarks;
    const dt = this.lastTime ? Math.min(0.06, Math.max(0.001, (timestamp - this.lastTime) / 1000)) : 1 / 30;
    this.lastTime = timestamp;
    const smoothPoint = (key, p) => {
      const old = this.previous.get(key);
      const alpha = 1 - Math.exp(-dt * 18);
      const next = old ? { x: old.x + (p.x - old.x) * alpha, y: old.y + (p.y - old.y) * alpha } : { x: p.x, y: p.y };
      this.previous.set(key, next);
      return next;
    };
    const fingertip = (side, index) => smoothPoint(side + "-" + index, index === 4 ? (side === "L" ? left : right)[index] : (side === "L" ? left : right)[index]);
    const links = LINK_FINGERS.map(index => [fingertip("L", index), fingertip("R", index)]);
    const corners = [
      fingertip("L", FRAME_FINGERS[0]), fingertip("R", FRAME_FINGERS[0]),
      fingertip("R", FRAME_FINGERS[1]), fingertip("L", FRAME_FINGERS[1])
    ];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#7DB7FF";
    ctx.lineWidth = Math.max(2, width * 0.003);
    ctx.shadowColor = "#268CFF";
    ctx.shadowBlur = 12;
    // A narrow, subtly eased rope curves between fingers so it follows movement naturally.
    for (const [a, b] of links) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const bend = Math.min(28, Math.hypot(dx, dy) * 0.035);
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - bend, b.x, b.y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#D9B66F";
    ctx.lineWidth = Math.max(1.6, width * 0.0022);
    ctx.shadowColor = "#D9B66F";
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath(); ctx.stroke();
    for (const p of [...corners, ...links.flat()]) {
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, width * 0.0045), 0, Math.PI * 2);
      ctx.fillStyle = "#E5C77E"; ctx.fill();
    }
    ctx.restore();
    this.active = true;
    return { ...state, gesture: "Portal connected · thumb-index frame + flowing links" };
  }

  reset() { this.active = false; this.previous.clear(); this.lastTime = 0; }
}