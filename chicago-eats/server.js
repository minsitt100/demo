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

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/openings", (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const source = req.query.source || null;
  const status = req.query.status || null; // 'opening' | 'upcoming'
  const rows = dbApi.list({ source, status, limit, offset });
  res.json({
    total: dbApi.count(),
    limit,
    offset,
    items: rows,
  });
});

app.get("/api/sources", (_req, res) => {
  res.json(sources.map((s) => ({ id: s.meta.id, label: s.meta.label })));
});

app.get("/api/status", (_req, res) => {
  res.json({
    total: dbApi.count(),
    recentRuns: dbApi.recentRuns(),
    sources: sources.map((s) => ({ id: s.meta.id, label: s.meta.label })),
  });
});

app.post("/api/refresh", async (_req, res) => {
  try {
    const inserted = await runAllSources();
    res.json({ ok: true, inserted, total: dbApi.count() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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
