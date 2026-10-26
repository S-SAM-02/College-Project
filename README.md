# OBJECT MIND — Intelligent Vision Lab

Premium browser vision and gesture workspace with live object detection, hand landmarks, air drawing, two-hand fingertip portal, visible-person counting and text/optional voice commands.

## Publish on GitHub Pages
Open repository **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/(root)`. This project is static, but Pages publishing is a repository setting and must be enabled separately. Access the resulting HTTPS URL and allow camera access.

## Features
- Object Finder: TensorFlow.js 4.22.0 and COCO-SSD 2.2.3 (lite MobileNet V2), supported-class labels, confidence and live bounding boxes.
- Air Drawing and Portal: MediaPipe Tasks Vision 0.10.22 Hand Landmarker. Pinch-to-draw, fist-to-clear and fingertip-connected canvas portal effect.
- Person Finder: current-frame COCO-SSD person-class count, without facial identification.
- DIP: coordinate-aware canvas sizing and temporal smoothing.
- NLP: explicit rule-based commands plus optional browser Web Speech API.
- Metrics: measured frame-loop FPS and inference duration; model becomes READY only after live inference succeeds.
- Privacy: application camera frames are processed locally and are not uploaded or saved by this code.

## Run locally
Requires Node.js 20+. Serve this folder, for example with `npx serve .`, and open the localhost URL. Camera access requires HTTPS or localhost. Internet access is required to fetch browser libraries and model weights from jsDelivr and Google Cloud Storage. CDN requests expose ordinary network metadata; application code does not upload video frames.

## Usage
1. Choose a mode and click **Start camera**. Approve camera access.
2. Wait for a successful live inference and a READY model indicator.
3. Object Finder recognises only COCO-SSD's known classes; a box is not proof that an object is being held.
4. Air Drawing: pinch thumb and index fingertips to draw; a confirmed fist clears the canvas.
5. Two-Hand Portal: bring both index fingertips closer, then separate them to release.
6. Person Finder counts frame-based full-person detections. Partial/occluded people may be missed; detections across frames are not persistent unique-person identities.
7. Commands: `open object finder`, `start hand drawing`, `activate portal`, `show person count`, `stop drawing`, `reset drawing`, `start camera`, `stop camera`.

## Camera and limitations
Native orientation is the default; mirroring is optional. Camera switching stops previous tracks. Stop the session or leave the page to release camera resources. COCO-SSD supports a finite list of object labels and does not generate exhaustive product descriptions. Object-to-hand association is not a verified grasp classifier. Person Finder is full-person detection, not face counting. Browser, GPU, network and lighting affect performance. The portal is a canvas effect, not a real 3D portal.

## Quality checks and test report
Run `npm run check` and `npm test`. GitHub Actions checks JS syntax, unit tests and the main files on push/pull request. Tests cover coordinate scaling, box overlap, distances, smoothing, command parsing, count formatting and person filtering. A physical-camera run, hosted-browser interaction and cross-device test still require a real device and are not claimed as completed.