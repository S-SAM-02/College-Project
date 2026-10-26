// Hand-local object filtering. Coordinates are video/canvas pixels.
export function handZones(hands, width, height) {
  if (!Array.isArray(hands) || !width || !height) return [];
  return hands.flatMap(hand => {
    const points = Array.isArray(hand?.landmarks) ? hand.landmarks.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : [];
    if (points.length < 21) return [];
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
    const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
    const padX = Math.max(28, spanX * 0.9, width * 0.035);
    const padY = Math.max(32, spanY * 0.75, height * 0.035);
    return [{ left: Math.max(0, minX - padX), top: Math.max(0, minY - padY), right: Math.min(width, maxX + padX), bottom: Math.min(height, maxY + padY) }];
  });
}
export function filterObjectsNearHands(predictions, hands, width, height, minScore = 0.24) {
  if (!Array.isArray(predictions) || !Array.isArray(hands) || hands.length === 0) return [];
  const zones = handZones(hands, width, height);
  if (!zones.length) return [];
  return predictions.filter(item => {
    if (!item || item.class === "person" || item.class === "face" || !Number.isFinite(item.score) || item.score < minScore) return false;
    const box = item.bbox;
    if (!Array.isArray(box) || box.length < 4 || box[2] <= 0 || box[3] <= 0) return false;
    const [x,y,w,h] = box, cx = x + w/2, cy = y + h/2, area = w*h;
    return zones.some(zone => {
      if (cx >= zone.left && cx <= zone.right && cy >= zone.top && cy <= zone.bottom) return true;
      const ix = Math.max(0, Math.min(x+w,zone.right)-Math.max(x,zone.left));
      const iy = Math.max(0, Math.min(y+h,zone.bottom)-Math.max(y,zone.top));
      return area > 0 && ix*iy/area >= 0.45;
    });
  }).sort((a,b)=>b.score-a.score).slice(0,6);
}
