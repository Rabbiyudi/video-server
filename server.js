require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_BASE = "https://api.x.ai/v1/videos";

function buildPrompt(sentence) {
  return `Animate this LEGO-style image into a 6-8 second cinematic video. This image contains two main LEGO characters that MUST be preserved exactly:
1. HAMAN - the shorter LEGO figure in the foreground wearing black and dark red robes with gold details, black turban with red jewel, angry expression, black beard - he is leading the white horse
2. MORDECAI - the LEGO figure riding the white horse, wearing white and blue royal robes, white beard, golden crown
Keep ALL LEGO aesthetics, plastic textures, and toy-like appearance exactly as shown. Do NOT change any character designs, colors, or the Persian palace background. Only add motion: Haman walks forward pulling the horse, Mordecai sits proudly on the horse, capes flow slightly, the crowd of LEGO figures in background cheer with small arm movements, gentle camera push-in toward the characters. Haman shouts in clear Hebrew: '${sentence}'. Audio: only Haman's voice, bold and humiliated. No music, no text overlays, no subtitles. 16:9, smooth cinematic motion.`;
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
