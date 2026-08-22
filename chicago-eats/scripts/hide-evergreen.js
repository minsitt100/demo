// One-shot cleanup: soft-hide any DB rows whose URL matches an
// "evergreen guide" pattern (best-of lists, hit lists, greatest-hits
// maps). Use after adding a new pattern to url-filter.js, or the first
// time to sweep out historical rows from before the aggregator started
// filtering them.
//
// Usage: node scripts/hide-evergreen.js
//
// Idempotent — running twice is safe; only unhidden matching rows are
// touched. Doesn't delete anything; just flips is_hidden = 1 so the
// aggregator excludes them.

import db from "../db.js";
import { EVERGREEN_URL_PATTERNS } from "../url-filter.js";

let total = 0;
const stmt = db.prepare(`UPDATE openings SET is_hidden = 1 WHERE is_hidden = 0 AND LOWER(url) LIKE ?`);

for (const pattern of EVERGREEN_URL_PATTERNS) {
  const like = `%${pattern.toLowerCase()}%`;
  const info = stmt.run(like);
  console.log(`  ${String(info.changes).padStart(3)} rows  ← ${pattern}`);
  total += info.changes;
}

console.log("");
console.log(`total hidden: ${total}`);
if (total > 0) {
  console.log("");
  console.log("Reload the site (Cmd+Shift+R) to see the cleaned-up feed.");
}
