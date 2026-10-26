const FRAME_FINGERS = [4, 20];
const LINK_FINGERS = [8, 12, 16];

export class HandPortal {
  constructor() { this.active = false; }

  status(hands) {
    const valid = Array.isArray(hands)
      ? hands.filter(hand => Array.isArray(hand?.landmarks)
          && hand.landmarks.length >= 21
          && hand.landmarks.slice(0, 21).every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)))
      : [];
    const active = valid.length === 2;
    return {
      active,
      hands: valid.length,
      gesture: active ? "Portal connected · three straight fingertip links"
        : valid.length === 1 ? "Second hand not found" : "Show both hands"
    };
  }

  render(ctx, hands) {
    const state = this.status(hands);
    if (!state.active) {
      this.active = false;
      return state;
    }

    const ordered = [...hands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
    const left = ordered[0].landmarks;
    const right = ordered[1].landmarks;

    // Thumbs and little fingers form the rectangle edges; only the other three
    // fingers get separate, straight links. This avoids duplicate double lines.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#c6a15b";
    ctx.lineWidth = 1.8;
    for (const index of LINK_FINGERS) {
      ctx.beginPath();
      ctx.moveTo(left[index].x, left[index].y);
      ctx.lineTo(right[index].x, right[index].y);
      ctx.stroke();
    }

    const corners = [left[FRAME_FINGERS[0]], right[FRAME_FINGERS[0]], right[FRAME_FINGERS[1]], left[FRAME_FINGERS[1]]];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();

    this.active = true;
    return { ...state, gesture: "Portal connected · three straight fingertip links" };
  }

  reset() { this.active = false; }
}
