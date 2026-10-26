# OBJECT MIND — Intelligent Vision Lab

A browser-first vision workspace with object detection, visible-face counting, hand landmarks, air drawing, and a two-hand fingertip portal.

## Current local models

- **Object Finder:** TensorFlow.js COCO-SSD Lite for fast, in-browser detection of common objects and people. Detection runs independently of hand tracking; objects outside its trained categories may not be recognized.
- **Person Finder:** MediaPipe Face Detector, using a short-range model for the front camera and full-range model for the rear camera. It counts face detections, not identities, and can miss small or occluded faces.
- **Air Drawing and Two-Hand Portal:** MediaPipe Hand Landmarker returns 21 landmarks per hand, with GPU-first and CPU fallback initialization. One hand is sufficient for hand tracking and drawing; the portal needs two hands to link fingertip pairs. Pinch thumb/index to draw; close a hand into a fist to clear.

## Run and deploy

Requires HTTPS or localhost, camera permission, a modern browser, and internet access for first-time model downloads. GitHub Pages can host the static app.

```sh
npm run check
npm test
```

## Troubleshooting

- Keep the whole hand inside the frame, use even lighting, and face the palm toward the camera.
- On first use, allow model files to finish downloading before testing. Check access to jsDelivr and TensorFlow.js model files if the object model fails to load.
- Select **Retry AI setup** after a model-loading failure.
- Object detections come from pretrained COCO-SSD weights; they are not guaranteed to identify every object.
- Person Finder counts detected faces, not people identities. It is not a validated crowd-counting model.
- The front-facing preview is mirrored; text labels remain readable.
