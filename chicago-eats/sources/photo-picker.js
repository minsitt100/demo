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
    // -1 signals "no food / drink / food-prep photo in the candidates"
    // so the caller can fall back to the OG image instead of showing
    // yet another interior shot. Range is enforced in code — the
    // Anthropic JSON schema validator doesn't accept `minimum` on
    // integer types.
    index: { type: "integer" },
    kind: {
      type: "string",
      enum: ["food", "drink", "food_scene", "interior", "exterior", "menu", "other", "none"],
    },
  },
  required: ["index", "kind"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You rank photos from a restaurant's Google Places listing. Your ONE job is to find a food photo.

ACCEPT — return that photo's index and its kind:
- "food": a plated dish, close-up of food, a table with dishes, pastries or bread visible in a case, ice cream, sushi, a burger, pizza, ramen, salad, dessert, ANY prepared food item
- "drink": a cocktail, glass of wine, coffee, latte art, beer, notable beverage
- "food_scene": open-kitchen plating action, ingredients being prepped, a chef holding a dish, food being served

REJECT — return index = -1, kind = "none":
- Interior dining rooms, bar decor, empty tables, banquettes, light fixtures
- Exterior storefronts, awnings, signs, patios, street views
- Logos, menus, receipts, chalkboards, price lists
- Staff portraits, groups of diners, event photos
- Blurry, dark, or unclear shots

Be strict. Even a mediocre food photo beats the most beautiful interior. Only return -1 if you are certain that NONE of the candidate photos show food, drink, or food preparation. Look at every single candidate before deciding.`;

// Pick the best food photo from a list of candidate URLs. Returns
// { index, kind }:
//   index >= 0        → a food/drink/food_scene photo at that position
//   index === -1      → no food photo in the candidates; caller should
//                       fall back to the OG image (kind === "none")
// On any picker error, returns { index: -1, kind: "picker_error" } so
// we DON'T lock in a random interior — the caller keeps the OG image.
export async function pickBestPhoto(uris) {
  if (!uris?.length) return { index: -1, kind: "none" };

  const content = [{ type: "text", text: "Here are the candidate photos, numbered from 0:" }];
  for (let i = 0; i < uris.length; i++) {
    content.push({ type: "text", text: `Photo ${i}:` });
    content.push({ type: "image", source: { type: "url", url: uris[i] } });
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 150,
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
    if (!block) return { index: -1, kind: "no-response" };
    const parsed = JSON.parse(block.text);
    // Strict acceptance: only food/drink/food_scene count as picks.
    // Anything else (interior/exterior/menu/other) is treated as "no food."
    const FOOD_KINDS = new Set(["food", "drink", "food_scene"]);
    if (parsed.index >= 0 && parsed.index < uris.length && FOOD_KINDS.has(parsed.kind)) {
      return parsed;
    }
    return { index: -1, kind: parsed.kind || "none" };
  } catch (err) {
    console.warn(`[photo-picker] ${uris.length} candidates failed: ${err.message}`);
    return { index: -1, kind: "picker_error" };
  }
}

export function isPhotoPickerEnabled() {
  // On by default when an API key is present. Set PHOTO_PICKER=0 to
  // disable and fall back to Google's top-ranked photo (saves ~$0.003
  // per new restaurant + several Places photo-URI resolves).
  return !!process.env.ANTHROPIC_API_KEY && process.env.PHOTO_PICKER !== "0";
}
