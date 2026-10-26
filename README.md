# OBJECT MIND — Intelligent Vision Lab

A browser-first computer-vision workspace with a mirrored front-camera preview, local two-hand tracking, air drawing, a two-hand portal, local common-object detection, and visible-person counting.

## How the models work

The app's layout and application logic are maintained in this repository. On first use, the browser downloads pretrained model runtime/weights:
- **TensorFlow.js + COCO-SSD** for common-object bounding boxes and visible-person detections.
- **MediaPipe Hand Landmarker** for the 21 hand landmarks needed by air drawing and two-hand gestures.

After download, inference runs on the user's device. No OpenAI key or server API is required for these core modes. An internet connection is required on first load to fetch the public library/model files. COCO-SSD is limited to the common classes in its training set and cannot recognize every arbitrary item; person counts may miss people or double-count in crowds. It does not identify faces.

## Features

- **Camera:** browser permission-based camera. The front camera preview and canvas overlays mirror together for familiar selfie movement; the rear camera remains unmirrored.
- **Air Drawing:** pinch thumb and index together to draw; release to pause. Close your hand into a fist to clear.
- **Two-Hand Portal:** both hands are tracked locally; bringing the two index fingertips close connects the portal effect.
- **Object Finder:** local COCO-SSD detection of common objects with bounding boxes and confidence.
- **Person Finder:** local person-class detections. This is an approximate count and is not face recognition or identity tracking.
- **Commands:** project-owned text-command parsing and optional browser speech recognition.

## Run and deploy

Requires a modern browser with camera support and a secure context (HTTPS or localhost). GitHub Pages can host the complete static app; core detections no longer require the `/api/vision` server endpoint.

```sh
npm run check
npm test
```

## Troubleshooting

- If the camera is black, allow camera permission in browser site settings and reload.
- If a model is still loading, keep the page open and online. Press **Retry AI setup** after correcting any network restrictions. Browser or network policies that block jsDelivr or the MediaPipe model host will prevent the first model download.
- If front-camera movement feels reversed, confirm **Front camera · mirrored** is selected. Preview and overlays are mirrored together.
- If person counts are low or change between frames, ensure the whole scene is well lit and visible. COCO-SSD detects people independently in each frame; it does not reliably count hundreds of tightly overlapping people.