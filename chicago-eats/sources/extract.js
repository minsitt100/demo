// Pull restaurant names out of an article's HTML using regex-based
// heuristics — no cheerio/DOM library needed. The goal is decent recall
// on well-structured food outlets (Eater, Block Club, Sun-Times,
// Infatuation) so that a roundup card can show its actual restaurants
// inline instead of forcing a click-through.
//
// Strongest signal: <h2>/<h3> inside the article body — roundup pieces
// almost always have one header per restaurant. Secondary signal:
// paragraphs that start with <strong>Restaurant Name</strong>.

import { stripHtml } from "./util.js";

// Try to isolate the article body — the whole page includes menu bars,
// related-article rails, footers, etc. that we don't want to mine.
const BODY_START_MARKERS = [
  /<article[^>]*>/i,
  /class=["'][^"']*(?:c-entry-content|entry-content|article-body|post-content|article-content|content-body)/i,
  /<main[^>]*>/i,
];

function findBody(html) {
  for (const re of BODY_START_MARKERS) {
    const m = html.match(re);
    if (m) return html.slice(m.index);
  }
  return html;
}

// Headers that are almost never a restaurant name.
const NON_RESTAURANT_HEADER = [
  /^(the )?bottom line$/i,
  /^(see|read) (also|more|next)$/i,
  /^related( stories)?$/i,
  /^more from/i,
  /^more chicago/i,
  /^(conclusion|introduction)$/i,
  /^tags?$/i,
  /^address(es)?$/i,
  /^hours?$/i,
  /^(the )?menu$/i,
  /^about (the |this )/i,
  /^share this/i,
  /^comments?$/i,
  /^advertisement$/i,
  /^(image|photo) credit$/i,
  /^getting there$/i,
  /^what to (order|know)$/i,
  /^the vibe$/i,
  /^the space$/i,
];

const NON_RESTAURANT_EXACT = new Set([
  "chicago", "the loop", "west loop", "fulton market",
  "wicker park", "logan square", "avondale", "pilsen",
  "hyde park", "lincoln park", "river north", "andersonville",
  "the neighborhood", "eater", "eater chicago", "block club",
  "block club chicago", "the infatuation", "infatuation",
  "chicago sun-times", "sun-times", "google news", "the takeout",
  "instagram", "facebook", "twitter", "yelp", "resy", "opentable",
]);

function looksLikeRestaurantName(name) {
  if (!name) return false;
  const t = name.trim();
  if (t.length < 2 || t.length > 60) return false;
  // Must start with a capital letter, digit, or quote — restaurant names
  // are proper nouns.
  if (!/^[A-Z0-9&'"""]/.test(t)) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  // ALL CAPS long strings are usually section titles or promo lines.
  if (t === t.toUpperCase() && t.length > 20) return false;
  if (NON_RESTAURANT_HEADER.some((r) => r.test(t))) return false;
  if (NON_RESTAURANT_EXACT.has(t.toLowerCase())) return false;
  // A sentence with an internal ". Word" is prose, not a name.
  if (/[.!?]\s+[A-Z]/.test(t)) return false;
  // Years in headers ("2024 Fall Openings") aren't restaurants.
  if (/\b(19|20)\d{2}\b/.test(t)) return false;
  // "The 10 Best…" style ranked-list headers — usually the intro, not
  // a restaurant entry.
  if (/^(the )?\d+\b/i.test(t)) return false;
  return true;
}

// Cuisine tags keyed off keywords we might find in the name or blurb.
// Order matters — longer/more specific phrases first so "wine bar" wins
// over "bar".
const CUISINE_KEYWORDS = [
  ["korean bbq", "Korean BBQ"],
  ["wine bar", "Wine Bar"],
  ["cocktail bar", "Cocktail Bar"],
  ["natural wine", "Wine Bar"],
  ["coffee shop", "Coffee"],
  ["coffee bar", "Coffee"],
  ["ice cream", "Ice Cream"],
  ["dim sum", "Dim Sum"],
  ["new american", "New American"],
  ["modern american", "New American"],
  ["farm to table", "New American"],
  ["farm-to-table", "New American"],
  ["middle eastern", "Middle Eastern"],
  ["asian fusion", "Asian Fusion"],
  ["hot dog", "Hot Dogs"],
  ["fried chicken", "Fried Chicken"],
  ["ramen", "Ramen"],
  ["sushi", "Sushi"],
  ["yakitori", "Yakitori"],
  ["izakaya", "Izakaya"],
  ["japanese", "Japanese"],
  ["thai", "Thai"],
  ["vietnamese", "Vietnamese"],
  ["pho", "Vietnamese"],
  ["italian", "Italian"],
  ["pizza", "Pizza"],
  ["pizzeria", "Pizza"],
  ["pasta", "Italian"],
  ["mexican", "Mexican"],
  ["tacos", "Tacos"],
  ["taqueria", "Tacos"],
  ["korean", "Korean"],
  ["chinese", "Chinese"],
  ["cantonese", "Chinese"],
  ["french", "French"],
  ["bistro", "French"],
  ["brasserie", "French"],
  ["patisserie", "Bakery"],
  ["boulangerie", "Bakery"],
  ["bakery", "Bakery"],
  ["cafe", "Café"],
  ["café", "Café"],
  ["brewery", "Brewery"],
  ["gastropub", "Gastropub"],
  ["steakhouse", "Steakhouse"],
  ["seafood", "Seafood"],
  ["oyster", "Seafood"],
  ["gelato", "Gelato"],
  ["sandwich", "Sandwiches"],
  ["burger", "Burgers"],
  ["deli", "Deli"],
  ["diner", "Diner"],
  ["mediterranean", "Mediterranean"],
  ["greek", "Greek"],
  ["levantine", "Levantine"],
  ["lebanese", "Lebanese"],
  ["israeli", "Israeli"],
  ["tapas", "Spanish"],
  ["spanish", "Spanish"],
  ["indian", "Indian"],
  ["ethiopian", "Ethiopian"],
  ["peruvian", "Peruvian"],
  ["cuban", "Cuban"],
  ["caribbean", "Caribbean"],
  ["southern", "Southern"],
  ["barbecue", "BBQ"],
  ["bbq", "BBQ"],
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
  ["pub", "Pub"],
  ["cocktail", "Cocktails"],
  ["american", "American"],
];

export function guessCuisine(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [needle, label] of CUISINE_KEYWORDS) {
    const re = new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`);
    if (re.test(lower)) return label;
  }
  return null;
}

// Grab the first sentence-ish chunk from a blob of prose. Prefers a full
// sentence 20–200 chars; falls back to a 200-char truncation.
export function firstSentence(text) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{20,220}?[.!?])(\s|$)/);
  if (m) return m[1];
  if (clean.length <= 220) return clean;
  return clean.slice(0, 220).replace(/\s+\S*$/, "") + "…";
}

export function extractRestaurants(html) {
  if (!html) return [];
  const body = findBody(html);
  const found = new Map(); // lowercased name -> { name, cuisine, blurb, score }

  function add(rawName, score, blurbSource = "") {
    const clean = stripHtml(rawName).replace(/\s+/g, " ").trim()
      .replace(/\s*[—–·|]\s*.*$/, "");
    if (!looksLikeRestaurantName(clean)) return;
    const key = clean.toLowerCase();
    const blurb = firstSentence(stripHtml(blurbSource));
    const cuisine = guessCuisine(`${clean} ${blurb}`);
    const existing = found.get(key);
    if (existing) {
      existing.score += score;
      if (!existing.blurb && blurb) existing.blurb = blurb;
      if (!existing.cuisine && cuisine) existing.cuisine = cuisine;
    } else {
      found.set(key, { name: clean, cuisine, blurb, score });
    }
  }

  // <h2> / <h3> block + the content up to the next header — roundups
  // typically follow "one header + one paragraph" per restaurant.
  let m;
  const hxRe = /<h[23][^>]*>([\s\S]*?)<\/h[23]>([\s\S]*?)(?=<h[23]|<\/article|$)/gi;
  while ((m = hxRe.exec(body)) !== null) add(m[1], 3, m[2]);

  // <p><strong>Name</strong> rest-of-paragraph — the leaded-paragraph
  // roundup pattern used by many outlets when they skip section headers.
  const strongRe = /<p[^>]*>\s*(?:<(?:span|em|a)[^>]*>\s*)*<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>([\s\S]*?)<\/p>/gi;
  while ((m = strongRe.exec(body)) !== null) add(m[1], 2, m[2]);

  return [...found.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ name, cuisine, blurb }) => ({ name, cuisine, blurb }));
}

// EXTRACTOR toggle. Set EXTRACTOR=llm plus ANTHROPIC_API_KEY to use the
// Claude-powered extractor in extract-llm.js; anything else falls back to
// the regex heuristics above.
const USE_LLM =
  process.env.EXTRACTOR === "llm" && !!process.env.ANTHROPIC_API_KEY;

// Fetch an article and pull restaurant names out of it. Returns [] on any
// failure — extraction is best-effort and should never break a scrape.
export async function fetchAndExtract(url, { timeoutMs = 12000, title = "" } = {}) {
  if (!url) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/122.0 Safari/537.36 chicago-eats/0.1",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    if (USE_LLM) {
      const { extractRestaurantsLLM } = await import("./extract-llm.js");
      return await extractRestaurantsLLM(html, title);
    }
    return extractRestaurants(html);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Enrich a batch of scraped items with a restaurants_mentioned field
// (JSON string). Bounded concurrency so we don't hammer a single host (or
// blow through API rate limits when the LLM extractor is on).
export async function enrichWithRestaurants(items, { concurrency } = {}) {
  // LLM calls are slower and rate-limited — dial concurrency down for that path.
  const workers = concurrency ?? (USE_LLM ? 2 : 4);
  const queue = [...items];
  const results = new Map();
  async function worker() {
    while (queue.length) {
      const it = queue.shift();
      const names = await fetchAndExtract(it.url, { title: it.title });
      results.set(it.url, names);
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return items.map((it) => ({
    ...it,
    restaurants_mentioned: JSON.stringify(results.get(it.url) || []),
  }));
}
