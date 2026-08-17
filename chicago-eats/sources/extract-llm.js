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
// ~12000 tokens. Sized to fit long roundup guides (Infatuation "Top 25",
// Eater year-end lists, Sun-Times omnibus features) uncut — a truncated
// article causes the LLM to see only the intro/hero and extract just the
// article title as a fake "restaurant." Applies to every source.
const MAX_ARTICLE_CHARS = 48000;

// Lazy client — only constructed when actually called, so importing this
// module without ANTHROPIC_API_KEY set doesn't crash.
let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM_PROMPT = `You extract restaurant information from Chicago food news articles and guides.

For each restaurant, cafe, bar, or bakery the article covers, extract:
- name: the restaurant's proper name only. Do not include quotation marks, price glyphs, addresses, or descriptors. If the raw text near the name contains HTML entity artifacts (e.g. "&#x27;", "&amp;"), replace them with the character they represent ("'" and "&").
- cuisine: a short cuisine label ("Ramen", "Wine Bar", "Bakery", "Mexican", "New American", etc.) or null if genuinely unclear
- neighborhood: the Chicago neighborhood the restaurant is in (e.g. "West Loop", "Wicker Park", "Portage Park"). Extract this even if it's rendered next to the address. Null only if the article truly doesn't say where.
- blurb: a clean 1-2 sentence factual description of what the place is, in your own words. STRICTLY EXCLUDE from the blurb: addresses, phone numbers, price glyphs ("$", "$ $ $ $"), the cuisine label, the neighborhood name, UI text like "Save spot" or "Reserve", and any hours/day-of-week strings. Those data points belong in their own fields (cuisine, neighborhood, price_band) or are dropped entirely.
- take: 1-2 sentences capturing the article's opinion in the reviewer's voice ("go for the pasta and stay for the natural wine list", "impressive room, average food"). If the article is purely factual news with no opinion, use null.
- top_dishes: 2-5 specific menu items the article recommends by name (e.g. ["Adobo", "Halo-halo", "Bibingka"]). Empty array if the article doesn't call out specific dishes.
- price_band: "$", "$$", "$$$", or "$$$$" — infer from cost signals in the article: $ = cheap eats, $$ = moderate, $$$ = expensive, $$$$ = splurge/tasting-menu. If the page shows "$ $ $ $" as glyphs (Infatuation's format), count the glyphs. Null only if there is no price signal at all.

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

// Try to rescue a partially-generated JSON array. Walks the string looking
// for the last complete `}` in what appears to be the restaurants array,
// then re-closes the array and object. Returns null if it can't find a
// safe truncation point. Only used when the primary JSON.parse() fails.
function salvagePartialJson(raw) {
  if (typeof raw !== "string") return null;
  const arrStart = raw.indexOf('"restaurants"');
  if (arrStart < 0) return null;
  const openBracket = raw.indexOf("[", arrStart);
  if (openBracket < 0) return null;
  // Find the last complete object end before any unclosed string
  let lastGoodEnd = -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openBracket + 1; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) lastGoodEnd = i; }
    else if (c === "]" && depth === 0) break;
  }
  if (lastGoodEnd < 0) return null;
  const rebuilt = raw.slice(0, lastGoodEnd + 1) + "]}";
  try { return JSON.parse(rebuilt); } catch { return null; }
}

// Extract restaurants from article HTML using Claude. Same return shape as
// the regex extractor: [{name, cuisine?, blurb?}].
export async function extractRestaurantsLLM(html, title = "") {
  if (!html) return [];
  const text = stripHtml(html).replace(/\s+/g, " ").trim().slice(0, MAX_ARTICLE_CHARS);
  if (!text) return [];

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      // Big structured outputs (25-restaurant guides, year-end lists) can
      // exceed 2048 output tokens and truncate the JSON mid-array. 16k
      // covers even the longest Infatuation "best of" guides plus rich
      // per-restaurant take/dishes on all-500-restaurant edge cases.
      // Applies across all sources, not just Infatuation.
      max_tokens: 16384,
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

    // structured outputs almost always return valid JSON, but on rare very-
    // long responses the model can still emit a malformed string. Try to
    // salvage the leading valid array before giving up on the article.
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return [];
    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch (parseErr) {
      // Best-effort recovery: trim any trailing malformed characters back
      // to the last valid `}` in the restaurants array and try again.
      const salvaged = salvagePartialJson(textBlock.text);
      if (!salvaged) throw parseErr;
      parsed = salvaged;
      console.warn(`[extract-llm] recovered ${parsed.restaurants?.length || 0} entries from a malformed response`);
    }
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
