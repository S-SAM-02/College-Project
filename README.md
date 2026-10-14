# ANIME REALITY — Gesture-Controlled Anime Portal

A browser-based prototype for a BCA AI & ML assignment integrating Digital Image Processing (DIP), Natural Language Processing (NLP), and Machine Learning & Neural Networks (ML & NN).

## Current prototype
- Simple character-style selector (anime-inspired original styles)
- Webcam preview with start/stop controls
- Hand landmark tracking using MediaPipe Tasks Vision
- Four-finger gesture trigger (best-effort heuristic)
- Person segmentation/visual effect is planned for the next iteration; this initial scaffold does not claim full-body anime replacement yet
- Text command input for switching styles (simple command parsing; NLP model integration is planned)

## Run locally
Open `index.html` through a local web server (camera access generally requires HTTPS or localhost). For example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Important notes
- Allow camera permission when prompted.
- MediaPipe model assets and CDN access require an internet connection.
- This is a prototype. It does not yet transform the whole body into a fully animated anime character.
- For the assignment report, distinguish implemented features from planned enhancements.

## Subject mapping
- **DIP:** camera frames, visual overlay, and the next-stage person segmentation/masking pipeline.
- **NLP:** text commands to select scene/style; can be upgraded to a dedicated NLP model.
- **ML & NN:** MediaPipe hand landmark model and gesture interpretation; body-pose tracking can be added next.

## Next milestones
1. Add person segmentation and a masked anime-style shader/effect.
2. Add body-pose tracking.
3. Add robust finger counting and gesture calibration.
4. Add an NLP intent classifier and scene descriptions.
5. Test camera performance across browsers and devices.
