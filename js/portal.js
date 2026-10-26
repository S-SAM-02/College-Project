import { distance } from "./image-processing.js";

const TIP_INDEXES = [4, 8, 12, 16, 20];

export class HandPortal {
  constructor() {
    this.active = false;
    this.smooth = null;
    this.lastFrame = null;
  }

  render(ctx, hands, width, height, time = performance.now()) {
    ctx.clearRect(0, 0, width, height);
    if (!Array.isArray(hands) || hands.length < 2) {
      this.active = false;
      this.smooth = null;
      this.lastFrame = null;
      return { active: false, gesture: "Show both hands" };
    }

    const leftHand = hands[0];
    const rightHand = hands[1];
    const leftTips = TIP_INDEXES.map(index => leftHand.landmarks[index]);
    const rightTips = TIP_INDEXES.map(index => rightHand.landmarks[index]);
    if (leftTips.some(point => !point) || rightTips.some(point => !point)) {
      this.active = false;
      return { active: false, gesture: "Keep both hands fully visible" };
    }

    const leftThumb = leftTips[0], leftPinky = leftTips[4];
    const rightThumb = rightTips[0], rightPinky = rightTips[4];
    const corners = [leftThumb, rightThumb, rightPinky, leftPinky];
    const center = corners.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
    if (!this.smooth) this.smooth = { ...center };
    this.smooth.x += (center.x - this.smooth.x) * 0.32;
    this.smooth.y += (center.y - this.smooth.y) * 0.32;

    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    const spread = distance(leftThumb, rightThumb);
    const active = spread > Math.max(32, width * 0.035);
    this.active = active;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // A soft filled portal plane with a double-line champagne frame.
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = active ? `rgba(198,161,91,${0.035 + pulse * 0.025})` : "rgba(198,161,91,0.015)";
    ctx.fill();
    ctx.shadowColor = "#c6a15bcc";
    ctx.shadowBlur = active ? 18 + pulse * 10 : 6;
    ctx.strokeStyle = active ? "#c6a15bf0" : "#c6a15b80";
    ctx.lineWidth = active ? 2.4 : 1.4;
    ctx.stroke();
    ctx.shadowBlur = active ? 28 : 8;
    ctx.strokeStyle = `rgba(232,216,176,${0.35 + pulse * 0.28})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.stroke();

    // Connect like-for-like fingertips across both hands.
    for (let i = 0; i < TIP_INDEXES.length; i++) {
      const a = leftTips[i], b = rightTips[i];
      const strength = 0.44 + pulse * 0.38;
      ctx.shadowBlur = active ? 8 + pulse * 10 : 3;
      ctx.strokeStyle = `rgba(198,161,91,${strength})`;
      ctx.lineWidth = i === 1 ? 2 : 1.35;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(this.smooth.x + (i - 2) * 8, this.smooth.y + Math.sin(time / 220 + i) * 9, b.x, b.y);
      ctx.stroke();
      for (const point of [a, b]) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, (i === 1 ? 5 : 3.5) + pulse, 0, Math.PI * 2);
        ctx.fillStyle = "#fff8e7";
        ctx.strokeStyle = "#c6a15b";
        ctx.lineWidth = 1.4;
        ctx.fill();
        ctx.stroke();
      }
    }

    // Add a subtle inner frame to make the portal read as a rectangle.
    const inner = [leftTips[1], rightTips[1], rightTips[3], leftTips[3]];
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(232,216,176,${0.28 + pulse * 0.26})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(inner[0].x, inner[0].y);
    for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    return {
      active,
      gesture: active ? "Portal connected · all five finger pairs linked" : "Move hands apart to form the portal"
    };
  }

  reset() {
    this.active = false;
    this.smooth = null;
    this.lastFrame = null;
  }
}
