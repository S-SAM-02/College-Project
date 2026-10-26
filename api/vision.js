const MAX_IMAGE_CHARS = 1_500_000;
const MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to analyze a camera frame." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OpenAI backend is not configured. Add OPENAI_API_KEY to your deployment environment." });
  }
  const { image, mode = "objects" } = req.body || {};
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
    return res.status(400).json({ error: "A valid, compressed camera image is required." });
  }
  const safeMode = ["objects", "people", "drawing", "portal"].includes(mode) ? mode : "objects";
  const prompt = `Analyze this single camera frame for the OBJECT MIND vision interface. Return only valid JSON. Do not invent things hidden or too unclear to see. Coordinates are normalized to 0..1000 relative to the full image, origin at top-left. For each visible item return bbox [left, top, width, height], all normalized 0..1000. Keep boxes inside the image. Return at most 25 distinct visible object instances. Use concise everyday object labels (phone, laptop, book, pen, pencil, bottle, cup, mug, chair, table, keyboard, mouse, monitor, backpack, bag, notebook, paper, ruler, scissors, calculator, charger, headphones, glasses, keys, remote, plant, person, etc.) and confidence from 0 to 1. Do not count the same object twice. people_count is the estimated number of visible people. For hand tracking, only report hands clearly visible in the image. For each hand, provide side ("Left", "Right", or "Unknown") and exactly 21 landmarks in this order: wrist; thumb CMC, MCP, IP, tip; index MCP, PIP, DIP, tip; middle MCP, PIP, DIP, tip; ring MCP, PIP, DIP, tip; pinky MCP, PIP, DIP, tip. Every landmark is {x,y,z} normalized 0..1, x/y relative to the image. Estimate joints only when visible; if the hand is too occluded or unclear, omit it rather than fabricate landmarks. These are visual estimates, not precision sensor measurements. Current mode: ${safeMode}. Prioritize landmark estimates for drawing/portal modes, and object labels/boxes for objects/people modes. JSON shape: {"objects":[{"label":"phone","confidence":0.9,"bbox":[100,100,200,250]}],"people_count":1,"hands":[{"side":"Right","landmarks":[{"x":0.5,"y":0.5,"z":0}]}],"summary":"brief observation"}.`;
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image, detail: "high" }
          ]
        }],
        text: { format: { type: "json_object" } },
        max_output_tokens: 3500
      })
    });
    const payload = await upstream.json();
    if (!upstream.ok) {
      const message = payload?.error?.message || "OpenAI vision request failed.";
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: message.slice(0, 240) });
    }
    const outputText = (payload.output || [])
      .filter(item => item.type === "message")
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");
    let result;
    try { result = JSON.parse(outputText); }
    catch { return res.status(502).json({ error: "The vision service returned an unreadable result. Retry the frame." }); }
    const objects = (Array.isArray(result.objects) ? result.objects : []).slice(0, 25).flatMap(item => {
      const bbox = Array.isArray(item.bbox) ? item.bbox.map(Number) : [];
      const confidence = Number(item.confidence);
      const label = typeof item.label === "string" ? item.label.trim().slice(0, 60) : "";
      if (!label || bbox.length !== 4 || !bbox.every(Number.isFinite) || !Number.isFinite(confidence)) return [];
      const [x, y, w, h] = bbox.map(v => Math.max(0, Math.min(1000, v)));
      if (w < 1 || h < 1) return [];
      return [{ label, confidence: Math.max(0, Math.min(1, confidence)), bbox: [x, y, w, h] }];
    });
    const hands = (Array.isArray(result.hands) ? result.hands : []).slice(0, 2).flatMap(hand => {
      if (!Array.isArray(hand.landmarks) || hand.landmarks.length !== 21) return [];
      const landmarks = hand.landmarks.map(p => ({ x: Number(p?.x), y: Number(p?.y), z: Number(p?.z) || 0 }));
      if (landmarks.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return [];
      return [{ side: ["Left", "Right"].includes(hand.side) ? hand.side : "Unknown", landmarks }];
    });
    return res.status(200).json({
      objects,
      people_count: Math.max(0, Math.min(30, Math.round(Number(result.people_count) || 0))),
      hands,
      summary: typeof result.summary === "string" ? result.summary.slice(0, 240) : ""
    });
  } catch (error) {
    return res.status(502).json({ error: "Could not reach OpenAI vision. Check deployment network access and retry." });
  }
}
