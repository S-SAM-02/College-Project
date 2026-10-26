import { Smoother, clamp, distance } from "./image-processing.js";
import { pinchActive } from "./hand-tracking.js";

export class AirDrawing {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.smoother = new Smoother(0.82);
    this.lastPoint = null;
    this.strokeActive = false;
    this.enabled = true;
    this.wasFist = false;
    this.lastEraserPoint = null;
  }

  resize(width, height) {
    width = Math.max(1, Math.round(Number(width) || 1));
    height = Math.max(1, Math.round(Number(height) || 1));
    if (this.canvas.width === width && this.canvas.height === height) return false;
    const oldWidth = this.canvas.width, oldHeight = this.canvas.height;
    let snapshot = null;
    const doc = this.canvas.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (doc && oldWidth > 0 && oldHeight > 0) {
      snapshot = doc.createElement("canvas");
      snapshot.width = oldWidth; snapshot.height = oldHeight;
      snapshot.getContext("2d")?.drawImage(this.canvas, 0, 0);
    }
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
    if (snapshot && this.ctx) this.ctx.drawImage(snapshot, 0, 0, oldWidth, oldHeight, 0, 0, width, height);
    this.lastPoint = null;
    this.lastEraserPoint = null;
    this.strokeActive = false;
    this.smoother.reset();
    return true;
  }

  process(hands, fist) {
    const hand = Array.isArray(hands) && hands.length ? hands[0] : null;
    if (fist && hand) {
      // Small moving eraser under the closed hand; never clear the whole ink layer.
      this.lastPoint = null;
      this.strokeActive = false;
      this.smoother.reset();
      const points = hand.landmarks || [];
      const palmPoints = [0, 5, 9, 13, 17].map(index => points[index]).filter(point =>
        Number.isFinite(point?.x) && Number.isFinite(point?.y));
      if (palmPoints.length) {
        const center = palmPoints.reduce((sum, point) => ({
          x: sum.x + point.x / palmPoints.length,
          y: sum.y + point.y / palmPoints.length
        }), { x: 0, y: 0 });
        const palmWidth = points[5] && points[17] ? distance(points[5], points[17]) : 0;
        const radius = clamp(palmWidth * 0.62 || this.canvas.width * 0.03, 18, Math.max(24, this.canvas.width * 0.065));
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.shadowBlur = 0;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = radius * 2;
        if (this.lastEraserPoint) {
          ctx.beginPath();
          ctx.moveTo(this.lastEraserPoint.x, this.lastEraserPoint.y);
          ctx.lineTo(center.x, center.y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        this.lastEraserPoint = center;
      }
      this.wasFist = true;
      return { drawing: false, gesture: "Fist eraser · move over the stroke to erase locally" };
    }
    this.wasFist = false;

    if (!this.enabled || !hand) {
      this.lastPoint = null;
      this.lastEraserPoint = null;
      this.strokeActive = false;
      this.smoother.reset();
      return { drawing: false, gesture: hand ? "Drawing paused · existing ink kept" : "Hand left view · existing ink kept" };
    }

    this.lastEraserPoint = null;
    if (pinchActive(hand)) {
      const point = this.smoother.update(hand.indexTip);
      if (!this.strokeActive) { this.lastPoint = null; this.strokeActive = true; }
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
    this.strokeActive = false;
    this.smoother.reset();
    return { drawing: false, gesture: "Touch thumb and index to draw · release to pause; existing ink stays" };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lastPoint = null;
    this.lastEraserPoint = null;
    this.strokeActive = false;
    this.smoother.reset();
  }
  pause() { this.enabled = false; this.lastPoint = null; this.lastEraserPoint = null; this.strokeActive = false; this.smoother.reset(); }
  resume() { this.enabled = true; }
}
