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

export function extractRestaurants(html) {
  if (!html) return [];
  const body = findBody(html);
  const scores = new Map(); // lowercased name -> { name, score }

  function add(rawText, score) {
    const clean = stripHtml(rawText).replace(/\s+/g, " ").trim()
      // Trailing "— Address" or "· Neighborhood" tails on headers
      .replace(/\s*[—–·|]\s*.*$/, "");
    if (!looksLikeRestaurantName(clean)) return;
    const key = clean.toLowerCase();
    const existing = scores.get(key);
    if (existing) existing.score += score;
    else scores.set(key, { name: clean, score });
  }

  // <h2> / <h3> — the primary signal for roundup pieces.
  let m;
  const hxRe = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  while ((m = hxRe.exec(body)) !== null) add(m[1], 3);

  // <p><strong>Name</strong> — the "leaded paragraph" roundup pattern
  // used by many food outlets when they don't use full section headers.
  const strongRe = /<p[^>]*>\s*(?:<(?:span|em|a)[^>]*>\s*)*<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi;
  while ((m = strongRe.exec(body)) !== null) add(m[1], 2);

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ name }) => ({ name }));
}

// Fetch an article and pull restaurant names out of it. Returns [] on any
// failure — extraction is best-effort and should never break a scrape.
export async function fetchAndExtract(url, { timeoutMs = 12000 } = {}) {
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
    return extractRestaurants(html);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Enrich a batch of scraped items with a restaurants_mentioned field
// (JSON string). Bounded concurrency so we don't hammer a single host.
export async function enrichWithRestaurants(items, { concurrency = 4 } = {}) {
  const queue = [...items];
  const results = new Map();
  async function worker() {
    while (queue.length) {
      const it = queue.shift();
      const names = await fetchAndExtract(it.url);
      results.set(it.url, names);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return items.map((it) => ({
    ...it,
    restaurants_mentioned: JSON.stringify(results.get(it.url) || []),
  }));
}
