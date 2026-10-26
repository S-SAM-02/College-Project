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
  const safeMode = ["objects", "people"].includes(mode) ? mode : "objects";
  const prompt = safeMode === "people"
    ? `Count the distinct real people physically visible in this full camera frame. Count each individual person once, not each face. Do not count posters, photographs, paintings, dolls, or people shown on a screen. Include partially visible real people if clearly present. For crowds, estimate every distinguishable individual, avoiding merging adjacent people when their bodies overlap. Output JSON only: {"people_count": integer, "objects": [], "hands": [], "summary": "brief note"}. Do not claim certainty where the scene is crowded or occluded.`
    : `Detect visible physical objects in the full camera frame, prioritizing the object most clearly presented and everyday objects such as phone, laptop, book, pen, pencil, bottle, cup, chair, table, keyboard, mouse, monitor, bag, notebook, paper, calculator, charger, headphones, glasses, keys, remote, plant, clothing, and household items. Do not restrict labels to that list. Return up to 25 distinct object instances. Ignore background pictures/posters as live people. Output JSON only: {"objects":[{"label":"phone","confidence":0.9,"bbox":[100,100,200,250]}],"people_count":1,"hands":[],"summary":"brief observation"}. bbox=[left,top,width,height] normalized 0..1000 from the top-left. Clamp boxes conceptually to the image and use conservative confidence 0..1. Count real people separately and do not infer people from depictions.`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
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
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      let message = payload?.error?.message || `OpenAI request failed (HTTP ${upstream.status}). Check API billing, API key permissions, and model access.`;
      if (upstream.status === 429) message = "OpenAI rate limit or API quota reached. Check API billing/limits, wait, then retry.";
      if (upstream.status === 401 || upstream.status === 403) message = "OpenAI rejected the API key or project permissions. Verify OPENAI_API_KEY and enabled model access in Vercel.";
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: message.slice(0, 240) });
    }
    const outputText = (payload.output || []).filter(item => item.type === "message")
      .flatMap(item => item.content || []).filter(item => item.type === "output_text")
      .map(item => item.text).join("\n");
    let result;
    try { result = JSON.parse(outputText); }
    catch { return res.status(502).json({ error: "OpenAI returned an unreadable result. Retry the frame or check the configured model." }); }

    const objects = (Array.isArray(result.objects) ? result.objects : []).slice(0, 25).flatMap(item => {
      const bbox = Array.isArray(item.bbox) ? item.bbox.map(Number) : [];
      const confidence = Number(item.confidence);
      const label = typeof item.label === "string" ? item.label.trim().slice(0, 60) : "";
      if (!label || bbox.length !== 4 || !bbox.every(Number.isFinite) || !Number.isFinite(confidence)) return [];
      let [x, y, w, h] = bbox;
      x = Math.max(0, Math.min(999, x)); y = Math.max(0, Math.min(999, y));
      w = Math.max(0, Math.min(1000 - x, w)); h = Math.max(0, Math.min(1000 - y, h));
      if (w < 1 || h < 1) return [];
      return [{ label, confidence: Math.max(0, Math.min(1, confidence)), bbox: [x, y, w, h] }];
    });
    const people = Number(result.people_count);
    return res.status(200).json({
      objects,
      people_count: Number.isFinite(people) ? Math.max(0, Math.min(1000, Math.round(people))) : 0,
      hands: [],
      summary: typeof result.summary === "string" ? result.summary.slice(0, 240) : ""
    });
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "OpenAI vision timed out after 25 seconds. Retry and check the deployment/API status if this repeats."
      : "Could not reach OpenAI vision. Check Vercel deployment logs and API connectivity.";
    return res.status(502).json({ error: message });
  } finally { clearTimeout(timeout); }
}
