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
    return res.status(503).json({ error: "OpenAI backend is not configured. Add OPENAI_API_KEY to your Vercel project, then redeploy." });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const { image, mode = "objects" } = body || {};
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
    return res.status(400).json({ error: "Invalid or oversized camera image. Retry with the camera running." });
  }
  const safeMode = ["objects", "people", "drawing", "portal"].includes(mode) ? mode : "objects";
  const prompt = safeMode === "people"
    ? `Count distinct visible people in this image, including partial people where clearly visible. Count people, not faces, posters, or pictures of people. Do not guess a person from a portrait in the background. For a crowd, estimate each distinct visible person and avoid merging people unless they overlap so much they cannot be separated. Return JSON only with people_count (integer), objects (array with label/confidence/bbox), hands (empty array), and summary. Bounding boxes use [left,top,width,height] normalized 0..1000 from the top-left. Return visible real-world objects only; ignore drawings/posters/pictures as people. Current task: count people.`
    : safeMode === "objects"
    ? `Inspect the full image and detect visible physical objects, especially everyday items including phone, laptop, book, pen, pencil, bottle, cup, chair, table, keyboard, mouse, monitor, bag, notebook, paper, calculator, charger, headphones, glasses, keys, remote, and plant. Do not limit labels to a fixed vocabulary. Include up to 25 distinct object instances, not parts of a person or background decoration. Return JSON only with objects [{label,confidence,bbox}], people_count (integer), hands (empty array), summary. bbox=[left,top,width,height], all normalized 0..1000 relative to image dimensions from top-left. Use conservative confidence 0..1 and keep boxes inside image. People count is a separate estimate of real people physically present, not posters or photographs.`
    : `Estimate visible hands only for visual reference. Return JSON with objects [], people_count integer, hands array, summary. For each clearly visible hand return side Left/Right/Unknown and exactly 21 landmarks in order: wrist; thumb CMC,MCP,IP,tip; index MCP,PIP,DIP,tip; middle MCP,PIP,DIP,tip; ring MCP,PIP,DIP,tip; pinky MCP,PIP,DIP,tip. Each landmark uses x,y,z in 0..1 relative to the full image, origin top-left. If you cannot estimate a complete, coherent hand, return no hand. These are approximate visual points, not reliable motion tracking. Current task: ${safeMode}.`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let upstream;
    try {
      upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          store: false,
          input: [{ role: "user", content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image, detail: "high" }
          ] }],
          text: { format: { type: "json_object" } },
          max_output_tokens: safeMode === "people" ? 1800 : 2800
        })
      });
    } finally { clearTimeout(timeout); }
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = payload?.error?.message || `OpenAI request failed (HTTP ${upstream.status}). Check API billing, project permissions, and model access.`;
      const status = upstream.status === 429 ? 429 : upstream.status === 401 || upstream.status === 403 ? 502 : 502;
      return res.status(status).json({ error: message.slice(0, 240) });
    }
    const outputText = (payload.output || []).filter(item => item.type === "message")
      .flatMap(item => item.content || []).filter(item => item.type === "output_text")
      .map(item => item.text).join("\n");
    let result;
    try { result = JSON.parse(outputText); }
    catch { return res.status(502).json({ error: "OpenAI returned an unreadable result. Check model access and retry." }); }

    const objects = (Array.isArray(result.objects) ? result.objects : []).slice(0, 25).flatMap(item => {
      const bbox = Array.isArray(item.bbox) ? item.bbox.map(Number) : [];
      const confidence = Number(item.confidence);
      const label = typeof item.label === "string" ? item.label.trim().slice(0, 60) : "";
      if (!label || bbox.length !== 4 || !bbox.every(Number.isFinite) || !Number.isFinite(confidence)) return [];
      const [x, y, w, h] = bbox.map(v => Math.max(0, Math.min(1000, v)));
      if (w < 1 || h < 1 || x + w > 1100 || y + h > 1100) return [];
      return [{ label, confidence: Math.max(0, Math.min(1, confidence)), bbox: [x, y, w, h] }];
    });
    const hands = (Array.isArray(result.hands) ? result.hands : []).slice(0, 2).flatMap(hand => {
      if (!Array.isArray(hand.landmarks) || hand.landmarks.length !== 21) return [];
      const landmarks = hand.landmarks.map(p => ({ x: Number(p?.x), y: Number(p?.y), z: Number(p?.z) || 0 }));
      if (landmarks.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return [];
      return [{ side: ["Left", "Right"].includes(hand.side) ? hand.side : "Unknown", landmarks }];
    });
    const people = Number(result.people_count);
    return res.status(200).json({
      objects,
      people_count: Number.isFinite(people) ? Math.max(0, Math.min(1000, Math.round(people))) : 0,
      hands,
      summary: typeof result.summary === "string" ? result.summary.slice(0, 240) : ""
    });
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "OpenAI vision timed out. Retry, or check whether your API project is responding."
      : "Could not reach OpenAI vision. Check the Vercel deployment logs and API connectivity.";
    return res.status(502).json({ error: message });
  }
}
