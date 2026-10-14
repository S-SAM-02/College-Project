# ANIME REALITY — AI Gesture Portal

A browser-based prototype for a BCA AI & ML assignment integrating Digital Image Processing (DIP), Natural Language Processing (NLP), and Machine Learning & Neural Networks (ML & NN).

## Current prototype
- Minimal interface with a camera start/stop control and full-screen/exit-full-screen button
- Five selectable anime-inspired themes: Solo Leveling-inspired Shadow Realm, One Piece-inspired Grand Voyage, Bleach-inspired Soul Reaper, Naruto-inspired Ninja Storm, and Demon Slayer-inspired Breathing Aura
- Live hand landmark tracking with MediaPipe Tasks Vision
- Four-finger gesture opens a square themed portal overlay around the detected hand; two fingers do not activate it
- Text commands can switch the selected theme using simple keyword-based intent matching

## Run locally
Serve this folder over localhost (camera access usually requires HTTPS or localhost):

```bash
python -m http.server 8000
```

Then open http://localhost:8000 and allow camera access.

## Important limitations
This is an early prototype. The portal is currently a themed animated graphic around the hand, not a rendered anime environment or full-body character replacement. Finger counting uses a simple landmark heuristic and may need calibration for different hand orientations. MediaPipe assets require internet access.

## Subject mapping
- **DIP:** camera frames and hand-region overlay positioning
- **NLP:** keyword-based interpretation of text commands to select a world
- **ML & NN:** MediaPipe's neural hand-landmark model and gesture interpretation

## Next milestones
1. Improve hand tracking and finger-count reliability across orientations.
2. Add person segmentation and a more convincing anime-scene effect inside the portal.
3. Add body-pose tracking if the character should follow the user's body.
4. Replace keyword matching with a proper NLP intent classifier if needed.
5. Test the deployed site on multiple browsers and devices.
