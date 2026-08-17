import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "openings.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS openings (
    id                    TEXT PRIMARY KEY,
    source                TEXT NOT NULL,
    source_label          TEXT NOT NULL,
    url                   TEXT NOT NULL UNIQUE,
    title                 TEXT NOT NULL,
    restaurant            TEXT,
    neighborhood          TEXT,
    status                TEXT NOT NULL DEFAULT 'opening',
    summary               TEXT,
    image_url             TEXT,
    published_at          TEXT,
    seen_at               TEXT NOT NULL DEFAULT (datetime('now')),
    is_hidden             INTEGER NOT NULL DEFAULT 0,
    restaurants_mentioned TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_openings_published ON openings(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_openings_source    ON openings(source);

  CREATE TABLE IF NOT EXISTS scrape_runs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source     TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    fetched    INTEGER DEFAULT 0,
    inserted   INTEGER DEFAULT 0,
    error      TEXT
  );
`);

// Migration: databases created before these columns existed need them added.
const existingCols = db.prepare("PRAGMA table_info(openings)").all().map((c) => c.name);
if (!existingCols.includes("restaurants_mentioned")) {
  db.exec("ALTER TABLE openings ADD COLUMN restaurants_mentioned TEXT");
}
if (!existingCols.includes("extracted_at")) {
  // Tracks when restaurants_mentioned was last written. Used by curated
  // "living page" sources to decide when to re-run extraction against
  // pages whose content changes over time.
  db.exec("ALTER TABLE openings ADD COLUMN extracted_at TEXT");
}

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO openings
    (id, source, source_label, url, title, restaurant, neighborhood, status, summary, image_url, published_at, restaurants_mentioned)
  VALUES
    (@id, @source, @source_label, @url, @title, @restaurant, @neighborhood, @status, @summary, @image_url, @published_at, @restaurants_mentioned)
`);

const updateRestaurantsStmt = db.prepare(`
  UPDATE openings
  SET restaurants_mentioned = @restaurants_mentioned,
      extracted_at = datetime('now')
  WHERE id = @id
`);

const isStaleStmt = db.prepare(`
  SELECT (extracted_at IS NULL OR extracted_at < datetime('now', '-' || ? || ' days')) AS stale
  FROM openings WHERE id = ?
`);

// Shared WHERE clause so list + count stay in sync. Each caller passes:
//   @source (nullable), @status (nullable), @cutoff (ISO timestamp string)
const FILTER_WHERE = `
  is_hidden = 0
  AND (@source IS NULL OR source = @source)
  AND (@status IS NULL OR status = @status)
  AND COALESCE(published_at, seen_at) >= @cutoff
`;

const listStmt = db.prepare(`
  SELECT id, source, source_label, url, title, restaurant, neighborhood, status,
         summary, image_url, published_at, seen_at, restaurants_mentioned
  FROM openings
  WHERE ${FILTER_WHERE}
  ORDER BY COALESCE(published_at, seen_at) DESC
  LIMIT @limit OFFSET @offset
`);

const countStmt = db.prepare(`
  SELECT COUNT(*) AS n FROM openings WHERE ${FILTER_WHERE}
`);

const allUnhiddenStmt = db.prepare(`
  SELECT id, url FROM openings WHERE is_hidden = 0
`);

const startRunStmt = db.prepare(`
  INSERT INTO scrape_runs (source) VALUES (?)
`);
const finishRunStmt = db.prepare(`
  UPDATE scrape_runs SET finished_at = datetime('now'), fetched = ?, inserted = ?, error = ? WHERE id = ?
`);

const recentRunsStmt = db.prepare(`
  SELECT source, started_at, finished_at, fetched, inserted, error
  FROM scrape_runs
  ORDER BY id DESC
  LIMIT 20
`);

// Per-source noise: how many rows we've hidden vs how many exist.
// A high ratio means the extractor is producing junk from that source.
const sourceStatsStmt = db.prepare(`
  SELECT
    source,
    COUNT(*)                                       AS total,
    SUM(CASE WHEN is_hidden = 1 THEN 1 ELSE 0 END) AS hidden
  FROM openings
  GROUP BY source
`);

// Bulk-hide every article row that mentions a given restaurant name.
// Called when the user hides a restaurant card in the grid view.
const bulkHideByRestaurantStmt = db.prepare(`
  UPDATE openings SET is_hidden = 1
  WHERE is_hidden = 0
    AND (
      LOWER(restaurant) = LOWER(?)
      OR restaurants_mentioned LIKE '%' || ? || '%'
    )
`);

export const dbApi = {
  insertMany(items) {
    const tx = db.transaction((rows) => {
      let inserted = 0;
      for (const r of rows) {
        if (r.restaurants_mentioned === undefined) r.restaurants_mentioned = null;
        const info = insertStmt.run(r);
        if (info.changes > 0) {
          inserted++;
          // Also mark extracted_at so weekly-recheck logic knows when the
          // restaurants_mentioned on this row was last written.
          if (r.restaurants_mentioned !== null) {
            db.prepare(`UPDATE openings SET extracted_at = datetime('now') WHERE id = ?`).run(r.id);
          }
        }
      }
      return inserted;
    });
    return tx(items);
  },
  setRestaurantsMentioned(id, jsonStr) {
    return updateRestaurantsStmt.run({ id, restaurants_mentioned: jsonStr }).changes;
  },
  isStale(id, olderThanDays) {
    const row = isStaleStmt.get(olderThanDays, id);
    return row ? !!row.stale : false;
  },
  needsEnrichment({ includeEmpty = false, includeAll = false } = {}) {
    let where;
    if (includeAll) {
      // Every visible row — for use after a change to the extractor
      // (e.g. tightened prompt) where existing non-empty results are also
      // wrong and need to be redone. Costs an API call per row.
      where = `is_hidden = 0`;
    } else if (includeEmpty) {
      // NULL OR the JSON literal "[]" — the latter is what a prior
      // extraction pass wrote when it found (or errored into) no
      // restaurants. Useful when re-running after a bug fix.
      where = `is_hidden = 0 AND (restaurants_mentioned IS NULL OR restaurants_mentioned = '[]')`;
    } else {
      where = `is_hidden = 0 AND restaurants_mentioned IS NULL`;
    }
    return db.prepare(
      `SELECT id, url, title FROM openings WHERE ${where}`
    ).all();
  },
  list({ source = null, status = null, limit = 50, offset = 0, cutoff } = {}) {
    return listStmt.all({ source, status, limit, offset, cutoff });
  },
  // Everything visible in the window — used by the restaurants aggregator.
  listAllInWindow({ cutoff }) {
    return db.prepare(`
      SELECT id, source, source_label, url, title, restaurant, neighborhood,
             status, summary, image_url, published_at, seen_at, restaurants_mentioned
      FROM openings
      WHERE is_hidden = 0
        AND COALESCE(published_at, seen_at) >= @cutoff
      ORDER BY COALESCE(published_at, seen_at) DESC
    `).all({ cutoff });
  },
  count({ source = null, status = null, cutoff } = {}) {
    return countStmt.get({ source, status, cutoff }).n;
  },
  allUnhidden() {
    return allUnhiddenStmt.all();
  },
  hide(id) {
    return db.prepare(`UPDATE openings SET is_hidden = 1 WHERE id = ?`).run(id).changes;
  },
  hasUrl(url) {
    return !!db.prepare(`SELECT 1 FROM openings WHERE url = ?`).get(url);
  },
  startRun(source) {
    return startRunStmt.run(source).lastInsertRowid;
  },
  finishRun(id, { fetched = 0, inserted = 0, error = null } = {}) {
    return finishRunStmt.run(fetched, inserted, error, id);
  },
  recentRuns() {
    return recentRunsStmt.all();
  },
  sourceStats() {
    return sourceStatsStmt.all();
  },
  hideByRestaurantName(name) {
    if (!name) return 0;
    return bulkHideByRestaurantStmt.run(name, name).changes;
  },
};

export default db;
