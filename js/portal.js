const TIP_INDEXES = [4, 8, 12, 16, 20];

export class HandPortal {
  constructor() { this.active = false; this.smooth = null; }

  status(hands) {
    const valid = Array.isArray(hands) ? hands.filter(h => Array.isArray(h.landmarks) && h.landmarks.length >= 21) : [];
    const active = valid.length >= 2;
    return { active, hands: valid.length, gesture: active ? "Portal connected · five fingertip pairs linked" : valid.length === 1 ? "Second hand not found" : "Show both hands" };
  }

  render(ctx, hands, width, height, time = performance.now()) {
    const state = this.status(hands);
    const valid = Array.isArray(hands) ? hands.filter(h => Array.isArray(h.landmarks) && h.landmarks.length >= 21) : [];
    if (!state.active) { this.active = false; this.smooth = null; return state; }

    // Order by wrist x-position, not handedness labels that can flicker between frames.
    const ordered = [...valid].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
    const left = ordered[0], right = ordered[1];
    const leftTips = TIP_INDEXES.map(i => left.landmarks[i]);
    const rightTips = TIP_INDEXES.map(i => right.landmarks[i]);
    if ([...leftTips, ...rightTips].some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      this.active = false;
      return { active: false, hands: valid.length, gesture: "Move both hands fully into view" };
    }

    const corners = [leftTips[0], rightTips[0], rightTips[4], leftTips[4]];
    const center = corners.reduce((sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }), { x: 0, y: 0 });
    if (!this.smooth) this.smooth = { ...center };
    this.smooth.x += (center.x - this.smooth.x) * 0.45;
    this.smooth.y += (center.y - this.smooth.y) * 0.45;

    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    this.active = true;
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = `rgba(198,161,91,${0.05 + pulse * 0.04})`; ctx.fill();
    ctx.shadowColor = "#c6a15bcc"; ctx.shadowBlur = 15 + pulse * 12;
    ctx.strokeStyle = "#c6a15bf0"; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.shadowBlur = 12; ctx.strokeStyle = `rgba(232,216,176,${0.42 + pulse * 0.25})`; ctx.lineWidth = 1; ctx.stroke();

    for (let i = 0; i < TIP_INDEXES.length; i++) {
      const a = leftTips[i], b = rightTips[i];
      ctx.shadowBlur = 8 + pulse * 8;
      ctx.strokeStyle = `rgba(198,161,91,${0.55 + pulse * 0.28})`;
      ctx.lineWidth = i === 1 ? 2.5 : 1.6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(this.smooth.x + (i - 2) * 8, this.smooth.y + Math.sin(time / 220 + i) * 9, b.x, b.y);
      ctx.stroke();
      for (const p of [a, b]) {
        ctx.beginPath(); ctx.arc(p.x, p.y, (i === 1 ? 5 : 3.5) + pulse, 0, Math.PI * 2);
        ctx.fillStyle = "#fff8e7"; ctx.strokeStyle = "#c6a15b"; ctx.lineWidth = 1.4; ctx.fill(); ctx.stroke();
      }
    }
    const inner = [leftTips[1], rightTips[1], rightTips[3], leftTips[3]];
    ctx.shadowBlur = 10; ctx.strokeStyle = `rgba(232,216,176,${0.32 + pulse * 0.24})`; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(inner[0].x, inner[0].y);
    for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath(); ctx.stroke(); ctx.restore();
    return { active: true, hands: valid.length, gesture: "Portal connected · five fingertip pairs linked" };
  }

  reset() { this.active = false; this.smooth = null; }
}
