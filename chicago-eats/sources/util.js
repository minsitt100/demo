// Shared helpers for source modules.

import crypto from "crypto";

// Words that suggest an article is about a NEW opening, an upcoming opening,
// or a discovery-friendly roundup of new places. The goal is high recall —
// it's easier for a user to hide a card they don't want than to know an
// opening was silently dropped.
const OPENING_PATTERNS = [
  /\bopens?\b/i,
  /\bopening\b/i,
  /\bopened\b/i,
  /\bdebuts?\b/i,
  /\bdebuting\b/i,
  /\bnow open\b/i,
  /\bcoming (?:to|soon)\b/i,
  /\blaunching\b/i,
  /\blaunches\b/i,
  /\bunveils?\b/i,
  /\bpremieres?\b/i,
  /\bfirst look\b/i,
  /\bset to open\b/i,
  /\bwill open\b/i,
  /\barriv(?:es|ed|ing|al)\b/i,
  /\breopens?\b/i,
  /\breopened\b/i,
  /\bwelcomes?\b/i,
  /\bexpand(?:s|ing) to\b/i,
  /\blatest (?:restaurant|opening|spot|addition|concept|venture|hotspot)\b/i,
  /\bnew (?:restaurant|spot|hotspot|joint|eatery|bar|cafe|café|bakery|shop|counter|pop-?up|concept|opening)s?\b/i,
  /\bbring(?:s|ing) .{0,60}\bto\s+(?:chicago|the\s+\w+|west\s+loop|wicker\s+park|logan\s+square|pilsen|river\s+north|hyde\s+park|lincoln\s+park|fulton\s+market|avondale)\b/i,
];

const UPCOMING_PATTERNS = [
  /\bcoming (?:to|soon)\b/i,
  /\bwill open\b/i,
  /\bset to open\b/i,
  /\bopening (?:this|next|in)\b/i,
  /\bdebuting (?:this|next|in)\b/i,
  /\bexpand(?:s|ing) to\b/i,
  /\bto open\b/i,                    // "chefs to open Midwestern restaurant"
  /\bplans? to open\b/i,             // "chef plans to open"
  /\bset to (?:debut|launch)\b/i,
  /\bslated (?:to|for)\b/i,          // "slated to open"
  /\b(?:coming|opening) (?:in|this) (?:january|february|march|april|may|june|july|august|september|october|november|december|fall|winter|spring|summer|20\d\d)\b/i,
];

// Words that push us to skip — kept intentionally short so discovery
// roundups (e.g. "The Best New Chicago Openings This Fall") still show.
// "roundup" and "best of" were removed at the user's request.
const SKIP_PATTERNS = [
  /\bcloses?\b/i,
  /\bclosing\b/i,
  /\bshuttered?\b/i,
  /\bshutting\b/i,
  /\brecipe\b/i,
  /\bobituary\b/i,
  // Sports content — reliably slips past the opening-signal check on
  // broad publisher feeds (Sun-Times sitewide, Google News).
  /\bhigh school\b/i,
  /\b(football|basketball|baseball|hockey|soccer|volleyball|tennis|golf|lacrosse)\s+(star|player|team|coach|game|season|match|tournament|scores?|schedule)\b/i,
  /\b(quarterback|linebacker|running back|wide receiver|point guard|striker|goalie|goaltender)\b/i,
  /\b(rookie|draft pick|championship|playoffs)\b/i,
];

// Food-related terms — used as an "is this article actually about food?"
// gate on broad publisher feeds (Sun-Times, Google News) that mix
// restaurant coverage with sports, weather, politics, etc.
const FOOD_PATTERNS = [
  /\brestaurants?\b/i, /\bcaf[eé]s?\b/i, /\bbars?\b/i,
  /\bbakery\b/i, /\bbakeries\b/i, /\beatery\b/i, /\beateries\b/i,
  /\bdining\b/i, /\bchef\b/i, /\bmenu\b/i, /\bdish(?:es)?\b/i,
  /\bcuisine\b/i, /\bfood\b/i, /\bculinary\b/i, /\bcoffee\b/i,
  /\bbrewery\b/i, /\bbreweries\b/i, /\bcocktails?\b/i,
  /\bwine\s+(?:bar|list|program)\b/i, /\bbistro\b/i,
  /\bpizza\b/i, /\bpizzeria\b/i, /\bramen\b/i, /\bsushi\b/i,
  /\btaqueria\b/i, /\btacos?\b/i, /\bpastry\b/i, /\bpastries\b/i,
  /\bgastropub\b/i, /\bsteakhouse\b/i, /\btasting menu\b/i,
];

export function mentionsFood(text) {
  if (!text) return false;
  return FOOD_PATTERNS.some((r) => r.test(text));
}

// Returns { kept, reason } so debugging tools can show why an item was
// dropped. `looksLikeOpening` stays as a boolean wrapper.
export function classifyItem(text) {
  if (!text) return { kept: false, reason: "empty text" };
  for (const r of SKIP_PATTERNS) {
    if (r.test(text)) return { kept: false, reason: `skip: matched ${r}` };
  }
  for (const r of OPENING_PATTERNS) {
    if (r.test(text)) return { kept: true, reason: `open: matched ${r}` };
  }
  return { kept: false, reason: "no opening keyword" };
}

export function looksLikeOpening(text) {
  return classifyItem(text).kept;
}

export function classifyStatus(text) {
  if (!text) return "opening";
  if (UPCOMING_PATTERNS.some((r) => r.test(text))) return "upcoming";
  return "opening";
}

// Naive Chicago-relevance check for sources that aren't Chicago-only.
const CHICAGO_HINTS = [
  /\bchicago\b/i,
  /\bwicker park\b/i,
  /\blogan square\b/i,
  /\bpilsen\b/i,
  /\bwest loop\b/i,
  /\bwest town\b/i,
  /\blincoln park\b/i,
  /\bavondale\b/i,
  /\bbucktown\b/i,
  /\bhyde park\b/i,
  /\buptown\b/i,
  /\bandersonville\b/i,
  /\bhumboldt park\b/i,
  /\brogers park\b/i,
  /\brogers square\b/i,
  /\bfulton market\b/i,
  /\bthe loop\b/i,
  /\briver north\b/i,
  /\bgold coast\b/i,
  /\bnear north\b/i,
  /\bevanston\b/i,
  /\boak park\b/i,
];

export function mentionsChicago(text) {
  if (!text) return false;
  return CHICAGO_HINTS.some((r) => r.test(text));
}

// Best-effort neighborhood extractor.
const NEIGHBORHOODS = [
  "Wicker Park", "Logan Square", "Pilsen", "West Loop", "West Town",
  "Lincoln Park", "Avondale", "Bucktown", "Hyde Park", "Uptown",
  "Andersonville", "Humboldt Park", "Rogers Park", "Fulton Market",
  "The Loop", "River North", "Gold Coast", "Near North", "Old Town",
  "Ukrainian Village", "Noble Square", "Streeterville", "South Loop",
  "Ravenswood", "Lakeview", "Roscoe Village", "Boystown", "Little Village",
  "Chinatown", "Bridgeport", "Edgewater", "Albany Park", "Portage Park",
  "Irving Park", "Jefferson Park", "Evanston", "Oak Park",
];

export function extractNeighborhood(text) {
  if (!text) return null;
  for (const n of NEIGHBORHOODS) {
    const re = new RegExp(`\\b${n.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(text)) return n;
  }
  return null;
}

// Best-effort restaurant name guess from the article title. Deliberately
// conservative — the LLM/HTML extractor is much better at this, and this
// fallback runs at the front of a headline where getting the wrong span
// yields article-title fragments like "Inside NAIA's chic" instead of "NAIA".
export function guessRestaurant(title) {
  if (!title) return null;
  const quoted = title.match(/[""']([^"""']{2,60})[""']/);
  if (quoted) return quoted[1].trim();

  // "Foo Bar opens in West Loop" -> "Foo Bar"
  // Constraints to filter out headline fragments:
  //   - name must be 1–4 whitespace-separated tokens
  //   - every token must start with uppercase / digit / & (so a headline
  //     opener like "Inside", "A luxury", "This new" — with lowercase words
  //     mid-name — falls through)
  const m = title.match(
    /^((?:[A-Z0-9&][A-Za-z0-9&'’.\-]*(?:\s+|$)){1,4})(?:opens|opening|debuts|is coming|will open|has opened|now open|set to open)\b/,
  );
  if (!m) return null;
  const candidate = m[1].trim();
  // A single "New" / "The" is a false positive on its own.
  if (/^(new|the|a|an|inside|meet|this|these)$/i.test(candidate)) return null;
  return candidate;
}

// Decode common HTML entities to real characters. Handles both named
// entities (&amp;, &nbsp;), decimal numeric (&#39;), and hex numeric
// (&#x27;) — the last of which Infatuation uses everywhere for
// apostrophes, causing "Chuy&#x27;s" to survive extraction otherwise.
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      try { return String.fromCodePoint(code); } catch { return ""; }
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      try { return String.fromCodePoint(code); } catch { return ""; }
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");  // amp last so we don't double-decode
}

export function stripHtml(html) {
  if (!html) return "";
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text, n = 260) {
  if (!text) return "";
  if (text.length <= n) return text;
  return text.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

export function stableId(source, url) {
  return crypto
    .createHash("sha1")
    .update(`${source}::${url}`)
    .digest("hex")
    .slice(0, 16);
}

export function firstImageFromHtml(html) {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// Verify a URL actually resolves. Used to block dead links from entering the
// DB at scrape time, and to hide rows whose links died later.
//
// Rules:
//   - Follows redirects (so short-links and rewritten paths still count).
//   - Tries HEAD first, falls back to GET if the server refuses HEAD.
//   - Rejects only definitive "gone" responses (404, 410) and network errors.
//   - Treats 403/429/5xx as "we can't tell — keep it", because many sites
//     block bots from HEAD requests even on live pages.
export async function verifyUrl(url, { timeoutMs = 8000 } = {}) {
  if (!url) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    // Pretend to be a normal browser — some CDNs 404 obvious bots.
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36 chicago-eats/0.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers,
      });
    }
    return res.status !== 404 && res.status !== 410;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Verify a list of URLs in parallel, respecting a small concurrency cap so
// we don't hammer a single host. Returns the URLs that passed.
export async function verifyMany(urls, { concurrency = 8, timeoutMs = 8000 } = {}) {
  const results = new Map();
  const queue = [...new Set(urls.filter(Boolean))];
  async function worker() {
    while (queue.length) {
      const u = queue.shift();
      results.set(u, await verifyUrl(u, { timeoutMs }));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
