import express from "express";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { dbApi } from "./db.js";
import { sources } from "./sources/index.js";
import { runAllSources } from "./scraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const SCRAPE_CRON = process.env.SCRAPE_CRON || "*/30 * * * *"; // every 30 min
const SCRAPE_ON_BOOT = process.env.SCRAPE_ON_BOOT !== "0";
// How far back the feed reaches. Change with e.g. MAX_AGE_DAYS=180 npm start.
const MAX_AGE_DAYS = parseInt(process.env.MAX_AGE_DAYS, 10) || 90;

function cutoffIso() {
  return new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString();
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/openings", (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const source = req.query.source || null;
  const status = req.query.status || null; // 'opening' | 'upcoming'
  const cutoff = cutoffIso();
  const rows  = dbApi.list({ source, status, limit, offset, cutoff });
  const total = dbApi.count({ source, status, cutoff });
  res.json({ total, limit, offset, maxAgeDays: MAX_AGE_DAYS, items: rows });
});

app.get("/api/sources", (_req, res) => {
  res.json(sources.map((s) => ({ id: s.meta.id, label: s.meta.label })));
});

// Restaurants view: aggregate every visible opening in the window into
// unique restaurants (deduped by normalized name), each carrying the list
// of source articles that mentioned it, best cuisine + blurb guess, and
// the earliest coverage date.
app.get("/api/restaurants", async (req, res) => {
  const cutoff = cutoffIso();
  const rows = dbApi.listAllInWindow({ cutoff });
  const restaurants = await aggregateRestaurants(rows);
  res.json({
    total: restaurants.length,
    maxAgeDays: MAX_AGE_DAYS,
    restaurants,
  });
});

// Defensive cleanup for blurbs that came back from the extractor with
// Infatuation's inline metadata still glued to the front. The LLM sometimes
// includes "Save spot <address> $ $ $ $ <cuisine> <neighborhood>" ahead of
// the actual sentence; users see that as a garbled blurb even when cuisine
// and neighborhood are populated correctly elsewhere on the card.
function cleanBlurb(blurb, name) {
  if (!blurb) return blurb;
  let t = String(blurb).trim();

  // Best-shot: if the restaurant's name appears in the blurb, slice from
  // there so the description starts with the name itself.
  if (name) {
    const idx = t.toLowerCase().indexOf(name.toLowerCase());
    if (idx > 0 && idx < 250) t = t.slice(idx).trim();
  }

  // Fallback strips for whatever prefix remains. Each is idempotent:
  //   "Save spot " UI label from Infatuation
  //   Address + zip (with or without "Chicago, IL")
  //   Price glyphs like "$ $ $ $" or "$$$$"
  t = t.replace(/^\s*Save\s+spot\s+/i, "");
  t = t.replace(/^\s*\d+\s+[NSEW]?\.?\s*\w[\w\s.\-]*?,?\s*(?:Chicago,?\s*IL)?\s*\d{5}\s*/i, "");
  t = t.replace(/^\s*(?:\$\s*){1,5}\s*/i, "");

  return t.trim();
}

// Split a raw cuisine string into individual normalized cuisines. Handles
// combined forms ("Bakery/Cafe", "Italian & Pizza", "Mexican and American")
// by splitting on common separators, then singularizes obvious plurals so
// "Cafes" / "Cafe" / "Bakery/Cafe" all end up as ["Cafe"] or ["Bakery", "Cafe"]
// instead of three separate filter entries.
const CUISINE_PLURALS = {
  Cafes: "Cafe",
  Cafés: "Café",
  Bakeries: "Bakery",
  Breweries: "Brewery",
  Wineries: "Winery",
  Delis: "Deli",
  Pubs: "Pub",
  Bars: "Bar",
  Gastropubs: "Gastropub",
  Steakhouses: "Steakhouse",
  Restaurants: "Restaurant",
  Diners: "Diner",
};

function titleCaseWord(w) {
  if (!w) return w;
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

function normalizeCuisines(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/\s*[\/&,]\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      // Preserve embedded hyphens/apostrophes; title-case each word chunk
      const cased = part.replace(/[A-Za-z]+/g, titleCaseWord);
      return CUISINE_PLURALS[cased] || cased;
    })
    .filter(Boolean);
}

// Case- and accent-insensitive key so "Cafe" / "cafe" / "Café" dedupe
// but the first-seen display form is preserved.
function cuisineDedupKey(c) {
  return String(c || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .trim();
}

function normalizeName(n) {
  if (!n) return "";
  return n
    .toLowerCase()
    .replace(/^(the|le|la|el)\s+/, "")
    .replace(/['"“”‘’]/g, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Reject values that are obviously article titles or headline fragments
// rather than real restaurant names. Filters out the ambient noise you get
// from title-guessing when the LLM extractor couldn't identify a specific
// place (e.g. "New Fulton Market wine bar debuts…", "10 places to eat…").
function looksLikeArticleTitle(name) {
  if (!name) return false;
  const t = name.trim();
  if (t.length > 40) return true;                          // real names are short
  if (/^\d/.test(t)) return true;                          // "10 Best…"
  if (/\s(opens?|opening|debuts?|coming to|now open)\s/i.test(t)) return true;
  if (/\bnew\s+(restaurants?|spots?|openings?|places?)/i.test(t)) return true;
  if (/^(where|how|why|the best|best|these|inside|meet|this|watch)\s/i.test(t)) return true;
  if (/^(top|our)\s+\d/i.test(t)) return true;             // "Top 25", "Our 12"
  if (/^(a|an)\s+[a-z]/.test(t)) return true;              // "A luxury steakhouse"
  if (/\b(chic|luxury|hot new|buzzy|trendy)\b/i.test(t)) return true;   // headline-descriptor giveaways
  if (/\b(highest-rated|top-rated|must-try|best of|hit list)\b/i.test(t)) return true;
  if (/\bis\s*$/i.test(t)) return true;                    // "A luxury steakhouse is" (truncated)
  if (/[:—–]/.test(t)) return true;                         // colon / em-dash → title punctuation
  if ((t.match(/,/g) || []).length >= 2) return true;      // list-comma structure
  // ALL-CAPS multi-word strings are almost always section headers
  // ("THE SPOTS", "OUR PICKS", "THE WINNERS"). Keep short single-word
  // all-caps like "NAIA" or "STK" — real short brand names.
  if (t === t.toUpperCase() && /\s/.test(t)) return true;
  // Common generic section labels regardless of case
  if (/^the\s+(spots?|picks?|list|best|winners?|highlights?|contenders?|newcomers?)$/i.test(t)) return true;
  // "First Last, Location" style — usually a person + school/city caption
  // from a non-food article (e.g. Sun-Times high school sports coverage).
  // Real restaurants don't append a location to their name in this shape;
  // if they did, the location would live in the neighborhood field instead.
  if (/^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+,\s+[A-Z]/.test(t)) return true;
  return false;
}

// IDs of currently-registered sources. Rows in the DB from sources that
// have since been removed from sources/index.js are ignored — lets us
// disable a source with a one-line change without wiping historical data.
const activeSourceIds = new Set(sources.map((s) => s.meta.id));

const USE_LLM_VALIDATOR =
  process.env.VALIDATOR === "llm" && !!process.env.ANTHROPIC_API_KEY;

const USE_PHOTO_FETCHER =
  process.env.PHOTO_FETCHER === "google_places" && !!process.env.GOOGLE_PLACES_API_KEY;

// A shared OG image spread across this many restaurants is treated as a
// "roundup collision" (one article's hero photo bleeding onto every
// restaurant it mentions). Below the threshold, the OG image is probably
// a real hero photo of the single restaurant covered.
const SHARED_IMAGE_THRESHOLD = 3;

async function aggregateRestaurants(openings) {
  const map = new Map(); // normalized name -> aggregate

  for (const o of openings) {
    if (!activeSourceIds.has(o.source)) continue;
    // Distinguish "never attempted" (NULL) from "attempted, found nothing"
    // (empty JSON array). If an extractor already ran and returned nothing,
    // trust that — don't fall back to the noisy title-guess.
    const wasProcessed = o.restaurants_mentioned !== null;
    let mentioned = [];
    try {
      mentioned = o.restaurants_mentioned ? JSON.parse(o.restaurants_mentioned) : [];
    } catch { mentioned = []; }

    // Seed with the title-guessed restaurant only when (a) no extractor
    // has processed this row yet AND (b) the guess doesn't look like an
    // article title. Prevents the "Inside NAIA's chic" style ghost cards
    // from surviving after the LLM already extracted the real name.
    if (o.restaurant && !wasProcessed && !looksLikeArticleTitle(o.restaurant)) {
      mentioned = [{ name: o.restaurant }];
    }

    for (const r of mentioned) {
      if (looksLikeArticleTitle(r.name)) continue;
      const key = normalizeName(r.name);
      if (!key) continue;

      let agg = map.get(key);
      if (!agg) {
        agg = {
          key,
          name: r.name,
          cuisine: null,
          cuisines: new Map(), // dedupKey -> display form, preserves discovery order
          blurb: null,
          take: null,
          topDishes: new Set(),
          priceBand: null,
          neighborhoods: new Set(),
          imageUrl: null,
          sources: [],
          firstSeen: null,
        };
        map.set(key, agg);
      }
      // First non-null image_url across this restaurant's source articles.
      // Rough proxy for "most editorial" since RSS/OG heroes tend to be
      // higher quality than random-image fallbacks.
      if (!agg.imageUrl && o.image_url) agg.imageUrl = o.image_url;
      // Split combined cuisines ("Bakery/Cafe") and normalize plurals
      // ("Cafes" → "Cafe"). Each restaurant ends up with a list of
      // individual, canonical cuisines so filters don't fragment.
      for (const c of normalizeCuisines(r.cuisine)) {
        const dk = cuisineDedupKey(c);
        if (dk && !agg.cuisines.has(dk)) agg.cuisines.set(dk, c);
      }

      // The .cuisine string field stays as first-seen (used as the card's
      // "primary" chip); .cuisines array is the split/normalized list used
      // for filtering.
      if (!agg.cuisine && r.cuisine) agg.cuisine = r.cuisine;
      if (r.blurb && (!agg.blurb || r.blurb.length > agg.blurb.length)) {
        agg.blurb = r.blurb;
      }
      // Take (opinion) — prefer the longest. This is usually the reviewer's
      // richest characterization of the place.
      if (r.take && (!agg.take || r.take.length > agg.take.length)) {
        agg.take = r.take;
      }
      // Top dishes — union across sources, capped at 8.
      if (Array.isArray(r.top_dishes)) {
        for (const dish of r.top_dishes) {
          if (typeof dish === "string" && dish.trim()) agg.topDishes.add(dish.trim());
        }
      }
      if (!agg.priceBand && r.price_band) agg.priceBand = r.price_band;
      // Neighborhood: prefer the per-restaurant LLM inference over the
      // article-level neighborhood, which is often the article's subject
      // location, not this specific restaurant's.
      if (r.neighborhood) agg.neighborhoods.add(r.neighborhood);
      else if (o.neighborhood) agg.neighborhoods.add(o.neighborhood);

      agg.sources.push({
        source: o.source,
        source_label: o.source_label,
        url: o.url,
        title: o.title,
        published_at: o.published_at,
        status: o.status,
      });

      const dt = o.published_at || o.seen_at;
      if (dt && (!agg.firstSeen || dt < agg.firstSeen)) agg.firstSeen = dt;
    }
  }

  let candidates = [...map.values()]
    // Only show restaurants that have at least one "opening" (currently open)
    // source article. Rows whose sources are all `upcoming` are future
    // openings — per the site's rule, we don't surface those.
    .filter((a) => a.sources.some((s) => s.status === "opening"));

  // LLM-driven validation when opted in. The request path is instant —
  // we consult the in-memory cache synchronously and enqueue any misses
  // for background validation on the next event loop tick. Names not yet
  // validated fail OPEN (shown), so first-load quality is at parity with
  // regex-only. On subsequent reloads (after the background workers have
  // run), invalid names disappear.
  if (USE_LLM_VALIDATOR && candidates.length) {
    const { validateFromCache, queueForValidation } = await import("./sources/validate-llm.js");
    const uncached = [];
    const contexts = {};
    candidates = candidates.filter((c) => {
      const cached = validateFromCache(c.name);
      if (cached) return cached.valid;
      // Not yet cached — keep it visible for now and queue for background
      uncached.push(c.name);
      contexts[c.name] = { articleTitle: c.sources[0]?.title };
      return true;
    });
    queueForValidation(uncached, contexts);
  }

  // Duplicate-image fix. Count how many restaurants share each OG image;
  // any image shared across SHARED_IMAGE_THRESHOLD+ restaurants is a
  // roundup collision (one article's hero photo attached to every
  // restaurant it mentioned). Route those to Google Places for a real
  // per-restaurant photo. Cache-hit swaps the URL now; cache-miss keeps
  // the OG image on this render and warms the cache for the next reload.
  if (USE_PHOTO_FETCHER && candidates.length) {
    const { findPhotoFromCache, queueForPhotoFetch } = await import("./sources/photo-fetcher.js");
    const imgCounts = new Map();
    for (const c of candidates) {
      if (c.imageUrl) imgCounts.set(c.imageUrl, (imgCounts.get(c.imageUrl) || 0) + 1);
    }
    const toFetch = [];
    for (const c of candidates) {
      const shared = c.imageUrl && (imgCounts.get(c.imageUrl) || 0) >= SHARED_IMAGE_THRESHOLD;
      const missing = !c.imageUrl;
      if (!shared && !missing) continue;
      const neighborhood = [...c.neighborhoods][0] || null;
      const cached = findPhotoFromCache(c.name, neighborhood);
      // A food/drink/food_scene pick — always use it.
      if (cached?.status === "ok" && cached.photo_url) {
        c.imageUrl = cached.photo_url;
      }
      // No food found, but we saved Google's top photo of the place as a
      // fallback. Use it whenever the OG is shared across a roundup —
      // a unique interior/exterior beats yet another tostada photo.
      else if (cached?.status === "no_food" && cached.photo_url && shared) {
        c.imageUrl = cached.photo_url;
      }
      // Already tried, nothing available at all (place not on Places
      // or Places had no photos, or the OG is unique so we shouldn't
      // stomp on it). Keep the OG.
      else if (cached && (cached.status === "no_food" || cached.status === "not_found" || cached.status === "error")) {
        // no-op — the OG image stays
      }
      // Not yet tried — queue for background fetch.
      else if (!cached) {
        toFetch.push({ name: c.name, neighborhood });
      }
    }
    queueForPhotoFetch(toFetch);
  }

  return candidates
    .map((a) => {
      const cuisines = [...a.cuisines.values()];
      return {
      name: a.name,
      // Primary cuisine for the card chip is the first normalized cuisine
      // when we have one; falls back to the raw field otherwise.
      cuisine: cuisines[0] || a.cuisine || null,
      cuisines,
      blurb: cleanBlurb(a.blurb, a.name),
      take: cleanBlurb(a.take, a.name),
      topDishes: [...a.topDishes].slice(0, 8),
      priceBand: a.priceBand,
      imageUrl: a.imageUrl,
      neighborhoods: [...a.neighborhoods],
      sources: a.sources.sort((x, y) =>
        (y.published_at || "").localeCompare(x.published_at || "")
      ),
      mentions: a.sources.length,
      firstSeen: a.firstSeen,
      };
    })
    .sort((a, b) =>
      b.mentions - a.mentions ||
      (b.firstSeen || "").localeCompare(a.firstSeen || "")
    );
}

app.get("/api/status", async (_req, res) => {
  const cutoff = cutoffIso();
  const extractor =
    process.env.EXTRACTOR === "llm" && process.env.ANTHROPIC_API_KEY
      ? { mode: "llm", model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5" }
      : { mode: "regex", model: null };
  const validator = USE_LLM_VALIDATOR
    ? { mode: "llm", model: process.env.VALIDATOR_MODEL || "claude-haiku-4-5" }
    : { mode: "regex", model: null };
  let photoFetcher = { enabled: false };
  if (USE_PHOTO_FETCHER) {
    const { photoFetcherStats } = await import("./sources/photo-fetcher.js");
    photoFetcher = photoFetcherStats();
  }
  res.json({
    total: dbApi.count({ cutoff }),
    maxAgeDays: MAX_AGE_DAYS,
    extractor,
    validator,
    photoFetcher,
    recentRuns: dbApi.recentRuns(),
    sourceStats: dbApi.sourceStats(),
    sources: sources.map((s) => ({ id: s.meta.id, label: s.meta.label })),
  });
});

app.post("/api/refresh", async (_req, res) => {
  try {
    const inserted = await runAllSources();
    res.json({ ok: true, inserted, total: dbApi.count({ cutoff: cutoffIso() }) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Re-verify every visible row's URL and hide any that 404. Slow-ish
// (network-bound), so use sparingly — mostly a cleanup step after
// pulling this change so existing dead links get pruned.
app.post("/api/verify", async (_req, res) => {
  const { verifyMany } = await import("./sources/util.js");
  const rows = dbApi.allUnhidden();
  const alive = await verifyMany(rows.map((r) => r.url));
  let hidden = 0;
  for (const r of rows) {
    if (!alive.get(r.url)) {
      dbApi.hide(r.id);
      hidden++;
    }
  }
  res.json({ ok: true, checked: rows.length, hidden });
});

app.post("/api/openings/:id/hide", (req, res) => {
  const changed = dbApi.hide(req.params.id);
  res.json({ ok: changed > 0 });
});

// Hide a whole restaurant (used by the ✕ button on a grid card). Marks
// every source article that mentions the name as hidden, so re-scrapes
// don't re-surface it and the noise-per-source ratio reflects the fix.
app.post("/api/restaurants/hide", express.json(), (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  const hidden = dbApi.hideByRestaurantName(name);
  res.json({ ok: true, hidden });
});

app.listen(PORT, () => {
  console.log(`chicago-eats listening on http://localhost:${PORT}`);
  console.log(`scrape schedule: "${SCRAPE_CRON}"`);
  if (SCRAPE_ON_BOOT) {
    runAllSources().catch((e) => console.warn("boot scrape failed:", e.message));
  }
  cron.schedule(SCRAPE_CRON, () => {
    runAllSources().catch((e) => console.warn("cron scrape failed:", e.message));
  });
});
