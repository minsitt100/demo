// Backfill: walk existing openings that were scraped BEFORE the restaurant
// extractor existed and fill in their restaurants_mentioned column.
// Safe to re-run — only touches rows where the field is still NULL.
//
//   npm run enrich:restaurants

import { dbApi } from "../db.js";
import { fetchAndExtract } from "../sources/extract.js";
// This script calls fetchAndExtract directly (not enrichWithRestaurants),
// so it bypasses the skipExisting check by design — it's meant to
// re-process rows the caller explicitly asked for.

// Look up each row's article title so the LLM extractor has that context.
// (The regex extractor ignores it; passing it is harmless.)
function titleFor(row) {
  return row.title || "";
}

// Three scopes, in order of "how much of the DB does this touch":
//   REENRICH_ALL=1    → every visible row (use after changing the extractor
//                       prompt itself; costs an API call per row)
//   REENRICH_EMPTY=1  → rows whose previous extraction produced [] (recover
//                       from a silent failure — bad key, missing SDK, etc.)
//   default           → only rows never processed (NULL)
const includeAll = process.env.REENRICH_ALL === "1";
const includeEmpty = process.env.REENRICH_EMPTY === "1";
const rows = dbApi.needsEnrichment({ includeAll, includeEmpty });
const mode = process.env.EXTRACTOR === "llm" && process.env.ANTHROPIC_API_KEY ? "llm" : "regex";
const scope = includeAll ? "all visible rows" : includeEmpty ? "NULL + empty" : "NULL only";
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
