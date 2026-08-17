// Claude vision-based photo ranker. Google Places returns photos ordered
// by "popularity," which for most restaurants means exterior shots, logos,
// or empty dining rooms — not food. This module takes N candidate photo
// URLs from Places and asks Claude to pick the one most likely to show
// the restaurant's food (or, failing that, its best atmosphere shot).
//
// Called by photo-fetcher.js when PHOTO_PICKER != "0" and an Anthropic
// key is set. Off means we just use the first (top-ranked) photo Google
// returns, same as before.
//
// Cost: one Haiku vision call per new restaurant (~$0.003 with 5 small
// images), cached along with the chosen URL. Existing cached entries
// aren't re-ranked — the DB just stores the final pick.
//
// Failure mode: fails to index 0 (Google's own top-ranked photo). A
// vision-API error never blocks a photo from being served.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.PHOTO_PICKER_MODEL || "claude-haiku-4-5";

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    index: { type: "integer", minimum: 0 },
    kind: {
      type: "string",
      enum: ["food", "drink", "interior", "exterior", "menu", "other"],
    },
  },
  required: ["index", "kind"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You rank candidate photos from a restaurant's Google Places listing. Pick the ONE that best represents what a diner would want to eat or drink there.

Priority order:
1. A plated dish, close-up of food, or table with multiple dishes
2. A cocktail, coffee, or notable drink
3. A bakery/pastry case with visible food items
4. Ingredients or open-kitchen action shots that show food

If NONE of the photos show food or drink, pick the one that best captures the interior atmosphere (dining room, bar, decor) — not exteriors, logos, menus, empty rooms, or staff portraits.

Return the 0-based index of your pick along with a "kind" label describing what it shows.`;

// Pick the best photo from a list of candidate URLs. Returns
// { index, kind }. On any error, returns { index: 0, kind: "unknown" }
// so the caller can fall back to Google's own top pick.
export async function pickBestPhoto(uris) {
  if (!uris?.length) return { index: 0, kind: "none" };
  if (uris.length === 1) return { index: 0, kind: "only" };

  const content = [{ type: "text", text: "Here are the candidate photos, numbered from 0:" }];
  for (let i = 0; i < uris.length; i++) {
    content.push({ type: "text", text: `Photo ${i}:` });
    content.push({ type: "image", source: { type: "url", url: uris[i] } });
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 120,
      system: [{
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      }],
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block) return { index: 0, kind: "no-response" };
    const parsed = JSON.parse(block.text);
    if (parsed.index >= 0 && parsed.index < uris.length) return parsed;
    return { index: 0, kind: "bad-index" };
  } catch (err) {
    console.warn(`[photo-picker] ${uris.length} candidates failed: ${err.message}`);
    return { index: 0, kind: "picker_error" };
  }
}

export function isPhotoPickerEnabled() {
  // On by default when an API key is present. Set PHOTO_PICKER=0 to
  // disable and fall back to Google's top-ranked photo (saves ~$0.003
  // per new restaurant + several Places photo-URI resolves).
  return !!process.env.ANTHROPIC_API_KEY && process.env.PHOTO_PICKER !== "0";
}
