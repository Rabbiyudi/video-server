require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_BASE = "https://api.x.ai/v1/videos";

function buildPrompt(sentence) {
  return `Animate the uploaded image into a short cinematic video (6–8 seconds). Keep the style and characters exactly the same. Make Haman, who is leading the horse, walk forward and shout in clear hebrew: "${sentence}". Sync his mouth to the words. Add subtle motion: the horse walks, capes move slightly, and the crowd in the background has small cheering movements. Add a gentle camera push-in toward Haman and the rider. Keep lighting and colors unchanged. Audio: only Haman voice, bold and confident. No music, no text overlays, no subtitles. Output 16:9, smooth cinematic motion.`;
}

async function pollForResult(requestId) {
  const url = `${XAI_BASE}/${requestId}`;
  while (true) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${XAI_API_KEY}` },
    });
    const data = await res.json();
    console.log(`Poll ${requestId}: full response:`, JSON.stringify(data));

    if (data.video?.url) {
      console.log(`Poll ${requestId}: done, video URL received`);
      return data;
    }

    const status = data.status || data.state;
    console.log(`Poll ${requestId}: status=${status}`);

    if (status === "failed" || status === "error") {
      throw new Error(`Video generation failed: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
}

app.post("/generate-video", async (req, res) => {
  try {
    const { sentence, image_url } = req.body;
    if (!sentence || !image_url) {
      return res.status(400).json({ success: false, error: "Missing sentence or image_url" });
    }

    console.log("Starting video generation...");
    const genRes = await fetch(`${XAI_BASE}/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: buildPrompt(sentence),
        image_url,
        duration: 8,
        aspect_ratio: "16:9",
        resolution: "720p",
      }),
    });

    const genData = await genRes.json();
    if (!genRes.ok) {
      console.error("Generation request failed:", genData);
      return res.status(genRes.status).json({ success: false, error: genData });
    }

    const requestId = genData.request_id || genData.id;
    console.log(`Request ID: ${requestId}`);

    const result = await pollForResult(requestId);
    const videoUrl = result.video?.url || result.video_url || result.url || result.output?.url;

    res.json({ success: true, video_url: videoUrl });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
