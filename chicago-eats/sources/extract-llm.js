// LLM-powered restaurant extractor. Same interface as the regex extractor in
// extract.js (`extractRestaurants(html, title?) -> [{name, cuisine, blurb}]`),
// but the "brain" is Claude reading the article body — which handles roundups,
// bot-blocked HTML, and cuisine inference much better than regex.
//
// Toggle at runtime via the EXTRACTOR env var, wired in extract.js:
//   EXTRACTOR=llm ANTHROPIC_API_KEY=sk-ant-... npm start
//
// Model defaults to claude-haiku-4-5: fast and cheap for a well-defined
// structured-extraction task (~a fraction of a cent per article). Bump to
// claude-opus-5 by setting ANTHROPIC_MODEL for higher-quality extraction on
// messier articles (roughly 5x the cost).

import Anthropic from "@anthropic-ai/sdk";
import { stripHtml } from "./util.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const MAX_ARTICLE_CHARS = 48000;  // ~12000 tokens — Infatuation's long "Top 25" guides need the full body, not the intro

// Lazy client — only constructed when actually called, so importing this
// module without ANTHROPIC_API_KEY set doesn't crash.
let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM_PROMPT = `You extract restaurant information from Chicago food news articles and guides.

For each restaurant, cafe, bar, or bakery the article covers, extract:
- name: the establishment's proper name (not a descriptor or placeholder)
- cuisine: short cuisine label ("Ramen", "Wine Bar", "Bakery", "Mexican", "New American", etc.) or null if genuinely unclear
- neighborhood: Chicago neighborhood if the article mentions it (e.g. "West Loop", "Wicker Park", "Fulton Market") or null
- blurb: 1-2 sentences of factual description of what the place is
- take: 1-2 sentences capturing the article's opinion in the reviewer's voice ("go for the pasta and stay for the natural wine list", "impressive room, average food"). If the article is purely factual news with no opinion, use null.
- top_dishes: 2-5 specific menu items the article recommends by name (e.g. ["Adobo", "Halo-halo", "Bibingka"]). Empty array if the article doesn't call out specific dishes.
- price_band: "$", "$$", "$$$", or "$$$$" if the article signals the price range (from mentions of tasting menus, splurge, cheap eats, etc.), or null

STRICT INCLUSION CRITERIA — only extract if ALL are true:
1. The article is about this restaurant (it's a subject, not a passing mention)
2. The restaurant IS CURRENTLY OPEN as of the article's date — not a future plan
3. It has a real proper name (not "Midwestern restaurant", "a new pizzeria", "the chef's next project")
4. It's a real food/drink establishment

For guide-style articles (roundups like "Best New Restaurants" or "Where to Eat in West Loop"), each restaurant listed in the guide IS a subject — extract all of them, with their dishes and the writer's take on each.

EXPLICITLY EXCLUDE:
- Restaurants mentioned only in staff bios ("chef previously worked at X, Y, Z")
- Restaurants mentioned only as comparisons ("reminiscent of X")
- Restaurants mentioned only as the chef's or owner's other business
- Future openings without a confirmed name or near-term opening date
- Closed or defunct restaurants
- Placeholder descriptions
- Section headers, author names, publication names, neighborhoods

Return an empty list if the article isn't about currently-open restaurants — recipes, trend pieces without specific places, obituaries, future-opening announcements without confirmed names.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    restaurants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name:         { type: "string" },
          cuisine:      { type: ["string", "null"] },
          neighborhood: { type: ["string", "null"] },
          blurb:        { type: ["string", "null"] },
          take:         { type: ["string", "null"] },
          top_dishes:   { type: "array", items: { type: "string" } },
          price_band:   { type: ["string", "null"] },
        },
        required: ["name", "cuisine", "neighborhood", "blurb", "take", "top_dishes", "price_band"],
        additionalProperties: false,
      },
    },
  },
  required: ["restaurants"],
  additionalProperties: false,
};

// Extract restaurants from article HTML using Claude. Same return shape as
// the regex extractor: [{name, cuisine?, blurb?}].
export async function extractRestaurantsLLM(html, title = "") {
  if (!html) return [];
  const text = stripHtml(html).replace(/\s+/g, " ").trim().slice(0, MAX_ARTICLE_CHARS);
  if (!text) return [];

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      // 25-restaurant guides can generate long structured output — bumped
      // from 2048 so we don't truncate the JSON mid-array on big roundups.
      max_tokens: 8192,
      // System prompt as a cacheable text block — repeated identically across
      // every extraction call in a scrape, so cache reads pay ~0.1x the
      // per-token price of a cold call.
      system: [{
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      }],
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{
        role: "user",
        content: `Title: ${title || "(unknown)"}\n\nArticle body:\n${text}`,
      }],
    });

    // structured outputs guarantee the first text block is valid JSON matching the schema
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return [];
    const parsed = JSON.parse(textBlock.text);
    return (parsed.restaurants || []).filter((r) => r && r.name);
  } catch (err) {
    // Never break a scrape on an extraction failure — return empty and log.
    // Include status when the SDK exposes one (e.g. 401 auth, 429 rate limit,
    // 529 overloaded) so the terminal shows the real reason.
    const status = err?.status ?? err?.response?.status ?? "";
    const msg = err?.message || String(err);
    console.warn(`[extract-llm] ${MODEL} failed${status ? ` (HTTP ${status})` : ""}: ${msg}`);
    return [];
  }
}
