# OBJECT MIND — Intelligent Vision Lab

Premium browser vision workspace with an unmirrored live camera preview, OpenAI-powered sampled-frame analysis, approximate hand landmarks for gesture interactions, visible-person estimates, and natural-language controls.

## Important: deployment and API setup

The frontend no longer loads TensorFlow.js, COCO-SSD, MediaPipe, external model weights, or Google Fonts. It calls the server endpoint `/api/vision`, which sends compressed camera snapshots to the OpenAI Responses API. **GitHub Pages is static hosting and cannot run this API route. Deploy the repository to Vercel (or adapt the endpoint to another serverless Node host) for AI features to work.**

1. Import this GitHub repository into Vercel and deploy it.
2. In Vercel **Project → Settings → Environment Variables**, add `OPENAI_API_KEY` with your OpenAI API key. Do not put this secret in HTML, JavaScript, GitHub, or a public `.env` file.
3. Optionally set `OPENAI_VISION_MODEL` to a vision-capable model available to your OpenAI API project. The default is `gpt-4.1-mini`.
4. Redeploy after setting the environment variables.
5. Open the HTTPS deployment, allow camera access, and select the desired front or rear camera.

OpenAI API usage is billed separately from a ChatGPT subscription. No database is used by this application. The backend sets `store: false` for Responses API requests; sampled camera images are still transmitted to OpenAI for analysis. Do not use this app with sensitive footage unless you are comfortable with that data flow.

## Features

- **Camera:** standard browser `getUserMedia`; front/rear selection uses camera facing constraints; no CSS mirror transform is applied. Camera permissions require HTTPS or localhost.
- **Object Finder:** OpenAI vision analyzes a sampled frame and estimates visible object labels and bounding boxes for common home/college items. Labels and coordinates can be wrong; they are not detector-grade guarantees.
- **Air Drawing:** estimated 21-point hand landmarks are smoothed and used for pinch-to-draw and fist-to-clear interactions.
- **Two-Hand Portal:** a canvas effect follows estimated index fingertips; it is not a physical or 3D portal.
- **Person Finder:** uses the model's estimated number of visible people. It is not face recognition, persistent identity tracking, or an exact count.
- **Commands:** rule-based text commands and optional browser speech recognition remain local.
- **No database:** no database is configured or required.

## Accuracy and latency

GPT vision is a general image-understanding model, not a dedicated real-time hand-pose engine. Hand joint positions, object boxes, and person counts are approximate and may flicker or be incorrect, especially during fast motion, occlusion, or poor lighting. Requests are throttled to about one analyzed frame per second to limit latency and API usage. This cannot guarantee 100% hand tracking or 60–80% object recognition for every environment. If low-latency, reliable continuous hand tracking becomes a strict requirement, a dedicated on-device hand-landmark model would be technically more suitable, but that would conflict with the requirement to remove third-party models.

## Run checks

Requires Node.js 20+.

```sh
npm run check
npm test
```

For local camera access, serve the site over localhost. To test the OpenAI route locally, use the Vercel CLI and set `OPENAI_API_KEY` in a local untracked `.env.local` file. Never commit that file. A real camera, API-key, and deployed-host smoke test is still required; code checks alone do not prove end-to-end camera operation.
