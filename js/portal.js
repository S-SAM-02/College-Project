const TIP_INDEXES = [4, 8, 12, 16, 20];

export class HandPortal {
  constructor() { this.active = false; }

  status(hands) {
    const valid = Array.isArray(hands)
      ? hands.filter(h => Array.isArray(h?.landmarks) && h.landmarks.length >= 21
          && h.landmarks.slice(0, 21).every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)))
      : [];
    const active = valid.length === 2;
    return {
      active,
      hands: valid.length,
      gesture: active ? "Portal connected · five straight fingertip links"
        : valid.length === 1 ? "Second hand not found" : "Show both hands"
    };
  }

  render(ctx, hands, width, height) {
    const state = this.status(hands);
    if (!state.active) {
      this.active = false;
      return state;
    }

    // Sort hands by wrist X so the left/right portal edges are stable.
    const ordered = [...hands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
    const left = ordered[0].landmarks;
    const right = ordered[1].landmarks;
    const leftTips = TIP_INDEXES.map(i => left[i]);
    const rightTips = TIP_INDEXES.map(i => right[i]);

    // One clean fingertip-to-fingertip line per finger. No curves or duplicate inner frame.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#c6a15b";
    ctx.lineWidth = 1.8;
    for (let i = 0; i < TIP_INDEXES.length; i++) {
      const a = leftTips[i], b = rightTips[i];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Single rectangular frame using thumb/index and ring/little fingertip anchors.
    const corners = [leftTips[0], rightTips[0], rightTips[4], leftTips[4]];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.strokeStyle = "#c6a15b";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();

    this.active = true;
    return { ...state, gesture: "Portal connected · five straight fingertip links" };
  }

  reset() { this.active = false; }
}
