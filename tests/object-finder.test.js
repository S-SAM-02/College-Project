import test from 'node:test';
import assert from 'node:assert/strict';
import { handZones, filterObjectsNearHands } from '../js/object-in-hand.js';

const handAt = (x, y, span = 12) => ({
  landmarks: Array.from({ length: 21 }, (_, i) => ({
    x: x + (i % 4) * span / 3,
    y: y + Math.floor(i / 4) * span / 5
  }))
});

test('hand zones expand around a hand so a held object can extend beyond the fingers', () => {
  const zone = handZones([handAt(220, 140)], 640, 480)[0];
  assert.ok(zone.left < 220);
  assert.ok(zone.right > 220 + 12);
  assert.ok(zone.top < 140);
  assert.ok(zone.bottom > 140 + 48);
});

test('Object Finder detects a held item from partial overlap with the hand region', () => {
  const hands = [handAt(200, 120, 20)];
  const predictions = [
    { class: 'potted_plant', score: 0.31, bbox: [175, 30, 100, 150] },
    { class: 'cell_phone', score: 0.22, bbox: [210, 60, 85, 145] },
    { class: 'chair', score: 0.92, bbox: [420, 150, 110, 160] },
    { class: 'person', score: 0.99, bbox: [180, 35, 200, 370] }
  ];
  const result = filterObjectsNearHands(predictions, hands, 640, 480, 0.18);
  assert.deepEqual(result.map(x => x.class), ['cell_phone', 'potted_plant']);
});

test('Object Finder ignores full-scene detections when no hand is tracked', () => {
  assert.deepEqual(
    filterObjectsNearHands([{ class: 'bottle', score: 0.9, bbox: [20, 20, 60, 100] }], [], 640, 480),
    []
  );
});

test('Object Finder ignores invalid and low-confidence boxes', () => {
  const predictions = [
    { class: 'bottle', score: 0.12, bbox: [200, 120, 40, 60] },
    { class: 'cup', score: 0.8, bbox: [200, 120, 0, 60] },
    { class: 'phone', score: 0.6, bbox: [200, 120, 40, 60] }
  ];
  assert.deepEqual(filterObjectsNearHands(predictions, [handAt(200, 120)], 640, 480, 0.18).map(x => x.class), ['phone']);
});
