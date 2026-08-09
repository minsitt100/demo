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

// Migration: databases created before this column existed need it added.
const existingCols = db.prepare("PRAGMA table_info(openings)").all().map((c) => c.name);
if (!existingCols.includes("restaurants_mentioned")) {
  db.exec("ALTER TABLE openings ADD COLUMN restaurants_mentioned TEXT");
}

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO openings
    (id, source, source_label, url, title, restaurant, neighborhood, status, summary, image_url, published_at, restaurants_mentioned)
  VALUES
    (@id, @source, @source_label, @url, @title, @restaurant, @neighborhood, @status, @summary, @image_url, @published_at, @restaurants_mentioned)
`);

const updateRestaurantsStmt = db.prepare(`
  UPDATE openings SET restaurants_mentioned = @restaurants_mentioned WHERE id = @id
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

export const dbApi = {
  insertMany(items) {
    const tx = db.transaction((rows) => {
      let inserted = 0;
      for (const r of rows) {
        // Ensure the new field is present so the prepared statement can bind.
        if (r.restaurants_mentioned === undefined) r.restaurants_mentioned = null;
        const info = insertStmt.run(r);
        if (info.changes > 0) inserted++;
      }
      return inserted;
    });
    return tx(items);
  },
  setRestaurantsMentioned(id, jsonStr) {
    return updateRestaurantsStmt.run({ id, restaurants_mentioned: jsonStr }).changes;
  },
  needsEnrichment() {
    return db.prepare(
      `SELECT id, url FROM openings WHERE is_hidden = 0 AND restaurants_mentioned IS NULL`
    ).all();
  },
  list({ source = null, status = null, limit = 50, offset = 0, cutoff } = {}) {
    return listStmt.all({ source, status, limit, offset, cutoff });
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
  startRun(source) {
    return startRunStmt.run(source).lastInsertRowid;
  },
  finishRun(id, { fetched = 0, inserted = 0, error = null } = {}) {
    return finishRunStmt.run(fetched, inserted, error, id);
  },
  recentRuns() {
    return recentRunsStmt.all();
  },
};

export default db;
