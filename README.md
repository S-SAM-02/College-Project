# OBJECT MIND — Intelligent Vision Lab

Premium white-and-gold browser computer-vision lab for object detection, hand landmarks, pinch-to-draw, a fingertip-connected portal effect, visible-person counting and natural-language controls.

## Publish
Enable **Settings → Pages → Deploy from a branch → main → /(root)**. This repository is configured for static hosting, but publishing must be enabled in GitHub settings. Visit the HTTPS Pages URL and allow camera access.

## Features
- **Object Finder:** real TensorFlow.js COCO-SSD detections, confidence labels and bounding boxes for supported classes.
- **Air Drawing:** MediaPipe Hand Landmarker, smoothed index landmark, pinch-to-draw and fist-to-clear.
- **Two-Hand Portal:** live tracked index fingertips, curved tether and activation hysteresis.
- **Person Finder:** counts current-frame COCO-SSD person-class detections; no face recognition or persistent unique-person tracking.
- **NLP:** rule-based mode/action commands; optional browser speech recognition.
- **DIP:** camera-aligned canvas sizing, coordinate mapping and landmark smoothing.
- **Measured metrics:** real render-loop FPS and recent inference latency.
- **Privacy:** app code does not upload or save camera frames.

## Tech and networking
TensorFlow.js 4.22.0, COCO-SSD 2.2.3, MediaPipe Tasks Vision 0.10.22, ES modules, Canvas and getUserMedia. Browser libraries and model weights load from jsDelivr and Google Cloud Storage when needed. Internet is required for model initialization. Camera video is processed inside the browser by application code; third-party CDN requests still expose ordinary network metadata.

## Run locally
Use Node.js 20+ and serve from a secure origin, for example `npx serve .`. Use HTTPS or localhost; a `file://` page is not recommended.

## Use
1. Select a mode and press **Start camera**.
2. Allow camera permission; wait for the selected model to complete valid inference.
3. Object Finder recognises only categories supported by COCO-SSD. A box means a model detection, not a verified grasp/held-object association.
4. Air Drawing: pinch thumb and index finger to draw; make a confirmed fist to clear.
5. Two-Hand Portal: bring both index fingertips closer; move apart to release.
6. Person Finder counts frame-based person detections. It can miss partial, small or occluded people and frame detections are not guaranteed unique people over time.
7. Commands include `open object finder`, `start hand drawing`, `activate portal`, `show person count`, `stop drawing`, `reset drawing`, `start camera`, and `stop camera`.

## Camera orientation and errors
Video uses native orientation by default; mirroring is optional. Camera access requires HTTPS or localhost. Switching cameras stops the old stream first; leaving/stopping releases tracks. The interface distinguishes camera permission errors and model failures. Browser/device performance varies.

## Quality checks
Run `npm run check` and `npm test`. GitHub Actions runs syntax checks, unit tests and entry-file checks on pushes/PRs.

## Test report
Unit tests cover coordinate scaling, box overlap, distances, smoothing, NLP mapping, count formatting and person filtering. CI is configured but must run on GitHub after commits. Physical-camera, cross-browser and hosted-page verification still require an actual browser/device; they are not claimed as completed here.