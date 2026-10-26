# OBJECT MIND — Intelligent Vision Lab

Premium browser vision workspace with a mirrored selfie preview on the front-facing camera, unmirrored rear-camera preview, local two-hand tracking, OpenAI object analysis, and approximate visible-person counting.

## Deploy and configure

The OpenAI endpoint is `/api/vision`; GitHub Pages is static hosting and cannot execute that API route. Import this repository into Vercel, add `OPENAI_API_KEY` in Project → Settings → Environment Variables, then redeploy. Do not commit the key or expose it in frontend JavaScript. Optionally set `OPENAI_VISION_MODEL` to a vision-capable model enabled for your API project; default is `gpt-4.1-mini`.

OpenAI API usage is billed separately from a ChatGPT subscription. Object/person frames are compressed and sent to OpenAI for analysis. Hand tracking runs locally after loading the MediaPipe runtime and hand-landmark model from their public hosts.

## Features

- **Camera:** browser camera permissions; the front-facing preview and overlay are horizontally mirrored together so left/right movement feels natural. Rear camera stays unmirrored.
- **Air Drawing:** dedicated local 21-landmark hand tracking; pinch thumb and index to draw, close the hand into a fist to clear.
- **Two-Hand Portal:** local two-hand tracking updates the fingertips continuously; move both index fingers together to connect the portal effect.
- **Object Finder:** OpenAI vision returns visible object labels and approximate bounding boxes for sampled frames. Labels and boxes may be imperfect.
- **Person Finder:** OpenAI vision estimates the number of real people visible in a frame. It does not identify faces or track identities. Dense groups, partial people and occlusions can cause inaccurate counts.
- **Commands:** rule-based text commands and optional browser speech recognition.

## Troubleshooting

- If object/person analysis shows an error on GitHub Pages, deploy to Vercel: static hosting cannot run `/api/vision`.
- If the API fails after deployment, confirm `OPENAI_API_KEY` is configured for the deployment environment, that the API project has billing/model access, and inspect Vercel function logs. Redeploy after changing environment variables.
- If hand tracking does not initialize, ensure the browser/network can access jsDelivr and the MediaPipe model host, then press “Retry AI setup”. GPU initialization automatically falls back to CPU.
- Camera access requires HTTPS or localhost.
- A real device, camera, API key and deployed-host smoke test are still needed; automated syntax checks cannot prove all hardware/browser combinations.

## Accuracy notes

Local hand landmarks are suitable for more responsive gesture interaction than asking a general vision-language model to invent joint coordinates. Tracking can still fail under occlusion, poor lighting or motion blur. OpenAI image analysis is sampled at roughly one frame per second to limit latency and API cost, so object/person modes are not continuous 30/60-FPS detectors. A high crowd count remains an estimate, not a guarantee that every person has been counted exactly.

## Run checks

Requires Node.js 20+.

```sh
npm run check
npm test
```

For a local OpenAI endpoint test, use the Vercel CLI and an untracked local `.env.local` containing the key. Never commit that file.
