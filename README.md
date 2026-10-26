# OBJECT MIND — Intelligent Vision Lab

A browser-first vision workspace with local object detection, local face counting, MediaPipe hand tracking, air drawing, and a two-hand fingertip portal.

## Models

The UI and application logic are maintained in this repository. The browser downloads public pretrained runtimes/weights on first use:
- **Object Finder:** Transformers.js with `Xenova/owlvit-base-patch32`, an open-vocabulary detector prompted with a curated list of 50 college/everyday item names (pen, pencil, marker, book, calculator, laptop, keyboard, mouse, mobile phone, headphones, earphones, charger, power bank, bottle, cup, backpack, glasses, scissors, ruler, stapler, keys, watch, plant, flower pot, remote, camera, microphone, speaker, ID card and more). It returns approximate boxes/labels; it does not learn new weights from those names. Large downloads and slower inference are expected on first run. A local COCO-SSD fallback remains available if the open-vocabulary model cannot load.
- **Person Finder:** MediaPipe Face Detector with short-range model for front camera and full-range model for rear camera. It counts face detections, not people identities. It will undercount crowded scenes when faces are tiny, occluded, or turned away; it is not a validated 50–100 person crowd-counting system.
- **Air Drawing and Two-Hand Portal:** MediaPipe Hand Landmarker returns 21 landmarks per detected hand. Blue skeleton lines show the five fingers. Pinch thumb/index to draw; close the hand into a fist to clear. The portal links all five corresponding fingertip pairs when two hands are visible.

All inference runs in the browser after model download. No API key or server endpoint is needed for these modes. First use requires internet access to download public runtime/model files.

## Run and deploy

Requires HTTPS or localhost, camera permission, and a modern browser. GitHub Pages can host the static app.

```sh
npm run check
npm test
```

## Troubleshooting

- Keep items well-lit, still, and large enough in frame. Open-vocabulary detection is slower than fixed-class detectors and can still return false positives or miss unfamiliar views.
- The first object model download is large; allow it to finish once before expecting repeated detection. If it fails, use **Retry AI setup** and check network access to jsDelivr and Hugging Face.
- For hand tracking, keep the full hand visible, palm facing the camera, fingers separated, and use even lighting. Retry model setup if the blue landmark overlay never appears.
- Person Finder counts detected faces. It cannot guarantee that every person in a large crowd is found.
- The front-facing video preview is mirrored, while the object/face label text remains readable. The rear-facing preview and labels remain natural.