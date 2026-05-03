const axios = require('axios');

const STYLE_GUIDES = {
  cinematic: 'dramatic lighting, wide-angle lens, film grain, professional cinematography',
  anime: 'anime art style, vibrant colors, dynamic poses, cel-shaded',
  documentary: 'realistic, natural lighting, handheld camera feel, authentic',
  fantasy: 'magical atmosphere, ethereal glow, detailed fantasy world, epic scale',
  minimal: 'clean, simple, white background, product-shot quality'
};

async function generateScenePrompts(userPrompt, sceneCount = 3, style = 'cinematic') {
  const styleDesc = STYLE_GUIDES[style] || STYLE_GUIDES.cinematic;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const resp = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `You are a video director. Break this concept into exactly ${sceneCount} short video scene prompts for AI video generation.

Concept: "${userPrompt}"
Visual style: ${styleDesc}

Rules:
- Each scene: single vivid sentence, max 20 words
- Include camera movement (pan, zoom, tracking shot, dolly)
- Include lighting description
- Pure visuals, no dialogue
- Scenes must flow narratively

Return ONLY a JSON array, no markdown, no extra text:
["scene 1", "scene 2"]`
          }]
        },
        {
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          timeout: 15000
        }
      );

      const text = resp.data.content[0].text.trim();
      // Strip any accidental markdown fences
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, sceneCount);
      }
    } catch (err) {
      console.warn('[promptEngine] Anthropic API failed, using fallback:', err.message);
    }
  }

  return generateFallbackScenes(userPrompt, sceneCount, styleDesc);
}

function generateFallbackScenes(prompt, count, styleDesc) {
  const templates = [
    `Sweeping establishing shot of ${prompt}, ${styleDesc}, slow pan right`,
    `Dramatic close-up of ${prompt}, golden hour lighting, shallow depth of field`,
    `Wide aerial view of ${prompt}, ${styleDesc}, smooth dolly zoom in`,
    `Tracking shot following ${prompt}, cinematic color grade, soft bokeh`,
    `Final wide reveal of ${prompt}, epic scale, ${styleDesc}`
  ];

  return templates.slice(0, Math.min(count, templates.length));
}

module.exports = { generateScenePrompts };
