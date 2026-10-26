# OBJECT MIND — Intelligent Vision Lab

A browser-first computer-vision workspace with a mirrored front-camera preview, local two-hand tracking, air drawing, a two-hand portal, common-object detection, and visible-face counting.

## How the models work

The app layout and application logic are maintained in this repository. On first use, the browser downloads pretrained model runtime/weights:
- **TensorFlow.js + COCO-SSD** for common-object bounding boxes.
- **MediaPipe Face Detector** for visible-face detection in Person Finder.
- **MediaPipe Hand Landmarker** for 21 hand landmarks used by air drawing and two-hand gestures.

After these downloads, inference runs on the user's device. No API key or server endpoint is required for these core modes. Internet access is required on first use to fetch public library/model files. COCO-SSD recognizes common trained categories, not arbitrary items. Person Finder counts visible faces rather than identifying people; tiny, turned-away or occluded faces may be missed, and a face in a photo or poster can sometimes be detected.

## Features

- **Camera:** browser permission-based camera. The front-facing preview and canvas overlays are horizontally mirrored together; the rear camera remains unmirrored.
- **Air Drawing:** pinch thumb and index together to draw; release to pause; close your hand into a fist to clear the canvas.
- **Two-Hand Portal:** local two-hand tracking; bringing both index fingertips close activates the portal effect.
- **Object Finder:** COCO-SSD detections with bounding boxes and confidence for the model's supported common classes.
- **Person Finder:** local face detection and face boxes. This is not facial recognition and does not identify anyone.
- **Commands:** project-owned text-command parsing and optional browser speech recognition.

## Run and deploy

Requires a modern browser with camera support and a secure context (HTTPS or localhost). GitHub Pages can host the complete static app; core detection no longer relies on the `/api/vision` endpoint.

```sh
npm run check
npm test
```

## Troubleshooting

- If the camera is black, allow camera permission in browser site settings and reload.
- If a model is still loading, keep the page open and online. Press **Retry AI setup** after correcting network restrictions. Blocking jsDelivr or the MediaPipe model host can prevent first use.
- If front-camera movement feels reversed, ensure **Front camera · mirrored** is selected. Preview and overlays are mirrored together.
- If object or face detections are inconsistent, improve lighting, keep objects/faces fully in frame, and avoid motion blur. The pretrained models are general detectors, not guaranteed exact item or crowd classifiers.