// Shared helpers for source modules.

import crypto from "crypto";

// Words that suggest an article is about a NEW opening (or upcoming opening).
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
];

const UPCOMING_PATTERNS = [
  /\bcoming (?:to|soon)\b/i,
  /\bwill open\b/i,
  /\bset to open\b/i,
  /\bopening (?:this|next|in)\b/i,
  /\bdebuting (?:this|next|in)\b/i,
];

// Words that push us to skip (recaps, closings, etc.)
const SKIP_PATTERNS = [
  /\bcloses?\b/i,
  /\bclosing\b/i,
  /\bshuttered?\b/i,
  /\brecipe\b/i,
  /\bround-?up\b/i,
  /\bbest of\b/i,
];

export function looksLikeOpening(text) {
  if (!text) return false;
  if (SKIP_PATTERNS.some((r) => r.test(text))) return false;
  return OPENING_PATTERNS.some((r) => r.test(text));
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

// Best-effort restaurant name guess: pull the first quoted string or the
// leading capitalized phrase from the title. Falls back to null.
export function guessRestaurant(title) {
  if (!title) return null;
  const quoted = title.match(/[""']([^"""']{2,60})[""']/);
  if (quoted) return quoted[1].trim();
  // "Foo Bar opens in West Loop" -> "Foo Bar"
  const m = title.match(/^([A-Z][A-Za-z0-9&'’.\- ]{1,60}?)\s+(?:opens|opening|debuts|is coming|will open|has opened|now open|set to)/);
  if (m) return m[1].trim();
  return null;
}

export function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
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
