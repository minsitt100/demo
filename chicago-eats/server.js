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
