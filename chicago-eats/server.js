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
app.get("/api/restaurants", (req, res) => {
  const cutoff = cutoffIso();
  const rows = dbApi.listAllInWindow({ cutoff });
  const restaurants = aggregateRestaurants(rows);
  res.json({
    total: restaurants.length,
    maxAgeDays: MAX_AGE_DAYS,
    restaurants,
  });
});

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

function aggregateRestaurants(openings) {
  const map = new Map(); // normalized name -> aggregate

  for (const o of openings) {
    let mentioned = [];
    try {
      mentioned = o.restaurants_mentioned ? JSON.parse(o.restaurants_mentioned) : [];
    } catch { mentioned = []; }

    // Seed with the title-guessed restaurant if we have one and it isn't
    // already in the extracted list.
    if (o.restaurant) {
      const seen = mentioned.some((m) => normalizeName(m.name) === normalizeName(o.restaurant));
      if (!seen) mentioned = [{ name: o.restaurant }, ...mentioned];
    }

    for (const r of mentioned) {
      const key = normalizeName(r.name);
      if (!key) continue;

      let agg = map.get(key);
      if (!agg) {
        agg = {
          key,
          name: r.name,
          cuisine: null,
          blurb: null,
          neighborhoods: new Set(),
          sources: [],
          firstSeen: null,
        };
        map.set(key, agg);
      }

      if (!agg.cuisine && r.cuisine) agg.cuisine = r.cuisine;
      // Prefer the longest blurb — usually the richest description.
      if (r.blurb && (!agg.blurb || r.blurb.length > agg.blurb.length)) {
        agg.blurb = r.blurb;
      }
      if (o.neighborhood) agg.neighborhoods.add(o.neighborhood);

      agg.sources.push({
        source: o.source,
        source_label: o.source_label,
        url: o.url,
        title: o.title,
        published_at: o.published_at,
      });

      const dt = o.published_at || o.seen_at;
      if (dt && (!agg.firstSeen || dt < agg.firstSeen)) agg.firstSeen = dt;
    }
  }

  return [...map.values()]
    .map((a) => ({
      name: a.name,
      cuisine: a.cuisine,
      blurb: a.blurb,
      neighborhoods: [...a.neighborhoods],
      sources: a.sources.sort((x, y) =>
        (y.published_at || "").localeCompare(x.published_at || "")
      ),
      mentions: a.sources.length,
      firstSeen: a.firstSeen,
    }))
    .sort((a, b) =>
      b.mentions - a.mentions ||
      (b.firstSeen || "").localeCompare(a.firstSeen || "")
    );
}

app.get("/api/status", (_req, res) => {
  const cutoff = cutoffIso();
  res.json({
    total: dbApi.count({ cutoff }),
    maxAgeDays: MAX_AGE_DAYS,
    recentRuns: dbApi.recentRuns(),
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
