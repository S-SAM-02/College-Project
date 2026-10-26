import { Smoother } from "./image-processing.js";
import { pinchActive } from "./hand-tracking.js";

export class AirDrawing {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.smoother = new Smoother(0.78);
    this.lastPoint = null;
    this.enabled = true;
    this.wasFist = false;
  }

  process(hands, fist) {
    const hand = Array.isArray(hands) && hands.length ? hands[0] : null;
    if (fist && hand) {
      // Fist is a moving local eraser; it must not clear all existing strokes.
      this.lastPoint = null;
      this.smoother.reset();
      const points = hand.landmarks || [];
      const palmPoints = [0, 5, 9, 13, 17].map(index => points[index]).filter(point =>
        Number.isFinite(point?.x) && Number.isFinite(point?.y));
      if (palmPoints.length) {
        const center = palmPoints.reduce((sum, point) => ({
          x: sum.x + point.x / palmPoints.length,
          y: sum.y + point.y / palmPoints.length
        }), { x: 0, y: 0 });
        const ctx = this.ctx;
        const radius = Math.max(18, Math.min(34, this.canvas.width * 0.03));
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      this.wasFist = true;
      return { drawing: false, gesture: "Fist eraser · move over the stroke to erase locally" };
    }
    this.wasFist = false;

    if (!this.enabled || !hand) {
      // Hide/release the hand cursor without changing any pixels already drawn.
      this.lastPoint = null;
      this.smoother.reset();
      return { drawing: false, gesture: hand ? "Drawing paused" : "Drawing preserved · no hand in frame" };
    }

    if (pinchActive(hand)) {
      const point = this.smoother.update(hand.indexTip);
      if (this.lastPoint) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = "#F0C96D";
        ctx.lineWidth = Math.max(3, this.canvas.width * 0.004);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "#c6a15b38";
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        ctx.restore();
      } else {
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, Math.max(1.5, this.canvas.width * 0.002), 0, Math.PI * 2);
        this.ctx.fillStyle = "#F0C96D";
        this.ctx.fill();
      }
      this.lastPoint = point;
      return { drawing: true, gesture: "Pinch detected · drawing" };
    }

    this.lastPoint = null;
    this.smoother.reset();
    return { drawing: false, gesture: "Bring thumb and index closer to draw" };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lastPoint = null;
    this.smoother.reset();
  }
  pause() { this.enabled = false; this.lastPoint = null; this.smoother.reset(); }
  resume() { this.enabled = true; }
}
