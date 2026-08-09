import { sources } from "./sources/index.js";
import { dbApi } from "./db.js";

export async function runSource(mod) {
  const runId = dbApi.startRun(mod.meta.id);
  const started = Date.now();
  try {
    const items = await mod.fetchItems();
    const inserted = dbApi.insertMany(items);
    dbApi.finishRun(runId, { fetched: items.length, inserted, error: null });
    console.log(
      `[scrape] ${mod.meta.id}: fetched=${items.length} inserted=${inserted} ` +
      `(${Date.now() - started}ms)`
    );
    return inserted;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    dbApi.finishRun(runId, { fetched: 0, inserted: 0, error: msg });
    console.warn(`[scrape] ${mod.meta.id}: FAILED — ${msg}`);
    return 0;
  }
}

export async function runAllSources() {
  const results = await Promise.all(sources.map(runSource));
  return results.reduce((a, b) => a + b, 0);
}
