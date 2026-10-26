// Hand-local object filtering. Coordinates are video/canvas pixels.
// The held item often extends well beyond the hand landmarks, so use a generous
// hand-centred region and partial box overlap rather than requiring its centre
// to sit almost on top of the fingers.
export function handZones(hands, width, height) {
  if (!Array.isArray(hands) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  return hands.flatMap(hand => {
    const points = Array.isArray(hand?.landmarks)
      ? hand.landmarks.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
      : [];
    if (points.length < 21) return [];
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
    const padX = Math.max(42, spanX * 1.6, width * 0.075);
    const padY = Math.max(48, spanY * 1.45, height * 0.075);
    return [{
      left: Math.max(0, minX - padX),
      top: Math.max(0, minY - padY),
      right: Math.min(width, maxX + padX),
      bottom: Math.min(height, maxY + padY)
    }];
  });
}

export function filterObjectsNearHands(predictions, hands, width, height, minScore = 0.18) {
  if (!Array.isArray(predictions) || !Array.isArray(hands) || hands.length === 0) return [];
  const zones = handZones(hands, width, height);
  if (!zones.length) return [];
  return predictions.filter(item => {
    if (!item || item.class === "person" || item.class === "face" || !Number.isFinite(item.score) || item.score < minScore) return false;
    const box = item.bbox;
    if (!Array.isArray(box) || box.length < 4 || !box.slice(0, 4).every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return false;
    const [x, y, w, h] = box;
    const cx = x + w / 2, cy = y + h / 2, area = w * h;
    return zones.some(zone => {
      if (cx >= zone.left && cx <= zone.right && cy >= zone.top && cy <= zone.bottom) return true;
      const ix = Math.max(0, Math.min(x + w, zone.right) - Math.max(x, zone.left));
      const iy = Math.max(0, Math.min(y + h, zone.bottom) - Math.max(y, zone.top));
      // Objects may be mostly outside the hand region (for example a bottle
      // held by its neck); a modest overlap is enough to associate them.
      return area > 0 && ix * iy / area >= 0.12;
    });
  }).sort((a, b) => b.score - a.score).slice(0, 6);
}
