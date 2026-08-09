// Backfill: walk existing openings that were scraped BEFORE the restaurant
// extractor existed and fill in their restaurants_mentioned column.
// Safe to re-run — only touches rows where the field is still NULL.
//
//   npm run enrich:restaurants

import { dbApi } from "../db.js";
import { fetchAndExtract } from "../sources/extract.js";

// Look up each row's article title so the LLM extractor has that context.
// (The regex extractor ignores it; passing it is harmless.)
function titleFor(row) {
  return row.title || "";
}

// REENRICH_EMPTY=1 also re-processes rows whose previous extraction produced
// an empty list — useful after fixing a bug that made the extractor silently
// fail (e.g. missing SDK, bad API key). Default: only touch NULL rows so we
// don't spend API calls re-checking articles that legitimately have no
// restaurants to extract.
const includeEmpty = process.env.REENRICH_EMPTY === "1";
const rows = dbApi.needsEnrichment({ includeEmpty });
const mode = process.env.EXTRACTOR === "llm" && process.env.ANTHROPIC_API_KEY ? "llm" : "regex";
const scope = includeEmpty ? "NULL + empty" : "NULL only";
console.log(`enrich-restaurants: ${rows.length} row${rows.length === 1 ? "" : "s"} to enrich (mode: ${mode}, scope: ${scope})`);

// LLM extraction is slower and rate-limited — halve concurrency for that path.
const CONCURRENCY = mode === "llm" ? 2 : 4;
const queue = [...rows];
let done = 0;
let hits = 0;

async function worker() {
  while (queue.length) {
    const row = queue.shift();
    const names = await fetchAndExtract(row.url, { title: titleFor(row) });
    dbApi.setRestaurantsMentioned(row.id, JSON.stringify(names));
    done++;
    if (names.length) hits++;
    if (done % 5 === 0 || done === rows.length) {
      console.log(`  ${done}/${rows.length} done (${hits} with restaurants)`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`enrich-restaurants: finished. ${hits}/${rows.length} rows now have restaurant chips.`);
process.exit(0);
